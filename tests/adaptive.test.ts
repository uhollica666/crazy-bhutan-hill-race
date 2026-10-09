import { describe, expect, it } from 'vitest';
import { AdaptiveResolution } from '../src/render/adaptive';
import { QUALITY } from '../src/render/quality';

function feed(a: AdaptiveResolution, seconds: number, fps: number): number[] {
  const changes: number[] = [];
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) {
    const c = a.update(dt);
    if (c !== null) changes.push(c);
  }
  return changes;
}

describe('AdaptiveResolution', () => {
  it('holds still when the target frame rate is met', () => {
    const a = new AdaptiveResolution(45);
    expect(feed(a, 20, 60)).toEqual([]);
    expect(a.scale).toBe(1);
  });

  it('steps the render scale down when the device cannot keep up, down to a floor', () => {
    const a = new AdaptiveResolution(45);
    const changes = feed(a, 40, 20);
    expect(changes.length).toBeGreaterThan(1);
    expect(changes[0]).toBeLessThan(1);
    expect(a.scale).toBeGreaterThanOrEqual(0.6);
    expect(a.scale).toBeLessThan(0.75);
    feed(a, 60, 20);
    expect(a.scale).toBe(0.6);
  });

  it('recovers resolution slowly once there is headroom', () => {
    const a = new AdaptiveResolution(30);
    feed(a, 30, 12);
    const low = a.scale;
    expect(low).toBeLessThan(1);
    feed(a, 60, 120);
    expect(a.scale).toBeGreaterThan(low);
    expect(a.scale).toBeLessThanOrEqual(1);
  });

  it('ignores pauses and tab-switch spikes', () => {
    const a = new AdaptiveResolution(45);
    for (let i = 0; i < 20; i++) expect(a.update(2.5)).toBeNull();
    expect(a.scale).toBe(1);
  });
});

describe('quality presets', () => {
  it('Low removes meaningfully more GPU work than Medium, and Medium more than High', () => {
    const { low, medium, high } = QUALITY;
    expect(low.shadows).toBe(false);
    expect(medium.shadows && high.shadows).toBe(true);
    expect(low.terrainCoarse).toBe(true);
    expect(medium.terrainCoarse || high.terrainCoarse).toBe(false);
    expect(low.renderScale).toBeLessThan(medium.renderScale);
    expect(low.maxPixelRatio).toBeLessThan(medium.maxPixelRatio);
    expect(medium.maxPixelRatio).toBeLessThan(high.maxPixelRatio);
    expect(low.propDensity).toBeLessThan(medium.propDensity);
    expect(medium.propDensity).toBeLessThan(high.propDensity);
    expect(low.particleDensity).toBeLessThan(medium.particleDensity);
    expect(low.skidMarks).toBe(false);
    expect(low.snowCount).toBeLessThan(medium.snowCount);
    expect(medium.snowCount).toBeLessThan(high.snowCount);
    expect(low.fogFar).toBeLessThan(medium.fogFar);
    expect(low.windSway).toBe(false);
  });
});
