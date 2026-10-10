import type { LevelDef } from '../types';
import { airportDash } from './airport-dash';
import { bumthangNight } from './bumthang-night';
import { chelelaClimb } from './chelela-climb';
import { dochulaStorm } from './dochula-storm';
import { gmcPlains } from './gmc-plains';
import { passRun } from './pass-run';
import { punakhaValley } from './punakha-valley';
import { remoteExpedition } from './remote-expedition';
import { thimphuPickup } from './thimphu-pickup';
import { trongsaGorge } from './trongsa-gorge';

/** The ten mission definitions as authored (before `extensions.ts` lengthens them), in campaign order. */
export const RAW_LEVELS: LevelDef[] = [passRun, thimphuPickup, airportDash, punakhaValley, dochulaStorm, trongsaGorge, chelelaClimb, bumthangNight, remoteExpedition, gmcPlains];

export const getRaw = (id: string): LevelDef => {
  const l = RAW_LEVELS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown level "${id}"`);
  return l;
};
