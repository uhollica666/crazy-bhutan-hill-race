import { Group } from 'three';
import type { MeshStandardMaterial } from 'three';
import { instantiate } from './assets';
import type { VehicleAsset } from './assets';
import type { Coachwork } from './coachwork';
import type { VehicleDef } from '../data/types';

/** Render-only clones borrow cached geometry but own materials. The asset cache owns GPU buffer disposal. */
export function loadedCoachwork(def: VehicleDef, asset: VehicleAsset, low: boolean): Coachwork {
  const shell = instantiate(low ? asset.lowBody : asset.body, def.livery);
  const wheels = instantiate(low ? asset.lowWheel : asset.wheel, def.livery);
  const body = shell.object as Group,
    wheel = wheels.object as Group;
  const materials = [...shell.materials, ...wheels.materials] as MeshStandardMaterial[];
  const material = (name: string) => materials.find((m) => m.name === name)!;
  const dirt = (body.getObjectByName('road_dirt_group') as Group) ?? new Group();
  const scars = (body.getObjectByName('damage_group') as Group) ?? new Group();
  dirt.visible = scars.visible = false;
  return {
    body,
    wheel,
    dirt,
    scars,
    materials,
    geometries: [],
    head: material('light_head'),
    tail: material('light_tail'),
    reverse: material('light_reverse'),
    indicators: [material('indicator_left'), material('indicator_right')],
  };
}
