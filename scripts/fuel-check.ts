import { getLevel } from '../src/data/levels';
import { runMission } from '../tests/helpers/mission';
for (const id of ['bumthang-night', 'chelela-climb', 'remote-expedition']) {
  const l = getLevel(id);
  for (const v of l.vehicles) {
    const r = runMission(l, v, { useServices: false });
    console.log(id, v, 'noService: finished', r.finished, r.result ? r.result.time.toFixed(0) + 's' : '', 'fuelLeft', r.fuelLeft.toFixed(2), 'sim', r.simTime.toFixed(0));
  }
}
