// Writes assets-src/vehicle-params.json from the real VehicleDefs, so the Blender models are built to the
// same dimensions the physics uses. Run: bun scripts/vehicle-params.ts
import { writeFileSync } from 'node:fs';
import { listVehicles } from '../src/data/vehicles';

const out = listVehicles().map((v) => {
  const sag = (v.mass * v.gravity) / (v.axles.length * 2) / v.suspension.stiffness;
  return {
    id: v.id,
    visual: v.visual,
    size: v.size,
    wheelRadius: v.wheelRadius,
    wheelWidth: v.wheelWidth,
    axles: v.axles.map((a) => ({ z: a.z, halfTrack: a.halfTrack, wheelY: a.y - v.suspension.rest + sag })),
    livery: v.livery,
  };
});
writeFileSync('assets-src/vehicle-params.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.map((o) => [o.id, o.axles.map((a) => a.wheelY.toFixed(3))])));
