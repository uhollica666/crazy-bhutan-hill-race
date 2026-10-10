import { seatedDriver } from './people';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry } from 'three';
import type { VehicleDef } from '../data/types';
import { GeoBuilder, loft } from './geo';
import type { Ring } from './geo';
import { LIGHT_LAYOUT } from './vehicleBodies';

/** Original coachwork. Metres, centre-of-mass origin, -Z forward; physics owns every wheel mount. */
export interface Coachwork {
  body: Group;
  wheel: Group;
  dirt: Group;
  scars: Group;
  geometries: BufferGeometry[];
  materials: MeshStandardMaterial[];
  head: MeshStandardMaterial;
  tail: MeshStandardMaterial;
  reverse: MeshStandardMaterial;
  indicators: MeshStandardMaterial[];
}

export function createCoachwork(d: VehicleDef, low = false): Coachwork {
  const body = new Group(), wheel = new Group();
  const geometries: BufferGeometry[] = [], materials: MeshStandardMaterial[] = [];
  const mat = (name: string, color: number, roughness: number, metalness = 0): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness, metalness, vertexColors: true });
    m.name = name; materials.push(m); return m;
  };
  const paint = mat('paint', d.livery.body, 0.28, 0.42);
  const rubber = mat('rubber', 0x24272b, 0.94);
  const tyre = mat('tyre', 0x252729, 0.96);
  const metal = mat('alloy', 0xb6bdc5, 0.31, 0.85);
  const accent = mat('accent', d.livery.accent, 0.4, 0.25);
  const trim = mat('trim', d.livery.trim, 0.55, 0.12);
  const glass = mat('glass', 0x536d7b, 0.16, 0.22);
  glass.transparent = true; glass.opacity = 0.66; glass.depthWrite = false;
  const cabin = mat('cabin', 0x363b42, 0.95);
  const head = mat('light_head', 0xffecc8, 0.22);
  head.emissive.setHex(0xffe2ac); head.emissiveIntensity = 0.35;
  const tail = mat('light_tail', 0xc3222c, 0.28);
  tail.emissive.setHex(0xe52628); tail.emissiveIntensity = 0.4;
  const reverse = mat('light_reverse', 0xcdd8da, 0.3);
  reverse.emissive.setHex(0xd6ecff); reverse.emissiveIntensity = 0;
  const indicators = [-1, 1].map(() => { const m = mat('indicator', 0xdb8a21, 0.3); m.emissive.setHex(0xff990c); return m; });
  const batches = new Map<MeshStandardMaterial, GeoBuilder>();
  const batch = (m: MeshStandardMaterial): GeoBuilder => {
    let b = batches.get(m); if (!b) { b = new GeoBuilder(); batches.set(m, b); } return b;
  };
  const add = (g: BufferGeometry, m: MeshStandardMaterial, target = body): void => {
    geometries.push(g); const mesh = new Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh);
  };
  const white = 0xffffff, w = d.size.width / 2, l = d.size.length, h = d.size.height;
  const bus = d.visual === 'coaster', hatch = d.visual === 'hatch', expedition = d.visual === 'cruiser';
  const bottom = -h / 2, belt = bus ? -0.02 : 0.04, roof = h / 2 - 0.04;
  const front = bus ? -l / 2 + 0.23 : hatch ? -0.55 : -0.8;
  const back = l / 2 - (hatch ? 0.3 : 0.22);
  const roofFront = front + (bus ? 0.14 : hatch ? 0.56 : expedition ? 0.38 : 0.6);
  const roofBack = back - (hatch ? 0.37 : 0.12);
  const topWidth = w * (bus ? 0.93 : expedition ? 0.89 : 0.82);
  // Narrow central tub leaves actual wheel wells open. Outer wings follow circular arch cutouts.
  batch(paint).add(loft([[-l / 2, w * 0.62, bottom + 0.07, belt - 0.07], [-l / 2 + 0.25, w * 0.67, bottom, belt],
    [l / 2 - 0.2, w * 0.67, bottom, belt], [l / 2, w * 0.62, bottom + 0.08, belt - 0.06]]), white);
  const stations = new Set<number>([-l / 2, -l / 2 + 0.18, l / 2 - 0.18, l / 2]);
  for (const axle of d.axles) for (let i = 0; i <= 16; i++) stations.add(axle.z + Math.cos(i * Math.PI / 16) * (d.wheelRadius + 0.12));
  const zs = [...stations].filter(z => z >= -l / 2 && z <= l / 2).sort((a, b) => a - b);
  for (const side of [-1, 1]) {
    const p: number[] = [];
    const lower = (z: number): number => {
      let y = bottom;
      for (const axle of d.axles) { const r = d.wheelRadius + 0.12, dz = z - axle.z;
        if (Math.abs(dz) < r) y = Math.max(y, axle.y - d.suspension.rest + Math.sqrt(r * r - dz * dz)); }
      return y;
    };
    for (let i = 0; i < zs.length - 1; i++) {
      const a = zs[i], b = zs[i + 1], ya = lower(a), yb = lower(b);
      // Exterior winding is opposite on each side.
      const pts = [[side * w, ya, a], [side * w, belt, a], [side * w, belt, b], [side * w, yb, b]];
      for (const k of side === 1 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) p.push(...pts[k]);
      batch(paint).box(w * 0.32, 0.065, b - a + 0.008, white, { x: side * w * 0.83, y: belt - 0.025, z: (a + b) / 2 });
    }
    const panel = new BufferGeometry(); panel.setAttribute('position', new Float32BufferAttribute(p, 3)); panel.computeVertexNormals();
    batch(paint).add(panel, white);
    for (const axle of d.axles) {
      const r = d.wheelRadius + 0.14, cy = axle.y - d.suspension.rest;
      for (let i = 0; i < 12; i++) { const a = (i + 0.5) * Math.PI / 12;
        batch(rubber).box(0.085, 0.07, r * Math.PI / 12 + 0.025, white,
          { x: side * (w + 0.012), y: cy + Math.sin(a) * r, z: axle.z + Math.cos(a) * r, rx: a - Math.PI / 2 }); }
    }
  }
  // Bonnet and rear shoulder taper into the glazed cabin rather than stacked boxes.
  if (!bus) batch(paint).add(loft([[-l / 2 + 0.04, w * 0.9, belt - 0.05, belt + 0.06],
    [front, w * 0.94, belt - 0.05, belt + 0.14]]), white);
  batch(glass).add(loft([[front, w * 0.94, belt + 0.07, belt + 0.1], [roofFront, topWidth, belt + 0.07, roof - 0.08],
    [roofBack, topWidth, belt + 0.07, roof - 0.08], [back, w * 0.94, belt + 0.07, belt + 0.12]]), white);
  batch(paint).add(loft([[roofFront - 0.05, topWidth - 0.02, roof - 0.09, roof],
    [roofFront + 0.15, topWidth, roof - 0.06, roof + 0.025], [roofBack - 0.1, topWidth, roof - 0.06, roof + 0.025],
    [roofBack + 0.04, topWidth - 0.02, roof - 0.09, roof]]), white);
  for (const side of [-1, 1]) {
    // Sloping A/C pillars, vertical window dividers and shallow stamped door seams.
    for (const [z0, z1] of [[front, roofFront], [back, roofBack]]) {
      const dy = roof - belt, dz = z1 - z0;
      batch(paint).box(0.11, Math.hypot(dy, dz), 0.09, white,
        { x: side * (w + topWidth) * 0.49, y: (roof + belt) / 2, z: (z0 + z1) / 2, rx: Math.atan2(-dz, dy) });
    }
    const count = bus ? 6 : 3;
    for (let i = 1; i < count; i++) {
      const z = roofFront + (roofBack - roofFront) * i / count;
      batch(rubber).box(0.035, roof - belt - 0.08, bus ? 0.075 : 0.095, white, { x: side * (w + topWidth) / 2, y: (roof + belt) / 2, z });
      if (!low) {
        batch(rubber).box(0.008, Math.max(0.12, belt - bottom - 0.08), 0.014, white, { x: side * (w + 0.004), y: (belt + bottom) / 2, z });
        batch(metal).box(0.045, 0.035, 0.18, white, { x: side * (w + 0.026), y: belt - 0.12, z: z + 0.16 });
      }
    }
    batch(accent).box(0.016, bus ? 0.16 : 0.055, l * 0.82, white, { x: side * (w + 0.012), y: belt - 0.2 });
    batch(rubber).box(0.06, 0.08, l * 0.54, white, { x: side * w, y: bottom + 0.06 });
    batch(rubber).box(0.09, 0.035, 0.15, white, { x: side * (w + 0.07), y: belt + 0.21, z: front + 0.1 });
    batch(paint).box(bus ? 0.17 : 0.15, bus ? 0.28 : 0.15, 0.23, white, { x: side * (w + 0.12), y: belt + 0.27, z: front + 0.08 });
    batch(metal).box(0.012, bus ? 0.21 : 0.1, 0.18, white, { x: side * (w + 0.21), y: belt + 0.27, z: front + 0.08 });
  }
  for (const end of [-1, 1]) {
    batch(rubber).add(loft([[end * (l / 2 - 0.14), w * 0.92, bottom + 0.04, bottom + 0.24],
      [end * l / 2, w * 0.9, bottom + 0.08, bottom + 0.21]].sort((a, b) => a[0] - b[0]) as Ring[]), white);
    batch(trim).box(0.36, 0.11, 0.018, white, { y: bottom + 0.19, z: end * (l / 2 + 0.012) });
  }
  const lights = LIGHT_LAYOUT[d.visual];
  batch(rubber).box(w * 1.15, 0.23, 0.045, white, { y: lights.y, z: -l / 2 - 0.01 });
  for (let i = 0; i < (expedition ? 6 : 4); i++) batch(metal).box(w * 1.04, 0.018, 0.015, white,
    { y: lights.y - 0.09 + i * 0.04, z: -l / 2 - 0.039 });
  for (const side of [-1, 1]) {
    batch(head).box(0.31, expedition ? 0.2 : 0.14, 0.05, white, { x: side * lights.hx, y: lights.y, z: -l / 2 - 0.017 });
    batch(tail).box(bus || expedition ? 0.15 : 0.25, bus || expedition ? 0.3 : 0.17, 0.045, white,
      { x: side * lights.tailHx, y: lights.tailY, z: l / 2 + 0.018 });
    batch(reverse).box(0.12, 0.055, 0.048, white, { x: side * lights.tailHx, y: lights.tailY - 0.05, z: l / 2 + 0.025 });
    for (const end of [-1, 1]) batch(indicators[side < 0 ? 0 : 1]).box(0.08, 0.07, 0.052, white,
      { x: side * (end < 0 ? lights.hx + 0.16 : lights.tailHx), y: end < 0 ? lights.y : lights.tailY + 0.1, z: end * (l / 2 + 0.023) });
  }
  batch(tail).box(0.32, 0.04, 0.035, white, { y: roof - 0.17, z: back + 0.04 });
  // Visible seats and dash; no glass transmission pass or extra interior light.
  batch(cabin).box(w * 1.65, 0.14, 0.34, white, { y: belt + 0.08, z: front + 0.22 });
  const rows = bus ? 5 : 2;
  for (let row = 0; row < rows; row++) for (const side of [-1, 1]) {
    const z = roofFront + 0.38 + row * (bus ? 0.84 : 0.9);
    if (z > roofBack - 0.15) continue;
    batch(cabin).box(0.43, 0.1, 0.4, white, { x: side * w * 0.46, y: belt - 0.04, z });
    batch(cabin).box(0.42, 0.43, 0.12, white, { x: side * w * 0.46, y: belt + 0.2, z: z + 0.18, rx: -0.1 });
    batch(cabin).box(0.22, 0.12, 0.1, white, { x: side * w * 0.46, y: belt + 0.48, z: z + 0.19 });
  }
  if (!low) for (const side of [-1, 1]) batch(rubber).box(0.022, 0.025, 0.4, white,
    { x: side * w * 0.43, y: belt + 0.16, z: front - 0.01, ry: side * 0.2 });
  if (bus) {
    batch(trim).add(loft([[-0.5, 0.55, roof + 0.03, roof + 0.17], [0, 0.6, roof + 0.03, roof + 0.24], [1.1, 0.55, roof + 0.03, roof + 0.17]]), white);
    for (let i = 0; i < 7; i++) batch(rubber).box(0.95, 0.012, 0.025, white, { y: roof + 0.18, z: 0.65 + i * 0.06 });
    batch(rubber).box(0.018, 0.88, 0.018, white, { x: w + 0.015, y: belt - 0.25, z: -l / 2 + 1.02 });
    batch(metal).box(0.16, 0.065, 0.7, white, { x: w - 0.05, y: bottom - 0.04, z: -l / 2 + 0.65 });
  } else if (!hatch) {
    for (const side of [-1, 1]) batch(metal).box(0.04, 0.045, roofBack - roofFront, white,
      { x: side * topWidth * 0.83, y: roof + 0.085, z: (roofBack + roofFront) / 2 });
    for (const z of [roofFront + 0.28, roofBack - 0.26]) batch(rubber).box(topWidth * 1.65, 0.05, 0.06, white, { y: roof + 0.1, z });
  } else batch(paint).box(topWidth * 1.9, 0.065, 0.22, white, { y: roof - 0.02, z: roofBack + 0.05 });
  if (expedition) {
    for (const side of [-1, 1]) {
      batch(metal).cylinder(0.035, 0.035, 0.5, white, 8, { x: side * 0.52, y: bottom + 0.43, z: -l / 2 - 0.08 });
      batch(rubber).box(0.14, 0.06, 2.4, white, { x: side * w, y: bottom + 0.015 });
    }
    batch(metal).cylinder(0.035, 0.035, 1.2, white, 8, { y: bottom + 0.66, z: -l / 2 - 0.08, rz: Math.PI / 2 });
    batch(rubber).cylinder(0.055, 0.055, roof - belt + 0.22, white, 8, { x: w - 0.03, y: (roof + belt) / 2, z: front + 0.1 });
    batch(rubber).box(0.15, 0.09, 0.17, white, { x: w - 0.03, y: roof + 0.09, z: front + 0.1 });
    batch(accent).box(0.65, 0.18, 0.85, white, { x: -0.3, y: roof + 0.21, z: 0.7 });
    batch(rubber).cylinder(d.wheelRadius, d.wheelRadius, 0.2, white, 20, { y: belt + 0.04, z: l / 2 + 0.11, rx: Math.PI / 2 });
    batch(metal).cylinder(d.wheelRadius * 0.57, d.wheelRadius * 0.57, 0.215, white, 16, { y: belt + 0.04, z: l / 2 + 0.11, rx: Math.PI / 2 });
  }
  if (!low) {
    const occupant = mat('occupant', 0xffffff, 0.95);
    const driver = new GeoBuilder();
    const scale = Math.min(0.84, (roof - belt - 0.12) / 0.98);
    driver.add(seatedDriver(), white, {x:w*0.46,y:belt-0.02,z:roofFront+0.38,sx:scale,sy:scale,sz:scale}, true);
    add(driver.build(), occupant);
    const steering = new TorusGeometry(0.15,0.018,6,16);
    batch(rubber).add(steering,white,{x:w*0.46,y:belt+0.17,z:roofFront+0.15,rx:-0.45});
  }
  // Optional cosmetic meshes are shared by both LODs; no physics attachments.
  const stripe = new Group(); stripe.name = 'cosmetic_stripe';
  const summit = new Group(); summit.name = 'cosmetic_summit';
  for (const side of [-1, 1]) {
    const stripeGeo = new GeoBuilder().box(0.015, 0.095, l * 0.72, white, {x: side * (w + 0.027), y: belt - 0.16}).build();
    add(stripeGeo, accent, stripe);
    const graphic = new GeoBuilder();
    for (let i=0;i<5;i++) graphic.box(0.016, 0.16 + i * 0.025, 0.11, white, {x: side * (w + 0.03), y: belt - 0.18, z: 0.15 + i * 0.18, rx: -0.45});
    add(graphic.build(), accent, summit);
  }
  const carrier = new Group(); carrier.name = 'cosmetic_carrier';
  const cargo = new GeoBuilder();
  cargo.box(w * 1.35, 0.24, Math.min(1.3,l * 0.35), white, {y: roof + 0.26, z: 0.35});
  for (const x of [-w * 0.48,w * 0.48]) cargo.box(0.06, 0.26, 1.3, white, {x,y:roof + 0.27,z:0.35});
  add(cargo.build(), rubber, carrier);
  const lamps = new Group(); lamps.name = 'cosmetic_lamps';
  const lampFrame = new GeoBuilder(), lenses = new GeoBuilder();
  lampFrame.box(w * 1.35, 0.06, 0.09, white, {y:roof + 0.14,z:roofFront + 0.12});
  for (const x of [-w * 0.48,-w * 0.16,w * 0.16,w * 0.48]) {
    lampFrame.cylinder(0.105,0.105,0.1,white,12,{x,y:roof+0.24,z:roofFront+0.12,rx:Math.PI/2});
    lenses.cylinder(0.086,0.086,0.014,white,12,{x,y:roof+0.24,z:roofFront+0.06,rx:Math.PI/2});
  }
  add(lampFrame.build(), rubber, lamps); add(lenses.build(), head, lamps);
  for (const option of [stripe,summit,carrier,lamps]) { option.visible = false; body.add(option); }
  for (const [m, b] of batches) add(b.build(), m);
  const r = d.wheelRadius, ww = d.wheelWidth;
  const tire = new GeoBuilder(), rim = new GeoBuilder();
  tire.add(new TorusGeometry(r - ww * 0.34, ww * 0.34, low ? 6 : 8, low ? 16 : 24), white, { ry: Math.PI / 2 });
  tire.cylinder(r * 0.88, r * 0.88, ww * 0.78, white, low ? 16 : 24, { rz: Math.PI / 2 });
  if (!low) for (let i = 0; i < (expedition ? 28 : 24); i++) {
    const a = i * Math.PI * 2 / (expedition ? 28 : 24);
    for (const side of [-1, 1]) tire.box(ww * 0.46, 0.022, r * 0.14, white,
      { x: side * ww * 0.22, y: Math.cos(a) * (r - 0.009), z: Math.sin(a) * (r - 0.009), rx: a, ry: side * 0.25 });
  }
  for (const side of [-1, 1]) {
    rim.cylinder(r * 0.56, r * 0.56, 0.022, white, 16, { x: side * ww * 0.44, rz: Math.PI / 2 });
    for (let i = 0; i < (bus ? 8 : 5); i++) rim.box(0.026, r * 0.86, r * 0.075, 0x707984,
      { x: side * ww * 0.49, rx: i * Math.PI / (bus ? 8 : 5) });
    rim.cylinder(r * 0.2, r * 0.2, 0.028, 0x69727a, 12, { x: side * ww * 0.51, rz: Math.PI / 2 });
  }
  add(tire.build(), tyre, wheel); add(rim.build(), metal, wheel);
  const dirt = new Group(), scars = new Group();
  const mud = new GeoBuilder(), scratch = new GeoBuilder();
  for (const side of [-1, 1]) {
    // Small separated splats behind each arch; hidden on clean garage vehicles.
    for (const axle of d.axles) for (let i = 0; i < (low ? 3 : 7); i++) {
      const z = Math.min(l / 2 - 0.06, axle.z + d.wheelRadius + 0.15 + i * 0.055);
      mud.box(0.012, 0.055 + i % 3 * 0.025, 0.055, white,
        { x: side * (w + 0.023), y: bottom + 0.16 + i % 4 * 0.085, z, rx: i * 0.27 });
    }
    for (let i = 0; i < (low ? 2 : 5); i++) scratch.box(0.009, 0.012, 0.24 + i * 0.045, white,
      { x: side * (w + 0.025), y: belt - 0.24 - i * 0.036, z: 0.12 + i * 0.13, rx: 0.07 });
  }
  const mudMat = mat('road_dirt', 0x66503a, 0.98);
  mudMat.transparent = true; mudMat.opacity = 0;
  add(mud.build(), mudMat, dirt); add(scratch.build(), mat('scuff', 0x777b7d, 0.7, 0.35), scars);
  dirt.visible = scars.visible = false;
  body.add(dirt, scars);
  return { body, wheel, dirt, scars, geometries, materials, head, tail, reverse, indicators };
}
