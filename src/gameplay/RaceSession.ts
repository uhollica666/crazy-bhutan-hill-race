import type { LevelDef, Medal } from '../data/types';
import type { LevelTimes } from '../data/levels';
import { levelTimes } from '../data/levels';
import { Emitter } from '../core/emitter';
import { ComfortMeter } from './Comfort';
import { finalMedal, medalFromComfort, medalFromTime, runScore } from './scoring';

export type RacePhase = 'countdown' | 'running' | 'finished' | 'failed';

export interface RaceResult {
  status: 'completed' | 'timeout';
  /** Seconds (when timed out this equals the time limit). */
  time: number;
  /** Final medal (worse of time/comfort for comfort missions). */
  medal: Medal;
  timeMedal: Medal;
  /** null when the mission does not track comfort. */
  comfortMedal: Medal | null;
  /** Average passenger satisfaction 0..100, or null. */
  comfort: number | null;
  /** Lowest comfort reached during the run, or null. */
  comfortLow: number | null;
  score: number;
  checkpoints: number;
  recoveries: number;
  splits: number[];
  vehicleId: string;
}

export interface RaceStations {
  /** Distances along the road, ascending. */
  checkpointS: number[];
  finishS: number;
  /** Lateral half-width within which a gate counts. */
  gateHalfWidth: number;
}

export interface RaceOptions {
  vehicleId: string;
  /** Time thresholds already scaled for the vehicle. Defaults to the level's reference times. */
  times?: LevelTimes;
}

type RaceEvents = {
  countdown: number;
  go: undefined;
  checkpoint: { index: number; split: number };
  finish: RaceResult;
  timeout: RaceResult;
};

export const COUNTDOWN_SECONDS = 3;

/** Kept for callers that only care about time medals on the reference vehicle. */
export function medalFor(level: Pick<LevelDef, 'medals' | 'timeLimit'>, time: number): Medal {
  return medalFromTime(
    {
      limit: level.timeLimit,
      gold: level.medals.gold,
      silver: level.medals.silver,
      bronze: level.medals.bronze,
    },
    time,
  );
}

/**
 * Pure race rules: countdown, timer, ordered checkpoints, passenger comfort, finish and time-out.
 * It only sees the car's progress along the road and its accelerations, so it needs no physics or rendering.
 */
export class RaceSession {
  readonly events = new Emitter<RaceEvents>();
  readonly times: LevelTimes;
  /** Present only on missions that grade passenger comfort. */
  readonly comfort: ComfortMeter | null;
  phase: RacePhase = 'countdown';
  /** Seconds remaining before GO (counts down from COUNTDOWN_SECONDS). */
  countdown = COUNTDOWN_SECONDS;
  time = 0;
  nextCheckpoint = 0;
  recoveries = 0;
  readonly splits: number[] = [];
  /** Distance of the last checkpoint passed (or the start), where recovery re-spawns the car. */
  lastSafeS: number;
  result: RaceResult | null = null;

  private lastTick = COUNTDOWN_SECONDS + 1;
  private comfortIntegral = 0;
  private comfortLow = 100;

  constructor(
    private readonly level: LevelDef,
    private readonly stations: RaceStations,
    startS: number,
    private readonly opts: RaceOptions = { vehicleId: level.vehicles[0] },
  ) {
    this.lastSafeS = startS;
    this.times = opts.times ?? levelTimes(level, 1);
    this.comfort = level.mission.comfort ? new ComfortMeter() : null;
  }

  get totalCheckpoints(): number {
    return this.stations.checkpointS.length;
  }

  get isActive(): boolean {
    return this.phase === 'countdown' || this.phase === 'running';
  }

  /** Remaining time on the clock (never negative). */
  get timeLeft(): number {
    return Math.max(0, this.times.limit - this.time);
  }

  /** Feed fixed-step horizontal accelerations (m/s^2). Only counts while the clock is running. */
  feedMotion(dt: number, lateral: number, longitudinal: number, roll = 0): void {
    if (this.phase !== 'running' || !this.comfort) return;
    this.comfort.update(dt, lateral, longitudinal, roll);
    this.trackComfort(dt);
  }

  feedImpact(speed: number): void {
    if (this.phase === 'running') this.comfort?.impact(speed);
  }

  private trackComfort(dt: number): void {
    if (!this.comfort) return;
    this.comfortIntegral += this.comfort.value * dt;
    this.comfortLow = Math.min(this.comfortLow, this.comfort.value);
  }

  update(dt: number, s: number, lateral: number): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const whole = Math.ceil(this.countdown);
      if (this.countdown > 0 && whole < this.lastTick) {
        this.lastTick = whole;
        this.events.emit('countdown', whole);
      }
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.events.emit('go', undefined);
      }
      return;
    }
    if (this.phase !== 'running') return;

    this.time += dt;

    const { checkpointS, finishS, gateHalfWidth } = this.stations;
    // Checkpoints must be taken in order; a gate counts once the car has driven past it on the road.
    while (
      this.nextCheckpoint < checkpointS.length &&
      s >= checkpointS[this.nextCheckpoint] &&
      Math.abs(lateral) <= gateHalfWidth
    ) {
      this.splits.push(this.time);
      this.lastSafeS = checkpointS[this.nextCheckpoint];
      this.events.emit('checkpoint', { index: this.nextCheckpoint, split: this.time });
      this.nextCheckpoint++;
    }

    if (this.nextCheckpoint >= checkpointS.length && s >= finishS && Math.abs(lateral) <= gateHalfWidth) {
      this.phase = 'finished';
      this.result = this.buildResult('completed');
      this.events.emit('finish', this.result);
      return;
    }

    if (this.time >= this.times.limit) {
      this.time = this.times.limit;
      this.phase = 'failed';
      this.result = this.buildResult('timeout');
      this.events.emit('timeout', this.result);
    }
  }

  /** Counts a recovery and returns the road distance to re-spawn at. */
  recover(): number {
    if (this.isActive) this.recoveries++;
    // Being put back on the road rattles the passengers a little (no free comfort reset).
    if (this.comfort && this.phase === 'running') this.comfort.value = Math.max(0, this.comfort.value - 8);
    return this.lastSafeS;
  }

  private buildResult(status: RaceResult['status']): RaceResult {
    const level = this.level;
    const avg = this.comfort && this.time > 0 ? this.comfortIntegral / this.time : this.comfort ? 100 : null;
    const comfort = avg === null ? null : Math.round(avg * 10) / 10;
    const done = status === 'completed';
    const timeMedal: Medal = done ? medalFromTime(this.times, this.time) : 'none';
    const comfortMedal =
      comfort === null ? null : done ? medalFromComfort(level.comfortMedals, comfort) : 'none';
    return {
      status,
      time: this.time,
      medal: done ? finalMedal(level, this.times, this.time, comfort) : 'none',
      timeMedal,
      comfortMedal,
      comfort,
      comfortLow: this.comfort ? Math.round(this.comfortLow) : null,
      score: done ? runScore({ times: this.times, time: this.time, comfort }) : 0,
      checkpoints: this.nextCheckpoint,
      recoveries: this.recoveries,
      splits: [...this.splits],
      vehicleId: this.opts.vehicleId,
    };
  }
}

export function formatTime(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
