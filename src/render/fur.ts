import { Vector3 } from 'three';
import { surface } from './heroSurfaces';
import type { GeoBuilder } from './geo';

/** Curved overlapping locks instead of triangular cone spikes; merged into the owning skinned body. */
export function furLock(
  builder: GeoBuilder,
  color: number,
  x: number,
  y: number,
  z: number,
  width: number,
  length: number,
  yaw: number,
): void {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  builder.add(
    surface(
      4,
      5,
      (u, v) => {
        const a = (u - 0.5) * width * (1 - v * 0.92),
          depth = 0.055 * Math.sin(v * Math.PI) + 0.02 * (1 - Math.pow(u * 2 - 1, 2));
        return new Vector3(x + a * c + depth * s, y - v * length, z - a * s + depth * c);
      },
      true,
    ),
    color,
  );
}
