import type { LevelDef, ServiceKind, StopDef } from '../data/types';
import { Emitter } from '../core/emitter';
import type { VehicleStatus } from './VehicleStatus';

export type StopState = 'pending' | 'active' | 'done' | 'skipped';

export interface StopRuntime {
  def: StopDef;
  /** Distance along the road (m). */
  s: number;
  state: StopState;
  /** 0..1 progress of the current boarding / service. */
  progress: number;
}

type StopEvents = {
  boarded: { stop: StopRuntime; party: number; onboard: number };
  service: { stop: StopRuntime; kind: ServiceKind };
  serviceDone: { stop: StopRuntime; kind: ServiceKind };
  /** A drop-off completed: tourists got out. */
  alighted: { stop: StopRuntime; party: number; onboard: number };
  /** The player drove past a required stop without doing it. */
  missed: StopRuntime;
};

/** What the HUD should say the player is doing right now. */
export interface Objective {
  kind: 'pickup' | 'dropoff' | 'service' | 'checkpoint' | 'finish' | 'unload';
  label: string;
  /** Metres to go along the road (may be negative = already past, must turn back). */
  distance: number;
  stop: StopRuntime | null;
}

export const STOP_RADIUS = 9;
/** Pickup boarding time (s) while stopped inside the zone. */
export const BOARD_SECONDS = 2.4;
const STOP_SPEED = 1.6;

/**
 * Pickups and pit stops along the road. Required pickups gate everything beyond them, so a delivery can never
 * be completed by skipping the people. Services are optional and need the car to actually stop in the zone.
 */
export class StopManager {
  readonly events = new Emitter<StopEvents>();
  readonly stops: StopRuntime[];
  onboard = 0;
  /** Tourists who have already got out at drop-off stops. */
  alighted = 0;
  /** The service being performed right now (null when none). */
  active: { stop: StopRuntime; kind: ServiceKind } | null = null;
  private warned = new Set<string>();

  constructor(level: Pick<LevelDef, 'stops'>, stretchToS: (f: number) => number) {
    this.stops = level.stops
      .map((def) => ({ def, s: stretchToS(def.at), state: 'pending' as StopState, progress: 0 }))
      .sort((a, b) => a.s - b.s);
  }

  /** Total tourists that must be collected. */
  get party(): number {
    return this.stops.filter((s) => s.def.kind === 'pickup').reduce((n, s) => n + (s.def.party ?? 0), 0);
  }

  /** Everyone carried over the whole route: those already dropped off plus those still on board. */
  get deliveredTotal(): number {
    return this.alighted + this.onboard;
  }

  /** First required pickup or drop-off that has not been done yet: nothing beyond it counts. */
  get gate(): StopRuntime | null {
    return this.stops.find((s) => (s.def.kind === 'pickup' || s.def.kind === 'dropoff') && !s.def.optional && s.state !== 'done') ?? null;
  }

  /** The largest road distance that currently counts for checkpoints / finish. */
  gateS(): number {
    const g = this.gate;
    return g ? g.s + 6 : Infinity;
  }

  get requiredDone(): boolean {
    return this.gate === null;
  }

  /** Which services are on offer where the car is stopped right now. */
  servicesHere(
    s: number,
    lateral: number,
    speed: number,
    halfWidth: number,
  ): { stop: StopRuntime; kinds: ServiceKind[] } | null {
    if (speed > STOP_SPEED * 1.5) return null;
    for (const st of this.stops) {
      if (st.def.kind !== 'service' || st.state === 'skipped') continue;
      if (Math.abs(st.s - s) <= STOP_RADIUS && Math.abs(lateral) <= halfWidth + 3) {
        return { stop: st, kinds: st.def.services ?? [] };
      }
    }
    return null;
  }

