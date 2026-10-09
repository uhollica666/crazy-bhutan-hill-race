import type { LevelDef } from '../data/types';
import type { BarrierHit } from './Road';
import { Road } from './Road';
import { Terrain, createRoadBase } from './Terrain';
import type { GroundSample } from './Terrain';
import type { PhysicsWorld } from '../physics/types';

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  /** Heading as a unit XZ vector. */
  tx: number;
  tz: number;
}

/**
 * Everything the simulation needs to know about a level: geometry plus the gameplay stations
 * (start, ordered checkpoints, finish) expressed as distances along the road.
 */
export class Course implements PhysicsWorld {
  readonly road: Road;
  readonly terrain: Terrain;
  readonly startS: number;
  readonly finishS: number;
  /** Distance along the road of each checkpoint, in required order. */
  readonly checkpointS: number[];

  constructor(readonly level: LevelDef) {
    this.road = new Road(level.road, createRoadBase(level.terrain));
    this.terrain = new Terrain(level.terrain, this.road);
    this.startS = level.road.startOffset;
    this.finishS = this.road.length - level.road.finishOffset;
    const span = this.finishS - this.startS;
    this.checkpointS = level.checkpoints.map((c) => this.startS + c.at * span);
    for (let i = 1; i < this.checkpointS.length; i++) {
      if (this.checkpointS[i] <= this.checkpointS[i - 1])
        throw new Error(`Level ${level.id}: checkpoints must ascend`);
    }
  }

  ground(x: number, z: number, out: GroundSample): void {
    this.terrain.groundAt(x, z, out);
  }

  barrier(x: number, z: number, out: BarrierHit): boolean {
    return this.road.barrier(x, z, out);
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
}
