import {
  AnimationMixer,
  AnimationClip,
  Bone,
  NumberKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Float32BufferAttribute,
} from 'three';
import type { BufferGeometry, Material } from 'three';

export type ActorPose = 'idle' | 'walk' | 'run' | 'react' | 'chase' | 'flee' | 'attack';
/** Original clips and a reusable smooth-weight skeleton for the licensed, adapted human mesh.
 * Geometry/material ownership stays with the caller, allowing all members of a party to share buffers.
 */
export function prepareHumanoidSkin(geometry: BufferGeometry, scale = 1, arms = true): void {
  if (geometry.hasAttribute('skinIndex')) return;
  const positions = geometry.getAttribute('position');
  const indices = new Uint16Array(positions.count * 4),
    weights = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / scale,
      y = positions.getY(i) / scale,
      side = x < 0 ? 0 : 1;
    let bone: number, parent: number, blend: number;
    if (y > 1.51) {
      bone = 2;
      parent = 1;
      blend = Math.min(1, (y - 1.51) / 0.08);
    } else if (arms && Math.abs(x) > 0.22 && y > 0.74) {
      bone = 3 + side * 2;
      parent = 1;
      blend = Math.min(1, (Math.abs(x) - 0.22) / 0.045);
      if (y < 1.12) {
        parent = bone;
        bone++;
        blend = Math.min(1, (1.12 - y) / 0.09);
      }
    } else if (y < 0.91) {
      bone = 7 + side * 2;
      parent = 0;
      blend = Math.min(1, (0.91 - y) / 0.12);
      if (y < 0.5) {
        parent = bone;
        bone++;
        blend = Math.min(1, (0.5 - y) / 0.09);
      }
    } else {
      bone = 1;
      parent = 0;
      blend = Math.min(1, (y - 0.91) / 0.2);
    }
    indices[i * 4] = bone;
    indices[i * 4 + 1] = parent;
    weights[i * 4] = blend;
    weights[i * 4 + 1] = 1 - blend;
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
}

export function createHumanoidRig(
  geometry: BufferGeometry,
  material: Material,
  phase = 0,
  scale = 1,
  arms = true,
) {
  prepareHumanoidSkin(geometry, scale, arms);
  const mesh = new SkinnedMesh(geometry, material),
    bones: Bone[] = [];
  function bone(name: string, parent: Bone | null, x: number, y: number, z = 0) {
    const joint = new Bone();
    joint.name = name;
    joint.position.set(x * scale, y * scale, z * scale);
    (parent || mesh).add(joint);
    bones.push(joint);
    return joint;
  }
  const pelvis = bone('Pelvis', null, 0, 0.89);
  const spine = bone('Spine', pelvis, 0, 0.28);
  bone('Head', spine, 0, 0.36);
  for (const side of [-1, 1]) {
    const arm = bone(side < 0 ? 'ArmL' : 'ArmR', spine, side * 0.23, 0.26);
    bone(side < 0 ? 'ForearmL' : 'ForearmR', arm, side * 0.075, -0.32);
  }
  for (const side of [-1, 1]) {
    const leg = bone(side < 0 ? 'LegL' : 'LegR', pelvis, side * 0.11, -0.05);
    bone(side < 0 ? 'ShinL' : 'ShinR', leg, 0, -0.39);
  }
  mesh.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const mixer = new AnimationMixer(mesh);
  const clips = new Map<ActorPose, AnimationClip>();
  for (const state of ['idle', 'walk', 'run', 'react', 'chase', 'flee', 'attack'] as ActorPose[]) {
    const moving = ['walk', 'run', 'chase', 'flee'].includes(state),
      fast = ['run', 'chase', 'flee'].includes(state);
    const duration = fast ? 0.65 : moving ? 1 : 3.2;
    const tracks: NumberKeyframeTrack[] = [];
    function track(name: string, axis: string, values: number[]) {
      tracks.push(
        new NumberKeyframeTrack(
          `${name}.rotation[${axis}]`,
          [0, duration / 4, duration / 2, (duration * 3) / 4, duration],
          values,
        ),
      );
    }
    const stride = moving ? (fast ? 0.58 : 0.32) : 0.015;
    track('LegL', 'x', [0, stride, 0, -stride, 0]);
    track('LegR', 'x', [0, -stride, 0, stride, 0]);
    track('ShinL', 'x', [0, -stride * 0.9, 0, 0, 0]);
    track('ShinR', 'x', [0, 0, 0, -stride * 0.9, 0]);
    track('Spine', 'z', [0, 0.025, 0, -0.025, 0]);
    track('Head', 'y', [0, 0.08, 0, -0.08, 0]);
    track('ArmL', 'x', [0, -stride * 0.75, 0, stride * 0.75, 0]);
    track('ArmR', 'x', state === 'attack' ? [0, 1.1, 0.8, 0.3, 0] : [0, stride * 0.75, 0, -stride * 0.75, 0]);
    if (state === 'react') {
      track('ArmR', 'z', [0, -1.9, -1.75, -1.9, 0]);
      track('ForearmR', 'x', [0, 0.3, -0.3, 0.3, 0]);
    }
    clips.set(state, new AnimationClip(state, duration, tracks));
  }
  let state: ActorPose = 'idle';
  let active = mixer.clipAction(clips.get(state)!);
  active.play();
  active.time = phase % active.getClip().duration;
  return {
    mesh,
    update(dt: number, next: ActorPose) {
      if (state !== next) {
        const action = mixer.clipAction(clips.get(next)!);
        action.reset().play();
        active.crossFadeTo(action, 0.22, false);
        active = action;
        state = next;
      }
      mixer.update(Math.min(0.1, Math.max(0, dt)));
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(mesh);
      skeleton.dispose();
    },
  };
}
