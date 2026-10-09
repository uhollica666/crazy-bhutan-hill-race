/** Static, serializable definitions. Gameplay code reads these; it never hardcodes vehicle or level numbers. */

export interface AxleDef {
  /** Local z of the axle (front axles have negative z: the vehicle faces -Z). */
  z: number;
  halfTrack: number;
  /** Local y of the suspension mount point (relative to the centre of mass). */
  y: number;
  steered: boolean;
  driven: boolean;
}

export type UnlockRequirement = 'finish' | 'bronze' | 'silver' | 'gold';

/** "Complete level X (optionally with at least a given medal)". */
export interface UnlockRule {
  levelId: string;
  requirement: UnlockRequirement;
}

export interface VehicleDef {
  id: string;
  name: string;
  blurb: string;
  /** Which procedural model builder draws it. */
  visual: 'suv' | 'coaster';
  /** Multiplies a level's medal times (slower vehicles get proportionally more time). */
  pace: number;
  unlock: UnlockRule | null;
  camera: {
    distance: number;
    height: number;
    /** Metres the camera looks ahead of the car. */
    lookAhead: number;
    fov: number;
    /** Extra FOV at top speed. */
    fovBoost: number;
  };
  audio: {
    /** Fundamental at idle (Hz) and the extra Hz gained across the rev range. */
    idleHz: number;
    rangeHz: number;
    /** Low-pass cutoff base (Hz). */
    cutoff: number;
    /** 0..1 amount of square/rattle in the engine tone (diesel-ish). */
    harsh: number;
    /** Strength of low rumble / body noise. */
    rumble: number;
  };
  recovery: {
    /** Seconds upside down (or on its side) before auto-recovery. */
    overturnSeconds: number;
  };
  mass: number;
  /** Collision box of the chassis (metres), centred on the centre of mass. */
  size: { width: number; height: number; length: number };
  inertiaScale: { x: number; y: number; z: number };
  /** Arcade gravity (m/s^2). Heavier than real life for a planted, snappy feel. */
  gravity: number;
  axles: AxleDef[];
  wheelRadius: number;
  wheelWidth: number;
  suspension: {
    /** Free spring length (m). */
    rest: number;
    /** Compression before the bump stop engages (m). */
    travel: number;
    stiffness: number;
    damping: number;
    antiRoll: number;
  };
  engine: {
    force: number;
    reverseForce: number;
    /** m/s */
    topSpeed: number;
    reverseSpeed: number;
    brakeForce: number;
    rollingResistance: number;
    /** Extra drag (N per m/s, total) when coasting with the throttle released. */
    engineBraking: number;
    aeroDrag: number;
    /** Only used for engine-sound gear simulation. */
    gearTopSpeeds: number[];
  };
  steering: {
    /** Radians at standstill. */
    maxAngle: number;
    /** Fraction of maxAngle left at `fullSpeed`. */
    highSpeedRatio: number;
    fullSpeed: number;
    /** Steering rack speed, 1/s. */
    rate: number;
  };
  grip: {
    longitudinal: number;
    lateral: number;
    /** Sideways slip speed (m/s) at which lateral grip saturates. */
    slipSpeed: number;
  };
  stability: {
    downforce: number;
    angularDamping: number;
    uprighting: number;
    /** Steering is limited so cornering never asks for more than this lateral acceleration (m/s^2): the vehicle understeers instead of tipping over. */
    maxLateralAccel: number;
    /** 0 = tyre forces act at ground level (lots of body roll/pitch) .. 1 = at the centre of mass (flat, planted). */
    contactLift: number;
    /** Yaw damping torque (N*m per rad/s of sideways slip) that keeps the tail from snapping around. */
    yawAssist: number;
  };
  livery: { body: number; accent: number; trim: number };
}

export type Medal = 'gold' | 'silver' | 'bronze' | 'none';

export interface RoadPointDef {
  x: number;
  z: number;
  /** Metres added on top of the natural terrain height at this point. */
  dy?: number;
}

export type LandmarkKind =
  | 'house'
  | 'chorten'
  | 'chortenGroup'
  | 'flagSpan'
  | 'lungta'
  | 'yak'
  | 'dzong'
  | 'terminal'
  | 'tower'
  | 'plane'
  | 'prayerWheelHouse';

