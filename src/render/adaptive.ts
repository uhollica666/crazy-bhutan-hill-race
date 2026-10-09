import { clamp } from '../core/math';

/**
 * Adaptive resolution controller. Watches a smoothed frame time and lowers the render scale when the device
 * cannot hold `targetFps`, creeping back up when there is plenty of headroom. Pure logic (no DOM), so it is
 * unit tested; the renderer just applies `scale`.
 */
export class AdaptiveResolution {
  scale = 1;
  private avgMs = 16.7;
  private slow = 0;
  private fast = 0;

  constructor(
    private readonly targetFps: number,
    private readonly minScale = 0.6,
  ) {}

  /** Returns the new scale when it changed, otherwise null. */
  update(dtSeconds: number): number | null {
    if (dtSeconds <= 0 || dtSeconds > 0.5) return null; // ignore pauses / tab switches
    const ms = dtSeconds * 1000;
    this.avgMs += (ms - this.avgMs) * 0.08;
    const budget = 1000 / this.targetFps;
    if (this.avgMs > budget * 1.25) {
      this.slow += dtSeconds;
      this.fast = 0;
    } else if (this.avgMs < budget * 0.7) {
      this.fast += dtSeconds;
      this.slow = 0;
    } else {
      this.slow = Math.max(0, this.slow - dtSeconds);
      this.fast = Math.max(0, this.fast - dtSeconds);
    }
    if (this.slow > 2.5 && this.scale > this.minScale) {
      this.slow = 0;
      this.scale = clamp(this.scale * 0.85, this.minScale, 1);
      return this.scale;
    }
    if (this.fast > 8 && this.scale < 1) {
      this.fast = 0;
      this.scale = clamp(this.scale * 1.1, this.minScale, 1);
      return this.scale;
    }
    return null;
  }

  get averageFps(): number {
    return 1000 / this.avgMs;
  }
}
