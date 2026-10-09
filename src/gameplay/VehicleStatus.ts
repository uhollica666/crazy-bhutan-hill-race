import type { VehicleDef } from '../data/types';
import type { SurfaceDef } from '../data/surfaces';
import { clamp, lerp } from '../core/math';
import type { BodyModifiers } from '../physics/VehicleBody';

export type StatusIssue = 'lowFuel' | 'outOfFuel' | 'damaged' | 'critical' | 'stalled' | 'flooded';

export interface FuelInput {
  /** Forward speed magnitude (m/s). */
  speed: number;
  /** 0..1 throttle demand. */
  throttle: number;
  /** Road grade ahead (rise/run, positive uphill). */
  grade: number;
  fourByFour: boolean;
  surface: SurfaceDef;
}

/**
 * Fuel and vehicle condition for one mission. Deterministic and fixed-step; contains no physics, only
 * bookkeeping and the mapping from "how broken is it" to the modifiers the physics body understands.
 */
export class VehicleStatus {
  /** Tank fraction 0..1. */
  fuel: number;
  /** Condition 0..100 (100 = like new). */
  health = 100;
  /** Seconds of enforced engine stall left (breakdown). */
  stalledFor = 0;
  /** Seconds since the mission began (drives the deterministic breakdown pattern). */
  clock = 0;
  /** Water depth currently over the wheels (m). */
  waterDepth = 0;
  /** Total fuel burned (tank fractions) and total damage taken (%), for stats and tests. */
  fuelUsed = 0;
  damageTaken = 0;
  servicesUsed = 0;
  private nextBreakdownCheck = 6;

  constructor(
    readonly def: VehicleDef,
    startFuel = 1,
  ) {
    this.fuel = clamp(startFuel, 0, 1);
  }

  reset(startFuel: number): void {
    this.fuel = clamp(startFuel, 0, 1);
    this.health = 100;
    this.stalledFor = this.clock = this.waterDepth = 0;
    this.fuelUsed = this.damageTaken = this.servicesUsed = 0;
    this.nextBreakdownCheck = 6;
  }

  get outOfFuel(): boolean {
    return this.fuel <= 0;
  }
  get lowFuel(): boolean {
    return this.fuel > 0 && this.fuel < 0.18;
  }
  get rangeLeftKm(): number {
    return this.fuel * this.def.fuel.rangeKm;
  }

  /** Per fixed step. */
  update(dt: number, f: FuelInput): void {
    this.clock += dt;
    const range = this.def.fuel.rangeKm * 1000;
    const climb = 1 + Math.max(0, f.grade) * 2.5;
    const mode = f.fourByFour ? this.def.fuel.fourByFourFactor : 1;
    const demand = 1 + 0.5 * Math.pow(clamp(f.throttle, 0, 1), 1.5);
    const rolling = 1 + f.surface.rolling * 3;
    const perSecond = (f.speed / range) * demand * climb * mode * rolling + this.def.fuel.idle;
    const used = Math.min(this.fuel, perSecond * dt);
    this.fuel -= used;
    this.fuelUsed += used;
    this.stalledFor = Math.max(0, this.stalledFor - dt);
    if (this.health < 18 && this.clock >= this.nextBreakdownCheck) {
      // A deterministic breakdown pattern: roughly one 2-second stall every ~15 s while nearly wrecked.
      this.nextBreakdownCheck = this.clock + 11 + ((Math.floor(this.clock) * 7) % 9);
      this.stalledFor = 2;
    }
  }

  /** Structural damage from an impact at `speed` m/s (barriers, hazards, hard landings). Returns % lost. */
  impact(speed: number): number {
    if (speed <= 3.2) return 0;
    const raw = Math.pow(speed - 3.2, 1.35) * 1.8;
    return this.hurt(raw);
  }

  /** Continuous scraping on rough surfaces. `clearance` in metres. */
  scrape(dt: number, speed: number, surface: SurfaceDef, clearance: number): number {
    if (surface.roughness <= 0 || speed < 2) return 0;
    const protection = clamp((clearance - 0.15) / 0.5, 0, 0.7);
    return this.hurt(surface.roughness * (speed / 20) * (1 - protection) * dt);
  }

  private hurt(raw: number): number {
    const d = this.def.durability;
    const pct = raw * (1 - d.resistance) * (100 / d.health);
    const lost = Math.min(this.health, pct);
    this.health -= lost;
    this.damageTaken += lost;
    return lost;
  }

  /** Refuel for `dt` seconds. Returns true when the tank is full. Takes about 9 s from empty. */
  refuel(dt: number): boolean {
    this.fuel = Math.min(1, this.fuel + dt / 9);
    return this.fuel >= 1;
  }

  /** Repair for `dt` seconds. Returns true when fully repaired. Takes about 10 s from wrecked. */
  repair(dt: number): boolean {
    this.health = Math.min(100, this.health + (dt * 100) / 10);
    if (this.health >= 100) this.stalledFor = 0;
    return this.health >= 100;
  }

  /** Power available 0..1 given condition, fuel, stalls and water. */
  get power(): number {
    if (this.stalledFor > 0) return 0;
    let p = 1;
    if (this.health < 70) p = lerp(0.45, 0.94, clamp((this.health - 20) / 50, 0, 1));
    if (this.outOfFuel) p = Math.min(p, 0.12); // limp mode: you can always crawl to a station
    if (this.waterDepth > this.def.wading) p = Math.min(p, 0.18);
    return p;
  }

  get topSpeedScale(): number {
    let s = 1;
    if (this.health < 45) s = lerp(0.7, 1, clamp((this.health - 15) / 30, 0, 1));
    if (this.outOfFuel) s = Math.min(s, 0.4);
    return s;
  }

  get steerNoise(): number {
    return this.health < 55 ? ((55 - this.health) / 55) * 0.06 : 0;
  }

  /** Most urgent thing the player should know, or null. */
  get issue(): StatusIssue | null {
    if (this.waterDepth > this.def.wading) return 'flooded';
    if (this.stalledFor > 0) return 'stalled';
    if (this.outOfFuel) return 'outOfFuel';
    if (this.health < 25) return 'critical';
    if (this.lowFuel) return 'lowFuel';
    if (this.health < 60) return 'damaged';
    return null;
  }

  /** Writes the effects into the physics body's modifier block. */
  applyTo(mod: BodyModifiers): void {
    mod.power = this.power;
    mod.topSpeed = this.topSpeedScale;
    mod.steerNoise = this.steerNoise;
  }
}
