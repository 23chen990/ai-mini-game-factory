import test from 'node:test';
import assert from 'node:assert/strict';
import {measureCourseActivity} from '../../../../tools/lean-pilot/racing-course-activity.mjs';
import {raceDistanceM} from '../racing/session.mjs';
const straight = length=>({length,sample:(d,out)=>Object.assign(out,{x:d,y:0,z:0})});
test('single-run audit cannot sample the invisible closing road',()=>{
  for(const [course,fraction] of [['race-07',.82],['race-22',.84]]) {
    const seen=[],track=straight(1000),native=track.sample;
    track.sample=(d,out)=>{seen.push(d);assert.ok(d<=1000*fraction+1e-8);return native(d,out);};
    const result=measureCourseActivity(track,{course,laps:1});
    assert.equal(result.raceDistanceM,1000*fraction);
    assert.equal(result.longestLowCurvature.lengthM,1000*fraction);
    assert.ok(seen.length>0);assert.equal(result.humanPlayability,'NOT_RUN');
  }
});
test('one-way end/start cannot be joined into a fictitious continuous straight',()=>{
  const track={length:1000,sample:(d,out)=>Object.assign(out,{x:d,y:0,z:d>300&&d<500?40*Math.sin((d-300)/200*Math.PI)**2:0})};
  const result=measureCourseActivity(track,{course:'race-07',laps:1});
  assert.ok(result.longestLowCurvature.lengthM<400);
  assert.ok(result.lowCurvatureWindows.length>=2);
  assert.ok(result.lowCurvatureWindows.every(x=>x.startM>=0&&x.endM<=820));
});
test('a curve still requires steering; do not call it no-input time',()=>{
  const radius=50,length=2*Math.PI*radius;
  const track={length,sample:(d,out)=>Object.assign(out,{x:radius*Math.sin(d/radius),y:0,z:radius*Math.cos(d/radius)})};
  const r=measureCourseActivity(track,{course:'race-03',laps:2});
  assert.ok(r.longestLowCurvature.lengthM<12);
  assert.equal(r.raceDistanceM,Math.round(length*2*100)/100);
  assert.ok(r.turnWindows.length>0);
  assert.match(r.scope,/NOT human/);
});
test('screening seconds are assumptions, not measured race duration',()=>{
  const r=measureCourseActivity(straight(1000),{course:'race-22',laps:1});
  assert.equal(r.longestWindowModelSeconds.at35Mps,24);
  assert.equal(r.longestWindowModelSeconds.at60Mps,14);
});
test('invalid distances and malformed native samples fail closed',()=>{
  assert.throws(()=>raceDistanceM(0,{laps:1}));
  assert.throws(()=>raceDistanceM(100,{laps:0}));
  assert.throws(()=>measureCourseActivity(straight(1000),{laps:1},{stepM:0}));
  assert.throws(()=>measureCourseActivity({length:1000,sample:()=>({x:NaN,y:0,z:0})},{laps:1}));
});
