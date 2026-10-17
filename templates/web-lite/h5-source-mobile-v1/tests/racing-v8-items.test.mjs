import test from 'node:test';
import assert from 'node:assert/strict';
import { V8_ITEM_WEIGHTS,v8AiItemUseful,v8UseExtraItem,
  v8UpdateExtraItems,v8DisposeBarrier } from '../racing/v8-item-rules.mjs';
import { ITEM_LABELS, ITEM_ICONS } from '../racing/items.mjs';

const driver=(id,x,progress,y=0)=>({id,x,z:0,y,h:0,hint:0,progress,
  isPlayer:false,finished:false,items:[]});
const source=driver('source',0,100);
const makeGame=()=>{
  const hits=[],bursts=[];
  const enemy=driver('ahead',10,110),behind=driver('behind',-9,88),
    far=driver('far',105,195),upper=driver('upper',5,115,22);
  const racers=[source,enemy,behind,far,upper];
  const game={racers,hitRacer:(r,kind)=>hits.push([r.id,kind]),
    racerAhead:()=>enemy,sfx(){},fx:{burst:(...p)=>bursts.push(p)},
    onMissileLock(){}};
  return {game,hits,bursts,enemy,far,upper};
};
test('eight ranked item types have visible unique identities and balanced weights',()=>{
  const all=Object.keys(V8_ITEM_WEIGHTS.lead).sort();
  assert.equal(all.length,8);
  for(const tier of ['lead','mid','back']) {
    assert.deepEqual(Object.keys(V8_ITEM_WEIGHTS[tier]).sort(),all);
    assert.equal(Object.values(V8_ITEM_WEIGHTS[tier]).reduce((a,b)=>a+b,0),100);
  }
  assert.deepEqual(Object.keys(ITEM_LABELS).sort(),all);
  assert.deepEqual(Object.keys(ITEM_ICONS).sort(),all);
});
test('shockwave only hits real nearby rivals on the same vertical layer',()=>{
  const {game,hits}=makeGame(),system={};
  assert.equal(v8UseExtraItem('shockwave',source,game,system),true);
  assert.deepEqual(hits.map(h=>h[0]).sort(),['ahead','behind']);
  assert.ok(v8AiItemUseful('shockwave',source,game));
});
test('thunder warns first then strikes only when real target stays in range',()=>{
  const {game,hits,enemy}=makeGame(),system={game};
  assert.ok(v8AiItemUseful('thunder',source,game));
  assert.equal(v8UseExtraItem('thunder',source,game,system),true);
  assert.equal(hits.length,0);
  assert.equal(v8UpdateExtraItems(system,.4),0);
  assert.equal(v8UpdateExtraItems(system,.4),1);
  assert.deepEqual(hits,[['ahead','missile']]);
  assert.equal(v8UpdateExtraItems(system,.3),0);
  enemy.x=400;
  assert.equal(v8UseExtraItem('thunder',source,game,system),true);
  assert.equal(v8UpdateExtraItems(system,1),0);
});
test('barricade creates a real in-world obstacle in native collision queue',()=>{
  class Group {
    constructor(){this.children=[];this.position={set:(...v)=>{this.xyz=v}}}
    add(x){this.children.push(x)}
    traverse(fn){fn(this);this.children.forEach(x=>x.traverse?.(fn))}
  }
  class Mesh extends Group{
    constructor(geometry,material){super();this.geometry=geometry;this.material=material}
  }
  class Shape {constructor(){}dispose(){}}
  class Material{constructor(){}dispose(){}}
  const THREE={Group,Mesh,MeshStandardMaterial:Material,MeshBasicMaterial:Material,
    BoxGeometry:Shape};
  const {game}=makeGame(),sys={track:{project:()=>({y:0,lat:0,bank:0})},
    group:new Group(),bananas:[]};
  assert.equal(v8UseExtraItem('barricade',source,game,sys,THREE),true);
  assert.equal(sys.bananas.length,1);
  assert.equal(sys.bananas[0].__V8_BARRIER__,true);
  assert.equal(sys.group.children.length,1);
  assert.doesNotThrow(()=>v8DisposeBarrier(sys.bananas[0].mesh));
});
