import test from 'node:test';
import assert from 'node:assert/strict';
import { newProgress, startRound, tickRound, pauseRound, resumeRound, finishRound, rewardRound, saveProgress, loadProgress, adAllowed, purchaseAssist, racePhase } from '../engine.mjs';
import { createFpsAdapter } from '../themes.mjs';
test('the pinned race uses finish, and countdown remains part of the playable round', () => {
  assert.equal(racePhase('finish'), 'finished'); assert.equal(racePhase('countdown'), 'running');
  assert.equal(racePhase('paused'), 'paused'); assert.equal(racePhase('menu'), 'ready');
});
test('FPS bridge reads actual actor stats and releases every held movement/fire input', () => {
  let starts = 0, pauses = 0, resumes = 0;
  const g = { opts: {}, hud: { syncControls() {} }, playing: true, ended: false, paused: false,
    player: { stats: { k: 3 }, keys: new Set(['KeyW']), mouse: { l: true, r: true }, touch: { fire: true, mx: 1, mz: 1 } },
    pause() { pauses++; this.paused = true; }, resume() { resumes++; this.paused = false; } };
  const a = createFpsAdapter(g, { getElementById: () => ({ click: () => starts++ }) });
  a.start(); assert.equal(starts, 1); assert.equal(g.opts.size, 4); assert.equal(a.score(), 3);
  a.pause(); assert.equal(a.phase(), 'paused'); a.resume(); assert.equal(a.phase(), 'running');
  assert.equal(pauses, 1); assert.equal(resumes, 1); a.clearInput(); assert.equal(g.player.keys.size, 0);
  assert.equal(g.player.mouse.l, false); assert.equal(g.player.touch.fire, false);
  g.ended = true; assert.equal(a.phase(), 'finished');
});
test('clock has a complete start, pause, resume, terminal and replay lifecycle', () => {
  const p = newProgress(), r = startRound(p, 90000);
  assert.equal(r.phase, 'running'); tickRound(r, 1000, 2); pauseRound(r);
  tickRound(r, 5000, 9); assert.equal(r.elapsedMs, 1000); assert.equal(r.score, 2);
  resumeRound(r); tickRound(r, 89000, 12); assert.equal(r.phase, 'finished');
  finishRound(r, p); assert.equal(p.best, 12); assert.equal(p.rounds, 1);
  finishRound(r, p); assert.equal(p.rounds, 1); assert.equal(startRound(p, 90000).elapsedMs, 0);
});
test('earned supplies buy one concrete next-round fish-following assist, not an empty currency counter', () => {
  const p = newProgress(); p.bank = 12;
  assert.equal(purchaseAssist(p), true); assert.equal(p.bank, 2); assert.equal(p.assistTokens, 1);
  assert.equal(purchaseAssist(p), false); assert.equal(p.bank, 2);
});
test('source terminal can settle early and cancellation never doubles supplies', () => {
  const p = newProgress(), r = startRound(p, null); tickRound(r, 1000, 4); finishRound(r, p);
  assert.equal(r.phase, 'finished'); const bank = p.bank;
  assert.equal(rewardRound(r, p, false), false); assert.equal(p.bank, bank);
  assert.equal(rewardRound(r, p, true), true); assert.equal(p.bank, bank * 2);
  assert.equal(rewardRound(r, p, true), false);
});
test('progress is versioned, per-game, robust to corrupt storage and preserves reward idempotency', () => {
  const p = newProgress(), r = startRound(p, 90000); tickRound(r, 90000, 7); finishRound(r, p); rewardRound(r, p, true);
  const raw = saveProgress(p, 'pelican-bike');
  assert.deepEqual(loadProgress(raw, 'pelican-bike'), p);
  assert.equal(loadProgress(raw, 'qq-speed'), null); assert.equal(loadProgress('{bad', 'pelican-bike'), null);
  const bad = JSON.parse(raw); bad.progress.bank = -1; assert.equal(loadProgress(JSON.stringify(bad), 'pelican-bike'), null);
});
test('no ad on first round, first sixty seconds, mid-action or after reward', () => {
  const p = newProgress(), r = startRound(p, 90000); tickRound(r, 90000, 7); finishRound(r, p);
  assert.equal(adAllowed(r, p, 90000), false);
  const next = startRound(p, 90000); tickRound(next, 1000, 2); assert.equal(adAllowed(next, p, 90000), false);
  finishRound(next, p); assert.equal(adAllowed(next, p, 59000), false); assert.equal(adAllowed(next, p, 61000), true);
  rewardRound(next, p, true); assert.equal(adAllowed(next, p, 61000), false);
});
