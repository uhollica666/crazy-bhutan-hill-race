import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { VehicleBody } from '../physics/VehicleBody';
import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import { clamp } from '../core/math';

// ---------------------------------------------------------------------------------------------- snow

const SNOW_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uScale;
attribute vec3 aSeed;
varying float vAlpha;
void main() {
  vec3 p = aSeed * uBox;
  p.y -= uTime * (1.6 + aSeed.x * 1.4);
  p.x += sin(uTime * 0.7 + aSeed.z * 20.0) * 1.4 + uTime * 0.9;
  p.z += cos(uTime * 0.5 + aSeed.x * 17.0) * 1.2;
  vec3 origin = uCam - uBox * 0.5;
  vec3 rel = mod(p - origin, uBox);
  vec3 world = origin + rel;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade = smoothstep(0.0, 6.0, -mv.z) * (1.0 - smoothstep(30.0, 52.0, -mv.z));
  vAlpha = fade * (0.55 + aSeed.y * 0.4);
  gl_PointSize = clamp(uScale * (0.5 + aSeed.y) * 38.0 / max(-mv.z, 1.0), 1.5, 12.0);
}`;
const SNOW_FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`;

/** Falling snow: a fixed point cloud animated entirely in the vertex shader (zero per-frame CPU work). */
export class Snow {
  readonly points: Points;
  private readonly mat: ShaderMaterial;
  private readonly geo = new BufferGeometry();

