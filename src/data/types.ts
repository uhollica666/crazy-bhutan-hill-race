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

export type Drivetrain = '4x2' | '4x4';

export type UpgradeId = 'engine' | 'tires' | 'suspension' | 'brakes' | 'tank' | 'efficiency' | 'armor';

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
  visual: 'hatch' | 'suv' | 'coaster' | 'cruiser';
  /** 1 = humble starter .. 4 = flagship. Display and progression only; handling comes from the numbers below. */
  tier: 1 | 2 | 3 | 4;
  /** Driving credits to buy it once it is available. 0 = owned from the start. */
  price: number;
  /** Seats for tourists. Missions with a bigger party cannot use a smaller vehicle. */
  capacity: number;
  drivetrain: {
    modes: Drivetrain[];
    default: Drivetrain;
    /** Index into `axles` that stays driven in 4x2. Every axle flagged `driven` is driven in 4x4. */
    twoWheelAxle: number;
  };
  fuel: {
    /** Distance (km, game scale) one full tank lasts at steady cruising in 4x2. */
    rangeKm: number;
    /** Tank fraction burned per second just idling. */
    idle: number;
    /** Consumption multiplier while in 4x4. */
    fourByFourFactor: number;
  };
  durability: {
    /** Health points at 100% condition (display scale). */
    health: number;
    /** 0..1 share of impact damage the structure absorbs. */
    resistance: number;
  };
  /** Deepest water (m) it can ford without stalling. */
  wading: number;
  /** 0..1 how well its tyres and running gear cope with loose surfaces (mud, gravel, rock). */
  offroad: number;
  /** Upgrade ids this vehicle accepts. */
  upgrades: UpgradeId[];
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
    /** Exponent of the power fall-off with speed: larger = flatter torque curve, strong right up to top speed. */
    powerExponent: number;
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

export type SurfaceId = 'asphalt' | 'wetAsphalt' | 'dirt' | 'gravel' | 'rocky' | 'mud' | 'water' | 'grass';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'heavyRain' | 'fog' | 'snow';
export type TimeOfDay = 'day' | 'dusk' | 'night';

/** Conditions a mission can be driven in. The first entry of `LevelDef.conditions` is the default. */
export interface ConditionsDef {
  weather: WeatherKind;
  time: TimeOfDay;
  /** Extra reward multiplier for taking the harder option (1 = none). */
  bonus: number;
}

export type StopKind = 'pickup' | 'service';
export type ServiceKind = 'refuel' | 'repair';

export interface StopDef {
  id: string;
  kind: StopKind;
  /** Fraction (0..1) of the playable stretch between start and finish. */
  at: number;
  label: string;
  /** Which side of the road the layby / group stands on. */
  side: -1 | 1;
  /** pickup: how many tourists board here. */
  party?: number;
  /** service: what is offered. */
  services?: ServiceKind[];
  /** Optional stops can be skipped (pit stops); required ones gate the finish. */
  optional: boolean;
  /** Story key for the people waiting (portrait set). */
  who?: string;
}

export type HazardKind = 'landslide' | 'creature' | 'brokenTruck';

export interface HazardDef {
  id: string;
  kind: HazardKind;
  /** Fraction of the playable stretch where it happens. */
  at: number;
  /** Seeds the layout, so a given mission always plays the same way. */
  seed: number;
  label: string;
}

export interface TrafficDef {
  /** Cars alive at once (hard cap). */
  count: number;
  /** Cruise speed range (m/s). */
  speed: [number, number];
  /** Share of cars that come the other way. */
  oncoming: number;
  seed: number;
}

export interface RivalDef {
  name: string;
  /** Vehicle model the rival drives. */
  vehicleId: string;
  /** Average speed as a fraction of the reference time: finishes in `finishTime` seconds. */
  finishTime: number;
  /** The rival starts this many seconds after GO. */
  headStart: number;
}

export type OptionalObjectiveKind = 'comfort' | 'condition' | 'beatRival' | 'goldTime' | 'useService';

export interface OptionalObjectiveDef {
  id: string;
  kind: OptionalObjectiveKind;
  /** comfort: minimum satisfaction %, condition: minimum health %. */
  value?: number;
  reward: number;
  label: string;
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
  | 'prayerWheelHouse'
  | 'shopRow'
  | 'clockTower'
  | 'streetLamp'
  | 'bridge'
  | 'station';

export interface LandmarkDef {
  kind: LandmarkKind;
  /** Absolute world position (overrides at/side/offset): used for city blocks and other layouts that follow streets. */
  pos?: { x: number; z: number };
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

export type MissionKind = 'climb' | 'airport' | 'hillclimb' | 'city' | 'expedition' | 'tour' | 'descent' | 'gorge' | 'night' | 'circuit';

export interface MissionDef {
  kind: MissionKind;
  /** Tourists to carry; every vehicle used must have at least this many seats. */
  party: number;
  /** cross = driving through the finish gate ends the run; stop = stop inside the drop-off zone to unload. */
  finishMode: 'cross' | 'stop';
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
  /** Weather / time-of-day options (first = default). */
  conditions: ConditionsDef[];
  /** Tank fraction the mission starts with (the tourists never fill up). */
  startFuel: number;
  /** Base driving credits for a first-class finish (scaled by medal, time, condition...). */
  reward: number;
  stops: StopDef[];
  hazards: HazardDef[];
  traffic?: TrafficDef;
  rival?: RivalDef;
  optional: OptionalObjectiveDef[];
  /** Road surface by stretch (fractions of the whole road); anything not listed is asphalt. */
  surfaces?: { from: number; to: number; surface: SurfaceId }[];
  /** Surface of the shoulder next to the asphalt. */
  shoulder?: SurfaceId;
  /** Optional ford: the road dips under water between these fractions of the road. */
  ford?: { from: number; to: number; depth: number };
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
    /**
     * The ground falls away from the road: a shelf above a river valley or a cliff drop. Applied outside the
     * road corridor, optionally on one side only (+1 right of travel, -1 left, omitted = both).
     */
    drop?: { start: number; width: number; depth: number; side?: -1 | 1 };
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
