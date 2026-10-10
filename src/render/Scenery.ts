import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import type { Course } from '../world/Course';
import { createRoadHit } from '../world/Road';
import type { LandmarkDef } from '../data/types';
import { fbm2, lerp, mulberry32, smoothstep } from '../core/math';
import { GeoBuilder } from './geo';
import { peekEnvKit } from './envKit';
import { FLAG_COLORS, PAL } from './palette';
import { clockTowerGeometry, shopRowGeometry, stationGeometry } from './vehicleBodies';
import { bridgeGeometry, cliffGeometry, plazaGeometry, retainWallGeometry, runwayGeometry, signpostGeometry, stallGeometry, trolleyGeometry, viewpointGeometry } from './trafficBodies';
import { chortenRingGeometry, lodgeGeometry, shelterGeometry } from './stormBodies';
import { flagPolesGeometry } from './snowBodies';
import { ruinGeometry } from './nightBodies';
import { brokenBridgeGeometry, campsiteGeometry, tentGeometry } from './expeditionBodies';
import { gmcHallGeometry } from './gmcBodies';
import { coveredBridgeGeometry, dzongComplexGeometry, footbridgeGeometry, paddyGeometry, picnicGeometry, trussBridgeGeometry } from './valleyBodies';
import { buddhaGeometry, busShelterGeometry, gateArchGeometry, hotelGeometry, officeGeometry, planterGeometry, policeBoothGeometry, railingGeometry, restaurantGeometry } from './cityBodies';
import {
  broadleafGeometry,
  dzongGeometry,
  planeGeometry,
  prayerWheelHouseGeometry,
  shrubGeometry,
  terminalGeometry,
  towerGeometry,
} from './landmarks';

// ---------------------------------------------------------------- geometry kits

function pineGeometry(): BufferGeometry {
  return new GeoBuilder()
    .cylinder(0.16, 0.22, 1.2, PAL.bark, 5, { y: 0.6 })
    .cone(1.75, 2.6, PAL.pineDark, 7, { y: 2.2 })
    .cone(1.35, 2.4, PAL.pineMid, 7, { y: 3.6, ry: 0.4 })
    .cone(0.95, 2.2, PAL.pineDark, 7, { y: 4.9 })
    .build();
}

function cypressGeometry(): BufferGeometry {
  return new GeoBuilder()
    .cylinder(0.15, 0.2, 1.4, PAL.bark, 5, { y: 0.7 })
    .cone(1.05, 7.2, PAL.cypress, 6, { y: 4.6 })
    .cone(0.72, 3.4, PAL.pineMid, 6, { y: 8.0, ry: 0.5 })
    .build();
}

function rockGeometry(): BufferGeometry {
  return new GeoBuilder().rock(PAL.rock, { sy: 0.72 }).build();
}

function houseGeometry(): BufferGeometry {
  const W = 9;
  const D = 6.4;
  const g = new GeoBuilder();
  g.box(W + 0.5, 3.2, D + 0.5, PAL.rock, { y: -1.4 }); // stone plinth, buries slopes
  g.box(W, 5.7, D, PAL.whitewash, { y: 2.95 }); // limewashed walls
  g.box(W + 0.18, 0.45, D + 0.18, PAL.woodDark, { y: 3.0 }); // floor band
  g.box(W + 0.18, 0.4, D + 0.18, PAL.woodDark, { y: 5.7 }); // eaves band
  g.box(W + 0.3, 0.12, D + 0.3, PAL.roofRed, { y: 5.95 }); // painted fascia

  const win = (x: number, y: number, z: number, ry: number): void => {
    g.box(1.5, 1.55, 0.14, PAL.wood, { x, y, z, ry });
    g.box(1.15, 1.2, 0.2, PAL.windowDark, { x, y, z, ry });
    g.box(1.7, 0.22, 0.16, PAL.maroon, { x, y: y + 0.88, z, ry });
  };
  for (const sx of [-2.8, 0, 2.8]) {
    win(sx, 4.4, D / 2 + 0.04, 0);
    win(sx, 4.4, -D / 2 - 0.04, 0);
  }
  win(-W / 2 - 0.04, 4.4, 0, Math.PI / 2);
  win(W / 2 + 0.04, 4.4, 0, Math.PI / 2);
  for (const sx of [-1.4, 1.8]) g.box(0.6, 0.8, 0.12, PAL.windowDark, { x: sx, y: 1.7, z: D / 2 + 0.03 });
  g.box(1.3, 2.1, 0.14, PAL.woodDark, { x: -3.1, y: 1.15, z: D / 2 + 0.05 });

  // Gabled roof with deep eaves, slate coloured.
  const H = 2.3;
  const alpha = Math.atan2(H, D / 2);
  const slope = Math.hypot(H, D / 2);
  const eave = 1.5;
  const len = slope + eave;
  const midZ = (D / 2 + Math.cos(alpha) * eave) / 2;
  const midY = 5.95 + H / 2 - (Math.sin(alpha) * eave) / 2;
  g.box(W + 2.6, 0.26, len, PAL.roofSlate, { y: midY, z: midZ, rx: alpha });
  g.box(W + 2.6, 0.26, len, PAL.roofSlate, { y: midY, z: -midZ, rx: -alpha });
  g.box(W + 2.7, 0.3, 0.5, PAL.roofSlate, { y: 5.95 + H + 0.05 });
  // Gable ends (triangles of whitewash under the roof).
  for (const sx of [-1, 1]) {
    g.add(gableTriangle(D, H), PAL.whitewash, { x: sx * (W / 2 - 0.02), y: 5.95 });
  }
  // Roof-top prayer flag pole.
  g.cylinder(0.06, 0.08, 4.2, PAL.woodDark, 5, { x: W / 2 + 0.7, y: 5.95 + H + 0.8 });
  g.quad(0.7, 2.2, PAL.flagWhite, { x: W / 2 + 0.7, y: 5.95 + H + 1.8, z: 0.4 });
  return g.build();
}

