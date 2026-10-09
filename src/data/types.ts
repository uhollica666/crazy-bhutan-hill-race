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

export interface VehicleDef {
  id: string;
  name: string;
  blurb: string;
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

export type LandmarkKind = 'house' | 'chorten' | 'chortenGroup' | 'flagSpan' | 'lungta' | 'yak';

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

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  objective: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  vehicleId: string;
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
  medals: { gold: number; silver: number; bronze: number };
  /** Future campaign gating. null = always available. */
  unlock: { levelId: string; medal: Exclude<Medal, 'none'> | 'finish' } | null;
  scenery: {
    seed: number;
    trees: number;
    rocks: number;
    landmarks: LandmarkDef[];
  };
  atmosphere: {
    /** Fog tightens and whitens toward this strength at the end of the route (0..1). */
    summitMist: number;
  };
}
