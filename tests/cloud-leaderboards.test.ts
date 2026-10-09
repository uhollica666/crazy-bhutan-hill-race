import { describe, expect, it } from 'vitest';
import { CloudService } from '../src/cloud/CloudService';
import { Leaderboards, eligibility } from '../src/cloud/Leaderboards';
import type { RunForBoard } from '../src/cloud/Leaderboards';
import { CloudMetaStore } from '../src/cloud/meta';
import { SaveStore } from '../src/storage/SaveStore';
import { FakeBackend } from './helpers/fakeCloud';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const run = (over: Partial<RunForBoard> = {}): RunForBoard => ({ levelId: 'pass-run', vehicleId: 'dzo-hatch', time: 150.25, medal: 'gold', comfort: null, conditions: 'clear-day', ...over });
const row = (uid: string, timeMs: number, name: string, levelId = 'pass-run') => ({ uid, levelId, timeMs, vehicleId: 'dzo-hatch', conditions: 'clear-day', displayName: name, medal: 'bronze', comfort: null, clientAt: 0 });

async function player(backend: FakeBackend, name?: string) {
  const storage = memory();
  const store = new SaveStore(storage);
  const online = { value: true };
  const cloud = new CloudService({ backend, store, meta: new CloudMetaStore(storage), appVersion: 't', isOnline: () => online.value });
  backend.current = null;
  cloud.start();
  await settle();
  if (name) await cloud.setDisplayName(name);
  const boards = new Leaderboards(cloud, store, storage, 'test');
  return { cloud, store, boards, online, storage };
}

describe('which runs are posted', () => {
  it('accepts a normal completion and converts seconds to milliseconds', () => {
    expect(eligibility(run())).toEqual({ ok: true, timeMs: 150250 });
  });

  it('rejects invalid, implausible, unknown and ineligible runs', () => {
    expect(eligibility(run({ time: 0 })).ok).toBe(false);
    expect(eligibility(run({ time: NaN })).ok).toBe(false);
    expect(eligibility(run({ time: 3 })).ok).toBe(false); // below the floor
    expect(eligibility(run({ time: 99999 })).ok).toBe(false);
    expect(eligibility(run({ levelId: 'nowhere' })).ok).toBe(false);
    expect(eligibility(run({ levelId: 'chelela-climb', vehicleId: 'dzo-hatch' })).ok).toBe(false); // not allowed on this mission
  });
});

