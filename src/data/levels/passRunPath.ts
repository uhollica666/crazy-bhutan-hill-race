import type { PathCmd } from './extend';

/**
 * Route 1's centre line as turtle-graphics sections (positive turn = right). It starts 30 m before the start line, heading north.
 * Sections are named so the level data can place stops, surfaces and scenery by section; `pathLength` below reads their lengths.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

export const PASS_RUN_SECTIONS: PathSection[] = [
  // Village main street: straight and slow, a lazy S through the market.
  { id: 'village', cmds: [{ straight: 150 }, { turn: 16, radius: 140 }, { turn: -16, radius: 140 }, { straight: 100 }, { turn: -24, radius: 110 }, { turn: 24, radius: 110 }, { straight: 20 }] },
  // Leaving the village along the river valley: gentle, wide, rolling.
  { id: 'valley', cmds: [{ turn: 38, radius: 95 }, { straight: 90 }, { turn: -38, radius: 95 }, { straight: 110 }, { turn: -46, radius: 85 }, { turn: 46, radius: 85 }, { straight: 10 }] },
  // Forest: long S-bends and a pair of tighter turns, climbing steadily.
  { id: 'forest', cmds: [{ turn: 62, radius: 60 }, { turn: -62, radius: 60 }, { straight: 60 }, { turn: -88, radius: 48 }, { turn: 88, radius: 48 }, { straight: 70 }, { turn: 72, radius: 55 }, { turn: -72, radius: 55 }, { turn: -112, radius: 40 }, { straight: 30 }, { turn: 112, radius: 40 }, { straight: 20 }] },
  // Service area: a straight with a wide verge.
  { id: 'service', cmds: [{ straight: 260 }] },
  // First hairpin ladder: two proper hairpins with a traverse between, then a long diagonal.
  { id: 'hairpins', cmds: [{ turn: -50, radius: 55 }, { straight: 70 }, { turn: 180, radius: 17 }, { straight: 120 }, { turn: -180, radius: 17 }, { straight: 70 }, { turn: 44, radius: 75 }, { turn: -44, radius: 75 }, { straight: 100 }, { turn: 50, radius: 60 }] },
  // Viewpoint plateau: a long, easy bend and a lay-by.
  { id: 'viewpoint', cmds: [{ turn: -60, radius: 110 }, { straight: 110 }, { turn: 60, radius: 110 }, { straight: 150 }] },
  // Down into a rough side valley (a descent), roadworks gravel, then mud and rock as it climbs out.
  { id: 'rough', cmds: [{ turn: 54, radius: 70 }, { turn: -54, radius: 70 }, { straight: 100 }, { turn: 70, radius: 55 }, { turn: -70, radius: 55 }, { straight: 110 }, { turn: -150, radius: 24 }, { straight: 90 }, { turn: 150, radius: 24 }, { straight: 90 }] },
  // The high pass: sweeping, exposed bends with an icy stretch near the top.
  { id: 'pass', cmds: [{ turn: -45, radius: 100 }, { straight: 120 }, { turn: 45, radius: 100 }, { turn: 40, radius: 90 }, { straight: 110 }, { turn: -40, radius: 90 }, { straight: 150 }] },
  // Arrival: a final easy bend and the straight run up to the summit plaza.
  { id: 'arrival', cmds: [{ turn: 25, radius: 120 }, { turn: -25, radius: 120 }, { straight: 290 }] },
];

export const PASS_RUN_PATH: PathCmd[] = PASS_RUN_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : (Math.abs(c.turn) * Math.PI) / 180 * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function sectionRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of PASS_RUN_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Pass Run section ${id}`);
}

export const PASS_RUN_LENGTH = PASS_RUN_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 38;
