import type { PathCmd } from './extend';

/**
 * Level 3's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading
 * north: a fictionalised Thimphu to Paro highway.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

export const AIRPORT_SECTIONS: PathSection[] = [
  // Hotel forecourt and the street out of town.
  { id: 'hotel', cmds: [{ straight: 120 }, { turn: 18, radius: 100 }, { turn: -18, radius: 100 }, { straight: 80 }] },
  // Highway exit: a slip road, then the long approach to the river.
  { id: 'exit', cmds: [{ straight: 150 }, { turn: 40, radius: 90 }, { straight: 120 }, { turn: -40, radius: 90 }, { straight: 120 }] },
  // Riverside highway: long straights and fast sweepers.
  { id: 'riverside', cmds: [{ straight: 260 }, { turn: -35, radius: 160 }, { straight: 200 }, { turn: 35, radius: 160 }, { straight: 240 }, { turn: 50, radius: 140 }, { straight: 180 }, { turn: -50, radius: 140 }, { straight: 220 }] },
  // The confluence: bridges, the junction and rocky slopes.
  { id: 'confluence', cmds: [{ turn: -30, radius: 120 }, { straight: 160 }, { turn: 70, radius: 80 }, { straight: 110 }, { turn: -70, radius: 80 }, { straight: 150 }, { turn: 30, radius: 120 }, { straight: 140 }] },
  // The gorge: narrow, with blind bends under the cliffs.
  { id: 'gorge', cmds: [{ turn: 60, radius: 70 }, { straight: 90 }, { turn: -60, radius: 70 }, { straight: 80 }, { turn: -90, radius: 45 }, { straight: 80 }, { turn: 90, radius: 45 }, { straight: 110 }, { turn: 50, radius: 60 }, { turn: -50, radius: 60 }, { straight: 120 }] },
  // Roadworks: gravel, cones and potholes on a gently curving road.
  { id: 'roadworks', cmds: [{ straight: 160 }, { turn: 25, radius: 140 }, { straight: 200 }, { turn: -25, radius: 140 }, { straight: 180 }] },
  // Paro valley: broad roads through fields and villages.
  { id: 'valley', cmds: [{ straight: 200 }, { turn: 30, radius: 200 }, { straight: 260 }, { turn: -30, radius: 200 }, { straight: 220 }, { turn: -20, radius: 200 }, { turn: 20, radius: 200 }, { straight: 150 }] },
  // Airport access road and the terminal forecourt.
  { id: 'airport', cmds: [{ straight: 140 }, { turn: 35, radius: 110 }, { turn: -35, radius: 110 }, { straight: 230 }] },
];

export const AIRPORT_PATH: PathCmd[] = AIRPORT_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function airportRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of AIRPORT_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown airport section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 36 m run-out after the finish. */
export const AIRPORT_LENGTH = AIRPORT_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 36;
