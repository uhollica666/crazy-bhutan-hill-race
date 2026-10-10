import type { PathCmd } from './extend';

/**
 * Level 9's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north: a
 * fictionalised eastern expedition from a village base camp, through forest tracks, an old broken highway, river crossings, a rocky
 * climb, a loose descent, a landslide area and an unpaved switchback climb, to a remote expedition camp. Apart from the three
 * hairpin ladders (the climb turns right first, the descent left first, the last climb right first, so they drift east, west and
 * east), no heading swings more than 60 degrees from north.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

const S = (straight: number): PathCmd => ({ straight });
const T = (turn: number, radius: number): PathCmd => ({ turn, radius });

export const EXPEDITION_SECTIONS: PathSection[] = [
  // The base camp: a rural track out of the village.
  { id: 'base', cmds: [S(130), T(20, 110), T(-20, 110), S(150), T(-25, 100), T(25, 100), S(110)] },
  // Remote forest tracks: dirt, ruts and mud between the trees.
  { id: 'forest', cmds: [S(110), T(45, 70), S(80), T(-60, 60), S(70), T(50, 60), S(90), T(-40, 70), S(100), T(-35, 80), S(90), T(35, 80), S(80), T(40, 70), S(100), T(-30, 90), S(110), T(30, 90), S(130), T(-35, 80), S(130)] },
  // The old highway: broken asphalt and gravel, long and rough.
  { id: 'oldroad', cmds: [S(150), T(-30, 120), S(130), T(30, 120), S(160), T(35, 100), S(120), T(-35, 100), S(150)] },
  // The river crossings: two fords, a collapsed bridge and a field clinic.
  { id: 'river', cmds: [S(140), T(-25, 120), S(120), T(25, 120), S(150), T(20, 130), S(120), T(-20, 130), S(140)] },
  // The rocky climb: six hairpins up the slope (turning right first), then rocky and muddy sweepers.
  { id: 'climb', cmds: [S(130), T(180, 22), S(90), T(-180, 22), S(90), T(180, 22), S(90), T(-180, 22), S(90), T(180, 22), S(90), T(-180, 22), S(100), S(100), T(-35, 80), S(90), T(35, 80), S(110)] },
  // The loose descent: four hairpins down (turning left first), then sweepers on gravel.
  { id: 'descent', cmds: [S(130), T(-180, 22), S(90), T(180, 22), S(90), T(-180, 22), S(90), T(180, 22), S(100), S(110), T(40, 80), S(90), T(-40, 80), S(120)] },
  // The landslide area: three slips, a flooded dip and a stranded team.
  { id: 'slides', cmds: [S(130), T(-35, 90), S(100), T(35, 90), S(130), T(40, 80), S(90), T(-40, 80), S(120)] },
  // The unpaved switchbacks: four hairpins up (turning right first), then rutted sweepers with a creek.
  { id: 'switch', cmds: [S(130), T(180, 22), S(90), T(-180, 22), S(90), T(180, 22), S(90), T(-180, 22), S(100), S(110), T(-30, 90), S(90), T(30, 90), S(120)] },
  // The wilderness station: fuel, a workshop and a rest hut on a level shelf.
  { id: 'station', cmds: [S(120), T(20, 120), T(-20, 120), S(130)] },
  // The last forest track.
  { id: 'approach', cmds: [S(140), T(30, 110), S(110), T(-30, 110), S(130), T(25, 120), S(100), T(-25, 120), S(140)] },
  // The expedition camp: the last bends and the straight to the camp ground.
  { id: 'camp', cmds: [S(120), T(25, 120), T(-25, 120), S(200)] },
];

export const EXPEDITION_PATH: PathCmd[] = EXPEDITION_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function expeditionRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of EXPEDITION_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown expedition section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 40 m run-out after the finish. */
export const EXPEDITION_LENGTH = EXPEDITION_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 40;
