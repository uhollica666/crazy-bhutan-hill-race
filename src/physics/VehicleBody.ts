import { Matrix4, Quaternion, Vector3 } from 'three';
import type { VehicleDef } from '../data/types';
import { clamp, lerp } from '../core/math';
import { createGroundSample } from '../world/Terrain';
import type { BarrierHit } from '../world/Road';
import type { PhysicsWorld, VehicleInput } from './types';

export interface WheelState {
  readonly mountLocal: Vector3;
  /** World position of the tyre contact patch (valid while inContact). */
  readonly contact: Vector3;
  readonly steered: boolean;
  readonly driven: boolean;
  /** Radians, + = right. Visual and force direction. */
  steerAngle: number;
  /** Accumulated roll angle (radians) for visuals. */
  spin: number;
  compression: number;
  inContact: boolean;
  load: number;
  /** Distance from the mount point to the wheel centre along the suspension axis (visual). */
  suspLength: number;
  /** Sideways slip speed at the contact patch (m/s), for sound and effects. */
  slip: number;
}

const GRAVITY_DIR_Y = -1;

/**
 * Arcade raycast-suspension rigid body.
 *
 * Each wheel casts straight down onto the shared height-field, produces spring/damper force and a
 * friction-ellipse tyre force; the chassis is a real rigid body (position, quaternion, linear and
 * angular velocity) integrated at a fixed step by the caller. Chassis box corners collide with the
 * ground and with the road parapets via impulses, so flips and scrapes behave sensibly.
 *
 * Local frame: +X right, +Y up, -Z forward, origin at the centre of mass.
 */
export class VehicleBody {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  readonly prevPosition = new Vector3();
  readonly prevQuaternion = new Quaternion();
  readonly velocity = new Vector3();
  readonly angularVelocity = new Vector3();
  readonly wheels: WheelState[];

  /** Forward speed (m/s, negative when reversing). */
  speed = 0;
  /** Smoothed steering position, -1..1. */
  steerValue = 0;
  groundedWheels = 0;
  /** Largest sideways wheel slip this step (m/s). */
  slip = 0;
  /** Seconds the chassis has been mostly upside down / on its side. */
  overturnedFor = 0;
  /** Seconds since any wheel touched the ground. */
  airTime = 0;
  /** Current throttle command actually applied (-1..1), for audio. */
  drive = 0;
  braking = 0;

  private impact = 0;
  private readonly invMass: number;
  private readonly inertia = new Vector3();
  private readonly drivenCount: number;
  private readonly restHeight: number;
  private readonly wheelbase: number;

  // Scratch (allocated once; the step loop never allocates).
  private readonly m4 = new Matrix4();
  private readonly ax = new Vector3();
  private readonly ay = new Vector3();
  private readonly az = new Vector3();
  private readonly fwd = new Vector3();
  private readonly force = new Vector3();
  private readonly torque = new Vector3();
  private readonly mountW = new Vector3();
  private readonly contact = new Vector3();
  private readonly pt = new Vector3();
  private readonly r = new Vector3();
  private readonly vp = new Vector3();
  private readonly f = new Vector3();
  private readonly right = new Vector3();
  private readonly nrm = new Vector3();
  private readonly avgN = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly ground = createGroundSample();
  private readonly barrierHit: BarrierHit = { depth: 0, nx: 0, nz: 0 };
  private readonly compBuf: number[] = [];

  constructor(readonly def: VehicleDef) {
    const { width: w, height: h, length: l } = def.size;
    const m = def.mass;
    const s = def.inertiaScale;
    this.inertia.set(
      (m / 12) * (h * h + l * l) * s.x,
      (m / 12) * (w * w + l * l) * s.y,
      (m / 12) * (w * w + h * h) * s.z,
    );
    this.invMass = 1 / m;
    this.wheels = [];
    for (const axle of def.axles) {
      for (const side of [-1, 1]) {
        this.wheels.push({
          mountLocal: new Vector3(side * axle.halfTrack, axle.y, axle.z),
          contact: new Vector3(),
          steered: axle.steered,
          driven: axle.driven,
          steerAngle: 0,
          spin: 0,
          compression: 0,
          inContact: false,
          load: 0,
          suspLength: def.suspension.rest,
          slip: 0,
        });
      }
    }
    this.drivenCount = Math.max(1, this.wheels.filter((x) => x.driven).length);
    const zs = def.axles.map((a) => a.z);
    this.wheelbase = Math.max(0.5, Math.max(...zs) - Math.min(...zs));
    const lowest = Math.min(...def.axles.map((a) => a.y));
    const sag = (def.mass * def.gravity) / this.wheels.length / def.suspension.stiffness;
    this.restHeight = -lowest + def.suspension.rest - sag + def.wheelRadius;
  }

