import type { LevelDef, SurfaceId } from '../data/types';
import { SURFACES, wetSurface } from '../data/surfaces';
import type { SurfaceDef } from '../data/surfaces';
import type { BarrierHit } from './Road';
import { Road, createRoadHit } from './Road';
import { Terrain, createRoadBase } from './Terrain';
import { nearestRiver, resolveRivers } from './Rivers';
import type { River, RiverNearest } from './Rivers';
import type { GroundSample } from './Terrain';
import { ObstacleSet } from './Obstacles';
import type { ObstacleHit, PhysicsWorld } from '../physics/types';

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  /** Heading as a unit XZ vector. */
  tx: number;
  tz: number;
}

export interface FordInfo {
  fromS: number;
  toS: number;
  /** Water surface height (m). */
  waterY: number;
  depth: number;
}

/**
 * Everything the simulation needs to know about a level: geometry plus the gameplay stations
 * (start, ordered checkpoints, finish) expressed as distances along the road, the road surface by stretch,
 * a ford (optional) and the set of movable obstacles.
 */
export class Course implements PhysicsWorld {
  readonly road: Road;
  readonly terrain: Terrain;
  readonly startS: number;
  readonly finishS: number;
  /** Distance along the road of each checkpoint, in required order. */
  readonly checkpointS: number[];
  /** Side streets joining the road (world distance along the road, length, width, sides). */
  readonly junctions: { s: number; arm: number; width: number; sides: (-1 | 1)[]; zebra: boolean }[] = [];
  /** Distances along the road of zebra crossings (junction crossings and the traffic's pedestrian crossings). */
  readonly zebras: number[] = [];
  readonly obstacles: ObstacleSet;
  readonly ford: FordInfo | null;
  /** Rivers carved into the terrain (empty on most levels). */
  readonly rivers: River[];
  /** 0..1 how wet the roads are right now (set by the weather system). */
  wetness = 0;

  /** Shallow puddles in road coordinates (distance along the road, lateral offset, radius). */
  readonly puddles: { s: number; lateral: number; r: number; pothole: boolean }[] = [];
  private readonly surfaceIds: SurfaceId[] = ['asphalt'];
  private readonly sampleSurface: Uint8Array;
  private readonly shoulderSurface: SurfaceId;
  private readonly rh = createRoadHit();
  private readonly rn: RiverNearest = { d: 0, y: 0, river: -1 };
  private readonly riverReach: number;

  constructor(readonly level: LevelDef) {
    // City routes carry more moving obstacles (traffic, pedestrians at crossings, parked vehicles).
    this.obstacles = new ObstacleSet(level.traffic?.controls || level.traffic?.scripted ? 96 : 64);
    this.road = new Road(level.road, createRoadBase(level.terrain));
    this.ford = level.ford ? this.road.carveFord(level.ford.from, level.ford.to, level.ford.depth) : null;
    this.rivers = resolveRivers(level.rivers, this.road);
    this.terrain = new Terrain(level.terrain, this.road, this.rivers);
    this.riverReach = this.rivers.reduce((m, r) => Math.max(m, r.width / 2), 0) + level.terrain.cell;
    this.startS = level.road.startOffset;
    this.finishS = this.road.length - level.road.finishOffset;
    const span = this.finishS - this.startS;
    this.checkpointS = level.checkpoints.map((c) => this.startS + c.at * span);
    for (let i = 1; i < this.checkpointS.length; i++) {
      if (this.checkpointS[i] <= this.checkpointS[i - 1])
        throw new Error(`Level ${level.id}: checkpoints must ascend`);
    }
    for (const j of level.junctions ?? []) {
      const js = this.startS + j.at * span;
      this.junctions.push({ s: js, arm: j.arm, width: j.width, sides: j.sides, zebra: j.zebra === true });
      for (const side of j.sides) this.road.openings.push({ from: js - j.width / 2, to: js + j.width / 2, side });
      if (j.zebra) this.zebras.push(js - 11);
    }
    for (const c of level.traffic?.controls ?? []) if (c.kind === 'crossing') this.zebras.push(this.startS + c.at * span);
    for (const p of level.puddles ?? []) this.puddles.push({ s: this.startS + p.at * span, lateral: p.lateral, r: p.radius, pothole: p.pothole === true });
    this.shoulderSurface = level.shoulder ?? 'gravel';
    this.sampleSurface = new Uint8Array(this.road.count);
    for (const seg of level.surfaces ?? []) {
      let idx = this.surfaceIds.indexOf(seg.surface);
      if (idx < 0) idx = this.surfaceIds.push(seg.surface) - 1;
      for (let i = 0; i < this.road.count; i++) {
        const f = this.road.ss[i] / this.road.length;
        if (f >= seg.from && f <= seg.to) this.sampleSurface[i] = idx;
      }
    }
  }

