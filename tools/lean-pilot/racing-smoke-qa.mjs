/* global process, console, window, document, getComputedStyle, URL */
import { webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(ROOT, 'runs/h5-qq-mobile-20261013/evidence', process.env.RACE_UI_QA_LABEL ?? (process.argv.includes('--red') ? 'ui-red' : 'smoke'));
await mkdir(out, { recursive: true });
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:4334');
  await page.waitForFunction(() => window.game?.track && !window.game.loading, null, { timeout: 45000 });
  const button = page.locator('#race-start, #mk-start').first();await button.waitFor({ state: 'visible' });
  const colors = await button.evaluate(el => { const style = getComputedStyle(el);return { color: style.color, background: style.backgroundColor }; });
  const luminance = value => value.match(/[\d.]+/gu).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const a = luminance(colors.color), b = luminance(colors.background), contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  checks.push({ name: 'primary-action-text-readable', passed: contrast >= 4.5, evidence: { ...colors, contrast } });
  await button.tap();
  await page.waitForFunction(() => window.game.state === 'race', { timeout: 45000 });
  await page.screenshot({ path: out + '/race-844x390.png' });
  const observed = await page.evaluate(() => {
    const visible = el => !!el?.getClientRects().length && getComputedStyle(el).display !== 'none';
    const rects = [...document.querySelectorAll('#bigrank,#lapbox,#timebox,#minimap,#gaugebox,#race-pause,[data-race-direction]')].filter(visible).map(el => ({ id: el.id, rect: el.getBoundingClientRect().toJSON() }));
    return { state: window.game.state, visibleButtons: [...document.querySelectorAll('button')].filter(visible).map(el => el.id), legacyTouch: [...document.querySelectorAll('#touch .tb')].filter(visible).length, duplicateHud: visible(document.querySelector('#mobile-kit')), legacyRanks: visible(document.querySelector('#rank')), rects, quality: window.game.settings.quality };
  });
  checks.push({ name: 'only-two-driving-buttons-and-pause', passed: observed.visibleButtons.length === 3 && ['race-left', 'race-right', 'race-pause'].every(id => observed.visibleButtons.includes(id)), evidence: observed });
  checks.push({ name: 'no-legacy-hud-or-touch', passed: !observed.duplicateHud && !observed.legacyTouch && !observed.legacyRanks, evidence: observed });
  checks.push({ name: 'compact-race-timer', passed: observed.rects.find(item => item.id === 'timebox')?.rect.width <= 130, evidence: observed.rects.find(item => item.id === 'timebox') });
  checks.push({ name: 'hud-stays-out-of-central-driving-view', passed: observed.rects.every(({ rect: r }) => r.left >= 0 && r.top >= 0 && r.right <= 844 && r.bottom <= 390 && !(r.left < 590 && r.right > 255 && r.top < 300 && r.bottom > 110)), evidence: observed.rects });
} catch (error) { errors.push(error.message); }
await writeFile(out + '/report.json', JSON.stringify({ schemaVersion: 1, checks, errors, passed: checks.length === 5 && checks.every(c => c.passed) && !errors.length, normalTouchInput: true, viewport: { width: 844, height: 390 }, checkedAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ checks: checks.map(({ name, passed }) => ({ name, passed })), errors }));
await browser.close();if (checks.length !== 5 || checks.some(c => !c.passed) || errors.length) process.exitCode = 1;