  /** Places the vehicle on the ground at (x,z), facing the XZ unit heading (tx,tz), at rest. */
  place(world: PhysicsWorld, x: number, z: number, tx: number, tz: number): void {
    const g = this.ground;
    world.ground(x, z, g);
    this.nrm.set(g.nx, g.ny, g.nz);
    this.f.set(tx, 0, tz);
    this.f.addScaledVector(this.nrm, -this.f.dot(this.nrm)).normalize();
    this.right.crossVectors(this.f, this.nrm).normalize();
    this.tmp.copy(this.f).negate();
    this.m4.makeBasis(this.right, this.nrm, this.tmp);
    this.quaternion.setFromRotationMatrix(this.m4);
    this.position.set(x, g.height + this.restHeight + 0.05, z).addScaledVector(this.nrm, 0);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    this.steerValue = 0;
    this.overturnedFor = 0;
    this.airTime = 0;
    this.impact = 0;
    this.speed = 0;
    for (const w of this.wheels) {
      w.steerAngle = 0;
      w.compression = 0;
      w.inContact = false;
      w.suspLength = this.def.suspension.rest;
      w.load = 0;
    }
  }

  /** Heading of the chassis in the XZ plane (unit vector written to out). */
  headingXZ(out: { x: number; z: number }): void {
    this.tmp.set(0, 0, -1).applyQuaternion(this.quaternion);
    const l = Math.hypot(this.tmp.x, this.tmp.z) || 1;
    out.x = this.tmp.x / l;
    out.z = this.tmp.z / l;
  }

  /** Returns and clears the strongest collision speed since the last call (m/s). */
  consumeImpact(): number {
    const v = this.impact;
    this.impact = 0;
    return v;
  }

  interpolate(alpha: number, outPos: Vector3, outQuat: Quaternion): void {
    outPos.lerpVectors(this.prevPosition, this.position, alpha);
    outQuat.slerpQuaternions(this.prevQuaternion, this.quaternion, alpha);
  }

  private updateBasis(): void {
    this.m4.makeRotationFromQuaternion(this.quaternion);
    const e = this.m4.elements;
    this.ax.set(e[0], e[1], e[2]);
    this.ay.set(e[4], e[5], e[6]);
    this.az.set(e[8], e[9], e[10]);
    this.fwd.copy(this.az).negate();
  }

  /** out = R * I^-1 * R^T * v, with v and out as plain numbers to avoid allocation. */
  private invInertia(x: number, y: number, z: number, out: Vector3): Vector3 {
    const { ax, ay, az } = this;
    const lx = (x * ax.x + y * ax.y + z * ax.z) / this.inertia.x;
    const ly = (x * ay.x + y * ay.y + z * ay.z) / this.inertia.y;
    const lz = (x * az.x + y * az.y + z * az.z) / this.inertia.z;
    return out.set(
      ax.x * lx + ay.x * ly + az.x * lz,
      ax.y * lx + ay.y * ly + az.y * lz,
      ax.z * lx + ay.z * ly + az.z * lz,
    );
  }

  private addForceAt(fx: number, fy: number, fz: number, px: number, py: number, pz: number): void {
    this.force.x += fx;
    this.force.y += fy;
    this.force.z += fz;
    const rx = px - this.position.x;
    const ry = py - this.position.y;
    const rz = pz - this.position.z;
    this.torque.x += ry * fz - rz * fy;
    this.torque.y += rz * fx - rx * fz;
    this.torque.z += rx * fy - ry * fx;
  }

