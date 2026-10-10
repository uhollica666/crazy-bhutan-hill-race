import { describe, expect, it } from 'vitest';
import { getLevel, listLevels } from '../src/data/levels';
import { EXTENSIONS } from '../src/data/levels/extensions';
import { extendLevel, netTurn, stretchReport, walkPath } from '../src/data/levels/extend';
import { RAW_LEVELS, getRaw } from '../src/data/levels/raw';
import { Course } from '../src/world/Course';
import { Road } from '../src/world/Road';

const flat = (): number => 0;

describe('turtle path', () => {
  it('a straight leg advances along the heading', () => {
    const w = walkPath({ x: 0, z: 0 }, { x: 0, z: -1 }, [{ straight: 100 }]);
    expect(w.end.x).toBeCloseTo(0);
    expect(w.end.z).toBeCloseTo(-100);
    expect(w.length).toBe(100);
  });

  it('a right turn of 90 degrees at radius r ends r ahead and r to the right, facing right', () => {
    const w = walkPath({ x: 0, z: 0 }, { x: 0, z: -1 }, [{ turn: 90, radius: 20 }]);
    expect(w.end.x).toBeCloseTo(20, 4);
    expect(w.end.z).toBeCloseTo(-20, 4);
    expect(w.heading.x).toBeCloseTo(1, 4);
    expect(w.heading.z).toBeCloseTo(0, 4);
  });

  it('a left turn mirrors it', () => {
    const w = walkPath({ x: 0, z: 0 }, { x: 0, z: -1 }, [{ turn: -90, radius: 20 }]);
    expect(w.end.x).toBeCloseTo(-20, 4);
    expect(w.heading.x).toBeCloseTo(-1, 4);
  });

  it('a path whose turns cancel leaves the heading unchanged', () => {
    const path = [{ turn: 40, radius: 90 }, { straight: 120 }, { turn: -80, radius: 90 }, { straight: 120 }, { turn: 40, radius: 90 }];
    expect(netTurn(path)).toBe(0);
    const w = walkPath({ x: 5, z: 7 }, { x: 0, z: -1 }, path);
    expect(w.heading.x).toBeCloseTo(0, 6);
    expect(w.heading.z).toBeCloseTo(-1, 6);
  });
});

describe('full-length missions', () => {
  it('a stretch that does not end on its heading is refused', () => {
    expect(() => extendLevel(RAW_LEVELS[9], { at: 0.5, path: [{ turn: 30, radius: 50 }], timeLimit: 100, medals: { gold: 1, silver: 2, bronze: 3 } })).toThrow(/heading/);
  });

  it('every campaign mission is authored as a full journey (no stretch is spliced in) and is long enough to be one', () => {
    expect(Object.keys(EXTENSIONS)).toEqual([]);
    for (const l of listLevels()) {
      const raw = new Road(getRaw(l.id).road, flat).length;
      const after = new Road(l.road, flat).length;
      expect(after, l.id).toBeCloseTo(raw, 3);
      expect(after, l.id).toBeGreaterThan(3500);
    }
  });

  it('the new road keeps clear of the rest of the road and has no corner tighter than the original', () => {
    for (const id of Object.keys(EXTENSIONS)) {
      const raw = getRaw(id);
      const base = stretchReport(raw, { ...EXTENSIONS[id], path: [] });
      const r = stretchReport(raw, EXTENSIONS[id]);
      expect(r.minGap, `${id} gap`).toBeGreaterThan(30);
      expect(r.minRadius, `${id} radius`).toBeGreaterThan(Math.min(base.minRadius, 12) - 0.6);
      expect(r.maxGrade, `${id} grade`).toBeLessThan(0.34);
    }
  });

  it('stops, checkpoints and hazards stay in order inside the playable stretch, with unique ids', () => {
    for (const l of listLevels()) {
      for (const list of [l.stops, l.checkpoints, l.hazards]) {
        for (let i = 0; i < list.length; i++) {
          expect(list[i].at).toBeGreaterThan(0);
          expect(list[i].at).toBeLessThan(1);
          if (i) expect(list[i].at, l.id).toBeGreaterThanOrEqual(list[i - 1].at);
        }
      }
      const ids = l.stops.map((s) => s.id);
      expect(new Set(ids).size, l.id).toBe(ids.length);
      expect(new Set(l.hazards.map((h) => h.id)).size, l.id).toBe(l.hazards.length);
      for (const lm of l.scenery.landmarks) {
        if (lm.pos) continue;
        expect(lm.at, l.id).toBeGreaterThanOrEqual(0);
        expect(lm.at, l.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the first pickup is near the start and the last checkpoint and stop are before the finish', () => {
    for (const l of listLevels()) {
      const firstPickup = l.stops.find((st) => st.kind === 'pickup')!;
      expect(firstPickup.at, l.id).toBeLessThan(0.25);
      expect(l.checkpoints.at(-1)!.at, l.id).toBeLessThan(1);
      expect(Math.max(...l.stops.map((st) => st.at)), l.id).toBeLessThan(1);
    }
  });

  it('the calibration is sane: gold under silver under bronze under the limit, at a speed a careful driver can hold', () => {
    for (const l of listLevels()) {
      expect(l.medals.gold, l.id).toBeLessThan(l.medals.silver);
      expect(l.medals.silver, l.id).toBeLessThan(l.medals.bronze);
      expect(l.medals.bronze, l.id).toBeLessThanOrEqual(l.timeLimit);
      const course = new Course(l);
      const metres = course.finishS - course.startS;
      // Gold needs an average speed under 20 m/s (72 km/h): fast but never a flat-out run on these roads.
      expect(metres / l.medals.gold, l.id).toBeLessThan(20);
    }
  });

  it('terrain covers the whole road with a margin and stays a reasonable size', () => {
    for (const l of listLevels()) {
      const road = new Road(l.road, flat);
      const b = l.terrain.bounds;
      for (let i = 0; i < road.count; i += 5) {
        expect(road.xs[i], l.id).toBeGreaterThan(b.minX + 150);
        expect(road.xs[i], l.id).toBeLessThan(b.maxX - 150);
        expect(road.zs[i], l.id).toBeGreaterThan(b.minZ + 150);
        expect(road.zs[i], l.id).toBeLessThan(b.maxZ - 150);
      }
      const nodes = ((b.maxX - b.minX) / l.terrain.cell) * ((b.maxZ - b.minZ) / l.terrain.cell);
      expect(nodes, l.id).toBeLessThan(130_000);
    }
  });

  it('getLevel returns the full-length level', () => {
    expect(new Road(getLevel('pass-run').road, flat).length).toBeGreaterThan(4000);
  });
});
