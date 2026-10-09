import type { LevelDef, Medal } from '../data/types';
import { Emitter } from '../core/emitter';

export type RacePhase = 'countdown' | 'running' | 'finished' | 'failed';

export interface RaceResult {
  status: 'completed' | 'timeout';
  /** Seconds (when timed out this equals the time limit). */
  time: number;
  medal: Medal;
  checkpoints: number;
  recoveries: number;
  splits: number[];
}

export interface RaceStations {
  /** Distances along the road, ascending. */
  checkpointS: number[];
  finishS: number;
  /** Lateral half-width within which a gate counts. */
  gateHalfWidth: number;
}

type RaceEvents = {
  countdown: number;
  go: undefined;
  checkpoint: { index: number; split: number };
  finish: RaceResult;
  timeout: RaceResult;
};

export const COUNTDOWN_SECONDS = 3;

export function medalFor(level: Pick<LevelDef, 'medals'>, time: number): Medal {
  const m = level.medals;
  if (time <= m.gold) return 'gold';
  if (time <= m.silver) return 'silver';
  if (time <= m.bronze) return 'bronze';
  return 'none';
}

/**
 * Pure race rules: countdown, timer, ordered checkpoints, finish and time-out.
 * It only ever sees the car's progress along the road, so it is easy to test without physics or rendering.
 */
export class RaceSession {
  readonly events = new Emitter<RaceEvents>();
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

  constructor(
    private readonly level: LevelDef,
    private readonly stations: RaceStations,
    startS: number,
  ) {
    this.lastSafeS = startS;
  }

  get totalCheckpoints(): number {
    return this.stations.checkpointS.length;
  }

  get isActive(): boolean {
    return this.phase === 'countdown' || this.phase === 'running';
  }

  /** Remaining time on the clock (never negative). */
  get timeLeft(): number {
    return Math.max(0, this.level.timeLimit - this.time);
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

    if (this.time >= this.level.timeLimit) {
      this.time = this.level.timeLimit;
      this.phase = 'failed';
      this.result = this.buildResult('timeout');
      this.events.emit('timeout', this.result);
    }
  }

  /** Counts a recovery and returns the road distance to re-spawn at. */
  recover(): number {
    if (this.isActive) this.recoveries++;
    return this.lastSafeS;
  }

  private buildResult(status: RaceResult['status']): RaceResult {
    return {
      status,
      time: this.time,
      medal: status === 'completed' ? medalFor(this.level, this.time) : 'none',
      checkpoints: this.nextCheckpoint,
      recoveries: this.recoveries,
      splits: [...this.splits],
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
