import { Bone, Skeleton, SkinnedMesh, Uint16BufferAttribute, Float32BufferAttribute } from 'three';
import type { BufferGeometry, Material } from 'three';
/** Four leg bones and a head joint; movement remains owned by the encounter system. */
export function createQuadrupedRig(geometry: BufferGeometry, material: Material) {
  const mesh = new SkinnedMesh(geometry, material),
    root = new Bone();
  root.name = 'Body';
  mesh.add(root);
  const head = new Bone();
  head.name = 'Head';
  head.position.set(0, 1.3, -1.25);
  root.add(head);
  const legs: Bone[] = [];
  for (const z of [-0.8, 0.85])
    for (const side of [-1, 1]) {
      const leg = new Bone();
      leg.name = `Leg${legs.length}`;
      leg.position.set(side * 0.5, 0.88, z);
      root.add(leg);
      legs.push(leg);
    }
  const indices = new Uint16Array(geometry.getAttribute('position').count * 4),
    weights = new Float32Array(indices.length),
    p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      z = p.getZ(i),
      x = p.getX(i);
    const leg = 2 + (z < 0 ? 0 : 2) + (x < 0 ? 0 : 1);
    const headWeight = z < -1.2 && y > 0.86 ? Math.min(1, (-z - 1.2) / 0.25) : 0;
    const legWeight = y < 0.9 ? Math.min(1, (0.9 - y) / 0.18) : 0;
    indices[i * 4] = headWeight > 0 ? 1 : leg;
    indices[i * 4 + 1] = 0;
    weights[i * 4] = Math.max(headWeight, legWeight);
    weights[i * 4 + 1] = 1 - weights[i * 4];
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  mesh.updateMatrixWorld(true);
  const skeleton = new Skeleton([root, head, ...legs]);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  let stride = 0;
  return {
    mesh,
    update(time: number, dt: number, speed: number, react: number) {
      stride += (Math.min(0.5, speed * 0.16) - stride) * (1 - Math.exp(-dt * 8));
      legs.forEach(
        (leg, i) => (leg.rotation.x = Math.sin(time * 5.5 + (i === 0 || i === 3 ? 0 : Math.PI)) * stride),
      );
      head.rotation.y = Math.sin(time * 1.1) * 0.04 + react * 0.12;
    },
    dispose() {
      skeleton.dispose();
    },
  };
}
