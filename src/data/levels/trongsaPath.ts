import type { PathCmd } from './extend';

/**
 * Level 6's centre line as turtle-graphics sections (positive turn = right), starting 30 m before the start line heading north:
 * a fictionalised run from a mountain lodge, along a ridge and a cliff ledge, down into a gorge, over a one-lane bridge, through a
 * rockfall corridor beside the river and up a rough mountain road to Trongsa. Every section's turns cancel. Apart from the two
 * hairpin ladders, no heading swings more than 90 degrees from north, so the road never doubles back on itself. The descent ladder
 * drifts east and the climb ladder drifts west (its first turn is to the left), away from the river on each side of the bridge.
 */
export interface PathSection {
  id: string;
  cmds: PathCmd[];
}

export const TRONGSA_SECTIONS: PathSection[] = [
  // The mountain lodge and the first easy bends.
  { id: 'departure', cmds: [{ straight: 120 }, { turn: 20, radius: 120 }, { turn: -20, radius: 120 }, { straight: 160 }, { turn: -30, radius: 100 }, { turn: 30, radius: 100 }, { straight: 100 }] },
  // The highway traverse: winding ridge road, buses and freight trucks.
  { id: 'traverse', cmds: [{ straight: 100 }, { turn: 45, radius: 90 }, { straight: 80 }, { turn: -70, radius: 70 }, { straight: 60 }, { turn: 70, radius: 70 }, { straight: 90 }, { turn: -45, radius: 90 }, { straight: 120 }, { turn: -40, radius: 100 }, { straight: 70 }, { turn: 60, radius: 60 }, { straight: 80 }, { turn: -60, radius: 60 }, { straight: 90 }, { turn: 40, radius: 100 }, { straight: 130 }] },
  // The exposed cliffside: the narrowest road, a drop on the left, rock on the right.
  { id: 'cliffside', cmds: [{ straight: 110 }, { turn: 35, radius: 80 }, { straight: 90 }, { turn: -35, radius: 80 }, { straight: 100 }, { turn: -50, radius: 70 }, { straight: 70 }, { turn: 50, radius: 70 }, { straight: 120 }, { turn: 40, radius: 90 }, { straight: 80 }, { turn: -40, radius: 90 }, { straight: 140 }] },
  // The gorge descent: a ladder of four hairpins, then steep sweepers down to the river.
  { id: 'gorge', cmds: [{ straight: 130 }, { turn: 180, radius: 22 }, { straight: 110 }, { turn: -180, radius: 22 }, { straight: 110 }, { turn: 180, radius: 22 }, { straight: 110 }, { turn: -180, radius: 22 }, { straight: 100 }, { straight: 120 }, { turn: 45, radius: 80 }, { straight: 90 }, { turn: -45, radius: 80 }, { straight: 110 }, { turn: -35, radius: 90 }, { straight: 80 }, { turn: 35, radius: 90 }, { straight: 120 }] },
  // The one-lane bridge over the river, on a straight so it sits square to the water.
  { id: 'bridge', cmds: [{ straight: 140 }, { turn: -10, radius: 150 }, { turn: 10, radius: 150 }, { straight: 120 }] },
  // The rockfall corridor: along the river bed, under crumbling cliffs.
  { id: 'corridor', cmds: [{ straight: 130 }, { turn: -30, radius: 90 }, { straight: 90 }, { turn: 30, radius: 90 }, { straight: 110 }, { turn: 40, radius: 80 }, { straight: 90 }, { turn: -40, radius: 80 }, { straight: 100 }, { turn: -25, radius: 100 }, { straight: 100 }, { turn: 25, radius: 100 }, { straight: 130 }] },
  // The rough mountain climb: six hairpins up the slope (the first turn is to the left), then rocky and muddy sweepers.
  { id: 'climb', cmds: [{ straight: 130 }, { turn: -180, radius: 22 }, { straight: 100 }, { turn: 180, radius: 22 }, { straight: 100 }, { turn: -180, radius: 22 }, { straight: 100 }, { turn: 180, radius: 22 }, { straight: 100 }, { turn: -180, radius: 22 }, { straight: 100 }, { turn: 180, radius: 22 }, { straight: 100 }, { straight: 110 }, { turn: -40, radius: 70 }, { straight: 80 }, { turn: 40, radius: 70 }, { straight: 100 }, { turn: 50, radius: 60 }, { straight: 70 }, { turn: -50, radius: 60 }, { straight: 120 }] },
  // The Trongsa approach: settlements, shops, visitor traffic.
  { id: 'approach', cmds: [{ straight: 120 }, { turn: 30, radius: 120 }, { straight: 120 }, { turn: -30, radius: 120 }, { straight: 140 }, { turn: -35, radius: 110 }, { straight: 100 }, { turn: 35, radius: 110 }, { straight: 130 }, { turn: 25, radius: 130 }, { straight: 110 }, { turn: -25, radius: 130 }, { straight: 120 }] },
  // The dzong viewpoint: the last bends and the straight to the visitor parking.
  { id: 'dzong', cmds: [{ straight: 130 }, { turn: 25, radius: 120 }, { turn: -25, radius: 120 }, { straight: 180 }] },
];

export const TRONGSA_PATH: PathCmd[] = TRONGSA_SECTIONS.flatMap((s) => s.cmds);

const cmdLength = (c: PathCmd): number => ('straight' in c ? c.straight : ((Math.abs(c.turn) * Math.PI) / 180) * c.radius);

/** Distance (m) from the START LINE (the path begins 30 m earlier) to the start and end of each section. */
export function trongsaRange(id: string): { from: number; to: number } {
  let acc = -30;
  for (const sec of TRONGSA_SECTIONS) {
    const len = sec.cmds.reduce((n, c) => n + cmdLength(c), 0);
    if (sec.id === id) return { from: acc, to: acc + len };
    acc += len;
  }
  throw new Error(`Unknown Trongsa section ${id}`);
}

/** Playable length: the whole path less the 30 m before the start line and the 36 m run-out after the finish. */
export const TRONGSA_LENGTH = TRONGSA_SECTIONS.reduce((n, s) => n + s.cmds.reduce((m, c) => m + cmdLength(c), 0), 0) - 30 - 36;
