import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCornerSigns, v9CornerSignPresentation, chooseV9CornerSigns } from '../racing/corner-signs.mjs';

const mkTrack=()=>{
  const N=1250,ds=2.4,curv=new Float32Array(N);
  for(const d of [360,600,850,1070,1350,1690,1980,2380,2760]) {
    const i=Math.round(d/ds/8)*8;
    curv[i]=.015+(d%5)*.001;
  }
  return {N,ds,length:N*ds,curv,halfW:9,
    __V9_WIDTH_PROFILE__:[{at:.2,span:.08,factor:.88}],
    __RACE_SHORTCUT__:{start:600,end:805},
    sample(d){return {x:d,y:0,z:0,rx:0,rz:1,hd:Math.PI/2}}};
};
test('V9 corner markers must remain small, outside playable road and not overlap fork decisions',()=>{
  const tr=mkTrack();
  const all=chooseCornerSigns(tr);
  assert.ok(all.length>=5);
  const design=v9CornerSignPresentation(tr);
  assert.ok(design.scale<=4.2 && design.scale>=3,design.scale);
  assert.ok(design.offset>=8 && design.height<4.5);
  assert.equal(design.panel,false,'No giant opaque turn billboard in front of mobile camera');
  const actual=chooseV9CornerSigns(tr);
  assert.ok(actual.length>=1&&actual.length<=4);
  for(const sign of actual) {
    assert.ok(Math.abs(sign.d-tr.__RACE_SHORTCUT__.start)>105,
      'Short fork already has theme-specific advance markers');
    assert.ok(Math.abs(sign.d-tr.__RACE_SHORTCUT__.end)>105);
  }
  assert.equal(actual.length,new Set(actual.map(v=>v.d)).size);
});
test('V9 quiet sign changes are opt-in; legacy V8 placement and dimensions unchanged',()=>{
  const tr=mkTrack();
  const v8={...tr,__V9_WIDTH_PROFILE__:null};
  assert.deepEqual(v9CornerSignPresentation(v8),{
    scale:7,offset:5.5,height:4.3,panel:true,
  });
  assert.deepEqual(chooseV9CornerSigns(v8),chooseCornerSigns(v8));
});
test('V9 can retain emergency corner cue if every technical bend is beside a fork',()=>{
  const tr=mkTrack();
  tr.__RACE_SHORTCUT__={start:1400,end:1470};
  const result=chooseV9CornerSigns(tr);
  assert.ok(result.length>0&&result.length<=4);
});
