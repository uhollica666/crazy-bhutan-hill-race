// Writes the facts the launch site shows (vehicles and routes) straight from the game data, so the page never drifts from the game.
//   bun scripts/site-data.ts        -> public/download/game-data.json
import { writeFileSync } from 'node:fs';
import { listLevels } from '../src/data/levels';
import { listVehicles } from '../src/data/vehicles';

const vehicles = listVehicles().map((v) => ({
  id: v.id,
  name: v.name,
  blurb: v.blurb,
  seats: v.capacity,
  topSpeedKmh: Math.round(v.engine.topSpeed * 3.6),
  rangeKm: v.fuel.rangeKm,
  fourByFour: v.drivetrain.modes.includes('4x4'),
  offroad: v.offroad,
  wading: v.wading,
}));

const routes = listLevels().map((l, i) => ({
  n: i + 1,
  id: l.id,
  name: l.name,
  subtitle: l.subtitle,
  region: l.region,
  difficulty: l.difficulty,
  party: l.mission.party,
  vehicles: l.vehicles,
  conditions: [...new Set(l.conditions.map((c) => `${c.weather}/${c.time}`))],
  summary: l.description.length > 220 ? `${l.description.slice(0, 217).replace(/\s+\S*$/, '')}...` : l.description,
}));

writeFileSync('public/download/game-data.json', JSON.stringify({ generated: 'bun scripts/site-data.ts', vehicles, routes }, null, 1) + '\n');
console.log(`${vehicles.length} vehicles, ${routes.length} routes`);