  /**
   * Fixed-step update. `request` is the service the player asked for (button / key), or null.
   * Returns nothing; changes are reported through events and `status`.
   */
  update(
    dt: number,
    s: number,
    lateral: number,
    speed: number,
    status: VehicleStatus,
    halfWidth: number,
    request: ServiceKind | null,
  ): void {
    const stopped = speed <= STOP_SPEED;
    let boardingHere: StopRuntime | null = null;

    for (const st of this.stops) {
      const inZone = Math.abs(st.s - s) <= STOP_RADIUS && Math.abs(lateral) <= halfWidth + 3;
      if (st.def.kind === 'pickup' || st.def.kind === 'dropoff') {
        if (st.state === 'done') continue;
        if (!st.def.optional && st !== this.gate) continue;
        if (inZone && stopped) {
          boardingHere = st;
          st.state = 'active';
          st.progress = Math.min(1, st.progress + dt / BOARD_SECONDS);
          if (st.progress >= 1) {
            st.state = 'done';
            if (st.def.kind === 'pickup') {
              this.onboard += st.def.party ?? 0;
              this.events.emit('boarded', { stop: st, party: st.def.party ?? 0, onboard: this.onboard });
            } else {
              const n = Math.min(this.onboard, st.def.party ?? 0);
              this.onboard -= n;
              this.alighted += n;
              this.events.emit('alighted', { stop: st, party: n, onboard: this.onboard });
            }
          }
        } else {
          st.state = 'pending';
          st.progress = Math.max(0, st.progress - dt * 0.8);
          // Drove well past a required pickup (the gate holds the progress back): tell the player once.
          if (!st.def.optional && s > st.s + 25 && !this.warned.has(st.def.id)) {
            this.warned.add(st.def.id);
            this.events.emit('missed', st);
          }
        }
      }
    }
    void boardingHere;

    // Services.
    const here = this.servicesHere(s, lateral, speed, halfWidth);
    if (this.active && (!here || here.stop !== this.active.stop || !stopped)) {
      this.active.stop.progress = 0;
      this.active = null;
    }
    if (!this.active && here && request && here.kinds.includes(request) && stopped) {
      const needs = request === 'refuel' ? status.fuel < 0.995 : status.health < 99.5;
      if (needs) {
        this.active = { stop: here.stop, kind: request };
        this.events.emit('service', { stop: here.stop, kind: request });
      }
    }
    if (this.active) {
      const { stop, kind } = this.active;
      const done = kind === 'refuel' ? status.refuel(dt) : status.repair(dt);
      stop.progress = kind === 'refuel' ? status.fuel : status.health / 100;
      if (done) {
        stop.state = 'done';
        status.servicesUsed++;
        this.events.emit('serviceDone', { stop, kind });
        this.active = null;
      }
    }
  }

  /** Current objective for the HUD. `nextCheckpoint` is a text/distance supplier from the race session. */
  objective(
    s: number,
    finishLabel: string,
    finishS: number,
    nextCheckpoint: { label: string; s: number } | null,
  ): Objective {
    const gate = this.gate;
    if (gate) {
      const n = gate.def.party ?? 1;
      return {
        kind: gate.def.kind === 'dropoff' ? 'dropoff' : 'pickup',
        label: `${gate.def.kind === 'dropoff' ? 'Drop off' : 'Pick up'} ${n} tourist${n === 1 ? '' : 's'}: ${gate.def.label}`,
        distance: gate.s - s,
        stop: gate,
      };
    }
    if (nextCheckpoint) {
      return { kind: 'checkpoint', label: nextCheckpoint.label, distance: nextCheckpoint.s - s, stop: null };
    }
    return {
      kind: 'finish',
      label: `Deliver the tourists: ${finishLabel}`,
      distance: finishS - s,
      stop: null,
    };
  }

  /** Nearest optional pit stop ahead (for the "fuel stop ahead" hint). */
  nextService(s: number): StopRuntime | null {
    return this.stops.find((st) => st.def.kind === 'service' && st.s > s - STOP_RADIUS) ?? null;
  }

  reset(): void {
    this.onboard = 0;
    this.alighted = 0;
    this.active = null;
    this.warned.clear();
    for (const st of this.stops) {
      st.state = 'pending';
      st.progress = 0;
    }
  }
}
