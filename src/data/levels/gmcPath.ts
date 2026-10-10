import type { PathCmd } from './extend';

/**
 * Level 10's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north: a
 * fictionalised journey from a southern mountain lodge down a steep forest descent, through a landslide corridor, an off-road detour,
 * river and flood crossings, a wildlife corridor and a monsoon storm, onto the southern plains highway, through a congested town and
 * into a Gelephu Mindfulness City-inspired arrival hall. Apart from the two hairpin ladders (the descent turns right first, the
 * detour left first, so they drift east and west) and the right-angle corners in the town (heading never beyond 90 degrees from north),
 * no heading swings more than 60 degrees from north, so the road never doubles back on itself.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

const S = (straight: number): PathCmd => ({ straight });
const T = (turn: number, radius: number): PathCmd => ({ turn, radius });

export const GMC_SECTIONS: PathSection[] = [
  // The mountain lodge: a large tourist assignment and the first bends.
  { id: 'depart', cmds: [S(130), T(20, 110), T(-20, 110), S(130), T(-25, 100), T(25, 100), S(120), T(-30, 100), S(100), T(30, 100), S(140)] },
  // The steep forest descent: four hairpins, then long sweepers over a narrow bridge. The brakes fade.
  { id: 'descent', cmds: [S(130), T(180, 22), S(100), T(-180, 22), S(100), T(180, 22), S(100), T(-180, 22), S(110), S(120), T(45, 90), S(100), T(-45, 90), S(110), T(-35, 100), S(100), T(35, 100), S(130)] },
  // The landslide corridor: five slips alternate sides under crumbling cliffs.
  { id: 'corridor', cmds: [S(130), T(-30, 100), S(110), T(30, 100), S(140), T(40, 90), S(100), T(-40, 90), S(130), T(-25, 110), S(100), T(25, 110), S(130)] },
  // The extreme off-road detour: a ladder of four hairpins (turning left first) on mud and rock, then rutted sweepers and a ford.
  { id: 'detour', cmds: [S(130), T(-180, 20), S(90), T(180, 20), S(90), T(-180, 20), S(90), T(180, 20), S(100), S(110), T(40, 70), S(90), T(-40, 70), S(100), T(-30, 80), S(90), T(30, 80), S(130)] },
  // The river and flood crossings: four fords of increasing depth.
  { id: 'river', cmds: [S(140), T(-20, 130), S(120), T(20, 130), S(160), T(25, 120), S(130), T(-25, 120), S(150), T(-20, 130), S(110), T(20, 130), S(150)] },
  // The wildlife corridor: yaks, bears and things that are not bears.
  { id: 'wildlife', cmds: [S(130), T(30, 110), S(120), T(-30, 110), S(150), T(-35, 100), S(110), T(35, 100), S(140), T(25, 120), S(100), T(-25, 120), S(130)] },
  // The monsoon storm zone: heavy rain, flooding and fog.
  { id: 'storm', cmds: [S(140), T(-30, 110), S(120), T(30, 110), S(160), T(40, 90), S(110), T(-40, 90), S(150), T(-30, 110), S(100), T(30, 110), S(140)] },
  // The southern highway: fast, wide, long straights, trucks to overtake and opposing traffic.
  { id: 'highway', cmds: [S(300), T(15, 300), S(250), T(-15, 300), S(300), T(-20, 280), S(200), T(20, 280), S(250), T(10, 400), S(300), T(-10, 400), S(250)] },
  // The congested town: right-angle corners, a police-directed junction, crossings, roadworks.
  { id: 'town', cmds: [S(100), T(90, 16), S(90), T(-90, 16), S(130), T(-90, 16), S(70), T(90, 16), S(110), T(90, 16), S(80), T(-90, 16), S(130), T(-45, 60), S(100), T(45, 60), S(120)] },
  // The arrival: the last bends and the straight to the terminal forecourt.
  { id: 'gmc', cmds: [S(140), T(25, 120), T(-25, 120), S(260)] },
];

export const GMC_PATH: PathCmd[] = GMC_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function gmcRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of GMC_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown GMC section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 40 m run-out after the finish. */
export const GMC_LENGTH = GMC_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 40;
