import test from 'node:test';
import assert from 'node:assert/strict';
import { aiV8TargetLine, advanceAiV8Road, aiV8ForkDesiredSpeed } from '../racing/v8-rival-ai.mjs';
import { installPhysicalShortcut } from '../racing/shortcut-network.mjs';

const makeTrack=(scale=1.09)=>{
  const L=2600*scale, R=330*scale,N=1800;
  const track={length:L,N,ds:L/N,halfW:11.5};
  track.sample=(d,out={})=>{
    const a=((d/L)%1+1)%1*2*Math.PI,x=R*Math.cos(a),z=R*Math.sin(a),
      tx=-Math.sin(a),tz=Math.cos(a);
    return Object.assign(out,{x,z,y:0,d,tx,tz,rx:-tz,rz:tx,hd:Math.atan2(tx,tz),
      i:Math.floor(((d%L)+L)%L/track.ds),bank:0});
  };
  track.project=(x,y,z,hint,out={})=>{
    const a=(Math.atan2(z,x)+2*Math.PI)%(2*Math.PI),d=a/(Math.PI*2)*L;
    const s=track.sample(d,{}),lat=(x-s.x)*s.rx+(z-s.z)*s.rz;
    return Object.assign(out,s,{lat,surfY:0});
  };
  return track;
};
test('AI uses an actual fork road rather than a rank or time warp',()=>{
  const track=makeTrack(),fork=installPhysicalShortcut(track,'race-13',{v8:true});
  assert.ok(fork.scale>1);
  assert.ok(fork.gain>0);
  const ai={track,dist:fork.start-.35,personal:.1,lat:0,latV:0,s2:{},
    skill:1.9,rnd:()=>0};
  const target=aiV8TargetLine(ai,track,0,track.halfW-2.2);
  assert.ok(Number.isFinite(target));
  let samples=[],prior=ai.dist;
  for(let n=0;n<150;n++){
    ai.dist+=3;
    const s=advanceAiV8Road(ai,track,3);
    assert.ok(ai.dist>=prior-1e-6,'no backward progress/teleport');
    prior=ai.dist;
    if(s){
      assert.equal(s.__V8_FORK_AI__,true);
      assert.ok(Number.isFinite(s.x)&&Number.isFinite(s.hd));
      samples.push(s);
    }
    if(!ai.__V8_FORK_STATE__ && samples.length>0)break;
  }
  assert.ok(samples.length>15);
  assert.equal(ai.__V8_FORK_STATE__,null);
  assert.ok(Math.abs(ai.dist-fork.end)<15,'rejoins the same real track');
});
test('cautious AI can choose the main track and malformed data fails closed',()=>{
  const track=makeTrack(),fork=installPhysicalShortcut(track,'race-13',{v8:true});
  const cautious={track,dist:fork.start+.5,personal:0,lat:1,latV:0,
    skill:.8,rnd:()=>.999,s2:{}};
  assert.equal(advanceAiV8Road(cautious,track,1),null);
  assert.equal(aiV8TargetLine(cautious,track,2,9.5),2);
  assert.equal(advanceAiV8Road(cautious,track,NaN),null);
});

test('V9 shortcut AI brakes according to genuine physical turn before and inside the fork',()=>{
  const tr=makeTrack(),fork=installPhysicalShortcut(tr,'race-13',{v8:true});
  const ai={track:tr,dist:fork.start-28,skill:1.3,personal:0,
    lat:0,latV:0,s2:{},rnd:()=>0};
  // V8 unaffected by opt-in design.
  assert.equal(aiV8ForkDesiredSpeed(ai,tr,70),70);
  fork.v9=true;
  const approach=aiV8ForkDesiredSpeed(ai,tr,70);
  assert.ok(Number.isFinite(approach)&&approach<70&&approach>=14);
  let bendAt=0,bendRate=0;
  for(let i=2;i<fork.samples.length-2;i++){
    const a=fork.samples[i],b=fork.samples[i+1];
    const v=Math.abs(Math.atan2(Math.sin(b.hd-a.hd),
      Math.cos(b.hd-a.hd)))/Math.max(.001,b.arc-a.arc);
    if(v>bendRate){bendRate=v;bendAt=a.arc;}
  }
  ai.__V8_FORK_STATE__={lap:0,arc:Math.max(0,bendAt-16)};
  const inside=aiV8ForkDesiredSpeed(ai,tr,70);
  assert.ok(Number.isFinite(inside)&&inside<70&&inside>=14);
  ai.__V8_FORK_STATE__=null;
  ai.rnd=()=>.999;
  ai.__V8_FORK_CHOICE_KEY__=null;
  const cautious=aiV8ForkDesiredSpeed(ai,tr,70);
  assert.equal(cautious,70);
});
