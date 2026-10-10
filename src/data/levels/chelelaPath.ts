import type { PathCmd } from './extend';

/**
 * Level 7's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north: a
 * fictionalised climb from the Paro-side foothills to the Chele La viewpoint. Every section's turns cancel. Apart from the two
 * hairpin ladders, no heading swings more than 90 degrees from north, so the road never doubles back on itself. The first ladder
 * (turning right first) drifts east and the summit ladder (turning left first) drifts west, each preceded by a straight at least as
 * long as one of its legs, so its legs run 38 to 40 m from that straight and from each other.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

const U = (turn: 180 | -180, radius: number): PathCmd => ({ turn, radius });
const S = (straight: number): PathCmd => ({ straight });

export const CHELELA_SECTIONS: PathSection[] = [
  // The foothill departure: the lodge, ordinary tarmac, easy bends.
  { id: 'foothill', cmds: [S(130), { turn: 20, radius: 120 }, { turn: -20, radius: 120 }, S(150), { turn: -25, radius: 110 }, { turn: 25, radius: 110 }, S(120), { turn: -30, radius: 100 }, S(100), { turn: 30, radius: 100 }, S(120)] },
  // The forest ascent: pine and rhododendron, winding bends, climbing harder.
  { id: 'forest', cmds: [S(100), { turn: 40, radius: 80 }, S(90), { turn: -60, radius: 60 }, S(70), { turn: 60, radius: 60 }, S(90), { turn: -40, radius: 80 }, S(120), { turn: -45, radius: 70 }, S(80), { turn: 45, radius: 70 }, S(100), { turn: 30, radius: 90 }, S(90), { turn: -30, radius: 90 }, S(130), { turn: 50, radius: 70 }, S(80), { turn: -50, radius: 70 }, S(100), { turn: -35, radius: 90 }, S(90), { turn: 35, radius: 90 }, S(130)] },
  // The mountain service station: a short level shelf with pumps, a workshop and a tea stop.
  { id: 'service', cmds: [S(120), { turn: 20, radius: 120 }, { turn: -20, radius: 120 }, S(120)] },
  // The hairpin section: a ladder of eight tight hairpins, then sweepers.
  { id: 'hairpin', cmds: [S(120), U(180, 20), S(90), U(-180, 20), S(90), U(180, 20), S(90), U(-180, 20), S(90), U(180, 20), S(90), U(-180, 20), S(90), U(180, 20), S(90), U(-180, 20), S(100), S(110), { turn: 40, radius: 80 }, S(90), { turn: -40, radius: 80 }, S(110)] },
  // The snowline: frost, then packed snow, between long bends.
  { id: 'snowline', cmds: [S(130), { turn: 35, radius: 90 }, S(100), { turn: -35, radius: 90 }, S(120), { turn: -40, radius: 80 }, S(90), { turn: 40, radius: 80 }, S(130), { turn: -35, radius: 90 }, S(90), { turn: 35, radius: 90 }, S(100)] },
  // The traction challenge: a long, steep, slippery climb.
  { id: 'traction', cmds: [S(300), { turn: -30, radius: 120 }, S(250), { turn: 30, radius: 120 }, S(450), { turn: 25, radius: 130 }, S(200), { turn: -25, radius: 130 }, S(150)] },
  // The high ridge: wind, fog, exposed edges.
  { id: 'ridge', cmds: [S(120), { turn: 30, radius: 100 }, S(150), { turn: -50, radius: 80 }, S(100), { turn: 50, radius: 80 }, S(150), { turn: -30, radius: 100 }, S(130), { turn: -35, radius: 90 }, S(100), { turn: 35, radius: 90 }, S(120)] },
  // The final summit climb: six hairpins (turning left first, so it drifts west), then demanding sweepers.
  { id: 'summit', cmds: [S(120), U(-180, 19), S(85), U(180, 19), S(85), U(-180, 19), S(85), U(180, 19), S(85), U(-180, 19), S(85), U(180, 19), S(100), S(100), { turn: -30, radius: 90 }, S(90), { turn: 30, radius: 90 }, S(120), { turn: 40, radius: 80 }, S(90), { turn: -40, radius: 80 }, S(120)] },
  // The Chele La viewpoint: the last bends and the straight to the summit parking.
  { id: 'viewpoint', cmds: [S(140), { turn: 25, radius: 120 }, { turn: -25, radius: 120 }, S(200)] },
];

export const CHELELA_PATH: PathCmd[] = CHELELA_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function chelelaRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of CHELELA_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Chelela section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 40 m run-out after the finish. */
export const CHELELA_LENGTH = CHELELA_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 40;
