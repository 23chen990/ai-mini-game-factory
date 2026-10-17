import test from 'node:test';
import assert from 'node:assert/strict';
import { V9_STAGE_RHYTHMS, validateV9Rhythms, shapeV9RhythmSegments, V9_WIDTH_BANDS, v9RoadHalfWidthAt } from '../racing/v9-course-director.mjs';
import { createCareerLayouts, CAREER_COURSE_MAPS, COURSE_BLUEPRINTS, COURSE_TECHNICAL_SECTORS } from '../racing/track-design.mjs';
const bases=()=>Object.fromEntries(['city','egypt','aegean','snow'].map(map=>[map,{__racingV31:true,width:23,points:[[0,0,0]]}]));
const length=points=>points.reduce((sum,a,i)=>{
  const b=points[(i+1)%points.length];
  return sum+Math.hypot(b[0]-a[0],b[1]-a[1]);
},0);
test('all 30 courses use distinct original driving-beat sequences, including recovery sectors',()=>{
  assert.equal(validateV9Rhythms(),30);
  assert.equal(Object.keys(V9_STAGE_RHYTHMS).length,30);
  const plans=Object.values(V9_STAGE_RHYTHMS);
  assert.equal(new Set(plans.map(x=>x.beats.join('/'))).size,30);
  assert.ok(plans.some(x=>x.beats.includes('late')));
  assert.ok(plans.some(x=>x.beats.includes('chicane')));
  assert.ok(plans.some(x=>x.beats.includes('sweep')));
  assert.ok(plans.some(x=>x.beats.includes(null)));
});
test('V8 native course construction uses authored V9 geometry; non-V8 compatibility preserved',()=>{
  const legacy=bases(),current=bases();
  assert.equal(createCareerLayouts(legacy),30);
  assert.equal(createCareerLayouts(current,{v8:true,v9:true}),30);
  const safe=bases();
  assert.equal(createCareerLayouts(safe,{v8:true}),30);
  assert.throws(()=>createCareerLayouts(bases(),{v9:true}),/require native V8/);
  let applied=0;
  for(let i=1;i<=30;i++){
    const id=String(i).padStart(2,'0'),key='race-'+id;
    const before=legacy[key].points,after=current[key].points;
    assert.equal(CAREER_COURSE_MAPS[i-1]!==undefined,true);
    assert.notDeepEqual(after,safe[key].points,id+' V9 is not merely cosmetic');
    assert.ok(after.length>=COURSE_BLUEPRINTS[id][4].split(' ').length,id);
    assert.ok(after.every(x=>x.length===3&&x.every(Number.isFinite)),id);
    assert.ok(length(after)>1800,id+' not a tiny arena');
    assert.equal(COURSE_BLUEPRINTS[id][0].length>0,true);
    applied++;
  }
  assert.equal(applied,30);
});
test('V9 original beats are pure, bounded, do not move track anchors and reject bad sectors',()=>{
  const control=[[0,0,0],[120,0,0],[280,0,3],[500,0,4],[650,0,0]];
  const frozen=JSON.stringify(control);
  assert.throws(()=>shapeV9RhythmSegments(control,'01',1,[[1,19,1],[2,19,-1],[3,17,1],[1,18,-1]]),/Invalid authored rhythm segment/);
  assert.equal(JSON.stringify(control),frozen);
  const correct=shapeV9RhythmSegments([[0,0,0],[120,0,0],[280,0,3],[500,0,4],[650,0,0],[820,0,0]],'01',1,[[1,19,1],[2,19,-1],[3,17,1],[4,18,-1]]);
  assert.ok(correct.applied>=2);
  assert.equal(correct.rest,1);
  assert.deepEqual(correct.points[0],[0,0,0]);
  assert.deepEqual(correct.points.at(-1),[820,0,0]);
});

test('V9 width variation changes actual safe driving width, not only line paint',()=>{
  assert.equal(Object.keys(V9_WIDTH_BANDS).length,30);
  const layouts=bases();
  createCareerLayouts(layouts,{v8:true,v9:true});
  for(let n=1;n<=30;n++){
    const id=String(n).padStart(2,'0');
    const profile=V9_WIDTH_BANDS[id],layout=layouts['race-'+id];
    assert.deepEqual(layout.v9WidthProfile,profile,id);
    const half=layout.width*.5,measured=[];
    for(let i=0;i<=1000;i++) {
      const value=v9RoadHalfWidthAt(half,profile,i/1000);
      assert.ok(value>=half*.83&&value<=half*1.08,id);
      measured.push(value);
    }
    assert.ok(Math.max(...measured)-Math.min(...measured)>half*.14,id);
    assert.equal(v9RoadHalfWidthAt(half,null,.32),half);
    assert.ok(Math.abs(v9RoadHalfWidthAt(half,profile,.13)-
      v9RoadHalfWidthAt(half,profile,1.13))<1e-7,id);
  }
});
