/* global process, console, window, document, getComputedStyle, URL, setTimeout */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRun, serveRun, buildHash } from './runner.mjs';
import { sha256 } from './policy.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUN_ID = 'h5-cf-challenges-20261013';
const MODES = Object.freeze({ awm: 'precision', survive: 'survive' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function reviewCfNaturalSuccess(mode, { base = path.join(ROOT, 'runs') } = {}) {
  if (!Object.hasOwn(MODES, mode)) throw Error('Expected awm or survive');
  const { run, root, game } = await loadRun(base, RUN_ID);
  if (run.theme !== 'cf-transport-ship') throw Error('Wrong game: refuse to operate on other H5 runs');
  const hash = await buildHash(game);
  const server = await serveRun(base, RUN_ID, 0);
  const port = server.address().port;
  const checks = [], trace = [], touches = [], screenshots = [], errors = [];
  const out = path.join(root, 'screenshots');
  await mkdir(out, { recursive: true });
  let browser, page, context, cdp, report;
  let shotCount = 0;
  const screenshot = async label => {
    const file = path.join(out, 'cf-v4-' + mode + '-' + label + '.png');
    await page.screenshot({ path: file, timeout: 10000 });
    screenshots.push({ path: 'screenshots/' + path.basename(file), sha256: sha256(await readFile(file)) });
  };
  const check = (name, condition, detail = {}) => checks.push({ name, passed: condition === true, detail });
  const inspect = async () => page.evaluate(() => {
    const game = window.__H5NativeGame, p = game?.player;
    const kit = document.getElementById('mobile-kit');
    const visibleEnemies = [...document.querySelectorAll('.mk-fps-enemy')].filter(el =>
      !el.hidden && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length).length;
    return {
      phase: kit?.dataset.phase ?? null, outcome: kit?.dataset.outcome ?? null,
      challenge: kit?.dataset.challenge ?? null, gameTime: +((game?.time ?? 0).toFixed(2)),
      weapon: p?.weapon?.id ?? null, scoped: p?.scoped ?? 0, alive: p?.alive ?? false,
      shots: p?.stats?.shots ?? 0, hits: p?.stats?.hits ?? 0, kills: p?.stats?.k ?? 0,
      deaths: p?.stats?.d ?? 0, awmKills: game?.__mkAwmKills ?? 0,
      travelLabel: document.getElementById('mk-status')?.textContent ?? '',
      visibleEnemies,
      targetSide: document.getElementById('mk-fps-target')?.dataset.side ?? null,
      guide: document.getElementById('mk-fps-guide')?.textContent ?? '',
      liveAd: document.getElementById('mk-ad')?.hidden === false,
      error: document.querySelector('.mk-error')?.textContent ?? ''
    };
  });
  // Only the actual on-screen touch buttons/joystick. No actor coordinates,
  // state injection, artificial kills, auto-completed objectives or time jumps.
  const touch = async (start, end = start, holdMs = 350, id = 41) => {
    touches.push({ at: Date.now(), kind: 'real-touch', from: start, to: end, holdMs });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id }] });
    if (end.x !== start.x || end.y !== start.y)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x, y: end.y, id }] });
    await wait(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const press = async (selector, holdMs = 550) => {
    const rect = await page.locator(selector).boundingBox({ timeout: 2500 });
    if (!rect) return false;
    await touch({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, undefined, holdMs);
    return true;
  };
  const move = async (dx, dy, duration = 1150) => {
    const rect = await page.locator('#touch .pad').first().boundingBox({ timeout: 1800 });
    if (!rect) return false;
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await touch({ x, y }, { x: x + dx, y: y + dy }, duration, 52);
    return true;
  };
  const look = async (dx, dy, duration = 250) => {
    await touch({ x: 540, y: 183 }, { x: 540 + dx, y: 183 + dy }, duration, 61);
  };
  try {
    browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
    context = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1
    });
    page = await context.newPage();
    cdp = await context.newCDPSession(page);
    page.on('pageerror', error => errors.push(String(error.message)));
    await page.goto('http://127.0.0.1:' + port, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mobile-kit[data-loaded="true"]', { timeout: 50000 });
    await page.locator('#mk-challenges [data-challenge-id="' + MODES[mode] + '"]').tap();
    check('actual-branch-selected',
      await page.locator('#mobile-kit').getAttribute('data-challenge') === MODES[mode],
      { expected: MODES[mode] });
    await screenshot('ready');
    await page.locator('#mk-start').tap();
    await page.waitForSelector('#mobile-kit[data-native-phase="running"]', { timeout: 55000 });
    await page.waitForFunction(() => document.documentElement.dataset.fpsActive === 'true', { timeout: 15000 });
    const start = await inspect();
    trace.push({ ...start, action: 'entered-real-native-game' });
    check('correct-real-weapon', mode === 'awm' ? start.weapon === 'awm' : start.challenge === 'survive',
      { weapon: start.weapon, challenge: start.challenge });
    await screenshot('combat');
    const startWall = Date.now();
    const MAX_WALL_MS = mode === 'awm' ? 420000 : 310000;
    let steps = 0, sawEnemy = false, travelSeen = 0, looked = false, validFire = false;
    if (mode === 'awm') {
      const scope = page.locator('#touch .btn[data-mk-action="scope"]');
      if (await scope.isVisible()) await scope.tap();
      await wait(700);
      const aimed = await inspect();
      trace.push({ ...aimed, action: 'scope-control' });
      check('native-awmscope-responds', aimed.scoped > 0, { scoped: aimed.scoped });
      await screenshot('scope');
    }
    while (Date.now() - startWall < MAX_WALL_MS && steps < (mode === 'awm' ? 110 : 120)) {
      const state = await inspect();
      if (steps % 3 === 0) trace.push({ ...state, action: 'ordinary-controls' });
      if (state.phase === 'finished') break;
      if (state.phase !== 'running') { await wait(400); continue; }
      steps++;
      if (mode === 'awm') {
        const target = page.locator('.mk-fps-enemy:not([hidden])').first();
        const visible = await target.isVisible().catch(() => false);
        const aimVisible = await page.locator('#mk-fps-target[data-side="enemy"]').isVisible().catch(() => false);
        if (visible || aimVisible) {
          sawEnemy = true;
          if (visible && shotCount === 0) await screenshot('visible-target');
          for (let n = 0; n < 4 && await target.isVisible().catch(() => false); n++) {
            const rect = await target.boundingBox({ timeout: 600 }).catch(() => null);
            if (!rect) break;
            // The HUD marker is above the head; its lower edge + 22px approximates
            // a chest, not an unobservable bot world position.
            const dx = Math.max(-76, Math.min(76, (rect.x + rect.width / 2 - 422) * 0.33));
            const dy = Math.max(-46, Math.min(46, (rect.y + rect.height + 22 - 195) * 0.33));
            if (Math.abs(dx) + Math.abs(dy) < 7) break;
            await look(dx, dy, 280);
            looked = true;
          }
          if (await press('#touch .btn[data-mk-action="fire"]', 1100)) {
            validFire = true; shotCount++;
          }
          if (shotCount > 0 && shotCount % 4 === 0)
            await press('#touch .btn[data-mk-action="reload"]', 400);
        } else {
          // Follow visible, authored route arrows. Never peek at a bot's
          // hidden position or change its navigation/state to score a kill.
          if (state.guide.startsWith('←') || state.guide.startsWith('→')) {
            await look(state.guide.startsWith('→') ? 57 : -57, 0, 400);
            looked = true;
          } else if (steps % 4 === 0) {
            await look(58, 0, 350);
            looked = true;
          } else {
            await move(0, -53, 1550);
          }
        }
      } else {
        // Reach 20m with real left-thumb movement, then keep evading until
        // the natural 45s timer expires. Readable HUD distance informs the QA.
        const value = /↗\s*(\d+)\s*\/\s*20m/u.exec(state.travelLabel);
        travelSeen = value ? Math.max(travelSeen, Number(value[1])) : travelSeen;
        const directions = [[0, -53], [53, 0], [0, 53], [-53, 0]];
        const pair = directions[Math.floor((steps - 1) / 4) % directions.length];
        await move(pair[0], pair[1], 1450);
        if (steps % 5 === 0) {
          await look(37, 0, 250);
          looked = true;
        }
        if (steps % 9 === 0) await press('#touch .btn[data-mk-action="fire"]', 700);
      }
    }
    const end = await inspect();
    trace.push({ ...end, action: 'final-real-game-state', touched: touches.length });
    await screenshot('end');
    check('real-touch-input-observed', touches.length > 0, { touches: touches.length });
    if (mode === 'awm') {
      check('enemy-located-via-visible-markers', sawEnemy, { sawEnemy, looked });
      check('actual-trigger-pressed', validFire && end.shots > 0, { taps: shotCount, nativeShots: end.shots });
      check('real-awm-kill-and-win', end.phase === 'finished' && end.outcome === 'won' &&
        end.awmKills >= 1 && end.kills >= 1,
      { phase: end.phase, outcome: end.outcome, kills: end.kills, awmKills: end.awmKills, hits: end.hits });
    } else {
      check('movement-20m-from-visible-hud', travelSeen >= 20 || /↗\s*(2\d|[3-9]\d)\s*\//u.test(end.travelLabel),
        { travelSeen, finalStatus: end.travelLabel, joystickSteps: steps });
      check('actual-survival-success', end.phase === 'finished' && end.outcome === 'won' &&
        end.deaths <= 2 && travelSeen >= 20,
      { phase: end.phase, outcome: end.outcome, deaths: end.deaths, gameTime: end.gameTime, travelSeen });
    }
    check('no-real-ad-misrepresented', !end.liveAd, { gameAdButtonVisible: end.liveAd });
  } catch (error) {
    errors.push(String(error.stack || error).slice(0,1800));
  } finally {
    report = {
      schemaVersion: 1, runId: RUN_ID, mode, buildHash: hash, authority: 'REAL_PINNED_THREEJS_HTTP_CHROMIUM_TOUCH',
      browser: 'Chromium software WebGL, mobile touch emulation, NOT physical device',
      checks, passed: errors.length === 0 && checks.length >= 6 && checks.every(item => item.passed),
      errors, touches, trace, screenshots, checkedAt: new Date().toISOString(),
      inputPolicy: 'only visible UI and touch actions; no player/enemy coordinate/stat/time injection',
      realPhone: 'NOT_RUN', humanBlindTest: 'NOT_RUN', liveIAA: 'NOT_INTEGRATED', publishable: false
    };
    await writeFile(path.join(root, 'cf-v4-' + mode + '.json'), JSON.stringify(report, null, 2) + '\n');
    if (cdp) await cdp.detach().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await reviewCfNaturalSuccess(process.argv[2]);
  console.log(JSON.stringify({ mode: result.mode, passed: result.passed,
    checks: result.checks, errors: result.errors, buildHash: result.buildHash }, null, 2));
  if (!result.passed) process.exitCode = 1;
}
