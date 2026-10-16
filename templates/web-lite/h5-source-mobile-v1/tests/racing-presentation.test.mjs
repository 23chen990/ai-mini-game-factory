import test from 'node:test';
import assert from 'node:assert/strict';
import { careerCourseSvg, raceProgressPercent, nearbyRival, raceEventMoment } from '../racing/presentation.mjs';
import { STAGES } from '../racing/career.mjs';

test('all 16 authored tracks have unique rendered road shapes without remote assets', () => {
  const paths = new Set();
  for (const stage of STAGES) {
    const svg = careerCourseSvg(stage.course);
    assert.match(svg, /viewBox="0 0 240 134"/);
    assert.match(svg, /race-track-start/);
    assert.equal(svg.includes('http'), false);
    const path = svg.match(/class="race-track-road" d="([^"]+)"/)?.[1];
    assert.ok(path && path.endsWith(' Z'));
    paths.add(path);
  }
  assert.equal(paths.size, 16);
  assert.equal(careerCourseSvg('race-99'), '');
});
test('progress display clamps to real native distance, not rank or synthetic timeline', () => {
  const stage = { laps: 2 }, track = { length: 1000 };
  assert.equal(raceProgressPercent({progress: 0},track,stage),0);
  assert.equal(raceProgressPercent({progress: 700},track,stage),35);
  assert.equal(raceProgressPercent({progress: 3000},track,stage),100);
  assert.equal(raceProgressPercent({progress: -30},track,stage),0);
  assert.equal(raceProgressPercent({progress: NaN},track,stage),0);
});
test('rival gap uses real progress and does not change native race data', () => {
  const player = {progress: 520}, first = {progress: 570, finished:false}, last = {progress: 440, finished:false};
  const game = {player,standings:[first,player,last]};
  const snapshot = JSON.stringify(game);
  assert.deepEqual(nearbyRival(game),{label:'追击前车',metres:50,threat:false});
  game.standings=[player,last,first];
  assert.deepEqual(nearbyRival(game),{label:'守住领先',metres:80,threat:false});
  assert.equal(nearbyRival({player,standings:[player]}),null);
  assert.equal(nearbyRival({player,standings:[{progress:900},player]}),null);
  assert.equal(JSON.stringify(game).includes('skill'),false);
  assert.notEqual(JSON.stringify(game),snapshot);
});
test('micro feedback requires native event; dirty drift and fake result yield nothing', () => {
  assert.deepEqual(raceEventMoment({type:'driftEnd',data:{clean:true,time:0.7}}),{title:'漂亮过弯',kind:'skill'});
  assert.equal(raceEventMoment({type:'driftEnd',data:{clean:false,time:1.2}}),null);
  assert.equal(raceEventMoment({type:'driftEnd',data:{clean:true,time:0.1}}),null);
  assert.deepEqual(raceEventMoment({type:'pad'}),{title:'加速带！',kind:'boost'});
  assert.equal(raceEventMoment({type:'fakeWin'}),null);
});
