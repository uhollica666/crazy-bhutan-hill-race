import type { QualityLevel } from '../storage/SaveStore';

export interface QualityProfile {
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  /** Render scale applied on top of the pixel ratio (dynamic-resolution floor). */
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