  ground(x: number, z: number, out: GroundSample): void {
    this.terrain.groundAt(x, z, out);
  }

  barrier(x: number, z: number, out: BarrierHit): boolean {
    return this.road.barrier(x, z, out);
  }

  obstacle(x: number, z: number, out: ObstacleHit): boolean {
    return this.obstacles.hit(x, z, out);
  }

  /** Surface under a world point, including rain (wet asphalt, mud) and the ford. */
  surface(x: number, z: number): SurfaceDef {
    return SURFACES[this.surfaceIdAt(x, z)];
  }

  surfaceIdAt(x: number, z: number): SurfaceId {
    if (this.rivers.length && this.riverDepthAt(x, z) > 0.05) return 'water';
    const h = this.rh;
    if (!this.road.project(x, z, h)) return 'grass';
    if (this.ford && h.s >= this.ford.fromS && h.s <= this.ford.toS && Math.abs(h.lateral) < this.road.wallOffset) {
      return 'water';
    }
    let id: SurfaceId;
    if (Math.abs(h.lateral) > this.road.halfWidthAtS(h.s)) {
      id = Math.abs(h.lateral) > this.road.wallAtS(h.s) + 1 ? 'grass' : this.shoulderSurface;
      // A side street joining the road is asphalt too.
      for (const j of this.junctions) {
        if (Math.abs(h.s - j.s) < j.width / 2 && j.sides.includes(h.lateral > 0 ? 1 : -1) && Math.abs(h.lateral) < this.road.wallAtS(j.s) + j.arm) {
          id = 'asphalt';
          break;
        }
      }
    } else {
      const i = Math.min(this.road.count - 1, Math.max(0, Math.round((h.s / this.road.length) * (this.road.count - 1))));
      id = this.surfaceIds[this.sampleSurface[i]];
      for (const p of this.puddles) {
        const ds = (h.s - p.s) / (p.r * 1.35);
        const dl = (h.lateral - p.lateral) / p.r;
        if (ds * ds + dl * dl < 1) return p.pothole ? 'rocky' : 'water';
      }
    }
    return this.wetness > 0 ? wetSurface(id, this.wetness) : id;
  }

  /** The paved/unpaved surface of the road bed at sample `i` (before weather and puddles); the renderer uses it to draw dirt, gravel, rock or mud instead of asphalt. */
  roadSurfaceAtSample(i: number): SurfaceId {
    return this.surfaceIds[this.sampleSurface[i]];
  }

  /** Depth of river water at a point (0 on dry land, and on a bridge deck, which is above the water). */
  riverDepthAt(x: number, z: number): number {
    if (!this.rivers.length || !this.terrain.nearRiver(x, z, this.riverReach)) return 0;
    nearestRiver(this.rivers, x, z, this.rn);
    const r = this.rivers[this.rn.river];
    if (!r || this.rn.d > r.width / 2) return 0;
    return Math.max(0, this.rn.y - this.terrain.heightAt(x, z));
  }

  /** Depth of water over the road bed at a point (a ford), or of a river (0 elsewhere). */
  waterDepthAt(x: number, z: number): number {
    const f = this.ford;
    let depth = 0;
    if (f) {
      const h = this.rh;
      if (this.road.project(x, z, h) && h.s >= f.fromS && h.s <= f.toS && Math.abs(h.lateral) <= this.road.wallOffset) depth = Math.max(0, f.waterY - h.y);
    }
    return depth > 0 ? depth : this.riverDepthAt(x, z);
  }

  /** Pose on the road at distance `s` - used for spawning and checkpoint recovery. */
  poseAt(s: number): SpawnPose {
    const p = this.road.at(s, { x: 0, y: 0, z: 0, tx: 0, tz: -1 });
    return { x: p.x, y: p.y, z: p.z, tx: p.tx, tz: p.tz };
  }

  /** Road fraction (0..1 of the whole road) to a distance. */
  fractionToS(f: number): number {
    return f * this.road.length;
  }

  /** Playable-stretch fraction (0..1 between start and finish) to a distance. */
  stretchToS(f: number): number {
    return this.startS + f * (this.finishS - this.startS);
  }
}
