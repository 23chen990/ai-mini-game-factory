/* global process, console, window, document, URL */
/** Browser check against THE PUBLIC HTTPS URL, not a local server or CI ZIP. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

export async function verifyExternalRacingPreview(url, output) {
  if (!/^https:\/\/(?:raw\.githack\.com\/|[a-z0-9-]+\.github\.io\/)/i.test(url)) throw Error('Unexpected external preview host');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 1,
  });
  // The source HTML host intercepts first-time browser documents with a
  // security confirmation. This cookie reproduces an ALREADY-CONFIRMED session;
  // it does not prove that a fresh human can open the URL without an extra step.
  if (new URL(url).hostname === 'raw.githack.com') {
    await context.addCookies([{ name:'__Http-phish', value:'1',
      domain:'raw.githack.com', path:'/23chen990/ai-mini-game-factory/',
      secure:true, httpOnly:true, sameSite:'Lax' }]);
  }
  const page = await context.newPage(), errors = [], observations = [];
  page.on('pageerror', error => errors.push(error.message));
  let success = false, problem = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(response?.status(), 200, 'External preview did not return HTTP 200');
    await page.waitForFunction(() => {
      const root = document.querySelector('#race-kit');
      return root?.dataset.loaded === 'true' &&
        root?.querySelector('#race-start')?.disabled === false &&
        !!window.game?.track && !!window.game?.player === false;
    }, null, { timeout: 95000 });
    for (const [width, height] of [[844,390], [740,360]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('#race-panel');
        const map = document.querySelector('.race-track-diagram');
        const box = panel.getBoundingClientRect();
        return { rect: box.toJSON(), scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
          mapShown: !!map && map.getBoundingClientRect().width > 75,
          phase: document.querySelector('#race-kit').dataset.phase,
        };
      });
      assert.equal(layout.phase, 'ready');
      assert.ok(layout.mapShown, 'Course preview missing on phone');
      assert.ok(layout.scrollHeight <= layout.clientHeight + 12, 'Landscape garage requires internal scrolling');
      assert.ok(layout.rect.left >= 0 && layout.rect.top >= 0 &&
        layout.rect.right <= width && layout.rect.bottom <= height, 'Race garage clipped');
      observations.push({ state: 'ready', width, height, layout });
      await page.screenshot({ path: output + '/garage-' + width + 'x' + height + '.png' });
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#race-start').tap();
    await page.waitForFunction(() => window.game?.state === 'race' &&
      !document.querySelector('#race-controls').hidden, null, { timeout: 95000 });
    const left = await page.locator('#race-left').boundingBox();
    assert.ok(left && left.width >= 70, 'No reliable left-thumb touch zone');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1}],
    });
    await page.waitForFunction(() => document.querySelector('#race-left')?.getAttribute('aria-pressed') === 'true',
      null, { timeout: 12000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const hud = await page.evaluate(() => {
      const a = document.querySelector('#gaugebox')?.getBoundingClientRect();
      const b = document.querySelector('#race-progress')?.getBoundingClientRect();
      const overlap = !!a && !!b && a.left < b.right && b.left < a.right &&
        a.top < b.bottom && b.top < a.bottom;
      return { progress: window.game?.player?.progress ?? 0,
        visibleControls: !document.querySelector('#race-controls').hidden,
        gaugeOverlap: overlap,
        realNativeTrack: !!window.game?.track?.__RACE_COURSE_ID,
        phase: document.querySelector('#race-kit').dataset.phase };
    });
    assert.equal(hud.phase, 'race');
    assert.ok(hud.visibleControls && !hud.gaugeOverlap && hud.realNativeTrack,
      'Game HUD collision or invalid actual game runtime');
    observations.push({ state: 'race', hud, touchObserved: true });
    await page.screenshot({path: output + '/race-844x390.png'});
    await page.locator('#race-pause').tap();
    await page.waitForFunction(() => window.game?.state === 'paused', null, {timeout: 12000});
    await page.screenshot({path: output + '/pause-844x390.png'});
    observations.push({state:'paused',normalPause:true});
    assert.deepEqual(errors, [], 'Uncaught errors during normal HTTPS browser play');
    success = true;
  } catch (error) {
    problem = String(error.stack || error);
    try {
      const debug = await page.evaluate(() => {
        const root = document.querySelector('#race-kit'),game=window.game;
        return {title:document.title,url:document.URL,loaded:root?.dataset.loaded,
          error:root?.dataset.error,readyDisabled:root?.querySelector('#race-start')?.disabled,
          gameState:game?.state,player:!!game?.player,track:!!game?.track,
          bodyExcerpt:document.body?.innerText?.slice(0,500)};
      });
      observations.push({state:'failure-diagnostic',debug});
      await page.screenshot({path:output+'/failure-diagnostic.png'}).catch(()=>{});
    } catch { /* A failed page navigation should not erase original error. */ }
  }
  finally {
    const report = {gameId:'qq-speed', externalUrl:url, browser:'Chromium WebGL software',
      testType:'remote HTTPS Chromium with confirmed raw.githack safety cookie when applicable; NOT first-click readiness, full career or physical-phone test',
      success, observations, errors, problem, testedAt:new Date().toISOString()};
    await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
    await context.close(); await browser.close();
    console.log(JSON.stringify(report));
  }
  if (!success) throw Error(problem || 'Unknown external preview failure');
}
if (process.argv[1] && process.argv[1].endsWith('racing-external-preview-qa.mjs')) {
  const [url, output] = process.argv.slice(2);
  if (!url || !output) throw Error('Usage: node racing-external-preview-qa.mjs <external-url> <evidence-folder>');
  await verifyExternalRacingPreview(url, output);
}