function gableTriangle(depth: number, height: number): BufferGeometry {
  const g = new BufferGeometry();
  const d = depth / 2;
  g.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, -d, 0, 0, d, 0, height, 0, 0, 0, -d, 0, height, 0, 0, 0, d], 3),
  );
  return g;
}

function chortenGeometry(): BufferGeometry {
  return new GeoBuilder()
    .box(3.4, 0.6, 3.4, PAL.whitewash, { y: 0.3 })
    .box(2.8, 0.55, 2.8, PAL.whitewash, { y: 0.88 })
    .frustum(2.3, 2.0, 0.9, PAL.whitewash, { y: 1.6 })
    .sphere(1.15, PAL.whitewash, { y: 2.45, sy: 0.95 }, 10)
    .cylinder(1.0, 1.05, 0.28, PAL.maroon, 10, { y: 3.2 })
    .box(1.05, 0.85, 1.05, PAL.gold, { y: 3.8 })
    .cone(0.62, 1.7, PAL.gold, 8, { y: 5.1 })
    .sphere(0.2, PAL.gold, { y: 6.05 }, 6)
    .box(3.4, 0.12, 3.4, PAL.wall, { y: -0.04 })
    .build();
}

export function yakGeometry(): BufferGeometry {
  return new GeoBuilder()
    .box(1.0, 0.95, 2.0, PAL.yak, { y: 1.15 })
    .box(1.12, 0.55, 1.8, 0x2a1e19, { y: 0.7 }) // long skirt of hair
    .box(0.9, 0.5, 0.9, PAL.yak, { y: 1.75, z: -0.3 }) // shoulder hump
    .box(0.5, 0.5, 0.6, PAL.yak, { y: 1.3, z: -1.2 })
    .box(0.28, 0.24, 0.3, 0x6a5a50, { y: 1.15, z: -1.55 })
    .cone(0.07, 0.5, PAL.yakHorn, 5, { x: 0.3, y: 1.7, z: -1.15, rz: -0.9 })
    .cone(0.07, 0.5, PAL.yakHorn, 5, { x: -0.3, y: 1.7, z: -1.15, rz: 0.9 })
    .box(0.18, 0.7, 0.18, 0x2a1e19, { x: 0.3, y: 0.35, z: -0.7 })
    .box(0.18, 0.7, 0.18, 0x2a1e19, { x: -0.3, y: 0.35, z: -0.7 })
    .box(0.18, 0.7, 0.18, 0x2a1e19, { x: 0.3, y: 0.35, z: 0.7 })
    .box(0.18, 0.7, 0.18, 0x2a1e19, { x: -0.3, y: 0.35, z: 0.7 })
    .build();
}

