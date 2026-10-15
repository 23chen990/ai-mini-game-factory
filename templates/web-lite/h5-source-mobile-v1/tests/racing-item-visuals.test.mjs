/* global Buffer */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const source = await readFile(new URL('../racing/item-visuals.mjs', import.meta.url), 'utf8');
const adapted = source.replace(
  "import { textTexture } from './textures.js';",
  "const textTexture = () => ({clone(){return {needsUpdate:false,dispose(){}};}});"
);
assert.notEqual(adapted, source,'must exercise production code');
const {upgradeItemBoxes}=await import('data:text/javascript;base64,'+Buffer.from(adapted).toString('base64'));
const THREE={
  SpriteMaterial: class {constructor(o){Object.assign(this,o);}},
  MeshBasicMaterial: class {constructor(o){Object.assign(this,o);}},
  TorusGeometry: class {},
  IcosahedronGeometry: class {constructor(){this.type='IcosahedronGeometry';}},
  Mesh: class {constructor(geo,mat){this.geometry=geo;this.material=mat;this.rotation={};this.position={};}},
  Sprite: class {constructor(mat){this.isSprite=true;this.material=mat;this.position={};this.scale={set(x,y,z){this.x=x;this.y=y;this.z=z;}};}},
};
function fixture(){
  const cube={geometry:{dispose(){}},
    material:{color:{setHex(){}},emissive:{setHex(){}},emissiveIntensity:0,opacity:0}};
  const old={visible:true};
  const g={children:[cube,old],add(obj){this.children.push(obj);}};
  return {boxes:[{cube,g}]};
}
test('real question sprite renders above opaque 3D item diamond',()=>{
  const system=fixture();
  assert.equal(upgradeItemBoxes(system,THREE),1);
  const icons=system.boxes[0].g.children.filter(x=>x.isSprite);
  assert.equal(icons.length,1);
  const icon=icons[0];
  assert.equal(icon.material.depthTest,false);
  assert.equal(icon.material.depthWrite,false);
  assert.equal(icon.material.transparent,true);
  assert.ok(icon.renderOrder>=10);
  assert.ok(icon.scale.x>=4);
  assert.equal(icon.material.map.needsUpdate,true);
  assert.equal(system.boxes[0].cube.geometry.type,'IcosahedronGeometry');
  assert.equal(system.boxes[0].g.children[1].visible,false);
});
test('item sprite source texture is recreated per race, upgrade stays idempotent',()=>{
  const first=fixture(),second=fixture();
  assert.equal(upgradeItemBoxes(first,THREE),1);
  assert.equal(upgradeItemBoxes(first,THREE),0);
  assert.equal(upgradeItemBoxes(second,THREE),1);
  const a=first.boxes[0].g.children.find(x=>x.isSprite).material.map;
  const b=second.boxes[0].g.children.find(x=>x.isSprite).material.map;
  assert.notEqual(a,b);
});
