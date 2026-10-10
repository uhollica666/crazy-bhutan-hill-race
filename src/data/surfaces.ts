import type { SurfaceId } from './types';

export interface SurfaceDef {
  id: SurfaceId;
  name: string;
  /** Multiplier on tyre grip (longitudinal and lateral). */
  grip: number;
  /** Extra rolling drag as deceleration per m/s of speed (1/s). */
  rolling: number;
  /**
   * 0..1. How much of the grip loss an off-road-capable vehicle claws back here
   * (effective grip = grip + (1 - grip) * looseness * vehicle.offroad * tyreOffroad).
   */
  looseness: number;
  /** Dust / spray colour kicked up by tyres (hex), or null for none. */
  dust: number | null;
  /** Spray is wet (mud / water splashes) rather than dust. */
  wet: boolean;
  /** Structural damage per second at 20 m/s on a vehicle with no armour (health points). */
  roughness: number;
  audio: 'asphalt' | 'gravel' | 'dirt' | 'mud' | 'water' | 'snow';
  /** What this surface turns into when it rains. */
  wetVariant?: SurfaceId;
}

/** Data-driven surface table. Add a row, and tyres, drag, particles and sound pick it up. */
export const SURFACES: Record<SurfaceId, SurfaceDef> = {
  asphalt: { id: 'asphalt', name: 'Asphalt', grip: 1, rolling: 0, looseness: 0, dust: null, wet: false, roughness: 0, audio: 'asphalt', wetVariant: 'wetAsphalt' },
  // Old, cracked and patched tarmac: a touch less grip than new asphalt, and a little rattle.
  worn: { id: 'worn', name: 'Weathered asphalt', grip: 0.93, rolling: 0.004, looseness: 0.1, dust: 0xc9c2b4, wet: false, roughness: 0.05, audio: 'asphalt', wetVariant: 'wetAsphalt' },
  wetAsphalt: { id: 'wetAsphalt', name: 'Wet asphalt', grip: 0.72, rolling: 0.01, looseness: 0.1, dust: 0xbfd0d8, wet: true, roughness: 0, audio: 'water' },
  dirt: { id: 'dirt', name: 'Dirt track', grip: 0.78, rolling: 0.05, looseness: 0.5, dust: 0xb59b6a, wet: false, roughness: 0.15, audio: 'dirt', wetVariant: 'mud' },
  gravel: { id: 'gravel', name: 'Gravel', grip: 0.68, rolling: 0.07, looseness: 0.55, dust: 0xc4b79a, wet: false, roughness: 0.25, audio: 'gravel', wetVariant: 'mud' },
  rocky: { id: 'rocky', name: 'Rocky road', grip: 0.72, rolling: 0.06, looseness: 0.5, dust: 0x9a9388, wet: false, roughness: 1.4, audio: 'gravel' },
  mud: { id: 'mud', name: 'Mud', grip: 0.42, rolling: 0.14, looseness: 0.85, dust: 0x5b4330, wet: true, roughness: 0.2, audio: 'mud' },
  water: { id: 'water', name: 'Shallow water', grip: 0.5, rolling: 0.34, looseness: 0.5, dust: 0xcfe8f2, wet: true, roughness: 0, audio: 'water' },
  // Packed frost near the pass: slippery but never extreme (grip 0.55), a little more forgiving for capable vehicles.
  ice: { id: 'ice', name: 'Icy road', grip: 0.55, rolling: 0.012, looseness: 0.35, dust: 0xe4f1f8, wet: false, roughness: 0, audio: 'asphalt' },
  // Mountain winter: a thin frost on the tarmac (still good grip, a warning), packed snow, fresh snow and wet slush. They are loose enough
  // that a vehicle with selectable 4x4 claws back some grip, and with two driven axles instead of one it can use all of it.
  frost: { id: 'frost', name: 'Frosty road', grip: 0.8, rolling: 0.005, looseness: 0.2, dust: 0xe4eef4, wet: false, roughness: 0, audio: 'asphalt' },
  packed: { id: 'packed', name: 'Packed snow', grip: 0.55, rolling: 0.03, looseness: 0.45, dust: 0xf1f6fa, wet: false, roughness: 0, audio: 'snow' },
  snow: { id: 'snow', name: 'Snow', grip: 0.46, rolling: 0.15, looseness: 0.55, dust: 0xf4f8fb, wet: false, roughness: 0, audio: 'snow' },
  slush: { id: 'slush', name: 'Slush', grip: 0.42, rolling: 0.2, looseness: 0.5, dust: 0xd3dade, wet: true, roughness: 0, audio: 'water' },
  grass: { id: 'grass', name: 'Grass', grip: 0.6, rolling: 0.09, looseness: 0.6, dust: 0x9fbf6a, wet: false, roughness: 0.1, audio: 'dirt' },
};

export const getSurface = (id: SurfaceId): SurfaceDef => SURFACES[id];

/** The surface a given base surface becomes at `wetness` (0..1): beyond 0.5 it switches to its wet variant. */
export function wetSurface(id: SurfaceId, wetness: number): SurfaceId {
  const s = SURFACES[id];
  return wetness >= 0.5 && s.wetVariant ? s.wetVariant : id;
}

/**
 * Effective tyre grip multiplier on a surface for a vehicle.
 * @param offroad vehicle.offroad (0..1) times the tyre upgrade factor
 */
export function effectiveGrip(surface: SurfaceDef, offroad: number): number {
  const recovered = (1 - surface.grip) * surface.looseness * Math.min(1, Math.max(0, offroad));
  return Math.min(1, surface.grip + recovered);
}