/** Waving cloth: a plain vertex-coloured mesh plus a per-vertex `sway` weight driven in the vertex shader. */
class ClothBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly sway: number[] = [];
  private readonly c = new Color();

  /** Quad from four corners (a=top-left, b=top-right, c=bottom-right, d=bottom-left) with sway weights. */
  quad(corners: Vector3[], color: number, sway: [number, number, number, number]): void {
    this.c.setHex(color);
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const p = corners[i];
      this.pos.push(p.x, p.y, p.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.sway.push(sway[i]);
    }
  }

  build(): BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('sway', new Float32BufferAttribute(this.sway, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- scenery

interface Instances {
  mesh: InstancedMesh;
  total: number;
  densityScaled: boolean;
}

/**
 * All decoration: forests, rocks, farmhouses, chortens, prayer flags, yaks.
 * Everything is a handful of InstancedMeshes (one draw call per kind), deterministic from the level seed.
 */
export class Scenery {
  readonly group = new Group();
  private readonly instances: Instances[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly uniforms = { uTime: { value: 0 }, uAmp: { value: 1 } };

  constructor(
    private readonly course: Course,
    density: number,
    wind: boolean,
  ) {
    this.group.name = 'scenery';
    this.build();
    this.setQuality(density, wind);
  }

  setQuality(density: number, wind: boolean): void {
    for (const inst of this.instances) {
      if (inst.densityScaled) inst.mesh.count = Math.floor(inst.total * density);
    }
    this.uniforms.uAmp.value = wind ? 1 : 0;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.group.clear();
  }

  private propMaterial(): MeshLambertMaterial {
    const m = new MeshLambertMaterial({ vertexColors: true });
    this.disposables.push(m);
    return m;
  }

  private registerInstanced(
    geo: BufferGeometry,
    mats: Matrix4[],
    material: MeshLambertMaterial,
    densityScaled: boolean,
    tint = 0,
    rng: () => number = Math.random,
  ): void {
    if (!mats.length) {
      geo.dispose();
      return;
    }
    // Instances are grouped into square cells and each cell becomes its own InstancedMesh (sharing one geometry):
    // the renderer can then skip the cells that are out of view instead of drawing every tree of the whole mission.
    const CELL = 420;
    const cells = new Map<string, Matrix4[]>();
    for (const m of mats) {
      const key = `${Math.floor(m.elements[12] / CELL)},${Math.floor(m.elements[14] / CELL)}`;
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(m);
    }
    const c = new Color();
    this.disposables.push(geo);
    for (const list of cells.values()) {
      const mesh = new InstancedMesh(geo, material, list.length);
      list.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        if (tint > 0) {
          const v = 1 - tint + rng() * tint * 2;
          c.setRGB(v, v, v);
          mesh.setColorAt(i, c);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this.disposables.push(mesh);
      this.instances.push({ mesh, total: list.length, densityScaled });
    }
  }

  /** Street lamps: a lit pole plus a glowing head that is bright regardless of the sun (visible at dusk and night). */
  private lampMat: MeshBasicMaterial | null = null;

  /** Street lamps glow at dusk and night and look unlit in daylight. */
  setLamps(on: boolean): void {
    this.lampMat?.color.setScalar(on ? 1.15 : 0.4);
  }

  private addLamps(mats: Matrix4[]): void {
    if (!mats.length) return;
    const pole = new GeoBuilder()
      .cylinder(0.08, 0.12, 5.6, PAL.woodDark, 6, { y: 2.8 })
      .box(1.1, 0.08, 0.1, PAL.woodDark, { y: 5.55, x: 0.45 })
      .build();
    const head = new GeoBuilder().box(0.5, 0.18, 0.34, 0xffe9a8, { y: 5.45, x: 0.95 }).build();
    const poles = new InstancedMesh(pole, this.propMaterial(), mats.length);
    this.lampMat = new MeshBasicMaterial({ vertexColors: true, fog: false });
    this.lampMat.color.setScalar(0.4);
    const heads = new InstancedMesh(head, this.lampMat, mats.length);
    mats.forEach((m, i) => {
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    for (const mesh of [poles, heads]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.disposables.push(mesh);
    }
    this.disposables.push(pole, head, this.lampMat);
  }

  private build(): void {
    const { course } = this;
    const level = course.level;
    const rng = mulberry32(level.scenery.seed);
    const terrain = course.terrain;
    const road = course.road;
    const material = this.propMaterial();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);
    const compose = (x: number, y: number, z: number, ry: number, sx: number, sy = sx, sz = sx): Matrix4 =>
      new Matrix4().compose(p.set(x, y, z), q.setFromAxisAngle(up, ry), s.set(sx, sy, sz));

    const b = terrain.bounds;
    const margin = 14;
    const nodeIdx = (x: number, z: number): number =>
      Math.round((x - terrain.minX) / terrain.cell) +
      Math.round((z - terrain.minZ) / terrain.cell) * terrain.nx;

    // The parapet's distance from the centre line varies with the road's width profile: ask the road where it matters.
    const wallHit = createRoadHit();
    const wallAt = (x: number, z: number, d: number): number => {
      if (d > road.wallOffset + 8 || !road.project(x, z, wallHit)) return road.wallOffset;
      return road.wallAtS(wallHit.s);
    };

    // ---- forests (species mix, tree line and foliage colours come from the level)
    const pines: Matrix4[] = [];
    const cypresses: Matrix4[] = [];
    const broadleaf: Matrix4[] = [];
    const shrubs: Matrix4[] = [];
    const sp = level.scenery.species;
    const total = Math.max(0.0001, sp.pine + sp.cypress + sp.broadleaf + sp.shrub);
    const treeLine = level.look.treeLine ?? 122;
    const want = level.scenery.trees;
    for (
      let tries = 0;
      tries < want * 14 && pines.length + cypresses.length + broadleaf.length + shrubs.length < want;
      tries++
    ) {
      const x = lerp(b.minX + margin, b.maxX - margin, rng());
      const z = lerp(b.minZ + margin, b.maxZ - margin, rng());
      const k = nodeIdx(x, z);
      const d = terrain.roadDist[k];
      const pick = rng() * total;
      const kind =
        pick < sp.pine
          ? 'pine'
          : pick < sp.pine + sp.cypress
            ? 'cypress'
            : pick < sp.pine + sp.cypress + sp.broadleaf
              ? 'broadleaf'
              : 'shrub';
      if (d < wallAt(x, z, d) + (kind === 'shrub' ? 2.5 : 4.5)) continue;
      if (terrain.riverDist && terrain.riverDist[k] < 15) continue;
      const h = terrain.heightAt(x, z);
      if (h < terrain.waterLevel + 2.5 || h > treeLine + (kind === 'shrub' ? 12 : 0)) continue;
      if (terrain.normals[k * 3 + 1] < (kind === 'shrub' ? 0.62 : 0.74)) continue;
      const forest = fbm2(x / 55, z / 55, level.scenery.seed, 3) * 0.5 + 0.5;
      let accept = smoothstep(0.38, 0.62, forest) * 0.95 + 0.04;
      if (d < 16) accept *= kind === 'shrub' ? 1 : 0.55;
      if (rng() > accept) continue;
      const sc = (kind === 'shrub' ? 0.8 : 0.8) + rng() * (kind === 'shrub' ? 0.8 : 0.95);
      const m = compose(x, h - 0.15, z, rng() * 6.28, sc, sc * (0.9 + rng() * 0.3), sc);
      (kind === 'pine'
        ? pines
        : kind === 'cypress'
          ? cypresses
          : kind === 'broadleaf'
            ? broadleaf
            : shrubs
      ).push(m);
    }
    const kit = peekEnvKit();
    // Kit variants: matrices are split between the models so a forest is not one tree repeated.
    const split = (list: Matrix4[], n: number): Matrix4[][] => {
      const out: Matrix4[][] = Array.from({ length: n }, () => []);
      list.forEach((m, i) => out[(i * 7 + Math.floor(rng() * n)) % n].push(m));
      return out;
    };
    const varied = (names: string[], list: Matrix4[], fallback: () => BufferGeometry, tint: number, densityScaled = true): void => {
      const avail = names.filter((n) => kit?.has(n));
      if (!kit || !avail.length) {
        this.registerInstanced(fallback(), list, material, densityScaled, tint, rng);
        return;
      }
      split(list, avail.length).forEach((part, i) => this.registerInstanced(kit.geo(avail[i]) as BufferGeometry, part, material, densityScaled, tint, rng));
    };
    varied(['pine_a', 'pine_b'], pines, pineGeometry, 0.14);
    varied(['cypress', 'spruce'], cypresses, cypressGeometry, 0.12);
    this.registerInstanced(
      broadleafGeometry(level.look.leaf ?? 0x7fae4a),
      broadleaf,
      material,
      true,
      0.12,
      rng,
    );
    this.registerInstanced(shrubGeometry(level.look.blossom ?? 0xd04070), shrubs, material, true, 0.1, rng);

    // ---- rocks
    const rocks: Matrix4[] = [];
    for (let tries = 0; tries < level.scenery.rocks * 25 && rocks.length < level.scenery.rocks; tries++) {
      const x = lerp(b.minX + margin, b.maxX - margin, rng());
      const z = lerp(b.minZ + margin, b.maxZ - margin, rng());
      const k = nodeIdx(x, z);
      const d = terrain.roadDist[k];
      if (d < wallAt(x, z, d) + 1.5) continue;
      const steep = terrain.normals[k * 3 + 1] < 0.84;
      if (!(steep ? rng() < 0.5 : d < 45 ? rng() < 0.18 : rng() < 0.03)) continue;
      const sc = 0.7 + rng() * rng() * 3.2;
      rocks.push(
        compose(
          x,
          terrain.heightAt(x, z) + sc * 0.1,
          z,
          rng() * 6.28,
          sc * (0.8 + rng() * 0.6),
          sc,
          sc * (0.8 + rng() * 0.6),
        ),
      );
    }
    varied(['rock_a', 'rock_b', 'rock_c'], rocks, rockGeometry, 0.1);

    // ---- roadside dressing (kit only; skipped when the kit is missing): grass, ferns, cairns
    if (kit) {
      const snowy = level.weather === 'snow';
      const grassA: Matrix4[] = [];
      const grassB: Matrix4[] = [];
      const ferns: Matrix4[] = [];
      const cairns: Matrix4[] = [];
      const cp = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
      const grassWant = snowy ? 0 : Math.min(1400, Math.round(level.scenery.trees * 1.3));
      for (let tries = 0; tries < grassWant * 6 && grassA.length + grassB.length < grassWant; tries++) {
        const x = lerp(b.minX + margin, b.maxX - margin, rng());
        const z = lerp(b.minZ + margin, b.maxZ - margin, rng());
        const k = nodeIdx(x, z);
        const d = terrain.roadDist[k];
        if (d < wallAt(x, z, d) + 0.9 || d > 30) continue;
        if (terrain.riverDist && terrain.riverDist[k] < 14) continue;
        const h = terrain.heightAt(x, z);
        if (h < terrain.waterLevel + 1.2 || h > treeLine || terrain.normals[k * 3 + 1] < 0.8) continue;
        if (rng() > 1 - d / 38) continue; // thicker nearer the road
        const sc = 0.8 + rng() * 0.9;
        (rng() < 0.55 ? grassA : grassB).push(compose(x, h - 0.02, z, rng() * 6.28, sc, sc * (0.8 + rng() * 0.6), sc));
      }
      const fernWant = snowy ? 0 : Math.round(level.scenery.trees * 0.35);
      for (let tries = 0; tries < fernWant * 10 && ferns.length < fernWant; tries++) {
        const x = lerp(b.minX + margin, b.maxX - margin, rng());
        const z = lerp(b.minZ + margin, b.maxZ - margin, rng());
        const k = nodeIdx(x, z);
        const d = terrain.roadDist[k];
        if (d < wallAt(x, z, d) + 3 || d > 55) continue;
        if (terrain.riverDist && terrain.riverDist[k] < 14) continue;
        const h = terrain.heightAt(x, z);
        if (h < terrain.waterLevel + 2 || h > treeLine - 10 || terrain.normals[k * 3 + 1] < 0.78) continue;
        const forest = fbm2(x / 55, z / 55, level.scenery.seed, 3) * 0.5 + 0.5;
        if (forest < 0.5 || rng() > 0.7) continue;
        const sc = 0.9 + rng() * 0.8;
        ferns.push(compose(x, h - 0.02, z, rng() * 6.28, sc));
      }
      // A cairn with prayer flags every few hundred metres, alternating sides.
      for (let at = 140 + rng() * 80, i = 0; at < road.length - 80 && cairns.length < 14; at += 190 + rng() * 140, i++) {
        road.at(at, cp);
        const side = i % 2 ? 1 : -1;
        const off = road.wallAtS(at) + 1.3 + rng() * 1.6;
        const x = cp.x + -cp.tz * side * off;
        const z = cp.z + cp.tx * side * off;
        const h = terrain.heightAt(x, z);
        if (h < terrain.waterLevel + 1.5 || terrain.normals[nodeIdx(x, z) * 3 + 1] < 0.8) continue;
        cairns.push(compose(x, h - 0.05, z, rng() * 6.28, 0.9 + rng() * 0.4));
      }
      const one = (name: string, list: Matrix4[], tint: number, scaled = true): void => {
        const g = kit.geo(name);
        if (g && list.length) this.registerInstanced(g, list, material, scaled, tint, rng);
      };
      one('grass_a', grassA, 0.2);
      one('grass_b', grassB, 0.2);
      one('fern', ferns, 0.15);
      one('cairn', cairns, 0.06, false);
    }

    // ---- landmarks
    const houses: Matrix4[] = [];
    const chortens: Matrix4[] = [];
    const maniWalls: Matrix4[] = [];
    const yaks: Matrix4[] = [];
    const dzongs: Matrix4[] = [];
    const terminals: Matrix4[] = [];
    const towers: Matrix4[] = [];
    const planes: Matrix4[] = [];
    const wheelHouses: Matrix4[] = [];
    const shops: Matrix4[] = [];
    const towersClock: Matrix4[] = [];
    const lamps: Matrix4[] = [];
    const stations: Matrix4[] = [];
    const retainWalls: Matrix4[] = [];
    const viewpoints: Matrix4[] = [];
    const signposts: Matrix4[] = [];
    const stalls: Matrix4[] = [];
    const plazas: Matrix4[] = [];
    const hotels: Matrix4[] = [];
    const cliffs: Matrix4[] = [];
    const bridges: Matrix4[] = [];
    const paddies: Matrix4[] = [];
    const footbridges: Matrix4[] = [];
    const trussBridges: Matrix4[] = [];
    const coveredBridges: Matrix4[] = [];
    const dzongComplexes: Matrix4[] = [];
    const picnics: Matrix4[] = [];
    const chortenRings: Matrix4[] = [];
    const shelterHuts: Matrix4[] = [];
    const lodges: Matrix4[] = [];
    const flagFields: Matrix4[] = [];
    const ruins: Matrix4[] = [];
    const brokenBridges: Matrix4[] = [];
    const tents: Matrix4[] = [];
    const camps: Matrix4[] = [];
    const gmcHalls: Matrix4[] = [];
    const runways: Matrix4[] = [];
    const trolleys: Matrix4[] = [];
    const offices: Matrix4[] = [];
    const restaurants: Matrix4[] = [];
    const shelters: Matrix4[] = [];
    const booths: Matrix4[] = [];
    const railings: Matrix4[] = [];
    const arches: Matrix4[] = [];
    const buddhas: Matrix4[] = [];
    const planters: Matrix4[] = [];
    const nearHit = createRoadHit();
    const cloth = new ClothBuilder();
    const poles = new GeoBuilder();
    let poleCount = 0;
    const pose = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
    const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

    for (const l of level.scenery.landmarks) {
      road.at(l.at * road.length, pose);
      let rx = -pose.tz;
      let rz = pose.tx;
      const lat = l.side * l.offset;
      let x = pose.x + rx * lat;
      let z = pose.z + rz * lat;
      // Heading that makes the model's +Z face look back toward the road.
      let faceRoad = Math.atan2(-l.side * rx, -l.side * rz);
      if (l.pos) {
        // Absolute placement (city blocks): face the nearest point of the road.
        x = l.pos.x;
        z = l.pos.z;
        if (road.project(x, z, nearHit)) {
          road.at(nearHit.s, pose);
          const cx = pose.x;
          const cz = pose.z;
          faceRoad = Math.atan2(cx - x, cz - z);
          rx = -pose.tz;
          rz = pose.tx;
        }
      }
      const y = terrain.heightAt(x, z);
      const sc = l.scale ?? 1;

      switch (l.kind) {
        case 'house':
          houses.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'chorten':
          chortens.push(compose(x, y, z, faceRoad, sc));
          if (kit?.has('mani_wall')) {
            const mx = x + pose.tx * 5.5 * sc;
            const mz = z + pose.tz * 5.5 * sc;
            maniWalls.push(compose(mx, terrain.heightAt(mx, mz), mz, Math.atan2(pose.tx, pose.tz) + Math.PI / 2, sc));
          }
          break;
        case 'chortenGroup': {
          // A terraced field of small chortens, in the spirit of a memorial ridge of 108.
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5 - row; col++) {
              const along = (col - (4 - row) / 2) * 5.6;
              const out = row * 5.2;
              const cx = x + pose.tx * along + rx * l.side * out;
              const cz = z + pose.tz * along + rz * l.side * out;
              chortens.push(compose(cx, terrain.heightAt(cx, cz), cz, faceRoad, 0.75 * sc));
            }
          }
          break;
        }
        case 'dzong':
          dzongs.push(compose(x, y - 0.5, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'terminal':
          terminals.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'tower':
          towers.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'plane':
          planes.push(compose(x, y, z, faceRoad + (l.rotation ?? 0) + Math.PI / 2, sc));
          break;
        case 'prayerWheelHouse':
          wheelHouses.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'shopRow':
          shops.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'clockTower':
          towersClock.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'streetLamp':
          lamps.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'station':
          stations.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'retainWall':
          // The wall's long axis (X) lies along the road, with its face toward it.
          retainWalls.push(compose(x, y - 0.1, z, Math.atan2(pose.tx, pose.tz) + Math.PI / 2 + (l.side > 0 ? Math.PI : 0), sc));
          break;
        case 'viewpoint':
          viewpoints.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'signpost':
          signposts.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'stall':
          stalls.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'plaza':
          plazas.push(compose(x, y - 0.05, z, faceRoad, sc));
          break;
        case 'cliff':
          cliffs.push(compose(x, y - 0.3, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'bridge':
          bridges.push(compose(pose.x, pose.y, pose.z, Math.atan2(pose.tx, pose.tz) + Math.PI / 2, sc));
          break;
        case 'trussBridge':
          // A road bridge: sits on the road, deck along it.
          trussBridges.push(compose(pose.x, pose.y, pose.z, Math.atan2(pose.tx, pose.tz) + Math.PI / 2, sc));
          break;
        case 'footbridge':
        case 'coveredBridge': {
          // Pedestrian bridges span a river that runs beside the road: the deck is across the road's direction, level with the higher bank.
          const yaw = Math.atan2(pose.tx, pose.tz) + (l.rotation ?? 0);
          const half = (l.kind === 'footbridge' ? 26 : 18) * sc;
          const ex = Math.cos(yaw) * half;
          const ez = -Math.sin(yaw) * half;
          const top = Math.max(terrain.heightAt(x + ex, z + ez), terrain.heightAt(x - ex, z - ez), y);
          (l.kind === 'footbridge' ? footbridges : coveredBridges).push(compose(x, top + 0.2, z, yaw, sc));
          break;
        }
        case 'paddy':
          paddies.push(compose(x, y - 0.3, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'dzongComplex':
          dzongComplexes.push(compose(x, y - 0.8, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'picnic':
          picnics.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'chortenRing':
          chortenRings.push(compose(x, y - 0.2, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'shelter':
          shelterHuts.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'lodge':
          lodges.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'brokenBridge':
          // A collapsed bridge beside the ford, along the road's direction and level with it.
          brokenBridges.push(compose(x, pose.y, z, Math.atan2(pose.tx, pose.tz) + Math.PI / 2 + (l.rotation ?? 0), sc));
          break;
        case 'tent':
          tents.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'gmcHall':
          gmcHalls.push(compose(x, y - 0.2, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'campsite':
          camps.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'ruin':
          ruins.push(compose(x, y - 0.1, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'flagPoles':
          flagFields.push(compose(x, y - 0.3, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'runway':
          // Long axis parallel to the road.
          runways.push(compose(x, y - 0.4, z, Math.atan2(pose.tx, pose.tz) + Math.PI / 2 + (l.rotation ?? 0), sc));
          break;
        case 'trolley':
          trolleys.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'hotel':
          hotels.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'office':
          offices.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'restaurant':
          restaurants.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'busShelter':
          shelters.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'policeBooth':
          booths.push(compose(x, y, z, faceRoad, sc));
          break;
        case 'railing':
          // Long axis along the road.
          railings.push(compose(x, y, z, Math.atan2(pose.tx, pose.tz) + Math.PI / 2, sc));
          break;
        case 'gateArch':
          // Spans the road: centred on the road, facing along it.
          arches.push(compose(pose.x, pose.y, pose.z, Math.atan2(pose.tx, pose.tz) + Math.PI, sc));
          break;
        case 'buddha':
          buddhas.push(compose(x, y - 0.3, z, faceRoad, sc));
          break;
        case 'planter':
          planters.push(compose(x, y, z, faceRoad + (l.rotation ?? 0), sc));
          break;
        case 'yak':
          yaks.push(compose(x, y, z, rng() * 6.28, 1.05 + rng() * 0.2));
          break;
        case 'flagSpan': {
          // Strings of prayer flags across the road on two poles.
          const edge = road.wallAtS(l.at * road.length) + 1.8;
          const px = [pose.x + rx * -edge, pose.x + rx * edge];
          const pz = [pose.z + rz * -edge, pose.z + rz * edge];
          const py = [terrain.heightAt(px[0], pz[0]), terrain.heightAt(px[1], pz[1])];
          const top = Math.max(py[0], py[1], pose.y) + 8.6;
          for (let i = 0; i < 2; i++) {
            poles.cylinder(0.11, 0.17, top - py[i] + 1, PAL.woodDark, 5, {
              x: px[i],
              y: (top + py[i] - 1) / 2 + 0.5,
              z: pz[i],
            });
            poleCount++;
          }
          const n = 22;
          const sag = 1.1;
          const at = (t: number): Vector3 =>
            v(lerp(px[0], px[1], t), top - sag * 4 * t * (1 - t), lerp(pz[0], pz[1], t));
          for (let i = 0; i < n; i++) {
            const a = at((i + 0.08) / n);
            const c = at((i + 0.92) / n);
            const hang = 0.95;
            cloth.quad(
              [a, c, c.clone().setY(c.y - hang), a.clone().setY(a.y - hang)],
              FLAG_COLORS[i % 5],
              [0, 0, 1, 1],
            );
          }
          break;
        }
        case 'lungta': {
          // A stand of tall white flag poles on a ridge.
          for (let i = 0; i < 7; i++) {
            const along = (i - 3) * 1.7 + (rng() - 0.5);
            const cx = x + pose.tx * along;
            const cz = z + pose.tz * along;
            const gy = terrain.heightAt(cx, cz);
            const hgt = 7.5 + rng() * 3.5;
            poles.cylinder(0.07, 0.1, hgt + 0.6, PAL.woodDark, 5, { x: cx, y: gy + hgt / 2 - 0.2, z: cz });
            poleCount++;
            const w = 0.75;
            const flagTop = gy + hgt;
            const fh = hgt * 0.62;
            // Flag extends sideways from the pole and is double-sided via the shared material.
            const a = v(cx, flagTop, cz);
            const bb = v(cx + rx * w, flagTop, cz + rz * w);
            const cc = v(cx + rx * w, flagTop - fh, cz + rz * w);
            const dd = v(cx, flagTop - fh, cz);
            cloth.quad([a, bb, cc, dd], i % 3 === 0 ? PAL.flagYellow : PAL.flagWhite, [0, 1, 1, 0]);
            cloth.quad(
              [a, bb, v(bb.x, flagTop - 0.55, bb.z), v(a.x, flagTop - 0.55, a.z)],
              PAL.flagRed,
              [0, 1, 1, 0],
            );
          }
          break;
        }
      }
    }

    varied(['house_0', 'house_1', 'house_2'], houses, houseGeometry, 0, false);
    varied(['chorten'], chortens, chortenGeometry, 0, false);
    if (kit && maniWalls.length) this.registerInstanced(kit.geo('mani_wall') as BufferGeometry, maniWalls, material, false, 0.05, rng);
    this.registerInstanced(yakGeometry(), yaks, material, false);
    this.registerInstanced(dzongGeometry(), dzongs, material, false);
    this.registerInstanced(terminalGeometry(), terminals, material, false);
    this.registerInstanced(towerGeometry(), towers, material, false);
    this.registerInstanced(planeGeometry(), planes, material, false);
    this.registerInstanced(prayerWheelHouseGeometry(), wheelHouses, material, false);
    this.registerInstanced(shopRowGeometry(), shops, material, false);
    this.registerInstanced(clockTowerGeometry(), towersClock, material, false);
    this.registerInstanced(stationGeometry(), stations, material, false);
    this.registerInstanced(retainWallGeometry(), retainWalls, material, false);
    this.registerInstanced(viewpointGeometry(), viewpoints, material, false);
    this.registerInstanced(signpostGeometry(), signposts, material, false);
    this.registerInstanced(stallGeometry(), stalls, material, false);
    this.registerInstanced(plazaGeometry(), plazas, material, false);
    this.registerInstanced(hotelGeometry(), hotels, material, false);
    this.registerInstanced(cliffGeometry(), cliffs, material, false);
    this.registerInstanced(bridgeGeometry(), bridges, material, false);
    this.registerInstanced(paddyGeometry(), paddies, material, false);
    this.registerInstanced(footbridgeGeometry(), footbridges, material, false);
    this.registerInstanced(trussBridgeGeometry(), trussBridges, material, false);
    this.registerInstanced(coveredBridgeGeometry(), coveredBridges, material, false);
    this.registerInstanced(dzongComplexGeometry(), dzongComplexes, material, false);
    this.registerInstanced(picnicGeometry(), picnics, material, false);
    this.registerInstanced(chortenRingGeometry(), chortenRings, material, false);
    this.registerInstanced(shelterGeometry(), shelterHuts, material, false);
    this.registerInstanced(lodgeGeometry(), lodges, material, false);
    this.registerInstanced(flagPolesGeometry(), flagFields, material, false);
    this.registerInstanced(ruinGeometry(), ruins, material, false);
    this.registerInstanced(brokenBridgeGeometry(), brokenBridges, material, false);
    this.registerInstanced(tentGeometry(), tents, material, false);
    this.registerInstanced(campsiteGeometry(), camps, material, false);
    this.registerInstanced(gmcHallGeometry(), gmcHalls, material, false);
    this.registerInstanced(runwayGeometry(), runways, material, false);
    this.registerInstanced(trolleyGeometry(), trolleys, material, false);
    this.registerInstanced(officeGeometry(), offices, material, false);
    this.registerInstanced(restaurantGeometry(), restaurants, material, false);
    this.registerInstanced(busShelterGeometry(), shelters, material, false);
    this.registerInstanced(policeBoothGeometry(), booths, material, false);
    this.registerInstanced(railingGeometry(), railings, material, false);
    this.registerInstanced(gateArchGeometry(), arches, material, false);
    this.registerInstanced(buddhaGeometry(), buddhas, material, false);
    this.registerInstanced(planterGeometry(), planters, material, false);
    this.addLamps(lamps);

    if (poleCount > 0) {
      const geo = poles.build();
      const mesh = new Mesh(geo, material);
      this.group.add(mesh);
      this.disposables.push(geo);
    }
    const clothGeo = cloth.build();
    if (clothGeo) {
      const m = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
      m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        shader.uniforms.uTime = this.uniforms.uTime;
        shader.uniforms.uAmp = this.uniforms.uAmp;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nattribute float sway;\nuniform float uTime;\nuniform float uAmp;',
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float ph = uTime * 3.4 + position.x * 0.45 + position.z * 0.45;
            transformed.x += sin(ph) * 0.26 * sway * uAmp;
            transformed.z += cos(ph * 0.9 + 1.3) * 0.26 * sway * uAmp;
            transformed.y += sin(ph * 1.7) * 0.07 * sway * uAmp;`,
          );
      };
      this.disposables.push(m, clothGeo);
      const mesh = new Mesh(clothGeo, m);
      mesh.frustumCulled = false;
      mesh.name = 'flags';
      this.group.add(mesh);
    }
  }
}

export type { LandmarkDef };
