import type { QualityLevel } from '../storage/SaveStore';

export interface QualityProfile {
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  /** Multiplier on the pixel ratio (Low renders fewer pixels). */
  renderScale: number;
  /** Draw the terrain with every 2nd grid node (about 4x fewer terrain triangles). */
  terrainCoarse: boolean;
  /** 0..1 share of dust / smoke particles that are spawned. */
  particleDensity: number;
  skidMarks: boolean;
  snowCount: number;
  /** Rain streaks drawn at full intensity. */
  rainDrops: number;
  /** Share of a level's traffic that is simulated and drawn (lower tiers have fewer cars). */
  trafficScale: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Fraction of the level's tree / rock budget that is drawn. */
  propDensity: number;
  fogFar: number;
  cameraFar: number;
  antialias: boolean;
  /** Cheap procedural flag animation. */
  windSway: boolean;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: {
    maxPixelRatio: 1,
    renderScale: 0.8,
    terrainCoarse: true,
    particleDensity: 0.4,
    skidMarks: false,
    snowCount: 220,
    rainDrops: 260,
    trafficScale: 0.5,
    shadows: false,
    shadowMapSize: 0,
    propDensity: 0.4,
    fogFar: 520,
    cameraFar: 1400,
    antialias: false,
    windSway: false,
  },
  medium: {
    maxPixelRatio: 1.5,
    renderScale: 1,
    terrainCoarse: false,
    particleDensity: 0.75,
    skidMarks: true,
    snowCount: 500,
    rainDrops: 600,
    trafficScale: 0.8,
    shadows: true,
    shadowMapSize: 1024,
    propDensity: 0.75,
    fogFar: 760,
    cameraFar: 1800,
    antialias: true,
    windSway: true,
  },
  high: {
    maxPixelRatio: 2,
    renderScale: 1,
    terrainCoarse: false,
    particleDensity: 1,
    skidMarks: true,
    snowCount: 900,
    rainDrops: 900,
    trafficScale: 1,
    shadows: true,
    shadowMapSize: 2048,
    propDensity: 1,
    fogFar: 1000,
    cameraFar: 2200,
    antialias: true,
    windSway: true,
  },
};

/** First-run default: phones and tablets start on a lighter profile. */
export function detectDefaultQuality(win: Window): QualityLevel {
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (coarse) return cores <= 4 || mem <= 3 ? 'low' : 'medium';
  return cores <= 2 ? 'medium' : 'high';
}
