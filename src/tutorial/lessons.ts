import type { ConditionsDef, SurfaceId } from '../data/types';
import type { MissionRuntime } from '../gameplay/MissionRuntime';
import type { VehicleInput } from '../physics/types';
import { ACADEMY } from '../data/levels/academy';

/** A control the lesson wants the player to use: shown as a chip and lit while the control is pressed. */
export interface Chip {
  id: 'throttle' | 'brake' | 'left' | 'right' | 'pause' | 'recover' | 'service' | 'drive';
  keys: string;
  touch: string;
  label: string;
}

export const CHIPS: Record<Chip['id'], Chip> = {
  throttle: { id: 'throttle', keys: 'W / ↑', touch: 'GAS', label: 'Accelerate' },
  brake: { id: 'brake', keys: 'S / ↓', touch: 'BRAKE', label: 'Brake, then reverse' },
  left: { id: 'left', keys: 'A / ←', touch: 'Steer left', label: 'Steer left' },
  right: { id: 'right', keys: 'D / →', touch: 'Steer right', label: 'Steer right' },
  pause: { id: 'pause', keys: 'Esc', touch: 'II button', label: 'Pause' },
  recover: { id: 'recover', keys: 'R', touch: '↻ button', label: 'Recover' },
  service: { id: 'service', keys: 'E', touch: 'Service button', label: 'Refuel / repair' },
  drive: { id: 'drive', keys: 'F', touch: '4x4 chip', label: '4x4 / 4x2' },
};

/** Counters filled in from the mission's events. Steps compare against a baseline taken when they begin. */
export interface EventCounts {
  recovered: number;
  touched: number;
  impacts: number;
  paused: number;
  resumed: number;
  boarded: Set<string>;
  refuelled: number;
  repaired: number;
  gone: Set<string>;
}

export interface LessonHost {
  toast(text: string): void;
  /** Puts the car back on the road `m` metres from the start line (keeps fuel and damage). */
  placeAt(m: number): void;
  setConditions(c: Pick<ConditionsDef, 'weather' | 'time'>): void;
  /** Puts named hazards back to their starting state so a lesson can be retried. */
  resetHazards(ids: string[]): void;
}

export interface StepCtx {
  /** Metres from the start line. */
  m: number;
  dt: number;
  /** Absolute speed (km/h) and signed forward speed (m/s, negative when reversing). */
  speedKmh: number;
  speed: number;
  cmd: VehicleInput;
  rt: MissionRuntime;
  /** Scratch values for the current step and for the whole lesson (cleared on retry). */
  sf: Record<string, number>;
  lf: Record<string, number>;
  ev: EventCounts;
  host: LessonHost;
  /** True when any wheel is touching the given surface. */
  onSurface(id: SurfaceId): boolean;
}

export interface Step {
  id: string;
  /** One or two short sentences: what to do. */
  text: string;
  chips?: Chip['id'][];
  /** HUD elements to pulse while this step is active. */
  highlight?: string[];
  /** A short explanation shown on a paused "Got it" card before the step starts. */
  card?: string;
  enter?(c: StepCtx): void;
  tick?(c: StepCtx): void;
  done(c: StepCtx): boolean;
  /** Returns a message when the attempt should restart from `retryFrom` (soft retry: nothing is lost). */
  fail?(c: StepCtx): string | null;
  retryFrom?: number;
}

export interface Lesson {
  id: string;
  title: string;
  /** Essential lessons must be completed before "Done, start the game" unlocks; the rest is optional practice. */
  essential: boolean;
  /** Metres from the start line where the lesson begins and where its barrier stands. */
  from: number;
  to: number;
  /** The paused card shown on entering the lesson. */
  intro: string;
  /** Hazards that belong to this lesson (reset when it is retried). */
  hazards?: string[];
  setup?(c: StepCtx): void;
  /** Called when the lesson is finished or skipped, to leave the world tidy. */
  cleanup?(rt: MissionRuntime, host: LessonHost): void;
  steps: Step[];
}

