import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MeshStandardMaterial, Vector3 } from 'three';
import { listVehicles } from '../src/data/vehicles';
import { personGeometry } from '../src/render/trafficArt';
import { createHumanoidRig } from '../src/render/humanoidRig';
import { readCosmetics, saveCosmetic } from '../src/render/cosmetics';
import { createQuadrupedRig } from '../src/render/quadrupedRig';
import { shaggyYak } from '../src/render/worldArt';

describe('remaster delivery contract', () => {
  it('binds yak hooves and moves the skinned mesh only when movement supplies a stride', () => {
    const geometry = shaggyYak(),
      material = new MeshStandardMaterial(),
      rig = createQuadrupedRig(geometry, material, 'yak');
    const bones = rig.mesh.skeleton.bones;
    for (let i = 0; i < 10; i++) rig.update(i * 0.05, 0.05, 0, 0);
    expect(bones[2].rotation.x).toBe(0);
    for (let i = 0; i < 10; i++) rig.update(i * 0.05, 0.05, 2, 0);
    expect(Math.abs(bones[2].rotation.x)).toBeGreaterThan(0.01);
    expect(bones[6].rotation.x).toBeCloseTo(-bones[2].rotation.x);
    rig.dispose();
    geometry.dispose();
    material.dispose();
  });
  it('decodes the four compressed heroes with both LODs, wheel choices and functional lamp materials', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const def of listVehicles()) {
      const buffer = readFileSync(`public/remaster/vehicles/${def.id}.glb`);
      // Curved hero surfaces + both authored LODs/options; bounded below one MiB per car.
      expect(buffer.length).toBeLessThan(750_000);
      const document = await io.readBinary(buffer),
        names = new Set(
          document
            .getRoot()
            .listNodes()
            .map((node) => node.getName()),
        );
      for (const name of [
        'body_high',
        'body_low',
        'wheel_high',
        'wheel_low',
        'rim_touring',
        'rim_steel',
        'rim_sport',
        'road_dirt_group',
        'damage_group',
        'cosmetic_basket',
        'cosmetic_trail',
      ])
        expect(names.has(name), `${def.id}: ${name}`).toBe(true);
      const materials = new Set(
        document
          .getRoot()
          .listMaterials()
          .map((material) => material.getName()),
      );
      for (const name of [
        'paint',
        'wheel_alloy',
        'glass',
        'light_head',
        'light_tail',
        'light_reverse',
        'indicator_left',
        'indicator_right',
      ])
        expect(materials.has(name), `${def.id}: ${name}`).toBe(true);
    }
  });
  it('retains downloaded source checksums', () => {
    for (const manifest of ['manifest.json', 'pine-manifest.json']) {
      const records = JSON.parse(readFileSync(`assets-src/remaster/${manifest}`, 'utf8')) as {
        source: string;
        md5: string;
      }[];
      for (const record of records)
        expect(createHash('md5').update(readFileSync(record.source)).digest('hex'), record.source).toBe(
          record.md5,
        );
    }
  });
  it('binds normalized weights and deforms limbs through the animation mixer', () => {
    const geometry = personGeometry(0x426080, 0xb98b70, 0x302020),
      material = new MeshStandardMaterial();
    const rig = createHumanoidRig(geometry, material),
      weights = geometry.getAttribute('skinWeight'),
      index = geometry.getAttribute('skinIndex');
    for (let i = 0; i < weights.count; i++) {
      expect(weights.getX(i) + weights.getY(i)).toBeCloseTo(1);
      expect(index.getX(i)).toBeLessThan(rig.mesh.skeleton.bones.length);
    }
    const vertex = Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i).find(
      (i) => geometry.getAttribute('position').getY(i) < 0.3,
    )!;
    rig.mesh.updateMatrixWorld(true);
    const before = rig.mesh.getVertexPosition(vertex, new Vector3()).clone();
    for (let i = 0; i < 8; i++) rig.update(0.05, 'walk');
    rig.mesh.updateMatrixWorld(true);
    const after = rig.mesh.getVertexPosition(vertex, new Vector3());
    expect(before.distanceTo(after)).toBeGreaterThan(0.01);
    rig.dispose();
    geometry.dispose();
    material.dispose();
  });
  it('reads old cosmetics without changing purchases or removing prior choices', () => {
    const original = globalThis.localStorage;
    let data = JSON.stringify({ 'dzo-hatch': { paint: 'blue', wheels: 'bronze', skin: 'stripe' } });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => data,
        setItem: (_key: string, value: string) => {
          data = value;
        },
      },
    });
    try {
      const previous = readCosmetics('dzo-hatch');
      expect(previous.paint).toBe('blue');
      expect(previous.wheels).toBe('bronze');
      expect(previous.finish).toBe('metallic');
      saveCosmetic('dzo-hatch', 'rim', 'steel');
      expect(readCosmetics('dzo-hatch').paint).toBe('blue');
      expect(readCosmetics('dzo-hatch').rim).toBe('steel');
    } finally {
      if (original)
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
