import type { PathCmd } from './extend';

/**
 * Level 8's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north: a
 * fictionalised night journey from a Bumthang town through forest, villages, bridges and fog to a mountain resort. No hairpin
 * ladders: every heading stays within 80 degrees of north, so the road never doubles back on itself.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

const S = (straight: number): PathCmd => ({ straight });
const T = (turn: number, radius: number): PathCmd => ({ turn, radius });

export const BUMTHANG_SECTIONS: PathSection[] = [
  // The town: the hotel forecourt and the streets out.
  { id: 'town', cmds: [S(140), T(20, 110), T(-20, 110), S(130), T(-25, 100), T(25, 100), S(100)] },
  // The forest highway at dusk: long easy bends.
  { id: 'forest', cmds: [S(120), T(30, 120), S(150), T(-40, 100), S(130), T(45, 90), S(110), T(-35, 110), S(140), T(25, 130), S(120), T(-25, 130), S(150)] },
  // Remote village roads: narrow lanes with sharper turns.
  { id: 'village', cmds: [S(80), T(70, 30), S(60), T(-70, 30), S(90), T(-60, 35), S(70), T(60, 35), S(100), T(80, 28), S(50), T(-80, 28), S(110)] },
  // Narrow bridges and unlit mountain roads (bridges on the first and the last straights).
  { id: 'mountain', cmds: [S(130), T(-30, 100), S(100), T(30, 100), S(120), T(35, 90), S(90), T(-35, 90), S(130), T(-30, 110), S(110), T(30, 110), S(120)] },
  // Dense forest at midnight.
  { id: 'dense', cmds: [S(130), T(40, 80), S(100), T(-40, 80), S(120), T(-50, 70), S(90), T(50, 70), S(140), T(35, 90), S(110), T(-35, 90), S(130)] },
  // Foggy roadside settlements.
  { id: 'settle', cmds: [S(120), T(25, 120), S(140), T(-25, 120), S(100), T(-30, 100), S(110), T(30, 100), S(140)] },
  // Abandoned structures and wildlife crossings.
  { id: 'wildlife', cmds: [S(130), T(-30, 110), S(120), T(30, 110), S(150), T(40, 90), S(100), T(-40, 90), S(130)] },
  // The remote fuel and repair station: a short level shelf.
  { id: 'station', cmds: [S(120), T(20, 120), T(-20, 120), S(130)] },
  // The dangerous final forest stretch: tighter bends in the dark.
  { id: 'final', cmds: [S(130), T(45, 80), S(90), T(-45, 80), S(110), T(-55, 60), S(70), T(55, 60), S(120), T(40, 80), S(100), T(-40, 80), S(140)] },
  // The mountain resort: the last bends and the straight to the covered entrance.
  { id: 'resort', cmds: [S(140), T(25, 120), T(-25, 120), S(200)] },
];

export const BUMTHANG_PATH: PathCmd[] = BUMTHANG_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function bumthangRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of BUMTHANG_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Bumthang section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 36 m run-out after the finish. */
export const BUMTHANG_LENGTH = BUMTHANG_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 36;