const A = ACADEMY;
const kmh = (c: StepCtx): number => c.speedKmh;
const inZone = (c: StepCtx, centre: number, radius = 9): boolean => Math.abs(c.m - centre) <= radius;
const CLEAR: Pick<ConditionsDef, 'weather' | 'time'> = { weather: 'clear', time: 'day' };

/** A weather stretch is passed cautiously when the average speed over it stays at or under this (km/h). */
const CAUTIOUS_KMH = 62;

/** Shared logic for the three weather stretches: track the average speed, soft-retry if the car was driven too fast. */
function weatherStep(
  id: string,
  text: string,
  from: number,
  to: number,
  cond: Pick<ConditionsDef, 'weather' | 'time'>,
  tip: string,
  extra?: { holdUntilGone?: string },
): Step {
  return {
    id,
    text,
    card: tip,
    retryFrom: from,
    enter: (c) => {
      c.host.setConditions(cond);
      c.sf.dist = 0;
      c.sf.time = 0;
    },
    tick: (c) => {
      if (c.m >= from) {
        c.sf.dist += Math.max(0, Math.abs(c.speed)) * c.dt;
        c.sf.time += c.dt;
      }
    },
    done: (c) => c.m >= to && (!extra?.holdUntilGone || c.ev.gone.has(extra.holdUntilGone)) && c.sf.time > 4 && (c.sf.dist / c.sf.time) * 3.6 <= CAUTIOUS_KMH,
    fail: (c) => {
      if (c.m >= to && c.sf.time > 0 && (c.sf.dist / c.sf.time) * 3.6 > CAUTIOUS_KMH)
        return 'That was fast for these conditions. Take it a little slower and try again: nothing is lost.';
      return null;
    },
  };
}

