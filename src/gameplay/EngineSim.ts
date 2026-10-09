import type { VehicleDef } from '../data/types';
import { clamp } from '../core/math';

/**
 * A presentation-only engine model. The physics has no gearbox (force is a smooth function of speed), so this
 * derives a believable rev counter and shift pattern from the same numbers the physics uses: the vehicle's
 * `gearTopSpeeds` ladder, its top speed, and the throttle. The HUD tachometer and the engine audio both read this
 * one object, so what you see and what you hear always agree. It never feeds back into the physics.
 */
export interface EngineState {
  /** 0..1 across idle..redline. */
  rpm: number;
  /** 0-based index into the ladder (what the audio and the rev logic use). */
  gear: number;
  /** 0..1 how hard the engine is working (throttle against what the road allows). */
  load: number;
  /** True for a short moment while a gear change happens (revs fall, power cuts). */
  shifting: boolean;
  /** True while the throttle is lifted and the engine is braking (overrun). */
  overrun: boolean;
}

export const IDLE_RPM = 0.18;
const SHIFT_TIME = 0.22;

export class EngineSim {
  readonly state: EngineState = { rpm: IDLE_RPM, gear: 0, load: 0, shifting: false, overrun: false };
  private ladder: number[];
  private topSpeed: number;
  private shiftLeft = 0;
  private rpmSmooth = IDLE_RPM;

  constructor(def: Pick<VehicleDef, 'engine'>) {
    this.ladder = def.engine.gearTopSpeeds.length ? def.engine.gearTopSpeeds : [def.engine.topSpeed];
    this.topSpeed = def.engine.topSpeed;
  }

  setVehicle(def: Pick<VehicleDef, 'engine'>): void {
    this.ladder = def.engine.gearTopSpeeds.length ? def.engine.gearTopSpeeds : [def.engine.topSpeed];
    this.topSpeed = def.engine.topSpeed;
    this.reset();
  }

  reset(): void {
    this.rpmSmooth = IDLE_RPM;
    this.shiftLeft = 0;
    Object.assign(this.state, { rpm: IDLE_RPM, gear: 0, load: 0, shifting: false, overrun: false });
  }

  /** Gear that would be chosen at this speed (pure helper, also used by tests). */
  gearAt(speed: number, prev = 0): number {
    const v = Math.abs(speed);
    let g = prev;
    // Hysteresis: shift up at the ladder value, down at 70% of the lower gear's range.
    while (g < this.ladder.length - 1 && v > this.ladder[g]) g++;
    while (g > 0 && v < this.ladder[g - 1] * 0.7) g--;
    return g;
  }

  update(dt: number, speed: number, throttle: number, grounded = true): EngineState {
    const s = this.state;
    const v = Math.abs(speed);
    const g = this.gearAt(v, s.gear);
    if (g !== s.gear) {
      if (g > s.gear) this.shiftLeft = SHIFT_TIME;
      s.gear = g;
    }
    this.shiftLeft = Math.max(0, this.shiftLeft - dt);
    s.shifting = this.shiftLeft > 0;

    const lo = g === 0 ? 0 : this.ladder[g - 1] * 0.62;
    const hi = this.ladder[g];
    const inGear = clamp((v - lo) / Math.max(0.1, hi - lo), 0, 1);
    const t = clamp(throttle, 0, 1);
    // Revs rise with speed inside the gear; throttle pushes them up (and wheelspin in the air lets them fly).
    let target = IDLE_RPM + (1 - IDLE_RPM) * inGear * (0.55 + 0.45 * clamp(t + 0.25, 0, 1));
    if (!grounded) target = Math.max(target, IDLE_RPM + 0.55 * t);
    if (s.shifting) target = Math.max(IDLE_RPM, target - 0.28);
    const rate = target > this.rpmSmooth ? 9 : 4.5;
    this.rpmSmooth += (target - this.rpmSmooth) * (1 - Math.exp(-rate * Math.max(dt, 0.001)));
    s.rpm = clamp(this.rpmSmooth, IDLE_RPM, 1);
    s.overrun = t < 0.05 && v > 3;
    // Load: throttle against how close to top speed we are (a laden engine on a hill has a high load).
    s.load = clamp(t * (1 - 0.6 * clamp(v / this.topSpeed, 0, 1)) + (s.shifting ? -0.2 : 0), 0, 1);
    return s;
  }
}
