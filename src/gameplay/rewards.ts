import type { LevelDef, Medal, OptionalObjectiveDef } from '../data/types';
import type { RaceResult } from './RaceSession';

export interface RewardLine {
  label: string;
  amount: number;
}

export interface Reward {
  total: number;
  lines: RewardLine[];
}

export interface OptionalOutcome {
  def: OptionalObjectiveDef;
  achieved: boolean;
}

export interface RunFacts {
  /** Lowest-ever health reached is not tracked: only the end state counts. */
  health: number;
  usedService: boolean;
  /** Seconds the rival needed (null when there is no rival or it had not finished). */
  rivalFinishedAt: number | null;
  conditionsBonus: number;
  firstCompletion: boolean;
}

const MEDAL_SHARE: Record<Medal, number> = { none: 0, bronze: 0.15, silver: 0.3, gold: 0.6 };

/** Which optional objectives were met by a finished run. Pure; used by the HUD, the results and the tests. */
export function evaluateOptional(level: Pick<LevelDef, 'optional' | 'medals'>, r: RaceResult, facts: RunFacts): OptionalOutcome[] {
  return level.optional.map((def) => {
    let achieved = false;
    switch (def.kind) {
      case 'comfort':
        achieved = r.comfort !== null && r.comfort >= (def.value ?? 80);
        break;
      case 'condition':
        achieved = facts.health >= (def.value ?? 80);
        break;
      case 'beatRival':
        achieved = facts.rivalFinishedAt === null || r.time < facts.rivalFinishedAt;
        break;
      case 'goldTime':
        achieved = r.timeMedal === 'gold';
        break;
      case 'useService':
        achieved = facts.usedService;
        break;
    }
    return { def, achieved };
  });
}

/**
 * Driving credits for a run. Documented in ARCHITECTURE.md: completion pays 60% of the mission's base reward,
 * medals add up to +60%, comfort and a clean vehicle add smaller bonuses, optional objectives pay their own
 * rewards, harder weather multiplies the base, and the first completion of a mission pays a one-off +40%.
 * A failed run still pays a small consolation so no attempt is wasted.
 */
export function computeReward(level: Pick<LevelDef, 'reward' | 'mission'>, r: RaceResult, optional: OptionalOutcome[], facts: RunFacts): Reward {
  const lines: RewardLine[] = [];
  const base = level.reward;
  if (r.status !== 'completed') {
    const amount = Math.round(base * 0.08);
    return { total: amount, lines: [{ label: 'Consolation for the effort', amount }] };
  }
  lines.push({ label: 'Tourists delivered', amount: Math.round(base * 0.6) });
  const medal = MEDAL_SHARE[r.medal];
  if (medal > 0) lines.push({ label: `${r.medal[0].toUpperCase()}${r.medal.slice(1)} medal`, amount: Math.round(base * medal) });
  if (level.mission.comfort && r.comfort !== null && r.comfort >= 70) {
    lines.push({ label: 'Happy passengers', amount: Math.round(base * 0.2 * (r.comfort / 100)) });
  }
  if (facts.health >= 90) lines.push({ label: 'Spotless vehicle', amount: Math.round(base * 0.1) });
  if (facts.conditionsBonus > 1) {
    const sub = lines.reduce((n, l) => n + l.amount, 0);
    lines.push({ label: 'Tough conditions', amount: Math.round(sub * (facts.conditionsBonus - 1)) });
  }
  for (const o of optional) if (o.achieved) lines.push({ label: o.def.label, amount: o.def.reward });
  if (facts.firstCompletion) lines.push({ label: 'First time here', amount: Math.round(base * 0.4) });
  return { total: lines.reduce((n, l) => n + l.amount, 0), lines };
}
