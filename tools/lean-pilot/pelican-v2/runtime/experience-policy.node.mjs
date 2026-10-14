import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedJumpRewardVisible, softwareQualityActions, experienceReportDirectory } from '../experience-policy.mjs';

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
