import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkV9Fork } from '../racing-shortcut-cost.mjs';

function fixture() {
  const tr={halfW:9,sample(d){
    return {hd:.45*Math.sin((d-100)*Math.PI/200)};
  }};
  const fork={v9:true,start:100,end:300,length:160,gain:40,neckWidth:8.8,
    samples:Array.from({length:161},(_,i)=>({
      arc:i,hd:.57*Math.sin(i*Math.PI/160),
    }))};
  return {tr,fork};
}
test('benchmarks actual arc, braking and equal-skill road alternatives, never just saved metres',()=>{
  const {tr,fork}=fixture();
  const p=benchmarkV9Fork(tr,fork);
  assert.equal(p.mainMeters,200);
  assert.equal(p.branchMeters,160);
  assert.equal(p.physicalSavingMeters,40);
  assert.equal(p.widthRatio,.489);
  assert.ok(p.skilled.mainSeconds>p.skilled.branchSeconds);
  assert.ok(p.novice.mainSeconds>p.novice.branchSeconds);
  assert.ok(p.skilled.estimatedGainSeconds>.5);
  assert.match(p.model,/NOT timed PlayerCar/);
});
test('a sharper short-cut can forfeit an apparent distance advantage',()=>{
  const {tr,fork}=fixture();
  fork.samples=fork.samples.map(p=>({
    ...p,
    hd:1.85*Math.sin(p.arc/160*Math.PI)*Math.sin(p.arc/160*Math.PI),
  }));
  const sharp=benchmarkV9Fork(tr,fork);
  assert.ok(sharp.skilled.estimatedGainSeconds <
    benchmarkV9Fork(tr,fixture().fork).skilled.estimatedGainSeconds,
    'High curvature must have an honest braking/time cost');
  assert.ok(sharp.novice.branchCornerMinMps <
    sharp.skilled.branchCornerMinMps,
    'Lower corner tolerance must require slower real paths');
});
test('non-native forks and nonmonotone physical samples never masquerade as verified reward',()=>{
  const {tr,fork}=fixture();
  assert.throws(()=>benchmarkV9Fork(tr,{...fork,v9:false}),/V9 native shortcut/);
  assert.throws(()=>benchmarkV9Fork(tr,{...fork,start:300,end:100}),/V9 native shortcut/);
  const broken={...fork,samples:fork.samples.map(p=>({...p}))};
  for(let i=0;i<broken.samples.length;i++)broken.samples[i].arc=1;
  assert.throws(()=>benchmarkV9Fork(tr,broken),/Nonmonotone native road distances/);
});
