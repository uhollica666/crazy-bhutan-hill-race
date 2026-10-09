import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { AssetLibrary, instantiate, setVehicleEnvMap } from '../src/render/assets';
import { toFloatGeometry } from '../src/render/envKit';
import { listVehicles } from '../src/data/vehicles';

describe('asset library', () => {
  it('resolves a missing or broken file to null, remembers the failure and does not retry', async () => {
    const lib = new AssetLibrary('http://127.0.0.1:9/');
    const a = await lib.load('models/vehicles/none.glb');
    const b = await lib.load('models/vehicles/none.glb');
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(lib.loads).toBe(1);
    expect(lib.failed.size).toBe(1);
    expect(lib.has('models/vehicles/none.glb')).toBe(false);
    expect(() => lib.dispose()).not.toThrow();
  });

  it('every vehicle has a model file in the build output folder, and it is small', () => {
    for (const v of listVehicles()) {
      const bytes = readFileSync(`public/models/vehicles/${v.id}.glb`).byteLength;
      expect(bytes, v.id).toBeGreaterThan(20_000);
      expect(bytes, v.id).toBeLessThan(250_000);
    }
    expect(readFileSync('public/models/env/kit.glb').byteLength).toBeLessThan(400_000);
  });
});

describe('model instances', () => {
  const source = (): Group => {
    const g = new Group();
    const paint = new MeshStandardMaterial({ color: 0xffffff });
    paint.name = 'paint';
    const tail = new MeshStandardMaterial({ color: 0x8a1414 });
    tail.name = 'light_tail';
    const m = new Mesh(new BufferGeometry(), [paint, tail]);
    g.add(m);
    return g;
  };

  it('recolours paint from the livery without touching the cached original', () => {
    const src = source();
    const a = instantiate(src, { body: 0xff0000, accent: 0x00ff00, trim: 0x0000ff });
    const b = instantiate(src, { body: 0x0000ff, accent: 0, trim: 0 });
    const matsA = (a.object.children[0] as Mesh).material as MeshStandardMaterial[];
    const matsB = (b.object.children[0] as Mesh).material as MeshStandardMaterial[];
    expect(matsA[0].color.getHex()).toBe(0xff0000);
    expect(matsB[0].color.getHex()).toBe(0x0000ff);
    expect(((src.children[0] as Mesh).material as MeshStandardMaterial[])[0].color.getHex()).toBe(0xffffff);
    expect(a.lights.tail).toHaveLength(1);
    expect(a.materials.length).toBe(2);
  });

  it('gives vehicle materials a reflection map only when one is set, and never to lamps', () => {
    const tex = new Texture();
    setVehicleEnvMap(tex);
    const r = instantiate(source(), null);
    const mats = (r.object.children[0] as Mesh).material as MeshStandardMaterial[];
    expect(mats[0].envMap).toBe(tex);
    expect(mats[1].envMap).toBeNull();
    setVehicleEnvMap(null);
    const none = instantiate(source(), null);
    expect(((none.object.children[0] as Mesh).material as MeshStandardMaterial[])[0].envMap).toBeNull();
  });
});

describe('environment kit geometry', () => {
  it('dequantises normalised integer positions and bakes the node transform', () => {
    const g = new BufferGeometry();
    const q = new Int16Array([-32767, 0, 0, 32767, 0, 0, 0, 32767, 0]);
    g.setAttribute('position', new BufferAttribute(q, 3, true));
    g.setAttribute('color', new BufferAttribute(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3, true));
    const mesh = new Mesh(g);
    mesh.scale.set(5, 5, 5);
    mesh.position.set(0, 2, 0);
    mesh.updateMatrixWorld(true);
    const out = toFloatGeometry(mesh);
    const p = out.getAttribute('position');
    expect(p.getX(0)).toBeCloseTo(-5, 3);
    expect(p.getX(1)).toBeCloseTo(5, 3);
    expect(p.getY(2)).toBeCloseTo(7, 3);
    expect(out.getAttribute('color').getX(0)).toBeCloseTo(1, 3);
    expect(out.getAttribute('normal')).toBeTruthy();
  });
});

describe('shipped environment kit', () => {
  it('contains every model the scenery asks for, including the Pass 4.5 roadside dressing', () => {
    const buf = readFileSync('public/models/env/kit.glb');
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as { nodes: { name?: string }[] };
    const names = new Set(json.nodes.map((n) => n.name));
    for (const n of ['pine_a', 'pine_b', 'spruce', 'cypress', 'rock_a', 'rock_b', 'rock_c', 'house_0', 'house_1', 'house_2', 'chorten', 'cairn', 'mani_wall', 'grass_a', 'grass_b', 'fern']) {
      expect(names.has(n), n).toBe(true);
    }
  });
});
