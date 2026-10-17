import test from 'node:test';
import assert from 'node:assert/strict';
import {V91_PACING_SECTORS,shapeV9RhythmSegments} from '../racing/v9-course-director.mjs';
import {COURSE_BLUEPRINTS,COURSE_TECHNICAL_SECTORS} from '../racing/track-design.mjs';

test('stage03 has one real early steering choice, not a long automatic start',()=>{
  const entries=V91_PACING_SECTORS['03'];
  assert.ok(entries,'missing early stage03 pacing section');
  assert.equal(entries.length,1);
  assert.equal(entries[0].index,0);
  assert.equal(entries[0].shape,'entry');
  assert.ok(entries[0].amplitude>=10&&entries[0].amplitude<=16);
});
test('stage03 keeps its flyover skeleton and final return; only one entry sector is inserted',()=>{
  const [,,,scale,sketch]=COURSE_BLUEPRINTS['03'];
  const local=sketch.split(' ').map(s=>s.split(',').map(Number));
  const original=JSON.stringify(local),sectors=COURSE_TECHNICAL_SECTORS['03'];
  const before=shapeV9RhythmSegments(local,'03',scale,sectors,{pacing:false});
  const after=shapeV9RhythmSegments(local,'03',scale,sectors);
  assert.equal(after.points.length,before.points.length+3);
  assert.deepEqual(after.points[0],before.points[0]);
  assert.deepEqual(after.points.slice(4),before.points.slice(1));
  assert.equal(JSON.stringify(local),original);
  assert.equal(after.pacingApplied,1);
});
