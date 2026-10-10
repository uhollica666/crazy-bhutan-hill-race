import type { PathCmd } from './extend';

/**
 * Level 2's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading
 * north. A bounded corridor: Babesa, a few residential blocks, the commercial streets, a congested stretch, the city
 * exit, and the climb to Kuenselphodrang.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

export const THIMPHU_SECTIONS: PathSection[] = [
  // Babesa: a broad street past the hotels.
  { id: 'babesa', cmds: [{ straight: 160 }, { turn: 14, radius: 110 }, { turn: -14, radius: 110 }, { straight: 150 }] },
  // Residential lanes: narrow, with right-angle turns between blocks.
  { id: 'residential', cmds: [{ straight: 70 }, { turn: -90, radius: 14 }, { straight: 80 }, { turn: 90, radius: 14 }, { straight: 90 }, { turn: 90, radius: 14 }, { straight: 80 }, { turn: -90, radius: 14 }, { straight: 60 }] },
  // Commercial district: wide boulevards, junctions and a police-directed crossroads.
  { id: 'commercial', cmds: [{ straight: 110 }, { turn: 90, radius: 16 }, { straight: 90 }, { turn: -90, radius: 16 }, { straight: 170 }, { turn: -90, radius: 16 }, { straight: 70 }, { turn: 90, radius: 16 }, { straight: 110 }] },
  // Congestion: a long straight with a gentle S, where the queue forms.
  { id: 'congestion', cmds: [{ straight: 220 }, { turn: 22, radius: 110 }, { turn: -22, radius: 110 }, { straight: 130 }] },
  // City exit: the road widens and starts to rise.
  { id: 'exit', cmds: [{ straight: 100 }, { turn: 28, radius: 110 }, { straight: 120 }, { turn: -28, radius: 110 }, { straight: 80 }] },
  // Kuenselphodrang climb: bends, three hairpins and viewpoints.
  { id: 'climb', cmds: [{ turn: -50, radius: 60 }, { straight: 70 }, { turn: 180, radius: 19 }, { straight: 110 }, { turn: -180, radius: 19 }, { straight: 80 }, { turn: 45, radius: 70 }, { turn: -45, radius: 70 }, { straight: 90 }, { turn: 160, radius: 21 }, { straight: 80 }, { turn: -160, radius: 21 }, { straight: 60 }] },
  // Arrival: the last bends and the straight up to the visitor plaza.
  { id: 'arrival', cmds: [{ turn: 50, radius: 90 }, { straight: 150 }, { turn: -25, radius: 100 }, { turn: 25, radius: 100 }, { straight: 190 }] },
];

export const THIMPHU_PATH: PathCmd[] = THIMPHU_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function thimphuRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of THIMPHU_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Thimphu section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 32 m run-out after the finish. */
export const THIMPHU_LENGTH = THIMPHU_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 32;

/** Distance ranges (m from the start line) of the sharp (>= 80 degree) corners, so buildings keep clear of them. */
export function thimphuCorners(): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let acc = -30;
  for (const sec of THIMPHU_SECTIONS) {
    for (const c of sec.cmds) {
      const len = cmdLength(c);
      if (!('straight' in c) && Math.abs(c.turn) >= 80) out.push({ from: acc, to: acc + len });
      acc += len;
    }
  }
  return out;
}