  step(dt: number, input: VehicleInput, world: PhysicsWorld): void {
    const d = this.def;
    const mass = d.mass;
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
    this.updateBasis();

    const fwdSpeed = this.velocity.dot(this.fwd);
    this.speed = fwdSpeed;
    const absSpeed = Math.abs(fwdSpeed);

    // --- Steering: speed-sensitive and rate-limited.
    const speedRatio = clamp(absSpeed / d.steering.fullSpeed, 0, 1);
    const maxAngle = d.steering.maxAngle * lerp(1, d.steering.highSpeedRatio, Math.pow(speedRatio, 0.8));
    // The rack returns to centre faster than it winds on, which feels natural and keeps corrections crisp.
    const returning = Math.abs(input.steer) < Math.abs(this.steerValue) || input.steer * this.steerValue < 0;
    const step = d.steering.rate * (returning ? 1.7 : 1) * dt;
    this.steerValue += clamp(input.steer - this.steerValue, -step, step);
    // Arcade rollover guard: never steer harder than the vehicle can corner without tipping.
    const tanLimit = (d.stability.maxLateralAccel * this.wheelbase) / Math.max(fwdSpeed * fwdSpeed, 1);
    const steerLimit = Math.atan(tanLimit);
    const steerAngle = clamp(this.steerValue * maxAngle, -steerLimit, steerLimit);

    // --- Pedals.
    let drive = 0;
    let brake = 0;
    if (input.brake > 0.01 && input.throttle > 0.01) {
      brake = input.brake;
    } else if (input.throttle > 0.01) {
      if (fwdSpeed < -1) brake = input.throttle;
      else drive = input.throttle;
    } else if (input.brake > 0.01) {
      if (fwdSpeed > 1) brake = input.brake;
      else drive = -input.brake;
    }
    this.drive = drive;
    this.braking = brake;
    let driveTotal = 0;
    if (drive > 0) {
      driveTotal =
        drive * d.engine.force * clamp(1 - Math.pow(Math.max(fwdSpeed, 0) / d.engine.topSpeed, 4), 0, 1);
    } else if (drive < 0) {
      driveTotal =
        drive *
        d.engine.reverseForce *
        clamp(1 - Math.pow(Math.max(-fwdSpeed, 0) / d.engine.reverseSpeed, 2), 0, 1);
    }

    this.force.set(0, GRAVITY_DIR_Y * mass * d.gravity, 0);
    this.torque.set(0, 0, 0);
    this.avgN.set(0, 0, 0);

    const nWheels = this.wheels.length;
    const wheelMass = mass / nWheels;
    const sus = d.suspension;
    const maxSpring = mass * d.gravity * 1.6;
    let grounded = 0;
    let slip = 0;
    this.compBuf.length = nWheels;

    for (let i = 0; i < nWheels; i++) {
      const w = this.wheels[i];
      const prevComp = w.compression;
      this.mountW.copy(w.mountLocal).applyQuaternion(this.quaternion).add(this.position);
      world.ground(this.mountW.x, this.mountW.z, this.ground);
      const g = this.ground;
      const maxLen = sus.rest + d.wheelRadius;
      const upY = this.ay.y;
      const len = upY > 0.2 ? (this.mountW.y - g.height) / upY : Infinity;

      w.steerAngle = w.steered ? steerAngle : 0;
      w.inContact = len < maxLen;
      if (!w.inContact) {
        w.compression = 0;
        w.load = 0;
        w.slip = 0;
        w.suspLength = sus.rest;
        this.compBuf[i] = 0;
        continue;
      }
      grounded++;
      const comp = Math.min(maxLen - len, sus.rest + d.wheelRadius);
      const compVel = prevComp > 0 ? (comp - prevComp) / dt : 0;
      w.compression = comp;
      this.compBuf[i] = comp;
      let spring = sus.stiffness * comp;
      if (comp > sus.travel) spring += sus.stiffness * 4 * (comp - sus.travel);
      spring += sus.damping * compVel;
      spring = clamp(spring, 0, maxSpring);
      w.load = spring;
      w.suspLength = Math.max(0.05, len - d.wheelRadius);

      // Spring force along the chassis' up axis, applied at the mount point.
      this.addForceAt(
        this.ay.x * spring,
        this.ay.y * spring,
        this.ay.z * spring,
        this.mountW.x,
        this.mountW.y,
        this.mountW.z,
      );

      // Contact patch and its velocity.
      this.contact.copy(this.mountW).addScaledVector(this.ay, -len);
      w.contact.copy(this.contact);
      this.r.subVectors(this.contact, this.position);
      this.vp.crossVectors(this.angularVelocity, this.r).add(this.velocity);

      // Tyre axes: steered chassis heading projected onto the ground plane.
      this.nrm.set(g.nx, g.ny, g.nz);
      this.avgN.add(this.nrm);
      const ca = Math.cos(w.steerAngle);
      const sa = Math.sin(w.steerAngle);
      this.f.copy(this.fwd).multiplyScalar(ca).addScaledVector(this.ax, sa);
      this.f.addScaledVector(this.nrm, -this.f.dot(this.nrm)).normalize();
      this.right.crossVectors(this.f, this.nrm);

      const vf = this.vp.dot(this.f);
      const vr = this.vp.dot(this.right);
      const load = spring;
      const muLong = d.grip.longitudinal * load;
      const muLat = d.grip.lateral * load;

      let fx = 0;
      if (w.driven) fx += driveTotal / this.drivenCount;
      if (brake > 0) {
        const bmax = (d.engine.brakeForce / nWheels) * brake;
        fx += clamp((-vf * wheelMass) / dt, -bmax, bmax);
      }
      fx -= (vf * d.engine.rollingResistance) / nWheels;
      if (drive === 0 && brake === 0 && w.driven) fx -= (vf * d.engine.engineBraking) / this.drivenCount;
      if (drive === 0 && brake === 0 && Math.abs(vf) < 1.2) {
        // Auto-hold: stops the car creeping on slopes when the player lets go.
        fx += clamp((-vf * wheelMass) / dt, -muLong * 0.9, muLong * 0.9);
      }
      let fy = -clamp(vr / d.grip.slipSpeed, -1, 1) * muLat;

      if (load > 1) {
        const ex = fx / muLong;
        const ey = fy / muLat;
        const e2 = ex * ex + ey * ey;
        if (e2 > 1) {
          const k = 1 / Math.sqrt(e2);
          fx *= k;
          fy *= k;
        }
      }
      w.slip = Math.abs(vr);
      if (w.slip > slip) slip = w.slip;
      w.spin += (vf / d.wheelRadius) * dt;

      // Apply a little above the ground to tame body roll/pitch (arcade handling).
      this.tmp.subVectors(this.position, this.contact);
      const lift = Math.max(0, this.tmp.dot(this.ay)) * d.stability.contactLift;
      this.pt.copy(this.contact).addScaledVector(this.ay, lift);
      this.addForceAt(
        this.f.x * fx + this.right.x * fy,
        this.f.y * fx + this.right.y * fy,
        this.f.z * fx + this.right.z * fy,
        this.pt.x,
        this.pt.y,
        this.pt.z,
      );
    }
    this.groundedWheels = grounded;
    this.slip = slip;

    // --- Anti-roll bars (axle pairs are stored left, right).
    for (let a = 0; a + 1 < nWheels; a += 2) {
      const diff = this.compBuf[a] - this.compBuf[a + 1];
      if (diff === 0) continue;
      const far = clamp(sus.antiRoll * diff, -mass * d.gravity * 0.5, mass * d.gravity * 0.5);
      for (const [idx, sgn] of [
        [a, 1],
        [a + 1, -1],
      ] as const) {
        this.mountW.copy(this.wheels[idx].mountLocal).applyQuaternion(this.quaternion).add(this.position);
        this.addForceAt(
          this.ay.x * far * sgn,
          this.ay.y * far * sgn,
          this.ay.z * far * sgn,
          this.mountW.x,
          this.mountW.y,
          this.mountW.z,
        );
      }
    }

    // --- Yaw stability aid: damps only the yaw the steering did NOT ask for (spin-outs, snap oversteer).
    if (grounded >= 2 && d.stability.yawAssist > 0) {
      const speedFactor = clamp(absSpeed / 8, 0, 1);
      const limit = (0.9 * d.grip.lateral * d.gravity) / Math.max(absSpeed, 4);
      const target = clamp((-fwdSpeed * Math.tan(steerAngle)) / this.wheelbase, -limit, limit);
      this.torque.y -= d.stability.yawAssist * speedFactor * (this.angularVelocity.dot(this.ay) - target);
    }

    // --- Aero drag, downforce, and a gentle self-righting torque while on the ground.
    const vlen = this.velocity.length();
    this.force.addScaledVector(this.velocity, -d.engine.aeroDrag * vlen);
    this.force.addScaledVector(this.ay, -d.stability.downforce * vlen * vlen * (grounded > 0 ? 1 : 0));
    if (grounded >= 2) {
      this.avgN.normalize();
      this.tmp.crossVectors(this.ay, this.avgN);
      this.torque.addScaledVector(this.tmp, d.stability.uprighting);
    }

    // --- Integrate.
    this.velocity.addScaledVector(this.force, dt * this.invMass);
    this.invInertia(this.torque.x, this.torque.y, this.torque.z, this.tmp);
    this.angularVelocity.addScaledVector(this.tmp, dt);
    this.angularVelocity.multiplyScalar(
      Math.exp(-d.stability.angularDamping * (grounded > 0 ? 1 : 0.35) * dt),
    );

    this.position.addScaledVector(this.velocity, dt);
    const q = this.quaternion;
    const w = this.angularVelocity;
    const h = 0.5 * dt;
    const qx = q.x;
    const qy = q.y;
    const qz = q.z;
    const qw = q.w;
    q.set(
      qx + h * (w.x * qw + w.y * qz - w.z * qy),
      qy + h * (w.y * qw + w.z * qx - w.x * qz),
      qz + h * (w.z * qw + w.x * qy - w.y * qx),
      qw + h * (-w.x * qx - w.y * qy - w.z * qz),
    ).normalize();
    this.updateBasis();

    this.collide(world);

    // Hard speed ceiling (the power curve already limits normal acceleration).
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    const cap = d.engine.topSpeed * 1.25;
    if (hs > cap) {
      const k = cap / hs;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }

    this.airTime = grounded > 0 ? 0 : this.airTime + dt;
    this.overturnedFor = this.ay.y < 0.25 ? this.overturnedFor + dt : 0;
  }

