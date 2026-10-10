import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  InstancedMesh,
  Matrix4,
} from 'three';
import { GameRenderer } from '../src/render/GameRenderer';
import { VehicleModel } from '../src/render/VehicleModel';
import { listVehicles } from '../src/data/vehicles';
import { readCosmetics } from '../src/render/cosmetics';
import { createHumanoidRig } from '../src/render/humanoidRig';
import { personGeometry } from '../src/render/trafficArt';
import { crowdMaterial } from '../src/render/people';
import { animateCrowd } from '../src/render/crowdAnimation';
import { createCreatureArt } from '../src/render/creatureArt';
import { mountainPine, villageHouse } from '../src/render/worldArt';
import { RemasterSurfaces } from '../src/render/remasterSurfaces';
import { loadVehicleAsset, peekVehicleAsset } from '../src/render/assets';
import { createPineMaterial } from '../src/render/premiumPine';
import type { VehicleBody } from '../src/physics/VehicleBody';
import type { PhysicsWorld } from '../src/physics/types';

const initialQuality = new URLSearchParams(location.search).get('quality') === 'low' ? 'low' : 'high';
const renderer = new GameRenderer(document.getElementById('view')!, initialQuality);
if (initialQuality !== 'low') await Promise.all(listVehicles().map((def) => loadVehicleAsset(def.id)));
const scene = renderer.scene;
scene.background = new Color(0x202b38);
scene.add(new HemisphereLight(0xcfe0ff, 0x57534a, 2.2));
const sun = new DirectionalLight(0xfff5e6, 3.2);
sun.position.set(-6, 12, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.normalBias = 0.025;
scene.add(sun);
const floor = new Mesh(
  new PlaneGeometry(80, 80),
  new MeshStandardMaterial({ color: 0x727878, roughness: 0.85 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);
camera.position.set(7, 3.5, -9);
camera.lookAt(0, 1, 0);
let model: VehicleModel | null = null;
let world = false;
const geometries = listVehicles().map((def) => {
  const model = new VehicleModel(def);
  let triangles = 0;
  model.root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh)
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  });
  model.dispose();
  return { id: def.id, trianglesAllLodsAndOptions: triangles };
});
function vehicle(index: number, custom = false) {
  if (model) {
    scene.remove(model.root);
    model.dispose();
  }
  const def = listVehicles()[index];
  model = new VehicleModel(def, peekVehicleAsset(def.id));
  model.poseStatic();
  model.setReflection(1);
  model.setLowDetail(renderer.level === 'low');
  model.root.position.y = -(def.axles[0].y - def.suspension.rest - def.wheelRadius);
  scene.add(model.root);
  if (custom)
    model.applyCosmetics({
      ...readCosmetics(def.id),
      paint: 'green',
      finish: 'matte',
      rim: 'steel',
      bumper: 'trail',
      rack: 'basket',
      equipment: 'lamps',
      skin: 'summit',
    });
  const size = def.size.length;
  camera.position.set(size * 1.4, size * 0.65, -size * 1.8);
  camera.lookAt(0, def.size.height * 0.52, 0);
  document.getElementById('label')!.innerHTML =
    `${def.name}<small>${custom ? 'Trail equipment · matte finish · steel rims' : 'Factory coachwork · metallic paint · touring rims'}</small>`;
}
vehicle(0);
const humanGeo = personGeometry(0x4b6b81, 0xbd8d68, 0x252424, 0x65734c, 0x9a6437),
  humanMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
