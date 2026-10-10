import { describe, expect, it } from 'vitest';
import { listLevels } from '../src/data/levels';
import { MEDAL_RANK } from '../src/gameplay/scoring';
import { getVehicle } from '../src/data/vehicles';
import { runMission } from './helpers/mission';
import { simulate } from './helpers/sim';
import type { SimOptions } from './helpers/sim';

/**
 * Autopilot "player profiles". They prove the levels are drivable and the medals are fair, NOT that the game is
 * fun: that still needs a human at a keyboard or on a phone.
 */
const STYLES: Record<string, SimOptions> = {
  flatOut: {}, // ignores passengers entirely
  brisk: { cornerAccel: 6.8, maxBrake: 0.6, brakeDecel: 5 }, // fast but tidy
  steady: { cornerAccel: 5.5, maxBrake: 0.5, brakeDecel: 4.5 }, // a competent, comfortable driver
  careful: { cornerAccel: 4.2, maxBrake: 0.35, brakeDecel: 3.5 },
};

const combos = listLevels().flatMap((l) => l.vehicles.map((v) => ({ level: l, vehicle: v })));
const rank = (m: string | undefined): number => MEDAL_RANK[(m ?? 'none') as keyof typeof MEDAL_RANK];

describe('every level is completable by every eligible vehicle', () => {
  for (const { level, vehicle } of combos) {
    it(`${level.id} / ${vehicle}: all driving styles finish without flipping, sticking, or hitting walls`, () => {
      for (const [name, style] of Object.entries(STYLES)) {
        const r = simulate(level, vehicle, style);
        expect(r.finished, `${name} finished`).toBe(true);
        expect(r.overturned, `${name} overturned`).toBe(false);
        expect(r.stuck, `${name} stuck`).toBe(false);
        expect(r.recoveries, `${name} recoveries`).toBe(0);
        expect(r.maxImpact, `${name} impact`).toBeLessThan(3);
        expect(r.maxLateral, `${name} lateral`).toBeLessThan(level.road.width / 2 + 1.5);
        expect(r.result?.checkpoints).toBe(level.checkpoints.length);
      }
    });

    it(`${level.id} / ${vehicle}: ordinary competent driving earns a medal, and gold is reachable`, () => {
      const steady = simulate(level, vehicle, STYLES.steady).result!;
      const careful = simulate(level, vehicle, STYLES.careful).result!;
      expect(rank(steady.medal), 'steady').toBeGreaterThanOrEqual(2); // at least silver
      expect(rank(careful.medal), 'careful').toBeGreaterThanOrEqual(1); // at least bronze
      const best = Math.max(
        ...Object.values(STYLES).map((s) => rank(simulate(level, vehicle, s).result!.medal)),
      );
      expect(best, 'gold reachable').toBe(3);
    });
  }
});

describe('Airport Dash balances speed against passenger comfort', () => {
  const airport = listLevels().find((l) => l.id === 'airport-dash')!;
  // The airport run is a whole mission now (hotel pickup, late guest, fuel stops), so these use the mission autopilot, which
  // includes the time the stops take, rather than the bare-road sim.
  const style = (o: SimOptions) => ({ cornerAccel: o.cornerAccel, style: { maxBrake: o.maxBrake, brakeDecel: o.brakeDecel } });
  const flatOutAccel = (v: string): number => 0.5 * getVehicle(v).grip.lateral * getVehicle(v).gravity; // the tyres' limit, ignoring the passengers

  it('flat-out driving is quicker but ruins the ride, and loses to a tidy brisk drive', () => {
    for (const v of airport.vehicles) {
      const fast = runMission(airport, v, { traffic: false, cornerAccel: flatOutAccel(v) }).result!;
      const tidy = runMission(airport, v, { traffic: false, ...style(STYLES.brisk) }).result!;
      expect(fast.time, v).toBeLessThan(tidy.time);
      expect(fast.comfort!, v).toBeLessThan(tidy.comfort! - 10);
      expect(rank(tidy.medal), v).toBeGreaterThan(rank(fast.medal));
      expect(tidy.score, v).toBeGreaterThan(0);
    }
  });

  it('an extremely slow crawl still cannot get gold (it misses the time target)', () => {
    const crawl = runMission(airport, 'druk-ranger', { traffic: false, cornerAccel: 1.6, style: { maxBrake: 0.3, brakeDecel: 3 } }).result!;
    expect(crawl.comfort!).toBeGreaterThan(95);
    expect(rank(crawl.medal)).toBeLessThan(3);
  });

  it('every ordinary run beats the flight deadline', () => {
    for (const v of airport.vehicles) {
      const r = simulate(airport, v, STYLES.careful).result!;
      expect(r.status).toBe('completed');
    }
  });
});
