/**
 * Layout of the illustrated campaign map. Purely presentational: a stylised, fictional sketch of a Himalayan
 * kingdom (west on the left, the southern plains at the bottom), not a survey. Coordinates are in a
 * 1000 x 620 viewBox. Missions without an entry are placed on a fallback grid so a new level never disappears.
 */
export const MAP_VIEW = { width: 1000, height: 620 };

export const MAP_PINS: Record<string, { x: number; y: number }> = {
  'pass-run': { x: 120, y: 400 },
  'thimphu-pickup': { x: 240, y: 320 },
  'airport-dash': { x: 150, y: 215 },
  'punakha-valley': { x: 385, y: 340 },
  'dochula-storm': { x: 345, y: 195 },
  'chelela-climb': { x: 480, y: 112 },
  'trongsa-gorge': { x: 590, y: 285 },
  'bumthang-night': { x: 715, y: 215 },
  'remote-expedition': { x: 860, y: 150 },
  'gmc-plains': { x: 745, y: 465 },
};

/** Region captions, placed beside their missions. */
export const MAP_REGIONS: Record<string, { x: number; y: number }> = {
  'Paro & Thimphu': { x: 70, y: 470 },
  'Punakha Valley': { x: 350, y: 410 },
  'Mountain Passes': { x: 470, y: 50 },
  'Central & Eastern Bhutan': { x: 700, y: 95 },
  'Southern Plains': { x: 700, y: 540 },
};

export function pinFor(id: string, index: number): { x: number; y: number } {
  return MAP_PINS[id] ?? { x: 80 + (index % 5) * 180, y: 560 - Math.floor(index / 5) * 60 };
}

/** A smooth path through the pins in campaign order (the road the player follows). */
export function routePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // A gentle bend perpendicular to the segment, alternating sides, so the road winds like a mountain road.
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const k = (i % 2 ? 1 : -1) * 0.18;
    d += ` Q${(mx + (nx / len) * len * k).toFixed(1)} ${(my + (ny / len) * len * k).toFixed(1)} ${b.x} ${b.y}`;
  }
  return d;
}