/** The ten Route 0 lessons, in road order. Each step succeeds only when the player really does the thing. */
export const LESSONS: Lesson[] = [
  {
    id: 'controls',
    title: 'Driving basics',
    essential: true,
    from: A.controls.from,
    to: A.controls.to,
    intro: 'Welcome to the Academy. Six quick skills: accelerate, steer, brake, reverse, pause and recover. Nothing here can go wrong.',
    steps: [
      { id: 'accelerate', text: 'Hold the gas to build speed. Reach 30 km/h.', chips: ['throttle'], highlight: ['[data-role=gas]'], done: (c) => kmh(c) >= 30 },
      {
        id: 'steer',
        text: 'Steer left, then right. A gentle touch is plenty.',
        chips: ['left', 'right'],
        highlight: ['[data-role=steer]', '[data-role=wheel]'],
        tick: (c) => {
          if (c.cmd.steer < -0.45) c.sf.left = 1;
          if (c.cmd.steer > 0.45) c.sf.right = 1;
        },
        done: (c) => c.sf.left === 1 && c.sf.right === 1,
      },
      {
        id: 'brake',
        text: 'Get above 20 km/h, then brake to a full stop.',
        chips: ['brake'],
        highlight: ['[data-role=brake]'],
        tick: (c) => {
          if (kmh(c) >= 20) c.sf.fast = 1;
        },
        done: (c) => c.sf.fast === 1 && kmh(c) < 1,
      },
      {
        id: 'reverse',
        text: 'Stopped? Keep holding brake and the car reverses. Back up about 8 metres.',
        chips: ['brake'],
        highlight: ['[data-role=brake]'],
        tick: (c) => {
          if (c.speed < -0.3) c.sf.back = (c.sf.back ?? 0) + -c.speed * c.dt;
        },
        done: (c) => (c.sf.back ?? 0) >= 8,
      },
      {
        id: 'pause',
        text: 'Pause the game, then resume. You can do this any time.',
        chips: ['pause'],
        highlight: ['#btn-pause'],
        enter: (c) => {
          c.sf.p0 = c.ev.paused;
          c.sf.r0 = c.ev.resumed;
        },
        done: (c) => c.ev.paused > c.sf.p0 && c.ev.resumed > c.sf.r0,
      },
      {
        id: 'recover',
        text: 'Stuck or upside down? Recover puts you back on the road. Try it now.',
        chips: ['recover'],
        highlight: ['#btn-recover'],
        enter: (c) => {
          c.sf.rec = c.ev.recovered;
          c.rt.session.lastSafeS = c.rt.s; // practise recovering right here
        },
        done: (c) => c.ev.recovered > c.sf.rec,
      },
    ],
  },
  {
    id: 'passengers',
    title: 'Passengers',
    essential: true,
    from: A.passengers.from,
    to: A.passengers.to,
    intro: 'Tourists wait in yellow zones. Stop inside, and they climb aboard. Smooth driving keeps them comfortable.',
    steps: [
      {
        id: 'pickup',
        text: 'Pull into the yellow zone and stop. The tourists will board.',
        chips: ['brake'],
        done: (c) => c.ev.boarded.has('academy-pickup-1'),
      },
      {
        id: 'comfort',
        text: 'Watch the comfort meter. Steer, brake and accelerate gently to keep it above 65% for 12 seconds.',
        tick: (c) => {
          const v = c.rt.session.comfort?.value ?? 100;
          if (v >= 65 && kmh(c) > 8) c.sf.calm = (c.sf.calm ?? 0) + c.dt;
        },
        done: (c) => (c.sf.calm ?? 0) >= 12,
      },
      {
        id: 'dropoff',
        text: 'Stop in the blue zone at the guesthouse to drop everyone off.',
        chips: ['brake'],
        tick: (c) => {
          if (inZone(c, A.passengers.dropoff) && kmh(c) < 6) c.sf.held = (c.sf.held ?? 0) + c.dt;
          else c.sf.held = Math.max(0, (c.sf.held ?? 0) - c.dt);
        },
        done: (c) => (c.sf.held ?? 0) >= 1.8,
      },
    ],
    cleanup: (rt) => {
      rt.stops.onboard = 0;
    },
  },
  {
    id: 'fuel',
    title: 'Fuel',
    essential: true,
    from: A.fuel.from,
    to: A.fuel.to,
    intro: 'The tank is nearly empty on purpose. Learn to read the warning and fill up. Here the pump is free.',
    setup: (c) => {
      c.rt.status.fuel = 0.15;
    },
    steps: [
      {
        id: 'warning',
        text: 'Low fuel! The gauge and the warning chip say so. Drive to the pump ahead.',
        highlight: ['#hud-cluster'],
        done: (c) => c.m >= A.fuel.station - 40,
      },
      {
        id: 'refuel',
        text: 'Stop in the blue zone, then press the Refuel button until the tank is full.',
        chips: ['brake', 'service'],
        highlight: ['#btn-refuel', '#hud-prompt'],
        enter: (c) => {
          c.sf.f0 = c.ev.refuelled;
        },
        done: (c) => c.ev.refuelled > c.sf.f0,
      },
    ],
  },
  {
    id: 'repairs',
    title: 'Damage and repairs',
    essential: true,
    from: A.repair.from,
    to: A.repair.to,
    intro: 'Crashes and rough roads wear the car down. Below half condition it loses power. A workshop fixes it.',
    setup: (c) => {
      c.rt.status.health = 52;
    },
    steps: [
      {
        id: 'condition',
        text: 'Your car took a knock: the condition gauge is low. Drive to the workshop ahead.',
        highlight: ['#hud-cluster'],
        done: (c) => c.m >= A.repair.station - 40,
      },
      {
        id: 'repair',
        text: 'Stop in the blue zone and press Repair until the car is as good as new.',
        chips: ['brake', 'service'],
        highlight: ['#btn-repair', '#hud-prompt'],
        enter: (c) => {
          c.sf.r0 = c.ev.repaired;
        },
        done: (c) => c.ev.repaired > c.sf.r0,
      },
    ],
  },
  {
    id: 'surfaces',
    title: 'Surfaces and water',
    essential: true,
    from: A.surfaces.from,
    to: A.surfaces.to,
    intro: 'Not every road is tarmac. Each surface grips differently. Slow down before it, not on it.',
    steps: [
      {
        id: 'gravel',
        text: 'Gravel: loose and slidey. Brake early, steer gently.',
        card: 'Gravel gives less grip than asphalt, so stopping takes longer.',
        tick: (c) => {
          if (c.onSurface('gravel')) c.sf.on = 1;
        },
        done: (c) => c.m >= A.surfaces.gravel[1] + 4 && c.sf.on === 1,
      },
      {
        id: 'dirt',
        text: 'Dirt track: ruts and dust. Keep a steady speed.',
        tick: (c) => {
          if (c.onSurface('dirt')) c.sf.on = 1;
        },
        done: (c) => c.m >= A.surfaces.dirt[1] + 4 && c.sf.on === 1,
      },
      {
        id: 'rocky',
        text: 'Rocky road: it scrapes the underside. Go slowly and watch the condition gauge.',
        tick: (c) => {
          if (c.onSurface('rocky')) c.sf.on = 1;
        },
        done: (c) => c.m >= A.surfaces.rocky[1] + 4 && c.sf.on === 1,
      },
      {
        id: 'mud',
        text: 'Mud: very slippery. Keep your momentum and steer smoothly.',
        tick: (c) => {
          if (c.onSurface('mud')) c.sf.on = 1;
        },
        done: (c) => c.m >= A.surfaces.mud[1] + 4 && c.sf.on === 1,
      },
      {
        id: 'puddles',
        text: 'Puddles splash and cost a little grip. Drive through one, slowly.',
        card: 'Shallow puddles are safe, but they spray and slide. Deeper water is another matter.',
        tick: (c) => {
          if (c.onSurface('water') && kmh(c) > 4) c.sf.splash = 1;
        },
        done: (c) => c.m >= A.surfaces.puddles[1] + 6 && c.sf.splash === 1,
      },
      {
        id: 'ford',
        text: 'Water crossing: roll through the ford straight and steady. This one is 0.3 m deep; your car can wade 0.5 m.',
        card: 'A vehicle stalls in water deeper than its wading depth. Check the garage stats before you try a deep ford.',
        tick: (c) => {
          if (c.rt.status.waterDepth > 0.05) c.sf.wet = 1;
        },
        fail: (c) => (c.rt.status.issue === 'flooded' || (c.sf.wet === 1 && c.rt.status.stalledFor > 0) ? 'The engine took on water. Back to the ford for another go.' : null),
        retryFrom: A.surfaces.ford[0] - 25,
        done: (c) => c.m >= A.surfaces.ford[1] + 8 && c.sf.wet === 1 && c.rt.status.stalledFor <= 0,
      },
    ],
  },
  {
    id: 'fourbyfour',
    title: '4x4 traction',
    essential: false,
    from: A.fourByFour.from,
    to: A.fourByFour.to,
    intro: 'A steep muddy hill. This loaner is a 4x4: it can send power to all four wheels. Optional practice.',
    setup: (c) => {
      c.rt.setDriveMode('4x2');
    },
    cleanup: (rt) => {
      rt.setDriveMode('4x2');
    },
    steps: [
      {
        id: 'engage',
        text: '4x4 sends power to all wheels: more grip, more fuel. Tap the 4x4 chip on the gauge (or F) to switch it on.',
        chips: ['drive'],
        highlight: ['#btn-drive'],
        done: (c) => c.rt.body.driveMode === '4x4',
      },
      {
        id: 'climb',
        text: 'Climb the muddy hill. Keep the gas steady.',
        chips: ['throttle'],
        highlight: ['#btn-drive'],
        done: (c) => c.m >= A.fourByFour.hump[1] + 6 && c.rt.body.driveMode === '4x4',
      },
      {
        id: 'disengage',
        text: 'Back on tarmac, switch to 4x2 again to save fuel.',
        chips: ['drive'],
        highlight: ['#btn-drive'],
        done: (c) => c.rt.body.driveMode === '4x2',
      },
    ],
  },
  {
    id: 'obstacles',
    title: 'Roadblocks and rockfalls',
    essential: true,
    from: A.obstacles.from,
    to: A.obstacles.to,
    hazards: ['academy-rock-1', 'academy-truck'],
    intro: 'Rocks fall and lorries break down. There is always a gap: slow down, pick a line, ease through.',
    steps: [
      {
        id: 'rockfall',
        text: 'Rockfall ahead! Slow down and steer through the gap.',
        retryFrom: A.obstacles.rockfall - 120,
        enter: (c) => {
          c.sf.t0 = c.ev.touched;
        },
        tick: (c) => {
          if (c.ev.touched > c.sf.t0 && !c.sf.warned) {
            c.sf.warned = 1;
            c.host.toast('You bumped a rock. No harm done in training: look for the widest gap.');
          }
        },
        done: (c) => c.m >= A.obstacles.rockfall + 22,
      },
      {
        id: 'truck',
        text: 'A lorry has broken down. Give it room and pass in the clear lane.',
        done: (c) => c.m >= A.obstacles.truck + 18,
      },
    ],
  },
  {
    id: 'wildlife',
    title: 'Yetis and animals',
    essential: false,
    from: A.wildlife.from,
    to: A.wildlife.to,
    hazards: ['academy-yeti', 'academy-herd'],
    intro: 'Friendly creatures share these roads. Slow down and let them cross: they notice a fast car and wait for it.',
    steps: [
      {
        id: 'yeti',
        text: 'A friendly yeti is crossing. Stop and let it wave you through.',
        chips: ['brake'],
        retryFrom: A.wildlife.yeti - 130,
        done: (c) => c.ev.gone.has('academy-yeti') && c.m >= A.wildlife.yeti + 12,
      },
      {
        id: 'herd',
        text: 'A herd of yaks is crossing. Stop, wait for the last one, then go.',
        chips: ['brake'],
        retryFrom: A.wildlife.herd - 140,
        done: (c) => c.ev.gone.has('academy-herd') && c.m >= A.wildlife.herd + 14,
      },
    ],
  },
  {
    id: 'weather',
    title: 'Rain, fog and night',
    essential: false,
    from: A.weather.from,
    to: A.weather.to,
    hazards: ['academy-ghost'],
    intro: 'Weather changes how far you can see and how far you slide. Drive each stretch calmly: slow and smooth wins.',
    cleanup: (rt, host) => {
      host.setConditions(CLEAR);
      void rt;
    },
    steps: [
      weatherStep('rain', 'Rain: the road is slick. Brake earlier and steer smoothly through this stretch.', A.weather.rain[0], A.weather.rain[1], { weather: 'rain', time: 'day' }, 'Wet roads stretch your braking distance. Leave extra room and avoid sudden moves.'),
      weatherStep('fog', 'Dense fog: you can only see a short way. Slow right down and follow the road edge.', A.weather.fog[0], A.weather.fog[1], { weather: 'denseFog', time: 'day' }, 'In fog, drive so you can stop within what you can see.'),
      weatherStep('night', 'Night: your headlights show a short stretch. Something may cross. Drive to what you can see.', A.weather.night[0], A.weather.night[1], { weather: 'clear', time: 'night' }, 'At night, headlights light only the road just ahead. A lantern spirit sometimes wanders across.', { holdUntilGone: 'academy-ghost' }),
    ],
  },
  {
    id: 'delivery',
    title: 'Practice delivery',
    essential: false,
    from: A.delivery.from,
    to: A.delivery.to,
    hazards: ['academy-rock-2'],
    intro: 'Put it all together: pick up two tourists, handle the road, and deliver them gently to the Academy gate.',
    setup: (c) => {
      c.host.setConditions(CLEAR);
    },
    steps: [
      {
        id: 'pickup',
        text: 'Collect the final two tourists from the yellow zone.',
        chips: ['brake'],
        done: (c) => c.ev.boarded.has('academy-pickup-2'),
      },
      {
        id: 'road',
        text: 'Splash through the puddle and ease past the rockfall. Keep the passengers comfortable.',
        done: (c) => c.m >= A.delivery.rockfall + 25,
      },
      {
        id: 'deliver',
        text: 'Pull up and stop at the Academy gate to drop them off.',
        chips: ['brake'],
        done: () => false, // finishing the route ends the lesson (the race session reports the finish)
      },
    ],
  },
];

export const ESSENTIAL_IDS = LESSONS.filter((l) => l.essential).map((l) => l.id);
