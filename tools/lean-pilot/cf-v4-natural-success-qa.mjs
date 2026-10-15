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
      scopeReady:p?.scopeReady === true,
      position:p?{x:+p.pos.x.toFixed(2),z:+p.pos.z.toFixed(2),yaw:+p.yaw.toFixed(3)}:null,
      shots: p?.stats?.shots ?? 0, hits: p?.stats?.hits ?? 0, kills: p?.stats?.k ?? 0,
      deaths: p?.stats?.d ?? 0, awmKills: game?.__mkAwmKills ?? 0,
      travelLabel: document.getElementById('mk-status')?.textContent ?? '',
      visibleEnemies,
      firstTrainingScoutRange:game?.__mobileBalanceReview?.trainingScoutRange??null,
      sniperScout:game?.__mobileBalanceReview?.sniperScout===true,
      visibleAllyTags:(game?.tags||[]).filter(t=>t.__mkAllyLabel && t.sprite?.material?.opacity>.01).length,
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
  // Read *rendered DOM* geometry, never hidden actor world coordinates.
  // Playwright locator.boundingBox() can exceed short timeouts during software WebGL.
  const visibleRect = async selector => page.evaluate(query => {
    const el = document.querySelector(query);
    if (!el || el.hidden || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0
      ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, selector);
  const press = async (selector, holdMs = 550) => {
    const rect = await visibleRect(selector);
    if (!rect) return false;
    await touch({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, undefined, holdMs);
    return true;
  };
  const move = async (dx, dy, duration = 1150) => {
    const rect = await visibleRect('#touch .pad');
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
    let afterInitialLook=start;
    if(mode==='awm'){
      const valid=start.sniperScout && Number.isFinite(start.firstTrainingScoutRange) &&
        start.firstTrainingScoutRange>=7 && start.firstTrainingScoutRange<=18;
      check('awm-actual-clear-opening-spawn',valid,{
        stagedNativeSniperScout:start.sniperScout,
        actualVisibleLaneMeters:start.firstTrainingScoutRange,
        playerPosition:start.position
      });
      if(!valid)throw Error('Real AWM opening lane failed nav+occlusion checks; do not waste 90 simulation seconds');
      // A small right-thumb look swipe previously synthesized native desktop
      // canvas mousedown, firing TWO genuine sniper shots without fire taps.
      // Explicitly reject that unintended combat path BEFORE aiming/shooting.
      await look(6,3,160);
      await wait(270);
      afterInitialLook=await inspect();
      const clean=afterInitialLook.shots===start.shots;
      check('awm-aim-swipe-never-fires-without-button',clean,{
        nativeShotsBefore:start.shots,nativeShotsAfter:afterInitialLook.shots,
        input:'ONLY_VISIBLE_RIGHT_THUMB_AIM_SWIPE'
      });
      if(!clean)throw Error('Aim swipe produced an unintended native shot; touch compatibility bug persists');
    }
    // A screenshot here delayed the first visible AWM enemy until it vanished.
    // Preserve it after input rather than spend the only opening sightline.
    if(mode!=='awm')await screenshot('combat');
    let firstObservation=mode==='awm'?afterInitialLook:null;
    const startWall = Date.now();
    const MAX_WALL_MS = mode === 'awm' ? 620000 : 310000;
    let steps = 0, sawEnemy = false, travelSeen = 0, looked = false, validFire = false;
    let lastActualAwmShotAt=-Infinity;
    let scopedObserved = false;
    if (mode === 'awm') {
      // Start unscoped: AWM's narrow scope made the visible enemy badge
      // appear outside the actual lens in the previous negative test.
      check('native-awmscope-control-visible',
        await page.locator('#touch .btn[data-mk-action="scope"]').isVisible());
    }
    while (Date.now() - startWall < MAX_WALL_MS && steps < (mode === 'awm' ? 220 : 120)) {
      const state = firstObservation || await inspect();
      firstObservation = null;
      if (steps % 3 === 0) trace.push({ ...state, action: 'ordinary-controls' });
      if (state.phase === 'finished') break;
      if (state.phase !== 'running') { await wait(400); continue; }
      steps++;
      if (mode === 'awm') {
        // After an AWM shot the REAL game enters a 1.35 simulation second
        // bolt cycle and automatically re-scopes. Do not accidentally toggle
        // zoom or run away from an injured target during the bolt animation.
        if(state.alive && state.gameTime-lastActualAwmShotAt < 1.9){
          await wait(260);
          continue;
        }
        const target = page.locator('.mk-fps-enemy:not([hidden])').first();
        const visible = await target.isVisible().catch(() => false);
        const aimVisible = await page.locator('#mk-fps-target[data-side="enemy"]').isVisible().catch(() => false);
        if (visible || aimVisible) {
          sawEnemy = true;
          // Do not pause the first target for a costly WebGL screenshot before aiming.
          // Wide-angle scan first; a red DOM badge is a genuinely visible,
          // wall-unoccluded marker. Do not read any actor world coordinates.
          if(state.scoped===0){
            for(let n=0;n<14 && await target.isVisible().catch(()=>false);n++){
              const rect=await visibleRect('.mk-fps-enemy:not([hidden])');
              if(!rect)break;
              const x=rect.x+rect.width/2-422, y=rect.y+rect.height+10-195;
              if(Math.abs(x)<24 && Math.abs(y)<28)break;
              await look(Math.max(-96,Math.min(96,x*.64)),
                Math.max(-54,Math.min(54,y*.64)),200);
              looked=true;
            }
            const aligned=await visibleRect('.mk-fps-enemy:not([hidden])');
            const centered=!!aligned && Math.abs(aligned.x+aligned.width/2-422)<52 &&
              Math.abs(aligned.y+aligned.height+10-195)<58;
            if(centered){
              await press('#touch .btn[data-mk-action="scope"]',260);
              await wait(850);
            }
          }
          let current=await inspect();
          if(current.scoped>0){
            scopedObserved=true;
            // Scoped FOV is narrower. Fine-tune using the marker's *rendered*
            // relative chest position until the target actually meets reticle.
            for(let n=0;n<14;n++){
              const rect=await visibleRect('.mk-fps-enemy:not([hidden])');
              if(!rect)break;
              const x=rect.x+rect.width/2-422,y=rect.y+rect.height+10-195;
              if(Math.abs(x)<=9 && Math.abs(y)<=13)break;
              await look(Math.max(-66,Math.min(66,x*.72)),
                Math.max(-42,Math.min(42,y*.69)),190);
              looked=true;
            }
            const aligned=await visibleRect('.mk-fps-enemy:not([hidden])');
            current=await inspect();
            const centered=!!aligned && Math.abs(aligned.x+aligned.width/2-422)<=13 &&
              Math.abs(aligned.y+aligned.height+10-195)<=18;
            const exactAim=current.targetSide==='enemy';
            if(centered || exactAim){
              // Normal weapon readiness and player input; the native original
              // rifle alone decides hit, damage, recoil and whether to award a kill.
              if(await press('#touch .btn[data-mk-action="fire"]',400)){
                validFire=true;shotCount++;
                const afterShot=await inspect();
                if(afterShot.shots>current.shots)lastActualAwmShotAt=afterShot.gameTime;
                trace.push({...afterShot,action:'normal-scoped-trigger',
                  onScreenCentered:centered,onScreenAimed:exactAim,
                  targetRect:aligned});
                // Screenshot on software WebGL cost almost TEN game seconds in
                // the previous real run, letting the target disappear and the
                // player die before a follow-up shot. Capture terminal only.
              }
            }else if(!aligned && !exactAim){
              // Two-stage sniper optics: one tap zooms 1→2, only 2→0 exits.
              // Keep both steps as ordinary visible touch-button inputs.
              for(let z=0;z<2;z++){
                const stage=await inspect();
                if(stage.scoped===0)break;
                await press('#touch .btn[data-mk-action="scope"]',230);
                await wait(230);
              }
            }
          }
          if (shotCount > 0 && shotCount % 4 === 0)
            await press('#touch .btn[data-mk-action="reload"]', 400);
        } else {
          if(state.scoped>0){
            // Reacquire in wide view, rather than wandering with a 30/11° lens.
            for(let z=0;z<2;z++){
              const stage=await inspect();
              if(stage.scoped===0)break;
              await press('#touch .btn[data-mk-action="scope"]',230);
              await wait(230);
            }
            continue;
          }
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
    if(mode==='awm')check('native-awmscope-responds',scopedObserved,{scopedObserved});
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
    check('ally-tags-hidden-on-result',end.phase!=='finished' || end.visibleAllyTags===0,
      {phase:end.phase,visibleAllyTags:end.visibleAllyTags});
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
