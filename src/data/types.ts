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

export type SurfaceId = 'asphalt' | 'wetAsphalt' | 'dirt' | 'gravel' | 'rocky' | 'mud' | 'water' | 'grass' | 'ice';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'heavyRain' | 'fog' | 'denseFog' | 'snow';
export type TimeOfDay = 'day' | 'dusk' | 'night';

/** Conditions a mission can be driven in. The first entry of `LevelDef.conditions` is the default. */
export interface ConditionsDef {
  weather: WeatherKind;
  time: TimeOfDay;
  /** Extra reward multiplier for taking the harder option (1 = none). */
  bonus: number;
}

/** pickup: tourists board; dropoff: some of the tourists on board get out (sequential groups); service: fuel / repairs. */
export type StopKind = 'pickup' | 'service' | 'dropoff';
export type ServiceKind = 'refuel' | 'repair';

export interface StopDef {
  id: string;
  kind: StopKind;
  /** Fraction (0..1) of the playable stretch between start and finish. */
  at: number;
  label: string;
  /** Which side of the road the layby / group stands on. */
  side: -1 | 1;
  /** pickup: how many tourists board here; dropoff: how many get out. */
  party?: number;
  /** service: what is offered. */
  services?: ServiceKind[];
  /** Optional stops can be skipped (pit stops); required ones gate the finish. */
  optional: boolean;
  /** Story key for the people waiting (portrait set). */
  who?: string;
  /** service: which building to draw (default: fuel station). */
  variant?: 'fuel' | 'workshop' | 'kiosk';
}

export type HazardKind = 'landslide' | 'creature' | 'brokenTruck' | 'herd';

export interface HazardDef {
  id: string;
  kind: HazardKind;
  /** Fraction of the playable stretch where it happens. */
  at: number;
  /** Seeds the layout, so a given mission always plays the same way. */
  seed: number;
  label: string;
  /** creature: the friendly yeti (default) or a pale lantern ghost seen in the dark. */
  variant?: 'yeti' | 'ghost';
  /** Creatures and herds that react to the car: they set off as it approaches and hurry if it comes in fast. */
  reactive?: boolean;
  /** herd: how many animals cross together (default 4). */
  count?: number;
}

/** A shallow puddle lying on the road: tyres splash and lose some grip, but it never stalls a car. */
export interface PuddleDef {
  /** Fraction (0..1) of the playable stretch. */
  at: number;
  /** Lateral offset from the centre line (m, + = right of travel). */
  lateral: number;
  /** Radius (m). */
  radius: number;
}

export type TrafficKind = 'car' | 'suv' | 'bus' | 'truck' | 'moto' | 'bike' | 'taxi' | 'minibus' | 'scooter' | 'delivery';

/** A traffic officer directing a junction, or a zebra crossing that traffic yields at. `at` is a fraction of the stretch. */
export interface TrafficControlDef {
  at: number;
  kind: 'police' | 'crossing';
  /** police: seconds of green / red for the main road. crossing: how many pedestrians cross together. */
  go?: number;
  stop?: number;
  peds?: number;
}

/** A side street joining the main road (drawn and drivable by cross traffic and turning cars). */
export interface JunctionDef {
  at: number;
  /** Length (m) of the side street beyond the main road's parapet. */
  arm: number;
  width: number;
  /** Which sides the street leaves on (-1 left, +1 right). */
  sides: (-1 | 1)[];
  /** A zebra crossing just before the junction. */
  zebra?: boolean;
}

export interface TrafficDef {
  /** Share of each kind of road user (default: cars only, as in the older missions). */
  mix?: { kind: TrafficKind; weight: number }[];
  /**
   * Hand-placed road users: spawned once, as the player approaches `at` (fraction of the stretch). With `hold` they stand still
   * (a queue, a truck blocking a lane) until the player is within `trigger` metres, then wait `hold` more seconds and drive off.
   */
  scripted?: { at: number; kind: TrafficKind; speed: number; hold?: number; trigger?: number }[];
  /** Signals the traffic obeys: a police-directed junction and pedestrian crossings. */
  controls?: TrafficControlDef[];
  /** Chance (0..1) that a car approaching a side street turns into it. */
  turnChance?: number;
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
  | 'station'
  | 'retainWall'
  | 'viewpoint'
  | 'signpost'
  | 'stall'
  | 'plaza'
  | 'hotel'
  | 'office'
  | 'busShelter'
  | 'policeBooth'
  | 'railing'
  | 'gateArch'
  | 'buddha'
  | 'planter'
  | 'restaurant';

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
  /** Colour of the verge beside the asphalt (default: gravel; a city uses pale paving). */
  shoulder?: number;
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

/** Life beside the road: nothing here is ever on the asphalt. */
export interface RoadsideDef {
  /** People strolling back and forth along `span` metres of verge. */
  walkers?: { at: number; side: -1 | 1; count: number; span: number; offset?: number }[];
  /** Vehicles parked on the verge (or behind the parapet where the verge is narrow). */
  parked?: { at: number; side: -1 | 1; kind: TrafficKind; offset?: number; rotation?: number; edge?: boolean }[];
  /** The crowd waiting at the destination: `width` metres along the road, `offset` metres onto the verge. */
  crowd?: { at: number; side: -1 | 1; count: number; offset: number; width: number };
  /** Grazing yaks (decoration only). */
  yaks?: { at: number; side: -1 | 1; offset: number }[];
  /** People standing about: bus stops, taxi queues, shopkeepers, small groups chatting. */
  standing?: { at: number; side: -1 | 1; count: number; offset?: number }[];
  /** Traffic officers (a pavilion and a figure that signals the phase of the junction's control). */
  police?: { at: number; side: -1 | 1 }[];
  /** Perched birds that take off when the car comes near. */
  birds?: { at: number; side: -1 | 1; offset: number; count: number }[];
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  objective: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Campaign chapter the mission is listed under on the mission map. */
  region: string;
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
  /** Villagers, parked vehicles, the arrival crowd. */
  roadside?: RoadsideDef;
  /** Arrival celebration (confetti, cheering crowd) on a successful delivery. */
  celebrate?: boolean;
  /** Black-and-white checkered flags are raised at the drop-off during the celebration. */
  celebrateFlags?: boolean;
  /** Side streets and zebra crossings on the main road. */
  junctions?: JunctionDef[];
  /** Shallow puddles on the road (training route and wet stretches). */
  puddles?: PuddleDef[];
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
    /** A broad hill: the ground rises toward (x, z), reaching `height` there and nothing at `radius` metres out. */
    uplift?: { x: number; z: number; radius: number; height: number };
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
    /** Stretches (fractions of the whole road) that are narrower or wider than `width`, with their own shoulder. Blended smoothly. */
    widthProfile?: { from: number; to: number; width: number; shoulder?: number }[];
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
