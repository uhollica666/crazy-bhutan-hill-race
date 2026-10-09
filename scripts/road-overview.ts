import { passRun } from '../src/data/levels/pass-run';
import { thimphuPickup } from '../src/data/levels/thimphu-pickup';
import { airportDash } from '../src/data/levels/airport-dash';
import { punakhaValley } from '../src/data/levels/punakha-valley';
import { dochulaStorm } from '../src/data/levels/dochula-storm';
import { chelelaClimb } from '../src/data/levels/chelela-climb';
import { trongsaGorge } from '../src/data/levels/trongsa-gorge';
import { bumthangNight } from '../src/data/levels/bumthang-night';
import { remoteExpedition } from '../src/data/levels/remote-expedition';
import { gmcPlains } from '../src/data/levels/gmc-plains';
import { Road } from '../src/world/Road';

for (const l of [passRun, thimphuPickup, airportDash, punakhaValley, dochulaStorm, chelelaClimb, trongsaGorge, bumthangNight, remoteExpedition, gmcPlains]) {
  const r = new Road(l.road, () => 0);
  const pose = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  const b = l.terrain.bounds;
  console.log(`## ${l.id} len ${r.length.toFixed(0)} bounds x ${b.minX}..${b.maxX} z ${b.minZ}..${b.maxZ} slope ${l.terrain.slope} valleyZ ${l.terrain.valleyZ} drop ${JSON.stringify(l.terrain.drop ?? null)} ford ${JSON.stringify(l.ford ?? null)}`);
  const row: string[] = [];
  for (let f = 0; f <= 1.0001; f += 0.1) {
    r.at(Math.min(f, 0.999) * r.length, pose);
    row.push(`${f.toFixed(1)}:(${pose.x.toFixed(0)},${pose.z.toFixed(0)})h(${pose.tx.toFixed(1)},${pose.tz.toFixed(1)})`);
  }
  console.log('  ' + row.join(' '));
  console.log(`  surfaces ${JSON.stringify(l.surfaces ?? [])} stops ${l.stops.map((s) => s.id + '@' + s.at.toFixed(2)).join(',')} cps ${l.checkpoints.map((c) => c.at.toFixed(2)).join(',')} hz ${l.hazards.map((h) => h.id + '@' + h.at.toFixed(2)).join(',')}`);
}