export interface LandmarkDef {
  kind: LandmarkKind;
  /** Position along the whole road as a 0..1 fraction. */
  at: number;
  /** -1 = left of the direction of travel, +1 = right. */
  side: -1 | 1;
  /** Metres from the road centre line. */
  offset: number;
  scale?: number;
  rotation?: number;
}

export interface CheckpointDef {
  /** Fraction (0..1) of the playable stretch between start and finish. */
  at: number;
  label: string;
}

export type MissionKind = 'climb' | 'airport' | 'hillclimb';

export interface MissionDef {
  kind: MissionKind;
  /** "elapsed" counts up toward a limit; "deadline" shows the time left as the headline number. */
  timerStyle: 'elapsed' | 'deadline';
  timerLabel: string;
  /** Whether passenger comfort is tracked and graded. */
  comfort: boolean;
}

/** Optional per-level look: palette, light and ground colours. Omitted fields use the Stage 1 defaults. */
export interface LookDef {
  skyTop?: number;
  skyMid?: number;
  skyHorizon?: number;
  fog?: number;
  mist?: number;
  grassA?: number;
  grassB?: number;
  meadow?: number;
  rock?: number;
  hemi?: number;
  sun?: number;
  sunColor?: number;
  /** Heights (m) where bare rock starts and snow cover starts/ends. */
  rockFrom?: number;
  snowFrom?: number;
  snowTo?: number;
  /** Foliage colour of broadleaf trees and flower colour of shrubs. */
  leaf?: number;
  blossom?: number;
  /** Maximum snow cover 0..1 (patchy at <1). */
  snowMax?: number;
  /** Heights where meadow replaces forest-green grass. */
  meadowFrom?: number;
  meadowTo?: number;
  /** Highest altitude trees are planted at. */
  treeLine?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  objective: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  mission: MissionDef;
  /** Vehicles allowed on this level; the first is the recommended one. */
  vehicles: string[];
  /** Short tip shown on the mission card. */
  tip: string;
  terrain: {
    seed: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    /** Grid spacing in metres (shared by rendering and physics). */
    cell: number;
    /** Metres of rise per metre travelled toward -Z. */
    slope: number;
    /** Low-frequency hill height (m). */
    hillHeight: number;
    /** Extra detail relief that is only applied away from the road (m). */
    detailHeight: number;
    /** A river valley opens up south of this z. */
    valleyZ: number;
    valleyDepth: number;
    waterLevel: number;
  };
  road: {
    width: number;
    /** Gravel strip between asphalt and the stone parapet. */
    shoulder: number;
    points: RoadPointDef[];
    /** Metres of road before the start line / after the finish line (run-out). */
    startOffset: number;
    finishOffset: number;
  };
  checkpoints: CheckpointDef[];
  finishLabel: string;
  /** Seconds. Exceeding it ends the run as "timeout". */
  timeLimit: number;
  /** Time thresholds (s) for the reference vehicle (pace 1.0); scaled by VehicleDef.pace. */
  medals: { gold: number; silver: number; bronze: number };
  /** Per-vehicle override of VehicleDef.pace for this level (a coach is nearly as quick as a 4x4 on a wide valley road). */
  pace?: Record<string, number>;
  /** Passenger comfort (%) needed per medal; only used when mission.comfort is true. */
  comfortMedals: { gold: number; silver: number; bronze: number };
  /** Campaign gating. null = always available. */
  unlock: UnlockRule | null;
  look: LookDef;
  weather: 'none' | 'snow';
  scenery: {
    seed: number;
    trees: number;
    rocks: number;
    /** Relative mix of tree species (normalised). */
    species: { pine: number; cypress: number; broadleaf: number; shrub: number };
    landmarks: LandmarkDef[];
  };
  atmosphere: {
    /** Fog tightens and whitens toward this strength at the end of the route (0..1). */
    summitMist: number;
    /** Fraction of the route where the mist starts building. */
    mistStart: number;
    /** Base fog distance multiplier (<1 = hazier). */
    visibility: number;
  };
}
