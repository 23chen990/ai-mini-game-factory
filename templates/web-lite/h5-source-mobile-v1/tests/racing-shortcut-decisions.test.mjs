import test from 'node:test';
import assert from 'node:assert/strict';
import { ShortcutDecisionTracker } from '../racing/shortcut-decisions.mjs';

const branch=Object.freeze({course:'race-30',start:1728,end:2148,length:372,gain:48});
const make=()=>({
  state:'race',raceTime:0,
  track:{length:2640,__RACE_SHORTCUT__:branch},
  player:{d:1550,progress:1550,finished:false,proj:{__RACE_SHORTCUT_ACTIVE:false}}
});
const tick=(g,time,d,progress,arc=null)=>{
  g.raceTime=time;g.player.d=d;g.player.progress=progress;
  g.player.proj=arc===null
    ? {__RACE_SHORTCUT_ACTIVE:false}
    : {__RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_ARC:arc};
};
test('only real native Track.project activation can count a physical shortcut choice',()=>{
  const tracker=new ShortcutDecisionTracker(),g=make();
  tick(g,1,branch.start-100,branch.start-100);
  assert.equal(tracker.frame(g),null);
  assert.deepEqual(tracker.snapshot(),{
    available:true,entries:0,completed:0,aborted:0,geometricSavingMeters:0
  });
  tick(g,2,branch.start+28,branch.start+28,18);
  assert.equal(tracker.frame(g)?.kind,'entered');
  assert.equal(tracker.frame(g),null,'same native race tick cannot duplicate an entry');
  tick(g,3,branch.start+175,branch.start+175,150);
  assert.equal(tracker.frame(g),null);
  tick(g,4,branch.end-8,branch.end-8,branch.length-10);
  assert.equal(tracker.frame(g),null);
  tick(g,5,branch.end+7,branch.end+7);
  assert.equal(tracker.frame(g)?.kind,'completed');
  assert.deepEqual(tracker.snapshot(),{
    available:true,entries:1,completed:1,aborted:0,geometricSavingMeters:48
  });
  // Merely looking at the same portal again cannot double count another lane.
  tick(g,6,branch.end+10,branch.end+10,branch.length-6);
  assert.equal(tracker.frame(g),null);
  assert.equal(tracker.snapshot().entries,1,'merge jitter is not a new deliberate fork');
  tick(g,7,branch.end+19,branch.end+19);
  assert.equal(tracker.frame(g),null);
  const final=tracker.finish();
  assert.equal(final.completed,1);
  assert.equal(final.aborted,0);
});
test('incomplete or wrong-way exit never earns route saving; pause never ends route',()=>{
  const tracker=new ShortcutDecisionTracker(),g=make();
  tick(g,1,branch.start+20,branch.start+20,16);
  tracker.frame(g);
  g.state='paused';
  tick(g,2,branch.start+35,branch.start+35,34);
  assert.equal(tracker.frame(g),null);
  assert.equal(tracker.snapshot().aborted,0);
  g.state='race';
  tick(g,3,branch.start+80,branch.start+80,85);
  tracker.frame(g);
  tick(g,4,branch.start+95,branch.start+95);
  assert.equal(tracker.frame(g)?.kind,'aborted');
  assert.deepEqual([tracker.snapshot().entries,tracker.snapshot().completed,
    tracker.snapshot().aborted,tracker.snapshot().geometricSavingMeters],[1,0,1,0]);
  tick(g,5,branch.end-3,branch.end-3,branch.length-9);
  assert.equal(tracker.frame(g)?.kind,'entered','later legitimate entry is distinct');
  const result=tracker.finish();
  assert.equal(result.entries,2);
  assert.equal(result.completed,0);
  assert.equal(result.aborted,2,'unfinished fork at game over is not a completion');
});
test('fake progress, malformed projections, spectator frames and changing courses fail closed',()=>{
  const tracker=new ShortcutDecisionTracker(),g=make();
  tick(g,1,branch.start+15,branch.start+15);
  g.player.proj={__RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_ARC:Infinity};
  assert.equal(tracker.frame(g),null);
  assert.equal(tracker.snapshot().entries,0);
  g.player.proj={__RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_ARC:390};
  g.raceTime=2;
  assert.equal(tracker.frame(g),null);
  g.state='finished';g.raceTime=3;
  g.player.proj.__RACE_SHORTCUT_ARC=20;
  assert.equal(tracker.frame(g),null);
  assert.equal(tracker.snapshot().entries,0);
  g.state='race';g.raceTime=4;
  assert.equal(tracker.frame(g)?.kind,'entered');
  g.track.__RACE_SHORTCUT__={...branch,course:'race-29'};
  g.raceTime=5;
  assert.equal(tracker.frame(g),null,'do not merge events across races');
  assert.equal(tracker.snapshot().entries,1);
  tracker.reset();
  assert.equal(tracker.snapshot().entries,0);
  assert.equal(tracker.snapshot().available,false);
});
