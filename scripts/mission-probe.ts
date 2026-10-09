// bun scripts/mission-probe.ts <levelId> <vehicleId> : runs the mission autopilot and prints why it ends.
import { getLevel } from '../src/data/levels';
import { runMission } from '../tests/helpers/mission';
const [id, veh] = process.argv.slice(2);
const l = getLevel(id);
const r = runMission(l, veh, { maxSeconds: 900 });
console.log(JSON.stringify({ finished: r.finished, time: r.result?.time, medal: r.result?.medal, sim: Math.round(r.simTime), fuelLeft: +r.fuelLeft.toFixed(2), health: Math.round(r.health), onboard: r.onboard, services: r.servicesUsed, recoveries: r.recoveries, stuck: r.stuck, overturned: r.overturned, maxImpact: +r.maxImpact.toFixed(1), end: r.result ? null : r.runtime.session.phase }));
