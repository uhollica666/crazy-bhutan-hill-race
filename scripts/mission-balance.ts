import { listLevels } from '../src/data/levels';
import { runMission } from '../tests/helpers/mission';

for (const level of listLevels())
  for (const vehicle of level.vehicles) {
    for (const [style, cornerAccel] of [
      ['brisk', 6.8],
      ['careful', 4.2],
    ] as const) {
      const r = runMission(level, vehicle, { traffic: true, cornerAccel });
      console.log(
        JSON.stringify({
          level: level.id,
          vehicle,
          style,
          finished: r.finished,
          time: r.result?.time,
          medal: r.result?.medal,
          comfort: r.result?.comfort,
          fuel: r.fuelLeft,
          health: r.health,
          services: r.servicesUsed,
          recoveries: r.recoveries,
        }),
      );
    }
  }
for (const vehicle of ['druk-ranger', 'dragon-cruiser'])
  for (const conditions of [0, 1, 2]) {
    const r = runMission(listLevels()[4], vehicle, { conditions, cornerAccel: 4.2 });
    console.log(
      JSON.stringify({
        level: 'remote-expedition',
        vehicle,
        conditions,
        finished: r.finished,
        time: r.result?.time,
        medal: r.result?.medal,
        fuel: r.fuelLeft,
        health: r.health,
      }),
    );
  }
