import type { PathCmd } from './extend';

/**
 * Level 5's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north: a
 * fictionalised descent from a Dochula-like pass to a valley lodge. Every section's turns cancel, so the road keeps heading north.
 * Apart from the hairpin ladder in the forest, no heading ever swings more than 90 degrees from north, so the road never doubles back
 * on itself; the ladder's legs run 48 m apart, beside a straight that precedes it.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

export const DOCHULA_SECTIONS: PathSection[] = [
  // The summit: the 108 chortens, prayer flags, tourist coaches; gentle bends around the mound.
  { id: 'summit', cmds: [{ straight: 130 }, { turn: 30, radius: 90 }, { turn: -30, radius: 90 }, { straight: 150 }, { turn: -30, radius: 90 }, { turn: 30, radius: 90 }, { straight: 120 }] },
  // The high mountain road: cold, narrow, winding bends under building cloud.
  { id: 'highroad', cmds: [{ straight: 120 }, { turn: 50, radius: 70 }, { straight: 60 }, { turn: -80, radius: 50 }, { straight: 70 }, { turn: 60, radius: 60 }, { straight: 80 }, { turn: -30, radius: 100 }, { straight: 100 }, { turn: -50, radius: 80 }, { straight: 80 }, { turn: 50, radius: 80 }, { straight: 90 }, { turn: 40, radius: 90 }, { straight: 60 }, { turn: -40, radius: 90 }, { straight: 130 }] },
  // The forest descent: a ladder of six hairpins down the slope, then long steep sweepers.
  { id: 'forest', cmds: [{ straight: 130 }, { turn: 180, radius: 24 }, { straight: 120 }, { turn: -180, radius: 24 }, { straight: 120 }, { turn: 180, radius: 24 }, { straight: 120 }, { turn: -180, radius: 24 }, { straight: 120 }, { turn: 180, radius: 24 }, { straight: 120 }, { turn: -180, radius: 24 }, { straight: 100 }, { straight: 140 }, { turn: 40, radius: 100 }, { straight: 100 }, { turn: -40, radius: 100 }, { straight: 140 }] },
  // The fog zone: long blind bends with reflective posts, trucks creeping ahead.
  { id: 'fog', cmds: [{ straight: 160 }, { turn: 40, radius: 110 }, { straight: 120 }, { turn: -40, radius: 110 }, { straight: 120 }, { turn: -30, radius: 110 }, { straight: 100 }, { turn: 30, radius: 110 }, { straight: 120 }, { turn: 45, radius: 100 }, { straight: 100 }, { turn: -45, radius: 100 }, { straight: 140 }] },
  // The landslide section: a wide road, two slips of debris well apart.
  { id: 'slide', cmds: [{ straight: 140 }, { turn: -35, radius: 90 }, { straight: 120 }, { turn: 35, radius: 90 }, { straight: 140 }] },
  // The storm corridor: heavy rain, sharper bends, a washed-out edge.
  { id: 'storm', cmds: [{ straight: 100 }, { turn: 60, radius: 70 }, { straight: 60 }, { turn: -60, radius: 70 }, { straight: 100 }, { turn: -75, radius: 45 }, { straight: 70 }, { turn: 75, radius: 45 }, { straight: 90 }, { turn: 90, radius: 30 }, { straight: 50 }, { turn: -90, radius: 30 }, { straight: 120 }, { turn: -50, radius: 90 }, { straight: 120 }, { turn: 50, radius: 90 }, { straight: 130 }] },
  // The emergency shelter and a workshop on a short level shelf.
  { id: 'shelter', cmds: [{ straight: 140 }, { turn: 25, radius: 120 }, { turn: -25, radius: 120 }, { straight: 160 }] },
  // The lower valley: wider roads, villages, terraces, the clouds lifting.
  { id: 'valley', cmds: [{ straight: 140 }, { turn: 30, radius: 140 }, { straight: 100 }, { turn: -30, radius: 140 }, { straight: 140 }, { turn: -35, radius: 120 }, { straight: 90 }, { turn: 35, radius: 120 }, { straight: 150 }, { turn: 30, radius: 150 }, { straight: 140 }, { turn: -30, radius: 150 }, { straight: 150 }] },
  // The lodge: the last bends and the straight to the covered entrance.
  { id: 'lodge', cmds: [{ straight: 140 }, { turn: 25, radius: 120 }, { turn: -25, radius: 120 }, { straight: 160 }] },
];

export const DOCHULA_PATH: PathCmd[] = DOCHULA_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function dochulaRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of DOCHULA_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Dochula section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 36 m run-out after the finish. */
export const DOCHULA_LENGTH = DOCHULA_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 36;
