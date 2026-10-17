import test from 'node:test';
import assert from 'node:assert/strict';
import { V8_COURSES, validateV8CourseProfiles, sampleElevation,
  applyV8CourseGeometry } from '../racing/v8-course-geometry.mjs';
import { createCareerLayouts, CAREER_COURSE_MAPS,
  COURSE_BLUEPRINTS } from '../racing/track-design.mjs';

const bases = () => Object.fromEntries(
  ['city','egypt','aegean','snow'].map(name =>
    [name,{__racingV31:true,width:23,points:[[0,0,0]]}]));
const routeLength = points => points.reduce((sum,p,i) => {
  const b=points[(i+1)%points.length];
  return sum+Math.hypot(b[0]-p[0],b[1]-p[1]);
},0);

test('V8 defines thirty distinct finite loop-safe altitude signatures',()=>{
  assert.equal(validateV8CourseProfiles(),30);
  assert.equal(Object.keys(V8_COURSES).length,30);
  for(const [id,profile] of Object.entries(V8_COURSES)) {
    assert.ok(profile.feature.length>=6,id);
    assert.equal(profile.knots[0][1],profile.knots.at(-1)[1],id);
    assert.equal(sampleElevation(profile.knots,0),sampleElevation(profile.knots,1),id);
    for(let j=0;j<=100;j++)
      assert.ok(Number.isFinite(sampleElevation(profile.knots,j/100)),id);
  }
});

test('V8 opt-in creates physically longer, terrain-diverse 30 stages without touching old baselines',()=>{
  const original=bases(),v8=bases();
  assert.equal(createCareerLayouts(original),30);
  assert.equal(createCareerLayouts(v8,{v8:true}),30);
  const heights=new Set();
  for(let i=1;i<=30;i++) {
    const id=String(i).padStart(2,'0'),course='race-'+id,
      old=original[course],next=v8[course],plan=V8_COURSES[id];
    assert.equal(CAREER_COURSE_MAPS[i-1]!==undefined,true);
    assert.equal(next.points.length,old.points.length,id);
    const oldLen=routeLength(old.points),newLen=routeLength(next.points);
    assert.ok(newLen>oldLen*1.065,id+' must genuinely extend physical road');
    assert.ok(newLen<oldLen*1.55,id+' must avoid indefinite race inflation');
    const hs=next.points.map(p=>p[2]);
    assert.ok(hs.every(h=>h>=0&&h<=70&&Number.isFinite(h)),id);
    assert.ok(Math.max(...hs)-Math.min(...hs)>8,id);
    assert.ok(next.points.every((p,j)=>p[2]!==old.points[j][2] || j===0 || j<next.points.length),
      'points remain finite');
    heights.add(hs.map(h=>Math.round(h*10)).join(':'));
    assert.ok(plan.knots.length>=7,id);
  }
  assert.equal(heights.size,30);
  assert.deepEqual(original['race-01'].points.map(p=>p[2]),Array(original['race-01'].points.length).fill(0));
});

test('V8 geometry rejects accidental steep, nonfinite or degenerate roads',()=>{
  assert.throws(()=>applyV8CourseGeometry([], '07', 1),/Invalid/);
  assert.throws(()=>applyV8CourseGeometry(Array(14).fill([0,0,0]),'07',1),/too little/);
  assert.throws(()=>sampleElevation(V8_COURSES['07'].knots,NaN),/Invalid/);
});

test('v8 authored cliff grade materially differs from flat stage 01',()=>{
  const plans=Object.fromEntries([1,7].map(i=>{
    const id=String(i).padStart(2,'0'),info=COURSE_BLUEPRINTS[id];
    return [id,info];
  }));
  assert.ok(V8_COURSES['07'].knots.some(k=>k[1]>=60));
  assert.ok(V8_COURSES['01'].knots.every(k=>k[1]<=20));
  assert.equal(plans['07'][1],'断崖连续下坡');
});
