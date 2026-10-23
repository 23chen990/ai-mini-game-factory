import test from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { earnedUpgradeOrigin } from '../racing-visible-policy.mjs';

test('old earned profile upgrades only with its matching archived build and unmodified saved origin', () => {
  const report = { buildHash: 'old', naturalInputsOnly: true, seededCampaign: false, errors: [], races: [{ saved: 'earned', status: 'PASS' }] };
  const storage = { origins: [{ origin: 'http://127.0.0.1:43210', localStorage: [{name: 'h5-mobile:qq-speed:career:v1', value: 'earned'}] }] };
  assert.equal(earnedUpgradeOrigin(report, storage, {buildHash:'old'}, 'new'), 'http://127.0.0.1:43210');
  assert.throws(() => earnedUpgradeOrigin(report, storage, {buildHash:'unrelated'}, 'new'));
  assert.throws(() => earnedUpgradeOrigin({...report, seededCampaign:true}, storage, {buildHash:'old'}, 'new'));
  assert.throws(() => earnedUpgradeOrigin(report, storage, {buildHash:'old'}, 'old'));
  assert.throws(() => earnedUpgradeOrigin(report, {origins:[]}, {buildHash:'old'}, 'new'));
  assert.equal(earnedUpgradeOrigin({...report, errors:['Fuel wait timed out AFTER the saved finish']}, storage, {buildHash:'old'}, 'new'), 'http://127.0.0.1:43210');
});
test('representative replay selects only an already enabled real UI option, never writes progress', async () => {
  const {readFile} = await import('node:fs/promises');
  const source = await readFile(new URL('../racing-career-qa.mjs', import.meta.url), 'utf8');
  assert.match(source, /RACE_QA_REPLAY_STAGE/);
  assert.match(source, /option\.isDisabled\(\)/);
  assert.match(source, /selectOption\(String\(requested\)\)/);
  assert.doesNotMatch(source, /saved\.stars\[[^\]]+\]\s*=/);
});
