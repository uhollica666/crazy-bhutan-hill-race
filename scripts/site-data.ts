// Writes the facts the launch site shows (vehicles and routes) straight from the game data, so the page never drifts from the game.
//   bun scripts/site-data.ts        -> public/download/game-data.json
import { writeFileSync } from 'node:fs';
import { listLevels } from '../src/data/levels';
import { listVehicles } from '../src/data/vehicles';

// Short, plain descriptions written for the site (the in-game blurbs are more playful). Numbers always come from the game data.
const VEHICLE_TEXT: Record<string, string> = {
  'dzo-hatch': 'The starting vehicle: a small hatchback that is light on fuel but struggles on steep hills and in mud.',
  'tourist-coaster': 'A ten-seat minibus. It is heavy and leans in corners, so brake early and take bends smoothly.',
  'druk-ranger': 'A five-seat SUV with selectable 4x2 and 4x4. Quick, with good grip on hairpins and muddy hills.',
  'dragon-cruiser': 'The most capable vehicle: a six-seat 4x4 with strong torque and the best off-road and river-crossing ability.',
};
const ROUTE_TEXT: Record<string, string> = {
  'pass-run': 'Your first tourism run. Pick up a family and a hiker, swap guests at the viewpoint and climb to the summit plaza, with a fuel stop and a workshop on the way.',
  'thimphu-pickup': 'A morning of pickups around Thimphu: busy streets, then the climb to the Buddha Dordenma viewpoint.',
  'airport-dash': 'A tour group is late for their flight. Collect them at the hotel and drive the Thimphu to Paro highway. A smooth ride keeps passengers happy.',
  'punakha-valley': 'Rice terraces, villages, the river road and the dzong where two rivers meet. Expect rain, mud, a narrow bridge, a ford and farm traffic.',
  'dochula-storm': 'Get your guests down from Dochula before a storm closes in. Fog, heavy rain, slippery hairpins and a landslide below.',
  'trongsa-gorge': 'A narrow, patched mountain road to Trongsa: a cliff ledge, a one-lane bridge, falling rocks and a muddy climb. Watch your brakes.',
  'chelela-climb': 'Fourteen hairpins from the Paro foothills to the snowy Chele La viewpoint. Frost, packed snow and ice, with deeper snow for four-wheel drive.',
  'bumthang-night': 'A long forest road after dark, with fog, unlit bridges and animals in your headlights. Your lamps only reach about forty metres.',
  'remote-expedition': 'Take a documentary team and their gear to a remote camp over mud tracks, a broken highway and rockfalls, with the rains arriving early.',
  'gmc-plains': 'The final assignment: guests from a southern mountain lodge to Gelephu Mindfulness City, over a long descent, landslides, mud, river crossings, a monsoon storm and a busy town. Check passengers’ ID.',
};

const vehicles = listVehicles().map((v) => ({
  id: v.id,
  name: v.name,
  blurb: VEHICLE_TEXT[v.id] ?? v.blurb,
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
  summary: ROUTE_TEXT[l.id] ?? l.description,
}));

writeFileSync('public/download/game-data.json', JSON.stringify({ generated: 'bun scripts/site-data.ts', vehicles, routes }, null, 1) + '\n');
console.log(`${vehicles.length} vehicles, ${routes.length} routes`);
