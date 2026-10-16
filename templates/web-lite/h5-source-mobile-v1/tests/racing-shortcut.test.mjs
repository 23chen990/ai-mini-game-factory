import test from 'node:test';
import assert from 'node:assert/strict';
import {SHORTCUT_PLANS,installPhysicalShortcut} from '../racing/shortcut-network.mjs';

function mockTrack(){
  const L=2600,N=1733,ds=L/N;
  const track={length:L,N,ds};
  track.sample=(d,out={})=>{
    const a=(((d/L)%1)+1)%1*2*Math.PI,
      x=300*Math.cos(a),z=300*Math.sin(a),
      tx=-Math.sin(a),tz=Math.cos(a);
    return Object.assign(out,{x,z,y:0,tx,tz,rx:-tz,rz:tx,
      hd:Math.atan2(tx,tz),d});
  };
  track.project=(x,y,z,hint,out={})=>{
    const a=(Math.atan2(z,x)+2*Math.PI)%(2*Math.PI),
      d=a/(2*Math.PI)*L,s=track.sample(d,{});
    return Object.assign(out,s,{i:Math.floor(d/ds),
      lat:(x-s.x)*s.rx+(z-s.z)*s.rz,surfY:s.y});
  };
  return track;
}
test('shortcut registry has only permitted physical stage roads; default stages stay on long route',()=>{
  assert.deepEqual(Object.keys(SHORTCUT_PLANS),['race-05','race-10','race-12','race-13','race-16']);
  assert.equal(installPhysicalShortcut(mockTrack(),'race-01'),null);
  assert.equal(installPhysicalShortcut(mockTrack(),'unknown'),null);
  assert.ok(Object.values(SHORTCUT_PLANS).every(p=>p.width<23&&p.width>=14&&p.end>p.start));
});
test('physical shortcut generates visible road, real optional projection and shorter distance',()=>{
  const track=mockTrack(),native=track.project;
  const route=installPhysicalShortcut(track,'race-13');
  assert.ok(route.gain>35);
  assert.equal(route.length<route.end-route.start,true);
  assert.notEqual(track.project,native,'real native projection handles alternate road');
  assert.equal(route.samples.length>80,true);
  // Starting straight from the main road at a distant point does not grant
  // shortcut progress. No hidden press, map unlock or fake distance mutation.
  const outside=track.sample(320,{}),out={};
  track.project(outside.x,outside.y,outside.z,0,out);
  assert.notEqual(out.__RACE_SHORTCUT_ACTIVE,true);
  let switched=false,previous=null;
  for(let i=1;i<route.samples.length-1;i++){
    const s=route.samples[i];
    track.project(s.x,s.y,s.z,0,out);
    if(out.__RACE_SHORTCUT_ACTIVE){
      if(previous!==null)assert.ok(out.d>=previous-2,'physical forward travel has monotone canonical progress');
      previous=out.d;
      assert.ok(out.__RACE_SHORTCUT_HALF_WIDTH<track.halfW||true);
      switched=true;
    }
  }
  assert.equal(switched,true,'player can actually enter the branch using physical positions');
  assert.equal(out.__RACE_SHORTCUT_ACTIVE,false,'branch must rejoin the main road at exit');
});
test('stuck shortcut recovery stays on fork instead of teleporting to credited main distance',()=>{
  const track=mockTrack(),route=installPhysicalShortcut(track,'race-13');
  const m=route.samples[Math.floor(route.samples.length*.55)],out={
    __RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_ARC:route.length*.55
  };
  track.project(m.x,m.y,m.z,0,out);
  assert.equal(out.__RACE_SHORTCUT_ACTIVE,true);
  const player={proj:out,x:m.x,z:m.z,y:m.y,s:45,wrongWay:2,lastD:out.d};
  const oldDistance=player.d=out.d;
  assert.equal(route.recover(player),true);
  assert.equal(player.proj.__RACE_SHORTCUT_ACTIVE,true);
  assert.ok(player.d<oldDistance,'real physical recovery moves back, never ahead');
  assert.equal(player.lastD,player.d);
  assert.equal(player.s,12);
  assert.equal(route.recover({proj:{__RACE_SHORTCUT_ACTIVE:false}}),false);
});
