import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedJumpRewardVisible, softwareQualityActions, experienceReportDirectory, earnedPrizeRouteSeen, pedestrianWarningSeen, experienceMotionPreference } from '../experience-policy.mjs';

test('earned jump reward remains readable through persistent gold and mastery counters after a missed toast', () => {
 const before={gold:1,jumps:0};
 assert.equal(earnedJumpRewardVisible({feedback:'🐟 +1 条鱼',gold:2,jumps:1},before),true);
 assert.equal(earnedJumpRewardVisible({feedback:'',gold:1,jumps:1},before),false);
 assert.equal(earnedJumpRewardVisible({feedback:'',gold:2,jumps:0},before),false);
 assert.equal(earnedJumpRewardVisible({feedback:'🏆 奖励金鱼 +7分',gold:2,jumps:1},before),true);
});

test('software renderer selects only the existing efficient preset with normal menu touches', () => {
 assert.deepEqual(softwareQualityActions('efficient'),['#co-quality','#co-quality']);
 assert.deepEqual(softwareQualityActions(undefined),[]);
 assert.throws(()=>softwareQualityActions('injected'),/Unsupported/u);
});

test('a QA presentation retest preserves the bound natural report in a separate safe directory', () => {
 assert.equal(experienceReportDirectory('chromium',undefined),'experience-chromium');
 assert.equal(experienceReportDirectory('chromium','efficient-retest'),'experience-chromium-efficient-retest');
 assert.throws(()=>experienceReportDirectory('chromium','../other-game'),/Unsafe/u);
});

test('a reward route observation requires actual visible gold cue between the same barrier and its bonus catch', () => {
 const frame={phase:'running',clearedBarriers:['l1-o1'],caughtBonusFish:[],lanes:[{index:1,kind:'fish',text:'🌟',visible:true}]};
 assert.equal(earnedPrizeRouteSeen([frame],'l1-o1','l1-jump-l1-o1'),true);
 assert.equal(earnedPrizeRouteSeen([{...frame,clearedBarriers:['other']}],'l1-o1','l1-jump-l1-o1'),false);
 assert.equal(earnedPrizeRouteSeen([{...frame,caughtBonusFish:['l1-jump-l1-o1']}],'l1-o1','l1-jump-l1-o1'),false);
 assert.equal(earnedPrizeRouteSeen([{...frame,lanes:[{...frame.lanes[0],visible:false}]}],'l1-o1','l1-jump-l1-o1'),false);
});

test('pedestrian warnings require live visible directional hazard and at least two seconds', () => {
 const frame={phase:'running',lanes:[{index:0,kind:'pedestrian',text:'🚶3s',visible:true}]};
 assert.equal(pedestrianWarningSeen([frame],0),true);
 assert.equal(pedestrianWarningSeen([frame],2),false);
 assert.equal(pedestrianWarningSeen([{...frame,phase:'paused'}],0),false);
 assert.equal(pedestrianWarningSeen([{...frame,lanes:[{...frame.lanes[0],text:'🚶1s'}]}],0),false);
 assert.equal(pedestrianWarningSeen([{...frame,lanes:[{...frame.lanes[0],visible:false}]}],0),false);
});

test('CI motion preference uses the shipped browser accessibility media query', () => {
 assert.equal(experienceMotionPreference(undefined),'no-preference');
 assert.equal(experienceMotionPreference('reduce'),'reduce');
 assert.throws(()=>experienceMotionPreference('forced-css'),/Unsupported/u);
});
