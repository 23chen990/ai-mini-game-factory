/* Owned V13 scene builder, copied only to the private pinned engine fork.
 * Shares the EXACT SAME primitive definition for visible meshes and original
 * engine World.colliders. No borrowed map, textures or offsite assets.
 * The base engine remains third-party: internal playtest only until licensed. */
import * as THREE from 'three';
import {DEPOT_MAP_ID,DEPOT_PIECES,DEPOT_SPAWNS} from './cf-depot-layout.js';

const SWATCH={
  floor:[0x343b42,.92,.04],
  boundary:[0x28363e,.89,.12],
  structure:[0x60707c,.82,.14],
  concrete:[0x737f88,.95,.02],
  steel:[0x315d6a,.59,.35],
  orange:[0xc37743,.76,.12],
  blue:[0x345978,.63,.24],
  amber:[0xb8a05c,.73,.12],
  roof:[0x40525d,.91,.18],
  stripe:[0xe4c779,.8,.02],
  red:[0xd6533e,.5,.15]
};
export function buildDepotMap(scene,world){
  if(!scene?.add||!world?.add||!world?.build)
    throw Error('Original Three scene and native physics World required');
  const group=new THREE.Group();
  group.name='ORIGINAL_DEPOT_V13';
  const cube=new THREE.BoxGeometry(1,1,1);
  const dummy=new THREE.Object3D();
  const meshes=[];
  for(const [kind,[color,roughness,metalness]] of Object.entries(SWATCH)){
    const members=DEPOT_PIECES.filter(p=>p.material===kind);
    if(!members.length)continue;
    const material=new THREE.MeshStandardMaterial({
      color,roughness,metalness,
      emissive:kind==='red'?0x692018:0x000000,
      emissiveIntensity:kind==='red'?.8:0
    });
    const mesh=new THREE.InstancedMesh(cube,material,members.length);
    mesh.name='DEPOT_'+kind;
    mesh.castShadow=false;mesh.receiveShadow=false;
    for(let i=0;i<members.length;i++){
      const p=members[i];
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(0,0,0);
      dummy.scale.set(p.w,p.h,p.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    group.add(mesh);meshes.push(mesh);
  }
  for(const p of DEPOT_PIECES){
    if(!p.collision)continue;
    world.add({
      x:p.x,y:p.y,z:p.z,
      sx:p.w,sy:p.h,sz:p.d,yaw:0,
      mat:p.material==='orange'?'metal':'concrete',
      surface:p.id==='ground'?'concrete':'metal',
      tag:'original-depot:'+p.id
    });
  }
  world.build();
  scene.add(group);
  return {
    id:DEPOT_MAP_ID,
    spawns:{
      BL:DEPOT_SPAWNS.BL.map(s=>({...s})),
      GR:DEPOT_SPAWNS.GR.map(s=>({...s}))
    },
    meshes,materials:SWATCH,lampSpots:[],funnelTop:null,
    update(){/* Static, GPU-instanced industrial scene; no extra frame work. */}
  };
}
