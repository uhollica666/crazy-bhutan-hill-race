import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIN_TIME_MS } from '../src/cloud/limits';
import { listLevels } from '../src/data/levels';
import { listVehicles } from '../src/data/vehicles';

const rules = readFileSync('firestore.rules', 'utf8');

describe('firestore.rules stays in step with the game data', () => {
  it('lists every mission and every vehicle', () => {
    const levels = /function levelIds\(\) \{\s*return \[([^\]]*)\]/.exec(rules)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    const vehicles = /function vehicleIds\(\) \{\s*return \[([^\]]*)\]/.exec(rules)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(levels.sort()).toEqual(listLevels().map((l) => l.id).sort());
    expect(vehicles.sort()).toEqual(listVehicles().map((v) => v.id).sort());
  });

  it('uses the same minimum times as the game checks before posting a time', () => {
    const block = /function minTimeMs\(levelId\) \{\s*return \{([\s\S]*?)\}\[levelId\]/.exec(rules)![1];
    const fromRules: Record<string, number> = {};
    for (const m of block.matchAll(/'([^']+)':\s*(\d+)/g)) fromRules[m[1]] = Number(m[2]);
    expect(fromRules).toEqual(MIN_TIME_MS);
  });

  it('every minimum is well below what the autopilot needs flat out, so honest players are never refused', () => {
    // Autopilot flat-out times from `bun scripts/medals.ts` (seconds), fastest vehicle per mission.
    const flatOut: Record<string, number> = { 'pass-run': 111, 'thimphu-pickup': 122, 'airport-dash': 117, 'punakha-valley': 108, 'dochula-storm': 168, 'chelela-climb': 157, 'trongsa-gorge': 126, 'bumthang-night': 128, 'remote-expedition': 110, 'gmc-plains': 112 };
    for (const [id, floor] of Object.entries(MIN_TIME_MS)) expect(floor / 1000, id).toBeLessThan(flatOut[id] * 0.6);
  });

  it('denies by default and grants no wildcard access', () => {
    expect(rules).not.toMatch(/match \/\{document=\*\*\}[\s\S]*allow [a-z, ]+: if (true|signedIn\(\))/);
    expect(rules).not.toMatch(/allow (read|write)[^;]*: if true/);
    // The only public (no sign-in needed) reads are the leaderboard get and list.
    const unconditional = [...rules.matchAll(/allow (get|list)[^;]*;/g)].map((m) => m[0]).filter((x) => !/signedIn|isOwner|if false/.test(x));
    expect(unconditional.length).toBe(2);
    expect(unconditional.every((x) => /leaderboard|true|request\.query\.limit/.test(x))).toBe(true);
  });
});