  /** Chassis-corner vs ground and parapet collisions, resolved with impulses. */
  private collide(world: PhysicsWorld): void {
    const { width, height, length } = this.def.size;
    const hx = width / 2;
    const hy = height / 2;
    const hz = length / 2;
    const g = this.ground;

    for (let i = 0; i < 8; i++) {
      this.pt
        .set(i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz)
        .applyQuaternion(this.quaternion)
        .add(this.position);
      world.ground(this.pt.x, this.pt.z, g);
      const depth = g.height - this.pt.y;
      if (depth > 0) {
        this.nrm.set(g.nx, g.ny, g.nz);
        this.resolve(this.pt, this.nrm, depth, 0.1, 0.55, 0.6);
      }
    }

    const b = this.barrierHit;
    for (let i = 0; i < 4; i++) {
      this.pt
        .set(i & 1 ? hx : -hx, 0, i & 2 ? hz : -hz)
        .applyQuaternion(this.quaternion)
        .add(this.position);
      if (world.barrier(this.pt.x, this.pt.z, b) && b.depth > 0) {
        this.nrm.set(b.nx, 0, b.nz);
        this.resolve(this.pt, this.nrm, b.depth, 0.2, 0.25, 0.95);
      }
    }
  }

  private resolve(
    point: Vector3,
    n: Vector3,
    depth: number,
    restitution: number,
    friction: number,
    push: number,
  ): void {
    this.r.subVectors(point, this.position);
    this.vp.crossVectors(this.angularVelocity, this.r).add(this.velocity);
    const vn = this.vp.dot(n);
    if (vn < 0) {
      this.tmp2.crossVectors(this.r, n);
      this.invInertia(this.tmp2.x, this.tmp2.y, this.tmp2.z, this.tmp);
      const kEff = this.invMass + this.tmp2.crossVectors(this.tmp, this.r).dot(n);
      const e = -vn > 2.5 ? restitution : 0;
      const j = (-(1 + e) * vn) / kEff;
      this.velocity.addScaledVector(n, j * this.invMass);
      this.angularVelocity.addScaledVector(this.tmp, j);
      if (-vn > this.impact) this.impact = -vn;

      // Coulomb friction along the surface.
      this.tmp2.copy(this.vp).addScaledVector(n, -vn);
      const vt = this.tmp2.length();
      if (vt > 1e-3) {
        const jt = Math.min(friction * j, vt * this.def.mass * 0.35);
        this.tmp2.multiplyScalar(-jt / vt);
        this.velocity.addScaledVector(this.tmp2, this.invMass);
        this.invInertia(
          this.r.y * this.tmp2.z - this.r.z * this.tmp2.y,
          this.r.z * this.tmp2.x - this.r.x * this.tmp2.z,
          this.r.x * this.tmp2.y - this.r.y * this.tmp2.x,
          this.tmp,
        );
        this.angularVelocity.add(this.tmp);
      }
    }
    this.position.addScaledVector(n, depth * push);
  }
}
