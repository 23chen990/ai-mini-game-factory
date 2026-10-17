import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareerLayouts, COURSE_BLUEPRINTS, COURSE_TECHNICAL_SECTORS } from '../racing/track-design.mjs';
import { V10_STAGE_SIGNATURES, validateV10Signatures } from '../racing/v10-course-director.mjs';
import { V10_SCENE_SIGNATURES,validateV10Environment,buildV10RoadRumble,buildV10CinematicWorld } from '../racing/v10-environment.mjs';

const seed=()=>Object.fromEntries(['city','egypt','aegean','snow'].map(n=>[n,{__racingV31:true,width:22,points:[[0,0,0]]}]));
test('30 individually choreographed V10 courses use physical extra sectors, preserve all source blueprints and V9 rollback',()=>{
  assert.equal(validateV10Signatures(),30);assert.equal(validateV10Environment(),30);
  const old=seed(),out=seed();
  assert.equal(createCareerLayouts(old,{v8:true,v9:true}),30);
  assert.equal(createCareerLayouts(out,{v8:true,v9:true,v10:true}),30);
  assert.throws(()=>createCareerLayouts(seed(),{v10:true}),/requires native V9 world/);
  for(let n=1;n<=30;n++){
    const id=String(n).padStart(2,'0'),key='race-'+id,
      plan=V10_STAGE_SIGNATURES[id];
    assert.ok(COURSE_BLUEPRINTS[id],id);
    assert.ok(plan.beats.length>=1,id);
    assert.equal(out[key].points.length-old[key].points.length,plan.beats.length*3,id);
    assert.ok(out[key].points.length<=40,id);
    assert.ok(out[key].points.every(p=>p.length===3&&p.every(Number.isFinite)),id);
    assert.equal(out[key].v10StageIdentity,plan.identity,id);
    assert.ok(out[key].v9WidthProfile?.length>=2,id);
    assert.ok(V10_SCENE_SIGNATURES[id]?.length===2,id);
    const existing=new Set(COURSE_TECHNICAL_SECTORS[id].map(x=>x[0]));
    for(const [idx]of plan.beats)assert.ok(!existing.has(idx),id+' not an unintentional old S clone');
  }
  assert.ok(V10_STAGE_SIGNATURES['07'].beats.length>=3,'a giant downhill needs multiple decisions');
  assert.ok(V10_STAGE_SIGNATURES['22'].beats.length>=3,'canyon must not be a 4.8km straight');
  assert.equal(old['race-07'].v10StageIdentity,undefined,'do not silently change V9');
});
class Obj {
  constructor(geometry=null,material=null){
    this.geometry=geometry;this.material=material;this.children=[];
    this.position={x:0,y:0,z:0,set:(x,y,z)=>Object.assign(this.position,{x,y,z})};
    this.rotation={y:0,z:0};
    this.scale={x:1,y:1,z:1,set:(x,y,z)=>Object.assign(this.scale,{x,y,z})};
  }
  add(obj){this.children.push(obj);}
}
class Geometry {
  setAttribute(key,val){this[key]=val;}
  setIndex(v){this.indices=v;}
  computeVertexNormals(){}
}
const mock3D={
  Group:class extends Obj{},Mesh:class extends Obj{},
  BoxGeometry:class{},OctahedronGeometry:class{},
  DodecahedronGeometry:class{},CylinderGeometry:class{},
  BufferGeometry:Geometry,
  Float32BufferAttribute:class{constructor(data,itemSize){this.array=data;this.itemSize=itemSize;}},
  MeshStandardMaterial:class{constructor(p){Object.assign(this,p);}},DoubleSide:2,
};
const sample=d=>({x:d,y:Math.sin(d/175)*5,z:0,rx:0,rz:1,hd:Math.PI/2,i:Math.floor(d/3),d});
test('native road speed marks are one batched drawcall, follow real width and 3D elevation',()=>{
  const tr={length:3000,halfW:9,__V10_STAGE_IDENTITY__:'v10',
    v9WidthAt:d=>d<1100?8.2:9,sample};
  const marks=buildV10RoadRumble(mock3D,tr,'race-05');
  assert.equal(marks.children.length,1);
  assert.equal(marks.children[0].name,'v10-native-rumble-edge-marks');
  assert.ok(marks.children[0].geometry.position.array.length>300);
  assert.ok(marks.children[0].geometry.indices.length>240);
  assert.ok(marks.children[0].geometry.position.array.every(Number.isFinite));
  assert.equal(buildV10RoadRumble(mock3D,{...tr,__V10_STAGE_IDENTITY__:null},'race-05').children.length,0);
});
test('unique stage silhouettes use actual native altitude and never occupy the main collision zone',()=>{
  const tr={length:3000,halfW:9,__V10_STAGE_IDENTITY__:'v10',
    __RACE_SHORTCUT__:{start:1488,end:1693},v9WidthAt:()=>8.7,sample};
  const world=buildV10CinematicWorld(mock3D,tr,'race-05');
  assert.equal(world.children.length,2);
  assert.notEqual(world.children[0].name,world.children[1].name);
  assert.ok(world.children.every(group=>group.children.length>=3));
  assert.ok(world.children.every(group=>group.position.z>30));
  assert.ok(world.children.every(group=>Number.isFinite(group.position.y)));
  assert.equal(buildV10CinematicWorld(mock3D,{...tr,__V10_STAGE_IDENTITY__:null},'race-05').children.length,0);
});