describe('posting and reading', () => {
  it('posts a completed run, ranks players by time, and marks your own row', async () => {
    const backend = new FakeBackend();
    const a = await player(backend, 'Ann Yak');
    const b = await player(backend, 'Bob Takin');
    const c = await player(backend, 'Cy Crane');
    a.boards.submitRun(run({ time: 160 }));
    b.boards.submitRun(run({ time: 120.5 }));
    c.boards.submitRun(run({ time: 140 }));
    await settle();
    const view = await c.boards.loadBoard('pass-run');
    expect(view.state).toBe('ready');
    expect(view.rows.map((r) => [r.rank, r.name, r.timeMs])).toEqual([[1, 'Bob Takin', 120500], [2, 'Cy Crane', 140000], [3, 'Ann Yak', 160000]]);
    expect(view.rows.filter((r) => r.isYou).map((r) => r.name)).toEqual(['Cy Crane']);
    expect(view.mine?.rank).toBe(2);
  });

  it('only improvements are sent: a slower or identical run causes no write', async () => {
    const backend = new FakeBackend();
    const a = await player(backend, 'Ann Yak');
    a.boards.submitRun(run({ time: 150 }));
    await settle();
    expect(backend.calls.submitEntry).toBe(1);
    a.boards.submitRun(run({ time: 150 }));
    a.boards.submitRun(run({ time: 175 }));
    await settle();
    expect(backend.calls.submitEntry).toBe(1);
    a.boards.submitRun(run({ time: 149.9 }));
    await settle();
    expect(backend.calls.submitEntry).toBe(2);
    expect(backend.entries.size).toBe(1);
  });

  it('an empty board says so', async () => {
    const backend = new FakeBackend();
    const a = await player(backend);
    const v = await a.boards.loadBoard('gmc-plains');
    expect(v.state).toBe('empty');
    expect(v.rows).toEqual([]);
    expect(v.message).toMatch(/first/i);
  });

  it('returns a bounded page and caches it for a minute (no repeated reads)', async () => {
    const backend = new FakeBackend();
    for (let i = 0; i < 40; i++) backend.entries.set(`pass-run/u${i}`, row(`u${i}`, 100_000 + i * 100, `Racer ${i}0`));
    const a = await player(backend);
    const v1 = await a.boards.loadBoard('pass-run');
    expect(v1.rows.length).toBe(25);
    await a.boards.loadBoard('pass-run');
    await a.boards.loadBoard('pass-run');
    expect(backend.calls.topEntries).toBe(1);
    await a.boards.loadBoard('pass-run', { force: true });
    expect(backend.calls.topEntries).toBe(2);
  });

  it('shows your rank even when you are beyond the first page', async () => {
    const backend = new FakeBackend();
    for (let i = 0; i < 30; i++) backend.entries.set(`pass-run/u${i}`, row(`u${i}`, 100_000 + i * 100, `Racer ${i}0`));
    const a = await player(backend, 'Slow Poke');
    a.boards.submitRun(run({ time: 200 }));
    await settle();
    const v = await a.boards.loadBoard('pass-run', { force: true });
    expect(v.mine?.beyond).toBe(true);
    expect(v.mine?.rank).toBe(31);
  });
});

describe('offline behaviour', () => {
  it('queues the best time per mission while offline and sends it once online', async () => {
    const backend = new FakeBackend();
    const a = await player(backend, 'Ann Yak');
    backend.online = false;
    a.online.value = false;
    a.boards.submitRun(run({ time: 170 }));
    a.boards.submitRun(run({ time: 155 })); // a better run replaces the queued one
    await settle();
    expect(a.boards.pendingCount).toBe(1);
    expect(backend.entries.size).toBe(0);
    backend.online = true;
    a.online.value = true;
    a.cloud.notifyOnline();
    await settle();
    expect(a.boards.pendingCount).toBe(0);
    expect([...backend.entries.values()].map((e) => e.timeMs)).toEqual([155000]);
  });

  it("shows the last page seen (labelled) when the network is gone, then this device's own times if there is none", async () => {
    const backend = new FakeBackend();
    backend.entries.set('pass-run/u1', row('u1', 99_000, 'Racer 10'));
    const a = await player(backend);
    await a.boards.loadBoard('pass-run');
    backend.online = false;
    a.online.value = false;
    const stale = await a.boards.loadBoard('pass-run', { force: true });
    expect(stale.state).toBe('offline');
    expect(stale.stale).toBe(true);
    expect(stale.rows.length).toBe(1);
    // A mission never viewed online falls back to this device's own records.
    a.store.recordCompletion({ levelId: 'airport-dash', vehicleId: 'tourist-coaster', time: 140, medal: 'silver', score: 50, comfort: null });
    const own = await a.boards.loadBoard('airport-dash', { force: true });
    expect(own.state).toBe('offline');
    expect(own.rows[0].timeMs).toBe(140000);
    expect(own.rows[0].isYou).toBe(true);
  });

  it('a disabled build shows local times and never calls a backend', async () => {
    const storage = memory();
    const store = new SaveStore(storage);
    const cloud = new CloudService({ backend: null, store, meta: new CloudMetaStore(storage), appVersion: 't' });
    const boards = new Leaderboards(cloud, store, storage, 't');
    boards.submitRun(run());
    expect((await boards.loadBoard('pass-run')).state).toBe('disabled');
  });
});
