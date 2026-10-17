import test from 'node:test';
import assert from 'node:assert/strict';
import { careerCourseSvg, raceProgressPercent, compactRaceObjective } from '../racing/presentation.mjs';
import { STAGES } from '../racing/career.mjs';
import { COURSE_BLUEPRINTS } from '../racing/track-design.mjs';
import { V9_STAGE_RHYTHMS } from '../racing/v9-course-director.mjs';
import { V10_STAGE_SIGNATURES } from '../racing/v10-course-director.mjs';

test('all 30 authored tracks have unique rendered road shapes without remote assets', () => {
  const paths = new Set();
  for (const stage of STAGES) {
    const svg = careerCourseSvg(stage.course);
    assert.match(svg, /viewBox="0 0 240 134"/);
    assert.match(svg, /race-track-start/);
    assert.equal(svg.includes('http'), false);
    const path = svg.match(/class="race-track-road" d="([^"]+)"/)?.[1];
    assert.ok(path && path.endsWith(' Z'));
    // Every visible turn on the lobby course uses the SAME inserted physics
    // vertices as the native track builder (not an old simplified preview).
    const basePoints=COURSE_BLUEPRINTS[stage.id][4].trim().split(/\s+/).length;
    const v9Beats=V9_STAGE_RHYTHMS[stage.id].beats.filter(Boolean).length;
    const v10Beats=V10_STAGE_SIGNATURES[stage.id].beats.length;
    assert.equal((path.match(/L/g)??[]).length+1,
      basePoints+(v9Beats+v10Beats)*3,
      'visible course must match native V9 + V10 authored physical road '+stage.id);
    paths.add(path);
  }
  assert.equal(paths.size, 30);
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
test('the only extra in-race text is a short factual counter on objective stages',()=>{
  const cases=[
    [{kind:'race',rank:3},{},31,''],
    [{kind:'boss',rank:1},{},31,''],
    [{kind:'elimination'},{survived:1},31,''],
    [{kind:'drift',target:5},{cleanDrifts:2},31,'漂移 2/5'],
    [{kind:'overtake',target:3},{cleanPasses:2},31,'超车 2/3'],
    [{kind:'item',target:4},{pickups:6},31,'道具 4/4'],
    [{kind:'speed',target:190},{gateSpeed:173},31,'测速 173/190'],
    [{kind:'time'},{timeAllowance:105},30.4,'剩余 75s'],
    [{kind:'relay'},{timeAllowance:90},92,'剩余 0s']
  ];
  for(const [stage,stats,raceTime,expected]of cases)
    assert.equal(compactRaceObjective(stage,stats,raceTime),expected);
});
test('compact HUD never invents a coach message or misstates corrupt telemetry',()=>{
  assert.equal(compactRaceObjective(null,{}),'');
  assert.equal(compactRaceObjective({kind:'drift',target:5},{cleanDrifts:-2}),'漂移 0/5');
  assert.equal(compactRaceObjective({kind:'speed',target:190},{gateSpeed:NaN}),'测速 0/190');
  assert.equal(compactRaceObjective({kind:'time'},{timeAllowance:20},Infinity),'剩余 20s');
});