  constructor(maxCount = 900) {
    const seeds = new Float32Array(maxCount * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    this.geo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 3));
    this.geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(maxCount * 3), 3));
    this.mat = new ShaderMaterial({
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
        uBox: { value: new Vector3(90, 50, 90) },
        uScale: { value: 1 },
      },
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  setCount(n: number, pixelRatio: number): void {
    this.geo.setDrawRange(0, n);
    this.points.visible = n > 0;
    this.mat.uniforms.uScale.value = pixelRatio;
  }

  update(time: number, camera: Vector3): void {
    this.mat.uniforms.uTime.value = time;
    (this.mat.uniforms.uCam.value as Vector3).copy(camera);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ----------------------------------------------------------------------------------------- particles

const PART_VERT = /* glsl */ `
uniform float uScale;
attribute vec3 aState; // size, age 0..1, alpha
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aState.z * pow(max(1.0 - aState.y, 0.0), 1.4);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = aState.x * (1.0 + aState.y * 1.8);
  gl_PointSize = clamp(uScale * size * 90.0 / max(-mv.z, 1.0), 0.0, 90.0);
}`;
const PART_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

/** Pooled soft sprites for dust, tyre smoke and impact bursts. One draw call, no allocation per particle. */
export class Particles {
  readonly points: Points;
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly state: Float32Array;
  private readonly color: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly baseSize: Float32Array;
  private cursor = 0;
  private readonly geo = new BufferGeometry();
  private readonly mat: ShaderMaterial;
  private posAttr: BufferAttribute;
  private stateAttr: BufferAttribute;
  private colorAttr: BufferAttribute;
  /** 0..1 multiplier for how many particles quality allows. */
  density = 1;

  constructor(capacity = 220) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.state = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1);
    this.life = new Float32Array(capacity).fill(1);
    this.baseAlpha = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.posAttr = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    this.stateAttr = new BufferAttribute(this.state, 3).setUsage(DynamicDrawUsage);
    this.colorAttr = new BufferAttribute(this.color, 3).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aState', this.stateAttr);
    this.geo.setAttribute('aColor', this.colorAttr);
    this.mat = new ShaderMaterial({
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uScale: { value: 1 } },
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  setPixelRatio(r: number): void {
    this.mat.uniforms.uScale.value = r;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
  ): void {
    if (this.density < 1 && Math.random() > this.density) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
    this.baseSize[i] = size;
    this.baseAlpha[i] = alpha;
    this.life[i] = life;
    this.age[i] = 0;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const a = this.age[i];
      if (a >= 1) {
        this.state[i * 3 + 2] = 0;
        continue;
      }
      const na = a + dt / this.life[i];
      this.age[i] = na;
      const drag = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.6 * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.state[i * 3] = this.baseSize[i];
      this.state[i * 3 + 1] = na;
      this.state[i * 3 + 2] = na >= 1 ? 0 : this.baseAlpha[i];
    }
    this.posAttr.needsUpdate = true;
    this.stateAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear(): void {
    this.age.fill(1);
    this.state.fill(0);
    this.stateAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------------------- skid marks

/** Ring buffer of dark quads laid on the road where tyres slide or lock. */
export class SkidMarks {
  readonly mesh: Mesh;
  private readonly maxQuads: number;
  private readonly pos: Float32Array;
  private readonly geo = new BufferGeometry();
  private readonly mat: MeshBasicMaterial;
  private cursor = 0;
  private readonly lastX: number[] = [];
  private readonly lastZ: number[] = [];
  private readonly active: boolean[] = [];
  private dirty = false;

  constructor(maxQuads = 500) {
    this.maxQuads = maxQuads;
    this.pos = new Float32Array(maxQuads * 4 * 3);
    // Unused quads collapse to a point far below the world.
    for (let i = 0; i < this.pos.length; i += 3) this.pos[i + 1] = -9999;
    const idx: number[] = [];
    for (let q = 0; q < maxQuads; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mat = new MeshBasicMaterial({
      color: 0x0e0e10,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Extends the mark of wheel `w` to (x, y, z), heading (hx, hz). Call with `skidding=false` to break the line. */
  add(
    w: number,
    skidding: boolean,
    x: number,
    y: number,
    z: number,
    hx: number,
    hz: number,
    half = 0.13,
  ): void {
    if (!skidding) {
      this.active[w] = false;
      return;
    }
    if (this.active[w]) {
      const dx = x - this.lastX[w];
      const dz = z - this.lastZ[w];
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.16) return; // lay a new segment every ~40 cm
      if (d2 > 9) {
        this.active[w] = false; // teleport / recovery: do not draw a long streak
      } else {
        const nx = -hz * half;
        const nz = hx * half;
        const q = this.cursor * 12;
        const p = this.pos;
        p[q] = this.lastX[w] - nx;
        p[q + 1] = y;
        p[q + 2] = this.lastZ[w] - nz;
        p[q + 3] = this.lastX[w] + nx;
        p[q + 4] = y;
        p[q + 5] = this.lastZ[w] + nz;
        p[q + 6] = x - nx;
        p[q + 7] = y;
        p[q + 8] = z - nz;
        p[q + 9] = x + nx;
        p[q + 10] = y;
        p[q + 11] = z + nz;
        this.cursor = (this.cursor + 1) % this.maxQuads;
        this.dirty = true;
      }
    }
    this.active[w] = true;
    this.lastX[w] = x;
    this.lastZ[w] = z;
  }

  flush(): void {
    if (!this.dirty) return;
    this.geo.getAttribute('position').needsUpdate = true;
    this.dirty = false;
  }

  clear(): void {
    for (let i = 1; i < this.pos.length; i += 3) this.pos[i] = -9999;
    this.active.length = 0;
    this.dirty = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------------------- vehicle effects driver

/** Turns physics state (slip, braking, surface) into dust, smoke, skid marks and impact bursts. */
export class VehicleEffects {
  readonly particles = new Particles();
  readonly skids = new SkidMarks();
  private readonly acc: number[] = [];
  private readonly hit = createRoadHit();
  private readonly head = { x: 0, z: -1 };

  update(dt: number, body: VehicleBody, course: Course, active: boolean): void {
    if (active) {
      const speed = Math.abs(body.speed);
      body.headingXZ(this.head);
      const hard = body.braking > 0.75 && speed > 12;
      for (let i = 0; i < body.wheels.length; i++) {
        const w = body.wheels[i];
        let dust = 0;
        let smoke = 0;
        let skid = false;
        if (w.inContact && speed > 2.5) {
          course.road.project(w.contact.x, w.contact.z, this.hit);
          const verge = Math.abs(this.hit.lateral) > course.road.halfWidth - 0.1;
          if (verge) dust = 16 * clamp(speed / 18, 0, 1);
          if (w.slip > 2.5) {
            smoke = 34 * clamp((w.slip - 2) / 4, 0, 1);
            skid = !verge;
          }
          if (hard) {
            smoke = Math.max(smoke, 14);
            skid = skid || speed > 14;
          }
          if (w.driven && body.drive > 0.8 && speed < 7) dust = Math.max(dust, 10);
        }
        this.skids.add(i, skid, w.contact.x, w.contact.y + 0.09, w.contact.z, this.head.x, this.head.z);
        this.spawn(i, dt, dust, w.contact.x, w.contact.y, w.contact.z, body, 0.78, 0.66, 0.46, 0.42, 1.1);
        this.spawn(i, dt, smoke, w.contact.x, w.contact.y, w.contact.z, body, 0.92, 0.92, 0.92, 0.3, 0.8);
      }
    }
    this.particles.update(dt);
    this.skids.flush();
  }

  private spawn(
    i: number,
    dt: number,
    rate: number,
    x: number,
    y: number,
    z: number,
    body: VehicleBody,
    r: number,
    g: number,
    b: number,
    alpha: number,
    size: number,
  ): void {
    if (rate <= 0) return;
    const k = i + (r > 0.9 ? 16 : 0);
    this.acc[k] = (this.acc[k] ?? 0) + rate * dt;
    while (this.acc[k] >= 1) {
      this.acc[k] -= 1;
      this.particles.emit(
        x + (Math.random() - 0.5) * 0.4,
        y + 0.15,
        z + (Math.random() - 0.5) * 0.4,
        body.velocity.x * 0.12 + (Math.random() - 0.5) * 1.2,
        0.5 + Math.random() * 0.8,
        body.velocity.z * 0.12 + (Math.random() - 0.5) * 1.2,
        size * (0.7 + Math.random() * 0.6),
        0.7 + Math.random() * 0.6,
        r,
        g,
        b,
        alpha,
      );
    }
  }

  /** Burst of dust where the car hit something. */
  impact(x: number, y: number, z: number, intensity: number): void {
    const n = Math.round(clamp(intensity, 2, 20));
    for (let i = 0; i < n; i++) {
      this.particles.emit(
        x + (Math.random() - 0.5),
        y,
        z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 5,
        1 + Math.random() * 2.5,
        (Math.random() - 0.5) * 5,
        0.9 + Math.random() * 0.8,
        0.6 + Math.random() * 0.6,
        0.82,
        0.78,
        0.7,
        0.5,
      );
    }
  }

  reset(): void {
    this.particles.clear();
    this.skids.clear();
  }

  dispose(): void {
    this.particles.dispose();
    this.skids.dispose();
  }
}