const rig = createHumanoidRig(humanGeo, humanMat);
rig.mesh.position.set(-3.5, 0, 2);
scene.add(rig.mesh);
const crowd = new InstancedMesh(personGeometry(0xffffff, 0xc69475, 0x35271e), crowdMaterial(), 3);
for (let i = 0; i < 3; i++) {
  crowd.setMatrixAt(i, new Matrix4().makeTranslation(-5 + i, 0, 3.6));
  crowd.setColorAt(i, new Color([0x926340, 0x4b704f, 0x415f8b][i]));
}
crowd.castShadow = true;
scene.add(crowd);
const gait = animateCrowd(crowd);
for (let i = 0; i < 3; i++) gait.set(i, i * 1.3, 0.35);
const creatures = ['yeti', 'ghost', 'zombie'].map((kind, i) => {
  const art = createCreatureArt(kind as 'yeti' | 'ghost' | 'zombie');
  art.group.position.set(4 + i * 2, 0, 2);
  scene.add(art.group);
  return art;
});
const pineArt = createPineMaterial();
pineArt.setEnabled(initialQuality !== 'low');
const pine = new Mesh(mountainPine(0, initialQuality === 'low'), pineArt.material);
pine.customDepthMaterial = pineArt.depth;
pine.position.set(-7, 0, 8);
pine.castShadow = true;
scene.add(pine);
const house = new Mesh(villageHouse(2), new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
house.position.set(5, 0, 14);
house.castShadow = true;
scene.add(house);
const surfaceMaterial = new MeshStandardMaterial({ roughness: 1 });
surfaceMaterial.userData.remasterSurface = 'asphalt';
const sample = new Mesh(new PlaneGeometry(12, 8), surfaceMaterial);
sample.rotation.x = -Math.PI / 2;
sample.position.set(0, 0.01, -5);
sample.receiveShadow = true;
scene.add(sample);
const surfaces = new RemasterSurfaces(scene);
surfaces.applyQuality(renderer.profile);
let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  pineArt.update(now / 1000);
  rig.update(dt, 'react');
  gait.update(now / 1000);
  creatures.forEach((art) => art.update(now / 1000, 0.3));
  model?.setReflection(1);
  if (world) renderer.render(camera);
  else renderer.renderScene(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function verifySignals(index: number) {
  const def = listVehicles()[index],
    wheelY = def.axles[0].y - def.suspension.rest - def.wheelRadius;
  const body = {
    speed: -1,
    braking: 0.9,
    wheels: def.axles.flatMap((axle) =>
      [-1, 1].map((side) => ({
        mountLocal: { x: side * axle.halfTrack, y: axle.y, z: axle.z },
        suspLength: def.suspension.rest - 0.025,
        steerAngle: 0.2,
        spin: 0.4,
        inContact: true,
        surface: { id: 'asphalt' },
      })),
    ),
    interpolate(_alpha: number, position: import('three').Vector3, quaternion: import('three').Quaternion) {
      position.set(0, -wheelY, 0);
      quaternion.identity();
    },
  } as unknown as VehicleBody;
  model!.setBlobVisible(false);
  model!.setHeadlights(true);
  model!.setIndicator(1);
  model!.sync(body, 1, {} as PhysicsWorld, 1.4, 0.3);
  const intensities: Record<string, number> = {};
  model!.root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const pbr = material as MeshStandardMaterial;
        if (pbr.name.startsWith('light_') || pbr.name.startsWith('indicator_'))
          intensities[pbr.name] = pbr.emissiveIntensity;
      }
  });
  return { detailed: model!.detailed, intensities };
}
(window as Window & { remasterReview?: unknown }).remasterReview = {
  vehicle,
  verifySignals,
  geometries,
  renderer,
  rig,
  crowd,
  scene,
  surfaces,
  world() {
    world = true;
    camera.position.set(13, 7, -16);
    camera.lookAt(0, 2, 5);
  },
  quality(level: 'low' | 'medium' | 'high' | 'max') {
    renderer.setQuality(level);
    surfaces.applyQuality(renderer.profile);
    model?.setLowDetail(level === 'low');
  },
  custom() {
    vehicle(3, true);
  },
  dispose() {
    surfaces.dispose();
    rig.dispose();
    gait.dispose();
    renderer.dispose();
  },
};
