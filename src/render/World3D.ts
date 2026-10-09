import { Group, Mesh, MeshLambertMaterial } from 'three';
import type { Material, Scene, Vector3 } from 'three';
import type { Course } from '../world/Course';
import type { TimeOfDay, WeatherKind } from '../data/types';
import { Environment } from './Environment';
import { Gates } from './Gates';
import { Scenery } from './Scenery';
import type { QualityProfile } from './quality';
import { buildFordWater, buildRoadMeshes, buildTerrainMesh, buildWater, setTerrainCoarse } from './WorldMesh';

/** Everything visible that belongs to a level, created from a Course and removable as a unit. */
export class World3D {
  readonly root = new Group();
  readonly env: Environment;
  readonly scenery: Scenery;
  readonly gates: Gates;
  private readonly terrain: Group;

  constructor(
    private readonly scene: Scene,
    course: Course,
    quality: QualityProfile,
  ) {
    this.root.name = 'world';
    this.terrain = buildTerrainMesh(course);
    this.root.add(this.terrain, buildRoadMeshes(course));
    // Only levels with a river valley get a water plane.
    if (course.terrain.waterLevel > course.terrain.minHeight) this.root.add(buildWater(course));
    const ford = buildFordWater(course);
    if (ford) this.root.add(ford);
    this.scenery = new Scenery(course, quality.propDensity, quality.windSway);
    this.root.add(this.scenery.group);
    this.gates = new Gates(course);
    this.root.add(this.gates.group);
    this.env = new Environment(scene, course);
    scene.add(this.root);
    this.applyQuality(quality);
  }

  applyQuality(q: QualityProfile): void {
    this.env.applyQuality(q);
    this.scenery.setQuality(q.propDensity, q.windSway);
    this.terrain.traverse((o) => {
      (o as Mesh).receiveShadow = q.shadows;
    });
    setTerrainCoarse(this.terrain, q.terrainCoarse);
    // Shadow-receiving materials need a recompile when shadows are switched on or off.
    this.root.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
  }

  setConditions(weather: WeatherKind, time: TimeOfDay): void {
    this.env.setConditions(weather, time);
    this.scenery.setLamps(this.env.lightsOn && time !== 'day');
  }

  update(time: number, camera: Vector3, focus: Vector3, progress: number): void {
    this.scenery.update(time);
    this.gates.update(time);
    this.env.setProgress(progress);
    this.env.follow(camera, focus);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as MeshLambertMaterial | MeshLambertMaterial[] | undefined;
      if (m)
        (Array.isArray(m) ? m : [m]).forEach((x) => {
          // Terrain detail and road textures are created per world: release them with it.
          x.map?.dispose();
          x.dispose();
        });
    });
    this.scenery.dispose();
    this.gates.dispose();
    this.env.dispose();
  }
}
