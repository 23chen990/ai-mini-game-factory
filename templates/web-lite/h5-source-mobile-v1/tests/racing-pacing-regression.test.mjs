import test from 'node:test';
import assert from 'node:assert/strict';
import * as session from '../racing/session.mjs';
import * as director from '../racing/v9-course-director.mjs';

const game = (course, progress, finished = false, laps = 1) => {
  const player = {progress, finished, finishTime: 70, stats: {crashes: 0}, name: 'Player'};
  return {settings:{course, laps, map:'aegean'}, track:{length:1000}, player, standings:[player]};
};
test('one-way results use the real finish, not the invisible return road', () => {
  assert.equal(session.resultSummary(game('race-07',820,true)).completion, 1);
  assert.equal(session.resultSummary(game('race-22',840,true)).completion, 1);
  assert.equal(session.resultSummary(game('race-07',410)).completion, .5);
  assert.equal(session.resultSummary(game('race-22',420)).completion, .5);
});
test('normal lap progress, result rank and finish flag are not fabricated', () => {
  const g=game('race-03',1500,false,3), snapshot=JSON.stringify(g);
  const r=session.resultSummary(g);
  assert.equal(r.completion,.5); assert.equal(r.finished,false); assert.equal(r.place,1);
  assert.equal(JSON.stringify(g),snapshot);
});
test('mobile composition and saved quality survive the pacing repair', () => {
  assert.equal(session.initialRaceQuality(null,true),'low');
  assert.equal(session.initialRaceQuality('high',true),'high');
  assert.equal(session.raceScreenProfile(667,320),'desktop');
  assert.equal(session.raceScreenProfile(844,390,{coarse:true}),'touch');
  assert.ok(session.racePhoneCamera(844,390).dist<10);
  assert.ok(session.raceCameraFov(70,true,true)<=69);
});
test('pacing repair owns original early/mid-course nodes, not finish-return nodes', () => {
  assert.ok(director.V91_PACING_SECTORS, 'authored pacing sectors are missing');
  assert.deepEqual(Object.keys(director.V91_PACING_SECTORS).sort(),['03','07','22']);
  for (const [id, entries] of Object.entries(director.V91_PACING_SECTORS)) {
    assert.ok(entries.some(x=>x.index===0),id+' has an early decision');
    assert.ok(entries.every(x=>x.index<=(id==='07'?14:11)),id+' must not add bends beyond the single-run finish');
    assert.ok(new Set(entries.map(x=>x.index)).size===entries.length);
  }
});
test('authored insertions are pure, finite and can be compared to the unmodified baseline', () => {
  const original=Array.from({length:20},(_,i)=>[i*180,Math.sin(i*.4)*30,i*.3]);
  const frozen=JSON.stringify(original);
  const sectors=[[1,17,-1],[8,17,-1],[12,19,1],[17,17,-1]];
  const before=director.shapeV9RhythmSegments(original,'07',1,sectors,{pacing:false});
  const after=director.shapeV9RhythmSegments(original,'07',1,sectors);
  assert.notDeepEqual(before.points,after.points);
  assert.equal(JSON.stringify(original),frozen);
  assert.deepEqual(after.points[0],original[0]);
  assert.deepEqual(after.points.at(-1),original.at(-1));
  assert.ok(after.points.length<=40);
  assert.ok(after.points.every(p=>p.length===3&&p.every(Number.isFinite)));
  assert.equal(after.pacingApplied,2);
  assert.equal(before.pacingApplied,0);
});
