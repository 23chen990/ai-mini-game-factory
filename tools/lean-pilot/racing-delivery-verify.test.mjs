import test from 'node:test';
import assert from 'node:assert/strict';
import { NaturalSchema, DeliverySchema } from './racing-delivery-verify.mjs';
const race = { stage: '01', course: 'race-01', phase: 'finished', map: 'city', laps: 2, diff: 1, mode: 'speed', finished: true, finishTime: 142.34,
  progress: 6363.81, place: 1, earnedStars: 3, heading: '第 1 名',
  result: '第 1 名 · 02:22.34 · 最佳 02:22.34 · 累计 3 星',
  saved: JSON.stringify({ version: 1, rounds: 1, stars: { '01': 3 }, times: { '01': 142.34 } }),
  resultStats: '', goal: '', status: 'PASS',
  actionsFit: true, forbiddenOperations: [], input: 'trusted CDP touches from visible minimap' };
const report = value => ({ schemaVersion: 1, gameId: 'qq-speed', buildHash: 'a'.repeat(64), naturalInputsOnly: true,
  seededCampaign: false, races: [value], errors: [], passed: false });
test('delivery evidence rejects seeded victories, old saved stars and forbidden state writes', () => {
  assert.throws(() => NaturalSchema.parse({ ...report(race), seededCampaign: true }));
  assert.throws(() => NaturalSchema.parse(report({ ...race, heading: '再试一次，争取过关' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, heading: '挑战成功！★★★' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, finished: false })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, place: 4, heading: '第 4 名' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, earnedStars: 0 })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, forbiddenOperations: ['player.progress=finish'] })));
  assert.throws(() => NaturalSchema.parse({ ...report(race), passed: true }));
  assert.equal(NaturalSchema.parse(report(race)).races[0].status, 'PASS');
});
test('a visible PASS still requires a real positive finish time/progress and a known career stage', () => {
  assert.throws(() => NaturalSchema.parse(report({ ...race, finishTime: 0 })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, progress: 0 })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, stage: 'unknown' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, course: 'race-03' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, saved: JSON.stringify({ version: 1, rounds: 1,
    stars: { '03': 3 }, times: { '03': 142.34 } }) })));
});
test('H5 delivery cannot claim physical, LIVE, commercial or publication approval', () => {
  const manifest = { schemaVersion: 1, runId: 'h5-qq-mobile-20261013', gameId: 'qq-speed', sourceCommit: 'a'.repeat(40),
    inputHash: 'b'.repeat(64), buildHash: 'c'.repeat(64), draft: true, publishable: false,
    artifacts: Array.from({ length: 5 }, (_, i) => ({ path: 'evidence-' + i, sha256: 'd'.repeat(64), bytes: 1, role: 'test' })),
    naturalReport: 'natural.json', gates: { natural: 'PASS', perceptual: 'PASS', engineering: 'PASS',
      physicalAndroid: 'BLOCKED', physicalIphone: 'BLOCKED', liveAds: 'BLOCKED', commercial: 'BLOCKED' }, checkedAt: new Date().toISOString() };
  assert.equal(DeliverySchema.parse(manifest).publishable, false);
  assert.throws(() => DeliverySchema.parse({ ...manifest, publishable: true }));
  assert.throws(() => DeliverySchema.parse({ ...manifest, gates: { ...manifest.gates, liveAds: 'PASS' } }));
});
