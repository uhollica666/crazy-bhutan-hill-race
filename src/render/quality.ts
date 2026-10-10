import type { QualityLevel } from '../storage/SaveStore';

export interface QualityProfile {
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  surfaceDetail: number;
  anisotropy: number;
  streetLights: number;
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
    surfaceDetail:0,anisotropy:1,streetLights:0,
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
    surfaceDetail:1,anisotropy:4,streetLights:1,
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
    surfaceDetail:2,anisotropy:8,streetLights:3,
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
  max: {maxPixelRatio:2.5,surfaceDetail:3,anisotropy:16,streetLights:6,renderScale:1.1,terrainCoarse:false,particleDensity:1,skidMarks:true,snowCount:1600,rainDrops:1500,trafficScale:1,shadows:true,shadowMapSize:4096,propDensity:1,fogFar:1200,cameraFar:2500,antialias:true,windSway:true},
  auto: {maxPixelRatio:1.5,surfaceDetail:1,anisotropy:4,streetLights:1,renderScale:1,terrainCoarse:false,particleDensity:0.75,skidMarks:true,snowCount:500,rainDrops:600,trafficScale:0.8,shadows:true,shadowMapSize:1024,propDensity:0.75,fogFar:760,cameraFar:1800,antialias:true,windSway:true},
};

export type ManualQuality = Exclude<QualityLevel,'auto'>;
/** Auto starts from CPU/memory hints and detects software WebGL when renderer information is available. */
export function resolveQuality(level:QualityLevel,gl?:WebGLRenderingContext|WebGL2RenderingContext):ManualQuality {
 if(level!=='auto')return level;
 const cores=navigator.hardwareConcurrency||4;
 const mem=(navigator as Navigator & {deviceMemory?:number}).deviceMemory;
 const mobile=window.matchMedia?.('(pointer: coarse)').matches||false;
 if(gl){const info=gl.getExtension('WEBGL_debug_renderer_info');const name=info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):'';if(/swiftshader|llvmpipe|software|microsoft basic/i.test(name))return 'low';}
 if(mobile)return cores<=4||(mem!==undefined&&mem<=3)?'low':'medium';
 return cores<=2||(mem!==undefined&&mem<=2)?'low':cores>=8&&(mem===undefined||mem>=8)?'high':'medium';
}
/** Saved preference stays Auto while the renderer resolves the available tier. */
export function detectDefaultQuality(_win: Window): QualityLevel { return 'auto'; }
/** Existing analytics schema continues receiving its original three tiers. */
export function telemetryQuality(level:QualityLevel):'low'|'medium'|'high' {
 const resolved=resolveQuality(level);return resolved==='max'?'high':resolved;
}
