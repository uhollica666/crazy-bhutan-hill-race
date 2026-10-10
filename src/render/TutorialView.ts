import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import type { Scene } from 'three';
import type { Course } from '../world/Course';

/**
 * The lesson barrier: a striped gate across the road that closes the current lesson off from the next. It is drawn
 * here and made solid by circles registered in the course's obstacle set by the tutorial controller.
 */
export class TutorialView {
  private readonly group = new Group();
  private readonly geos: BoxGeometry[] = [];
  private readonly mats: MeshLambertMaterial[] = [];
  private lowering = 0;
  private bar: Group | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly course: Course,
  ) {
    this.group.name = 'tutorial';
    scene.add(this.group);
  }

  /** Raises a barrier at `s` metres along the road, replacing any earlier one. */
  raise(s: number): void {
    this.clear();
    const { road, terrain } = this.course;
    const p = { x: 0, y: 0, z: 0, tx: 0, tz: -1 };
    road.at(s, p);
    const bar = new Group();
    const half = road.wallOffset - 0.2;
    const white = new MeshLambertMaterial({ color: 0xf1efe8 });
    const orange = new MeshLambertMaterial({ color: 0xff8a2a });
    const post = new MeshLambertMaterial({ color: 0x2c3042 });
    this.mats.push(white, orange, post);
    const postGeo = new BoxGeometry(0.28, 1.9, 0.28);
    this.geos.push(postGeo);
    for (const side of [-1, 1]) {
      const m = new Mesh(postGeo, post);
      m.position.set(side * half, 0.95, 0);
      bar.add(m);
    }
    const n = 9;
    const w = (half * 2) / n;
    const segGeo = new BoxGeometry(w * 0.98, 0.34, 0.16);
    this.geos.push(segGeo);
    for (let i = 0; i < n; i++) {
      for (const y of [1.15, 1.6]) {
        const m = new Mesh(segGeo, (i + (y > 1.4 ? 1 : 0)) % 2 === 0 ? orange : white);
        m.position.set(-half + w * (i + 0.5), y, 0);
        bar.add(m);
      }
    }
    // Two small cones in front, so it reads as "closed for now" rather than a wall.
    const coneGeo = new BoxGeometry(0.4, 0.55, 0.4);
    this.geos.push(coneGeo);
    for (const side of [-0.45, 0.45]) {
      const c = new Mesh(coneGeo, orange);
      c.position.set(side * half, 0.28, -1.1);
      bar.add(c);
    }
    bar.position.set(p.x, terrain.heightAt(p.x, p.z), p.z);
    bar.rotation.y = Math.atan2(-p.tx, -p.tz);
    this.group.add(bar);
    this.bar = bar;
    this.lowering = 0;
  }

  /** Lowers the barrier out of the way (a short animation, then it is removed). */
  lower(): void {
    if (this.bar) this.lowering = 1;
  }

  update(dt: number): void {
    if (!this.bar || this.lowering <= 0) return;
    this.lowering = Math.max(0, this.lowering - dt * 1.8);
    this.bar.position.y -= dt * 3.2;
    this.bar.scale.y = Math.max(0.05, this.lowering);
    if (this.lowering <= 0) this.clear();
  }

  private clear(): void {
    if (this.bar) this.group.remove(this.bar);
    this.bar = null;
    this.geos.splice(0).forEach((g) => g.dispose());
    this.mats.splice(0).forEach((m) => m.dispose());
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
