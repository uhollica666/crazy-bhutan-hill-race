import { branch } from './organic';
import { seatedDriver } from './people';
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, TorusGeometry, Vector3, DoubleSide } from 'three';
import { HeroBuilder, crown, pane, surface } from './heroSurfaces';
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
    const m = name === 'paint' ? new MeshPhysicalMaterial({color,roughness:0.24,metalness:0.38,clearcoat:1,clearcoatRoughness:0.12,vertexColors:true}) : name === 'glass' ? new MeshPhysicalMaterial({color:0x92abb8,roughness:0.08,metalness:0,ior:1.5,clearcoat:1,vertexColors:true}) : new MeshStandardMaterial({ color, roughness, metalness, vertexColors: true });
    m.name = name; materials.push(m); return m;
  };
  const paint = mat('paint', d.livery.body, 0.28, 0.42);
  const rubber = mat('rubber', 0x24272b, 0.94);
  const tyre = mat('tyre', 0x252729, 0.96);
  const metal = mat('alloy', 0xb6bdc5, 0.31, 0.85);
  const accent = mat('accent', d.livery.accent, 0.4, 0.25);
  const trim = mat('trim', d.livery.trim, 0.55, 0.12);
  const glass = mat('glass', 0x263b47, 0.13, 0.12);
  glass.transparent = true; glass.opacity = 0.24; glass.depthWrite = false; glass.side = DoubleSide;
  const cabin = mat('cabin', 0x363b42, 0.95);
  const head = mat('light_head', 0xffecc8, 0.22);
  head.emissive.setHex(0xffe2ac); head.emissiveIntensity = 0.35;
  const tail = mat('light_tail', 0xc3222c, 0.28);
  tail.emissive.setHex(0xe52628); tail.emissiveIntensity = 0.4;
  const reverse = mat('light_reverse', 0xcdd8da, 0.3);
  reverse.emissive.setHex(0xd6ecff); reverse.emissiveIntensity = 0;
  const indicators = [-1, 1].map((side) => { const m = mat(side<0?'indicator_left':'indicator_right', 0xdb8a21, 0.3); m.emissive.setHex(0xff990c); return m; });
  const batches = new Map<MeshStandardMaterial, GeoBuilder>();
  const batch = (m: MeshStandardMaterial): GeoBuilder => {
    let b = batches.get(m); if (!b) { b = new HeroBuilder(low); batches.set(m, b); } return b;
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
  batch(paint).add(loft([[-l / 2, w * 0.62, bottom + 0.07, belt - 0.16], [-l / 2 + 0.25, w * 0.67, bottom, belt-.16],
    [l / 2 - 0.2, w * 0.67, bottom, belt-.16], [l / 2, w * 0.62, bottom + 0.08, belt - 0.16]]), white);
  for (const side of [-1, 1]) {
    const lower = (z: number): number => {
      let y = bottom;
      for (const axle of d.axles) { const r = d.wheelRadius + 0.12, dz = z - axle.z;
        if (Math.abs(dz) < r) y = Math.max(y, axle.y - d.suspension.rest + Math.sqrt(r * r - dz * dz)); }
      return y;
    };
      // A continuous shoulder crown and lower tumble-in create broad flowing reflections.
      batch(paint).add(surface(low?80:200, low ? 3 : 16, (u,v) => {
        const z=-l/2+l*u, lo=lower(z);
        const taper=1-0.1*Math.pow(Math.abs(z)/(l/2),8);
        const flare=d.axles.reduce((amount,axle)=>Math.max(amount,Math.exp(-Math.pow((z-axle.z)/(d.wheelRadius*1.25),4))),0);
        const contour=0.945+0.045*Math.sin(v*Math.PI)+0.01*flare-0.028*Math.pow(v,8);
        return new Vector3(side*w*taper*contour,lo+(belt-lo)*v,z);
      }, side > 0),white);
      batch(paint).add(surface(low?40:100,4,(u,v)=>{
        const z=-l/2+l*u,taper=1-0.1*Math.pow(Math.abs(z)/(l/2),8);
        return new Vector3(side*w*taper*(0.917-0.2*v),belt+0.035*Math.sin(v*Math.PI),z);
      },side>0),white);
    for (const axle of d.axles) {
      const r = d.wheelRadius + 0.14, cy = axle.y - d.suspension.rest;
      batch(rubber).add(new TorusGeometry(r,0.028,low?4:8,low?12:40,Math.PI),white,{x:side*(w+0.012),y:cy,z:axle.z,ry:Math.PI/2});
    }
  }
  // Bonnet and rear shoulder taper into the glazed cabin rather than stacked boxes.
  if (!bus) batch(paint).add(crown(-l/2+0.05,front,w*0.917,belt+0.025,belt+0.12,hatch?0.085:expedition?0.055:0.09,low),white);
  else batch(paint).add(crown(-l/2+.025,front,w*.917,belt+.025,belt+.1,.025,low),white);
  batch(paint).add(crown(back-.025,l/2-.035,w*.917,belt+.095,belt+.035,.025,low),white);
  batch(paint).add(loft([[l/2-.11,w*.86,bottom+.22,belt+.04],[l/2,w*.85,bottom+.25,belt+.025]]),white);
  // Front air dam, inset fascia and lower cooling apertures visibly break up the tall front panel.
  batch(paint).add(loft([[-l/2-0.014,w*0.84,bottom+0.25,belt-0.08],[-l/2+0.2,w*0.91,bottom+0.2,belt]]),white);
  batch(rubber).box(w*1.05,0.19,0.05,white,{y:bottom+0.34,z:-l/2-0.052});
  for(const side of [-1,1]) {
    batch(rubber).box(0.25,0.16,0.065,white,{x:side*w*0.66,y:bottom+0.34,z:-l/2-0.052});
    batch(head).cylinder(0.055,0.055,0.016,white,12,{x:side*w*0.66,y:bottom+0.34,z:-l/2-0.093,rx:Math.PI/2});
  }
  // Individual glass sheets leave the cabin open, with no glass bottom or overlapping roof prism.
  const v=(x:number,y:number,z:number)=>new Vector3(x,y,z);
  batch(glass).add(pane(v(-w*.9,belt+.13,front),v(w*.9,belt+.13,front),v(topWidth*.96,roof-.09,roofFront),v(-topWidth*.96,roof-.09,roofFront)),white);
  batch(glass).add(pane(v(w*.9,belt+.1,back),v(-w*.9,belt+.1,back),v(-topWidth*.96,roof-.09,roofBack),v(topWidth*.96,roof-.09,roofBack)),white);
  for(const side of [-1,1]) {
    const count=bus?6:hatch?2:3;
    for(let i=0;i<count;i++) {
      const a=roofFront+(roofBack-roofFront)*i/count+.035,b=roofFront+(roofBack-roofFront)*(i+1)/count-.035;
      const lowerA=i===0?front+.035:a,lowerB=i===count-1?back-.035:b;
      batch(glass).add(pane(v(side*w*.918,belt+.09,lowerA),v(side*w*.918,belt+.09,lowerB),v(side*topWidth,roof-.1,b),v(side*topWidth,roof-.1,a),side>0),white);
    }
  }
  batch(paint).add(crown(roofFront-.05,roofBack+.06,topWidth,roof-.012,roof-.012,bus?.075:hatch?.065:.045,low),white);
  // Rolled roof edge and seals follow the same tapered silhouette.
  for(const side of [-1,1]) branch(batch(paint),[side*topWidth,roof-.015,roofFront-.04],[side*topWidth,roof-.015,roofBack+.045],.022,white);
  for (const side of [-1, 1]) {
    // Sloping A/C pillars, vertical window dividers and shallow stamped door seams.
    for (const [z0, z1] of [[front, roofFront], [back, roofBack]]) {
      branch(batch(paint),[side*w*0.94,belt+0.1,z0],[side*topWidth,roof-0.07,z1],bus?0.058:0.043,white);
    }
    const count = bus ? 6 : hatch ? 2 : 3;
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
    batch(paint).sphere(0.13,white,{x:side*(w+.11),y:belt+.27,z:front+.08,sx:.7,sy:bus?1.3:.62,sz:1.05},low?10:24);
    batch(metal).sphere(0.115,white,{x:side*(w+.195),y:belt+.27,z:front+.08,sx:.075,sy:bus?1.28:.62,sz:1.02},low?10:24);
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
    const lampWidth=expedition?0.36:bus?0.31:0.38;
    if(hatch) {
      batch(rubber).sphere(lampWidth*.55,white,{x:side*lights.hx,y:lights.y,z:-l/2-.035,sx:1,sy:.49,sz:.27},low?12:28);
      batch(metal).sphere(lampWidth*.5,white,{x:side*lights.hx,y:lights.y,z:-l/2-.068,sx:1,sy:.48,sz:.16},low?12:28);
    } else if(expedition) {
      batch(rubber).cylinder(.124,.124,.074,white,low?16:40,{x:side*lights.hx,y:lights.y,z:-l/2-.035,rx:Math.PI/2});
      batch(metal).add(new TorusGeometry(.108,.012,low?5:10,low?16:48),white,{x:side*lights.hx,y:lights.y,z:-l/2-.078});
    } else {
      batch(rubber).box(lampWidth+0.04,bus?.21:.19,0.075,white,{x:side*lights.hx,y:lights.y,z:-l/2-0.035});
      batch(metal).box(lampWidth,0.16,0.016,white,{x:side*lights.hx,y:lights.y,z:-l/2-0.075});
    }
    for(const offset of expedition?[0]:[-0.065,0.065])batch(head).cylinder(expedition?.092:.055,expedition?.092:.055,0.02,white,low?12:32,{x:side*lights.hx+offset,y:lights.y,z:-l/2-0.09,rx:Math.PI/2});
    if(!expedition)batch(head).box(lampWidth,0.027,0.023,white,{x:side*lights.hx,y:lights.y-0.055,z:-l/2-0.092});
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
  if(!low) {
    batch(cabin).box(w*1.72,.035,back-front-.3,white,{y:belt-.11,z:(front+back)/2+.05});
    batch(cabin).box(topWidth*1.9,.025,roofBack-roofFront-.08,white,{y:roof-.067,z:(roofFront+roofBack)/2});
    batch(cabin).box(.23,.13,.72,white,{y:belt-.012,z:roofFront+.66});
    for(const side of [-1,1]) {
      batch(cabin).box(.028,.19,roofBack-roofFront,white,{x:side*w*.89,y:belt-.025,z:(roofFront+roofBack)/2});
      batch(metal).box(.035,.025,.12,white,{x:side*w*.875,y:belt+.06,z:roofFront+.42});
    }
    const instrument=mat('instrument',0x111a1e,.7);instrument.emissive.setHex(0x326c61);instrument.emissiveIntensity=.25;
    batch(instrument).box(.18,.075,.018,white,{y:belt+.175,z:front+.398});
    for(let i=0;i<6;i++)batch(metal).sphere(.009,white,{x:(i%3-1)*.05,y:belt+.07+Math.floor(i/3)*.035,z:front+.399,sz:.4},12);
  }
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
    // Authored hero assemblies: visible chassis, axle casings, drive shaft, differential and cooling stack.
    const chassis = mat('chassis', 0x343b41, 0.58, 0.62);
    const upholstery = mat('upholstery', bus ? 0x556572 : expedition ? 0x584a3c : 0x3d4149, 0.93);
    const disc = mat('brake_disc', 0x798087, 0.44, 0.86);
    for (const side of [-1, 1]) {
      batch(chassis).box(0.085,0.12,l*0.79,white,{x:side*w*0.48,y:bottom-0.015});
      // Sculpted sill and belt crease catch a narrow highlight along the body.
      const sillFront=d.axles[0].z+d.wheelRadius+0.18, sillBack=d.axles[d.axles.length-1].z-d.wheelRadius-0.18;
      if(sillBack>sillFront) batch(paint).add(loft([[sillFront,0.018,bottom+0.12,bottom+0.19],[(sillFront+sillBack)/2,0.03,bottom+0.11,bottom+0.2],[sillBack,0.018,bottom+0.12,bottom+0.19]]),white,{x:side*w});
      batch(rubber).box(0.018,0.018,roofBack-roofFront,white,{x:side*topWidth,y:roof-0.1,z:(roofBack+roofFront)/2});
      // Headlamp optical cups, fine lens bars and bumper parking sensors.
      for (let i=0;i<7;i++) batch(glass).box(0.012,0.135,0.012,white,{x:side*lights.hx-0.075+i*0.025,y:lights.y,z:-l/2-0.109});
      batch(rubber).cylinder(0.017,0.017,0.006,white,12,{x:side*w*0.46,y:bottom+0.16,z:-l/2-0.012,rx:Math.PI/2});
      // Rear hatch gasket, latch and heated rear-window strips.
      batch(metal).box(0.24,0.025,0.016,white,{y:belt+0.12,z:l/2+0.032});
      for(let i=0;i<5;i++) batch(trim).box(topWidth*1.55,0.004,0.008,white,{y:belt+0.24+i*0.09,z:back+0.02});
      for(const axle of d.axles) {
        batch(chassis).cylinder(0.065,0.065,axle.halfTrack*2,white,16,{y:axle.y-d.suspension.rest+0.06,z:axle.z,rz:Math.PI/2});
        batch(chassis).sphere(0.16,white,{y:axle.y-d.suspension.rest+0.06,z:axle.z,sx:1.2,sz:1.1},16);
        batch(metal).cylinder(0.027,0.04,0.24,white,12,{x:side*axle.halfTrack*0.78,y:bottom-0.04,z:axle.z,rz:side*0.22});
        for(let turn=0;turn<5;turn++) batch(chassis).add(new TorusGeometry(0.065,0.01,6,16),white,{x:side*axle.halfTrack*0.78,y:bottom-0.12+turn*0.035,z:axle.z,rx:Math.PI/2});
      }
    }
    batch(chassis).cylinder(0.036,0.036,Math.abs(d.axles[0].z-d.axles[d.axles.length-1].z),white,12,{y:bottom-0.05,z:(d.axles[0].z+d.axles[d.axles.length-1].z)/2,rx:Math.PI/2});
    for(let i=0;i<12;i++) batch(chassis).box(w*0.84,0.008,0.018,white,{y:lights.y-0.13,z:-l/2-0.056+i*0.002});
    for(let row=0;row<rows;row++) for(const side of [-1,1]) {
      const z=roofFront+0.38+row*(bus?0.84:0.9); if(z>roofBack-0.15) continue;
      batch(upholstery).sphere(0.21,white,{x:side*w*0.46,y:belt-0.005,z,sy:0.27,sz:0.9},16);
      batch(upholstery).sphere(0.21,white,{x:side*w*0.46,y:belt+0.2,z:z+0.14,sy:0.96,sz:0.21},16);
      for(let stitch=0;stitch<4;stitch++) batch(trim).box(0.28,0.003,0.006,white,{x:side*w*0.46,y:belt+0.09+stitch*0.065,z:z+0.09});
      batch(rubber).box(0.024,0.32,0.024,white,{x:side*(w*0.46+0.18),y:belt+0.2,z:z+0.08,rz:side*0.37});
    }
    // Analog instruments and a gear lever are visible through the clearer glazing.
    for(const x of [w*0.46-0.07,w*0.46+0.07]) batch(disc).cylinder(0.047,0.047,0.009,white,20,{x,y:belt+0.18,z:front+0.39,rx:Math.PI/2});
    batch(chassis).cylinder(0.018,0.018,0.19,white,12,{y:belt+0.04,z:roofFront+0.47,rx:-0.17});
    batch(rubber).sphere(0.035,white,{y:belt+0.14,z:roofFront+0.45},16);
    const occupant = mat('occupant', 0xffffff, 0.95);
    const driver = new GeoBuilder();
    const scale = Math.min(0.84, (roof - belt - 0.12) / 0.98);
    driver.add(seatedDriver(), white, {x:w*0.46,y:belt-0.02,z:roofFront+0.38,sx:scale,sy:scale,sz:scale}, true);
    add(driver.build(), occupant);
    const steering = new TorusGeometry(0.15,0.018,6,16);
    batch(rubber).add(steering,white,{x:w*0.46,y:belt+0.17,z:roofFront+0.15,rx:-0.45});
  }
  // Optional cosmetic meshes are shared by both LODs; no physics attachments.
  const panelX=(side:number,y:number,z:number):number=>{
    let lo=bottom,flare=0;
    for(const axle of d.axles){const r=d.wheelRadius+.12,dz=z-axle.z;if(Math.abs(dz)<r)lo=Math.max(lo,axle.y-d.suspension.rest+Math.sqrt(r*r-dz*dz));flare=Math.max(flare,Math.exp(-Math.pow(dz/(d.wheelRadius*1.25),4)));}
    const v=Math.min(1,Math.max(0,(y-lo)/(belt-lo)));
    return side*(w*(1-.1*Math.pow(Math.abs(z)/(l/2),8))*(.945+.045*Math.sin(v*Math.PI)+.01*flare-.028*Math.pow(v,8))+.003);
  };
  const stripe = new Group(); stripe.name = 'cosmetic_stripe';
  const summit = new Group(); summit.name = 'cosmetic_summit';
  for (const side of [-1, 1]) {
    const stripeGeo = new GeoBuilder().add(surface(low?20:80,2,(u,v)=>{const z=(u-.5)*l*.72,y=belt-.16+(v-.5)*.095;return new Vector3(panelX(side,y,z),y,z);},side>0),white).build();
    add(stripeGeo, accent, stripe);
    const graphic = new GeoBuilder();
    for (let i=0;i<5;i++) graphic.add(surface(4,4,(u,v)=>{const y=belt-.3+v*(.16+i*.025),z=.15+i*.18+u*.11-v*.065;return new Vector3(panelX(side,y,z),y,z);},side>0),white);
    add(graphic.build(), accent, summit);
  }
  const carrier = new Group(); carrier.name = 'cosmetic_carrier';
  const cargo = new HeroBuilder(low);
  const fabric=mat('cargo_fabric',0x746c54,.94),bags=new HeroBuilder(low);
  for(const side of [-1,1]) {
    bags.box(w*.6,.23,Math.min(1.3,l*.35),white,{x:side*w*.33,y:roof+.26,z:.35});
    cargo.box(.065,.24,Math.min(1.3,l*.35)+.014,white,{x:side*w*.33,y:roof+.26,z:.35});
  }
  for (const x of [-w * 0.48,w * 0.48]) cargo.box(0.06, 0.26, 1.3, white, {x,y:roof + 0.27,z:0.35});
  add(cargo.build(), rubber, carrier);
  add(bags.build(),fabric,carrier);
  const lamps = new Group(); lamps.name = 'cosmetic_lamps';
  const lampFrame = new GeoBuilder(), lenses = new GeoBuilder();
  lampFrame.box(w * 1.35, 0.06, 0.09, white, {y:roof + 0.14,z:roofFront + 0.12});
  for (const x of [-w * 0.48,-w * 0.16,w * 0.16,w * 0.48]) {
    lampFrame.cylinder(0.105,0.105,0.1,white,12,{x,y:roof+0.24,z:roofFront+0.12,rx:Math.PI/2});
    lenses.cylinder(0.086,0.086,0.014,white,12,{x,y:roof+0.24,z:roofFront+0.06,rx:Math.PI/2});
  }
  add(lampFrame.build(), rubber, lamps); add(lenses.build(), head, lamps);
  for (const option of [stripe,summit,carrier,lamps]) { option.visible = false; body.add(option); }
  const basket = new Group(); basket.name = 'cosmetic_basket';
  const rails = new GeoBuilder();
  const rackLength = Math.min(l*0.48,2.3), rackZ = (roofFront+roofBack)/2;
  for(const side of [-1,1]) {
    rails.box(0.04,0.04,rackLength,white,{x:side*w*0.68,y:roof+0.3,z:rackZ});
    for(const z of [-rackLength/2,rackLength/2]) rails.box(0.04,0.19,0.04,white,{x:side*w*0.68,y:roof+0.2,z:rackZ+z});
  }
  for(let i=0;i<8;i++) rails.box(w*1.36,0.026,0.026,white,{y:roof+0.11,z:rackZ-rackLength/2+i*rackLength/7});
  for(const z of [-rackLength/2,rackLength/2]) rails.box(w*1.36,0.04,0.04,white,{y:roof+0.3,z:rackZ+z});
  add(rails.build(),metal,basket); basket.visible=false; body.add(basket);
  const trail = new Group(); trail.name = 'cosmetic_trail'; const protection = new GeoBuilder();
  for(const side of [-1,1]) {
    protection.cylinder(0.035,0.035,0.42,white,low?6:16,{x:side*w*0.56,y:bottom+0.39,z:-l/2-0.15});
    protection.box(0.07,0.035,l*0.6,white,{x:side*(w+0.08),y:bottom+0.05});
  }
  protection.cylinder(0.035,0.035,w*1.28,white,low?6:16,{y:bottom+0.6,z:-l/2-0.15,rz:Math.PI/2});
  protection.box(w*1.25,0.045,0.24,white,{y:bottom+0.1,z:-l/2-0.1,rx:-0.2});
  add(protection.build(),metal,trail); trail.visible=false; body.add(trail);
  // Panel details: towing eyes, rear hatch inset, badge, fuel flap and exhaust tip.
  batch(rubber).box(w*1.3,0.075,0.03,white,{y:bottom+0.31,z:l/2+0.038});
  batch(metal).sphere(0.055,white,{y:lights.y+0.02,z:-l/2-0.072,sy:0.65,sz:0.25},12);
  for(const side of [-1,1]) {
    batch(trim).box(0.07,0.04,0.12,white,{x:side*w*0.57,y:bottom+0.19,z:-l/2-0.1});
    if(!low)batch(rubber).box(0.008,0.16,0.18,white,{x:side*(w+0.016),y:belt-0.29,z:back-0.36});
  }
  batch(metal).cylinder(0.038,0.038,0.24,white,10,{x:-w*0.57,y:bottom+0.02,z:l/2-0.08,rx:Math.PI/2});
  for (const [m, b] of batches) add(b.build(), m);
  const r = d.wheelRadius, ww = d.wheelWidth;
  const wheelMetal = mat('wheel_alloy',0xb6bdc5,0.31,0.85);
  const tire = new GeoBuilder(), rim = new GeoBuilder();
  tire.add(new TorusGeometry(r - ww * 0.34, ww * 0.34, low ? 6 : 8, low ? 20 : 40), white, { ry: Math.PI / 2 });
  tire.cylinder(r * 0.88, r * 0.88, ww * 0.78, white, low ? 16 : 24, { rz: Math.PI / 2 });
  if (!low) for (let i = 0; i < (expedition ? 40 : 36); i++) {
    const a = i * Math.PI * 2 / (expedition ? 40 : 36);
    for (const side of [-1, 1]) tire.box(ww * 0.46, 0.013, r * 0.11, white,
      { x: side * ww * 0.22, y: Math.cos(a) * (r - 0.009), z: Math.sin(a) * (r - 0.009), rx: a, ry: side * 0.25 });
  }
  for (const side of [-1, 1]) {
    rim.add(new TorusGeometry(r*0.61,r*0.045,low?5:8,low?16:32),white,{x:side*ww*0.46,ry:Math.PI/2});
    rim.cylinder(r*0.49,r*0.49,0.016,0x4a5055,20,{x:side*ww*0.32,rz:Math.PI/2});
    const spokes=bus?8:expedition?6:5;
    for (let i = 0; i < spokes; i++) {
      const a=i*Math.PI*2/spokes;
      rim.box(0.03,r*0.47,r*0.11,white,{x:side*ww*0.48,y:Math.cos(a)*r*0.33,z:Math.sin(a)*r*0.33,rx:a});
      rim.cylinder(r*0.028,r*0.028,0.035,0x383b3d,8,{x:side*ww*0.515,y:Math.cos(a)*r*0.15,z:Math.sin(a)*r*0.15,rz:Math.PI/2});
    }
    rim.cylinder(r * 0.2, r * 0.2, 0.028, 0x69727a, 12, { x: side * ww * 0.51, rz: Math.PI / 2 });
  }
  add(tire.build(), tyre, wheel);
  if(!low) {
    const brakes=new HeroBuilder(false),brakeMat=mat('wheel_brake',0x777c80,.5,.83);
    for(const side of [-1,1]) {
      brakes.cylinder(r*.48,r*.48,.012,white,40,{x:side*ww*.27,rz:Math.PI/2});
      for(let i=0;i<20;i++){const a=i*Math.PI/10;brakes.cylinder(.009,.009,.014,0x32393c,6,{x:side*ww*.28,y:Math.cos(a)*r*.38,z:Math.sin(a)*r*.38,rz:Math.PI/2});}
    }
    add(brakes.build(),brakeMat,wheel);
  }
  const touring = new Group(); touring.name='rim_touring'; add(rim.build(),wheelMetal,touring); wheel.add(touring);
  for(const variant of ['steel','sport']) {
    const group = new Group(); group.name=`rim_${variant}`; group.visible=false;
    const variantRim = new GeoBuilder();
    for(const side of [-1,1]) {
      variantRim.add(new TorusGeometry(r*0.61,r*0.035,6,low?16:36),white,{x:side*ww*0.48,ry:Math.PI/2});
      if(variant==='steel') {
        variantRim.cylinder(r*0.52,r*0.52,0.018,0x59636c,low?16:32,{x:side*ww*0.44,rz:Math.PI/2});
        for(let i=0;i<8;i++){const a=i*Math.PI/4;variantRim.cylinder(r*0.075,r*0.075,0.025,0x20262b,10,{x:side*ww*0.46,y:Math.cos(a)*r*0.38,z:Math.sin(a)*r*0.38,rz:Math.PI/2});}
      } else for(let i=0;i<10;i++) {
        const a=i*Math.PI/5+(i%2)*0.065;
        variantRim.box(0.024,r*0.48,r*0.055,white,{x:side*ww*0.48,y:Math.cos(a)*r*0.34,z:Math.sin(a)*r*0.34,rx:a});
      }
      variantRim.cylinder(r*0.18,r*0.18,0.03,white,16,{x:side*ww*0.5,rz:Math.PI/2});
    }
    add(variantRim.build(),wheelMetal,group); wheel.add(group);
  }
  const dirt = new Group(), scars = new Group();
  dirt.name='road_dirt_group';scars.name='damage_group';
  const mud = new GeoBuilder(), scratch = new GeoBuilder();
  for (const side of [-1, 1]) {
    // Small separated splats behind each arch; hidden on clean garage vehicles.
    for (const axle of d.axles) for (let i = 0; i < (low ? 3 : 7); i++) {
      const z = Math.min(l / 2 - 0.06, axle.z + d.wheelRadius + 0.15 + i * 0.055);
      mud.box(0.012, 0.055 + i % 3 * 0.025, 0.055, white,
        { x: panelX(side,bottom+.16+i%4*.085,z), y: bottom + 0.16 + i % 4 * 0.085, z, rx: i * 0.27 });
    }
    for (let i = 0; i < (low ? 2 : 5); i++) scratch.box(0.009, 0.012, 0.24 + i * 0.045, white,
      { x: panelX(side,belt-.24-i*.036,.12+i*.13), y: belt - 0.24 - i * 0.036, z: 0.12 + i * 0.13, rx: 0.07 });
  }
  const mudMat = mat('road_dirt', 0x66503a, 0.98);
  mudMat.transparent = true; mudMat.opacity = 0;
  add(mud.build(), mudMat, dirt); add(scratch.build(), mat('scuff', 0x777b7d, 0.7, 0.35), scars);
  dirt.visible = scars.visible = false;
  body.add(dirt, scars);
  return { body, wheel, dirt, scars, geometries, materials, head, tail, reverse, indicators };
}
