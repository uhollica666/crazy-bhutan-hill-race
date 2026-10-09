import type { Course } from '../world/Course';

/** Tiny north-up route map: the road is drawn once, only the car marker is redrawn. */
export class MiniMap {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly base: HTMLCanvasElement;
  private minX = 0;
  private minZ = 0;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private cps: { x: number; z: number }[] = [];
  private readonly size = 128;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = this.size;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.size;
  }

  setCourse(course: Course): void {
    const r = course.road;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < r.count; i++) {
      minX = Math.min(minX, r.xs[i]);
      maxX = Math.max(maxX, r.xs[i]);
      minZ = Math.min(minZ, r.zs[i]);
      maxZ = Math.max(maxZ, r.zs[i]);
    }
    const pad = 12;
    this.scale = (this.size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    this.minX = minX;
    this.minZ = minZ;
    this.offX = (this.size - (maxX - minX) * this.scale) / 2;
    this.offY = (this.size - (maxZ - minZ) * this.scale) / 2;

    const g = this.base.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, this.size, this.size);
    g.lineJoin = g.lineCap = 'round';
    const path = (): void => {
      g.beginPath();
      for (let i = 0; i < r.count; i += 3) {
        const x = this.tx(r.xs[i]);
        const y = this.ty(r.zs[i]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 6;
    path();
    g.stroke();
    g.strokeStyle = '#f6ecd2';
    g.lineWidth = 3.2;
    path();
    g.stroke();
    this.cps = course.checkpointS.map((s) => course.poseAt(s));
    const fin = course.poseAt(course.finishS);
    this.cps.push(fin);
    const st = course.poseAt(course.startS);
    g.fillStyle = '#2e9c4f';
    g.beginPath();
    g.arc(this.tx(st.x), this.ty(st.z), 3.6, 0, Math.PI * 2);
    g.fill();
  }

  private tx(x: number): number {
    return (x - this.minX) * this.scale + this.offX;
  }
  private ty(z: number): number {
    return (z - this.minZ) * this.scale + this.offY;
  }

  /** `next` = index of the next checkpoint (== checkpoint count for the finish). */
  draw(x: number, z: number, heading: number, next: number): void {
    const g = this.ctx;
    if (!g) return;
    g.clearRect(0, 0, this.size, this.size);
    g.drawImage(this.base, 0, 0);
    this.cps.forEach((p, i) => {
      if (i < next) return;
      g.fillStyle = i === next ? '#f6c452' : 'rgba(246,196,82,0.5)';
      g.beginPath();
      g.arc(this.tx(p.x), this.ty(p.z), i === next ? 4.5 : 3, 0, Math.PI * 2);
      g.fill();
    });
    g.save();
    g.translate(this.tx(x), this.ty(z));
    g.rotate(heading);
    g.fillStyle = '#d6322b';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
