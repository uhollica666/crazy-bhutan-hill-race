import { describe, expect, it } from 'vitest';
import { getLevel, listLevels } from '../src/data/levels';
import { getVehicle, listVehicles } from '../src/data/vehicles';
import { availableVehicles, isLevelUnlocked } from '../src/gameplay/progression';
import { SaveStore } from '../src/storage/SaveStore';
import { runMission } from './helpers/mission';

describe('Stage 3 full missions: real pickups, fuel, traffic, hazards and delivery', () => {
  for (const level of listLevels())
    for (const vehicle of level.vehicles) {
      it(`${level.id}/${vehicle} completes with all mandatory passengers and checkpoints`, () => {
        const r = runMission(level, vehicle, { traffic: true });
        console.info(
          JSON.stringify({
            level: level.id,
            vehicle,
            time: r.result?.time,
            medal: r.result?.medal,
            fuel: r.fuelLeft,
            health: r.health,
            services: r.servicesUsed,
            recoveries: r.recoveries,
          }),
        );
        expect(r.finished).toBe(true);
        expect(r.stuck).toBe(false);
        expect(r.overturned).toBe(false);
        // Everyone picked up is either still aboard or was dropped on the way.
        expect(r.onboard + r.runtime.stops.alighted).toBe(r.runtime.stops.party);
        expect(r.result?.checkpoints).toBe(level.checkpoints.length);
        expect(r.result?.status).toBe('completed');
        expect(r.health).toBeGreaterThan(0);
        expect(r.fuelLeft).toBeGreaterThan(0);
      });
    }
});

describe('competent careful driving with full mission systems', () => {
  for (const level of listLevels())
    for (const vehicle of level.vehicles) {
      it(`${level.id}/${vehicle} earns a medal with fuel remaining`, () => {
        const r = runMission(level, vehicle, { traffic: true, cornerAccel: 4.2 });
        expect(r.finished).toBe(true);
        expect(r.result?.medal).not.toBe('none');
        expect(r.fuelLeft).toBeGreaterThan(0);
        expect(r.recoveries).toBe(0);
      });
    }
  for (const vehicle of ['druk-ranger', 'dragon-cruiser'])
    for (const conditions of [1, 2]) {
      it(`expedition/${vehicle}/conditions ${conditions} remains winnable`, () => {
        const r = runMission(listLevels()[4], vehicle, { conditions, cornerAccel: 4.2 });
        expect(r.finished).toBe(true);
        expect(r.fuelLeft).toBeGreaterThan(0);
      });
    }
});

it('a fresh profile can complete the campaign after spending credits, using eligible loaners', () => {
  const store = new SaveStore(null);
  // The whole campaign, in unlock order: each mission opens only when its prerequisite has really been finished.
  const order = ['pass-run', 'thimphu-pickup', 'airport-dash', 'punakha-valley', 'dochula-storm', 'trongsa-gorge', 'chelela-climb', 'bumthang-night', 'remote-expedition', 'gmc-plains'];
  for (const id of order) {
    const level = getLevel(id);
    expect(isLevelUnlocked(level, store.progress), id).toBe(true);
    const owned = availableVehicles(level, listVehicles(), store.garage.owned);
    const vehicle = owned[0] ?? getVehicle(level.vehicles[0]); // same eligible-loaner rule used by Game
    expect(vehicle.capacity).toBeGreaterThanOrEqual(level.mission.party);
    const r = runMission(level, vehicle.id, { traffic: true, cornerAccel: 4.2 });
    expect(r.finished, id).toBe(true);
    const result = r.result!;
    const reward = r.runtime.rewardFor(result, true).reward;
    store.recordCompletion({
      levelId: id,
      vehicleId: vehicle.id,
      time: result.time,
      medal: result.medal,
      score: result.score,
      comfort: result.comfort,
    });
    store.addCredits(reward.total);
    expect(store.spend(store.credits)).toBe(true); // no funds left for the next mission's vehicle
  }
  expect(Object.keys(store.progress.levels)).toHaveLength(order.length);
  expect(store.garage.owned).toEqual(['dzo-hatch']); // borrowing never grants free ownership
});
