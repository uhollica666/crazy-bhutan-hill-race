import { ACESFilmicToneMapping, Box3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VehicleModel } from '../src/render/VehicleModel';
import { setVehicleEnvMap } from '../src/render/assets';
import { getVehicle } from '../src/data/vehicles';
import { createCreatureArt } from '../src/render/creatureArt';
import { cityBlock, stupaGeometry } from '../src/render/architecture';
import { mountainPine, shaggyYak, villageHouse } from '../src/render/worldArt';
import { broadleafGeometry } from '../src/render/landmarks';
import { birdGeometry } from '../src/render/trafficBodies';
import { personGeometry } from '../src/render/trafficArt';
const canvas=document.querySelector<HTMLCanvasElement>('#art')!;
const renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;
const scene=new Scene();scene.background=new Color(0x253238);const camera=new PerspectiveCamera(38,innerWidth/innerHeight,0.05,250);const root=new Group();scene.add(root);
const pmrem=new PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room).texture;scene.environment=env;setVehicleEnvMap(env);room.dispose();pmrem.dispose();
scene.add(new HemisphereLight(0xfff3de,0x46534b,1.8));const sun=new DirectionalLight(0xffe4ba,3.1);sun.position.set(-8,18,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-28;sun.shadow.camera.right=28;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28;sun.shadow.bias=-0.0002;scene.add(sun);
const floor=new Mesh(new PlaneGeometry(300,300),new MeshStandardMaterial({color:0x424944,roughness:0.92}));floor.rotation.x=-Math.PI/2;floor.position.y=-0.025;floor.receiveShadow=true;scene.add(floor);
const names:Record<string,string>={'dzo-hatch':'Dzo Hatch','tourist-coaster':'Tourist Coaster','druk-ranger':'Druk Ranger','dragon-cruiser':'Dragon Cruiser',hotel:'Thimphu hotel',office:'Thimphu office',shops:'Thimphu shop row',restaurant:'Restaurant',chorten:'Chorten',house:'Village house',pine:'Mountain pine',broadleaf:'Broadleaf tree',yak:'Yak',bird:'Bird',tourist:'Tourist',yeti:'Yeti',ghost:'Ghost',zombie:'Zombie'};
const select=document.querySelector<HTMLSelectElement>('#asset')!;select.innerHTML=Object.entries(names).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
let dispose=()=>{},animate=(_t:number)=>{},target=new Vector3(),distance=10,time=0;
function show(id:string){dispose();root.clear();root.rotation.y=0;animate=()=>{};let art:Group;
 if(id in names&&id.includes('-')){const v=new VehicleModel(getVehicle(id));v.poseStatic();v.setBlobVisible(false);v.setReflection(1.3);art=v.root;art.rotation.y=Math.PI;dispose=()=>v.dispose();}
 else if(['yeti','ghost','zombie'].includes(id)){const v=createCreatureArt(id as 'yeti'|'ghost'|'zombie');art=v.group;art.rotation.y=Math.PI;dispose=v.dispose;animate=t=>v.update(t,0);}
 else {const geo=['hotel','office','shops','restaurant'].includes(id)?cityBlock(id as 'hotel'|'office'|'shops'|'restaurant'):id==='chorten'?stupaGeometry():id==='house'?villageHouse(2):id==='pine'?mountainPine(0):id==='broadleaf'?broadleafGeometry(0x6b8546):id==='yak'?shaggyYak():id==='bird'?birdGeometry():personGeometry(0x697b81,0xb98964,0x3a2a20,0x88724b,0x654b35);const mat=new MeshStandardMaterial({vertexColors:true,roughness:0.83});const mesh=new Mesh(geo,mat);mesh.castShadow=mesh.receiveShadow=true;art=new Group();art.add(mesh);if(['yak','bird','tourist'].includes(id))art.rotation.y=Math.PI;dispose=()=>{geo.dispose();mat.dispose();};}
 root.add(art);const box=new Box3().setFromObject(art);art.position.y-=box.min.y;box.setFromObject(art);const size=box.getSize(new Vector3());target=box.getCenter(new Vector3());distance=Math.max(size.y*2.05,size.x*1.85,size.z*2.1);document.querySelector('#description')!.textContent=names[id]+' · source geometry, materials and rig';select.value=id;resize();}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();camera.position.copy(target).add(new Vector3(distance*0.64,distance*0.35,distance));camera.lookAt(target);camera.setViewOffset(innerWidth,innerHeight,-Math.min(130,innerWidth*0.1),0,innerWidth,innerHeight);}
select.addEventListener('change',()=>show(select.value));document.querySelector('#reset')!.addEventListener('click',()=>show(select.value));addEventListener('resize',resize);
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,0.05);last=now;time+=dt;animate(time);if(document.querySelector<HTMLInputElement>('#rotate')!.checked)root.rotation.y+=dt*0.3;renderer.render(scene,camera);});
Object.assign(window,{__visualReview:{show,stats:()=>renderer.info.render}});show('dragon-cruiser');
