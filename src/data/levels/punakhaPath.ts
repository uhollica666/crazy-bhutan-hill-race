import type { PathCmd } from './extend';

/**
 * Level 4's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north: a
 * fictionalised drive from a Wangdue lodge down the valley, through the terraced villages, along the river, over a bridge and a
 * rough detour, past the viewpoints and into Punakha. Every section's turns cancel, so the road keeps heading the same way.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

export const PUNAKHA_SECTIONS: PathSection[] = [
  // Wangdue approach: the lodge forecourt and a gentle S out onto the valley road.
  { id: 'lodge', cmds: [{ straight: 130 }, { turn: 16, radius: 120 }, { turn: -16, radius: 120 }, { straight: 110 }] },
  // Valley descent: long sweepers dropping toward the river, with a couple of firm braking bends.
  { id: 'descent', cmds: [{ turn: -35, radius: 130 }, { straight: 90 }, { turn: 55, radius: 110 }, { straight: 60 }, { turn: -70, radius: 90 }, { straight: 70 }, { turn: 50, radius: 100 }, { straight: 80 }, { turn: -35, radius: 120 }, { turn: 35, radius: 120 }, { straight: 100 }] },
  // Agricultural villages: narrow lanes between terraces, tight bends, junctions.
  { id: 'villages', cmds: [{ straight: 60 }, { turn: -80, radius: 28 }, { straight: 70 }, { turn: 80, radius: 28 }, { straight: 90 }, { turn: 70, radius: 30 }, { straight: 60 }, { turn: -70, radius: 30 }, { straight: 110 }, { turn: -50, radius: 40 }, { straight: 50 }, { turn: 50, radius: 40 }, { straight: 80 }, { turn: 90, radius: 26 }, { straight: 50 }, { turn: -90, radius: 26 }, { straight: 120 }] },
  // Riverside highway: curving beside the Pho Chhu with exposed banks.
  { id: 'riverside', cmds: [{ straight: 120 }, { turn: 30, radius: 180 }, { straight: 160 }, { turn: -45, radius: 150 }, { straight: 130 }, { turn: 60, radius: 130 }, { straight: 100 }, { turn: -45, radius: 150 }, { straight: 170 }, { turn: 30, radius: 170 }, { straight: 100 }, { turn: -30, radius: 150 }] },
  // Bridge crossing: a straight run so the narrow bridge sits square to the river.
  { id: 'bridge', cmds: [{ straight: 120 }, { turn: -12, radius: 140 }, { turn: 12, radius: 140 }, { straight: 110 }] },
  // Rural detour: gravel and dirt tracks, a muddy lane, a ford.
  { id: 'rural', cmds: [{ straight: 60 }, { turn: 60, radius: 45 }, { straight: 70 }, { turn: -90, radius: 35 }, { straight: 60 }, { turn: 90, radius: 35 }, { straight: 110 }, { turn: -60, radius: 40 }, { straight: 80 }, { turn: 45, radius: 50 }, { straight: 90 }, { turn: -45, radius: 50 }, { straight: 80 }, { turn: 70, radius: 40 }, { straight: 60 }, { turn: -70, radius: 40 }, { straight: 100 }] },
  // Scenic stops: a viewpoint, a restaurant and a riverside picnic area on easy roads.
  { id: 'scenic', cmds: [{ straight: 100 }, { turn: 20, radius: 150 }, { straight: 140 }, { turn: -20, radius: 150 }, { straight: 120 }, { turn: -30, radius: 140 }, { straight: 100 }, { turn: 30, radius: 140 }, { straight: 160 }] },
  // Punakha approach: a developed road with parked buses and visitor traffic.
  { id: 'approach', cmds: [{ straight: 110 }, { turn: -25, radius: 160 }, { straight: 190 }, { turn: 25, radius: 160 }, { straight: 140 }, { turn: 40, radius: 120 }, { straight: 80 }, { turn: -40, radius: 120 }, { straight: 110 }] },
  // The dzong visitor area: the last bends and the straight to the parking plaza.
  { id: 'dzong', cmds: [{ straight: 120 }, { turn: 25, radius: 120 }, { turn: -25, radius: 120 }, { straight: 160 }] },
];

export const PUNAKHA_PATH: PathCmd[] = PUNAKHA_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function punakhaRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of PUNAKHA_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Punakha section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 38 m run-out after the finish. */
export const PUNAKHA_LENGTH = PUNAKHA_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 38;
