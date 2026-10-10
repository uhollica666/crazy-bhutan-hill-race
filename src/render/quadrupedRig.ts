import { Bone, Skeleton, SkinnedMesh, Uint16BufferAttribute, Float32BufferAttribute } from 'three';
import type { BufferGeometry, Material } from 'three';
/** Four leg bones and a head joint; movement remains owned by the encounter system. */
export function createQuadrupedRig(geometry: BufferGeometry, material: Material, kind: 'bear' | 'yak' = 'bear') {
  const hipY=kind==='yak'?.73:.88,track=kind==='yak'?.31:.5,front=kind==='yak'?-.63:-.8,rear=kind==='yak'?.62:.85;
  const mesh = new SkinnedMesh(geometry, material),
    root = new Bone();
  root.name = 'Body';
  mesh.add(root);
  const head = new Bone();
  head.name = 'Head';
  head.position.set(0, 1.3, kind==='yak'?-1.04:-1.25);
  root.add(head);
  const legs: Bone[] = [];
  for (const z of [front, rear])
    for (const side of [-1, 1]) {
      const leg = new Bone();
      leg.name = `Leg${legs.length}`;
      leg.position.set(side * track, hipY, z);
      root.add(leg);
      legs.push(leg);
    }
  const feet=legs.map((leg,i)=>{const foot=new Bone();foot.name=`Foot${i}`;foot.position.set(0,.08-hipY,-.04);leg.add(foot);return foot;});
  const indices = new Uint16Array(geometry.getAttribute('position').count * 4),
    weights = new Float32Array(indices.length),
    p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      z = p.getZ(i),
      x = p.getX(i);
    const leg = 2 + (z < 0 ? 0 : 2) + (x < 0 ? 0 : 1);
    const headStart=kind==='yak'?-1.03:-1.2;
    const headWeight = z < headStart && y > hipY ? Math.min(1, (headStart-z) / 0.25) : 0;
    const legWeight = y < hipY ? Math.min(1, (hipY - y) / 0.18) : 0;
    const footWeight=y<.19?Math.min(1,(.19-y)/.08):0;
    indices[i * 4] = headWeight > 0 ? 1 : footWeight>0?leg+4:leg;
    indices[i * 4 + 1] = footWeight>0?leg:0;
    weights[i * 4] = footWeight>0?footWeight:Math.max(headWeight, legWeight);
    weights[i * 4 + 1] = 1 - weights[i * 4];
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  mesh.updateMatrixWorld(true);
  const skeleton = new Skeleton([root, head, ...legs,...feet]);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  let stride = 0,phase=0;
  return {
    mesh,
    update(time: number, dt: number, speed: number, react: number) {
      stride += (Math.min(0.5, speed * 0.16) - stride) * (1 - Math.exp(-dt * 8));
      phase+=dt*Math.min(9,speed*3.6);
      legs.forEach(
        (leg, i) => {leg.rotation.x = Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI)) * stride;feet[i].rotation.x=-leg.rotation.x;},
      );
      head.rotation.y = Math.sin(time * 1.1) * 0.04 + react * 0.12;
    },
    dispose() {
      skeleton.dispose();
    },
  };
}
