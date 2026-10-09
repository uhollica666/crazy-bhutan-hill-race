import { clamp } from '../core/math';

export type ComfortCause = 'corner' | 'brake' | 'accel' | 'bump';
export type RideQuality = 'smooth' | 'firm' | 'rough';

/** Tunable thresholds (m/s^2). Everything below these is "ordinary driving" and costs nothing. */
export interface ComfortConfig {
  lateralFree: number;
  lateralRange: number;
  brakeFree: number;
  brakeRange: number;
  accelFree: number;
  accelRange: number;
  /** Body lean (radians) that is free, and the extra lean that counts as a full unit of discomfort. */
  rollFree: number;
  rollRange: number;
  /** Percent lost per second at an excess of 1.0 (i.e. a full `range` over the free limit). */
  drainPerSecond: number;
  /** Percent regained per second while nothing is uncomfortable. */
  recoverPerSecond: number;
  /** Time constant (s) of the acceleration filter: ignores bumps and tiny steering corrections. */
  filterSeconds: number;
  /** Percent lost per m/s of collision speed above `impactFree`. */
  impactPenalty: number;
  impactFree: number;
}

export const DEFAULT_COMFORT: ComfortConfig = {
  lateralFree: 4.2,
  lateralRange: 4,
  brakeFree: 4.5,
  brakeRange: 5,
  accelFree: 4.8,
  accelRange: 6,
  rollFree: 0.05,
  rollRange: 0.09,
  drainPerSecond: 10,
  recoverPerSecond: 3,
  filterSeconds: 0.25,
  impactPenalty: 2.4,
  impactFree: 2,
};

/**
 * Passenger comfort, 0..100.
 *
 * Deterministic and frame-rate independent: the caller feeds fixed-step horizontal accelerations
 * (lateral and longitudinal, m/s^2). They are low-pass filtered, so bumps and tiny steering corrections
 * disappear; only sustained hard cornering / braking / launching drains comfort, and calm driving
 * slowly wins it back. Collisions cost a flat chunk proportional to impact speed.
 */
export class ComfortMeter {
  value = 100;
  /** What is hurting comfort right now (null when everything is fine). */
  cause: ComfortCause | null = null;
  /** 0..1 how bad the current discomfort is. */
  severity = 0;

  private aLat = 0;
  private aLong = 0;
  private roll = 0;

  constructor(private readonly cfg: ComfortConfig = DEFAULT_COMFORT) {}

  get quality(): RideQuality {
    return this.value >= 75 ? 'smooth' : this.value >= 45 ? 'firm' : 'rough';
  }

  /** @param roll body lean in radians (soft, tall vehicles lean more for the same cornering force) */
  update(dt: number, lateral: number, longitudinal: number, roll = 0): void {
    const c = this.cfg;
    const k = 1 - Math.exp(-dt / c.filterSeconds);
    this.aLat += (lateral - this.aLat) * k;
    this.aLong += (longitudinal - this.aLong) * k;
    this.roll += (Math.abs(roll) - this.roll) * k;

    const eLat = clamp((Math.abs(this.aLat) - c.lateralFree) / c.lateralRange, 0, 2);
    const eBrake = clamp((-this.aLong - c.brakeFree) / c.brakeRange, 0, 2);
    const eAccel = clamp((this.aLong - c.accelFree) / c.accelRange, 0, 2) * 0.6;
    const eRoll = clamp((this.roll - c.rollFree) / c.rollRange, 0, 2) * 0.8;
    const total = eLat + eBrake + eAccel + eRoll;

    if (total > 0.001) {
      this.value -= c.drainPerSecond * Math.pow(total, 1.3) * dt;
      const corner = Math.max(eLat, eRoll);
      this.cause = corner >= eBrake && corner >= eAccel ? 'corner' : eBrake >= eAccel ? 'brake' : 'accel';
    } else {
      this.value += c.recoverPerSecond * dt;
      this.cause = null;
    }
    this.severity = clamp(total, 0, 1);
    this.value = clamp(this.value, 0, 100);
  }

  /** Collision at `speed` m/s. */
  impact(speed: number): void {
    const c = this.cfg;
    if (speed <= c.impactFree) return;
    this.value = clamp(this.value - Math.min(30, (speed - c.impactFree) * c.impactPenalty + 4), 0, 100);
    this.cause = 'bump';
    this.severity = 1;
  }

  reset(): void {
    this.value = 100;
    this.aLat = this.aLong = this.roll = 0;
    this.cause = null;
    this.severity = 0;
  }
}
