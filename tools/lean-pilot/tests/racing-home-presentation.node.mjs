/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAGES } from '../../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';

const mobileSource = readFileSync(fileURLToPath(new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/mobile.mjs', import.meta.url)), 'utf8');
const mobileCss = readFileSync(fileURLToPath(new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/mobile.css', import.meta.url)), 'utf8');

test('single home keeps the existing 30 stages and places their rail outside the menu panel', () => {
  assert.equal(STAGES.length, 30);
  assert.match(mobileSource, /for \(let index = 0; index < STAGES\.length; index\+\+\)/);
  const panelEnd = mobileSource.indexOf('</div><section id="race-garage"');
  const garageEnd = mobileSource.indexOf('</section><nav id="race-stage-rail"');
  const railStart = mobileSource.indexOf('<nav id="race-stage-rail"');
  assert.ok(panelEnd >= 0 && garageEnd > panelEnd && railStart > garageEnd);
  assert.match(mobileSource, /<nav id="race-stage-rail"[^>]*aria-label="主线关卡"/);
  assert.match(mobileSource, /id="race-stage"[^>]*class="race-native-stage-select"/);
  assert.doesNotMatch(mobileSource.match(/<select id="race-stage"[^>]*>/)[0], /\shidden(?:\s|>)/);
});

test('rail mirrors the existing select options and lock gate instead of creating stage progression', () => {
  assert.match(mobileSource, /for \(const option of \[\.\.\.\$\('stage'\)\.options\]\.filter\(option => option\.value !== 'daily'\)\)/);
  assert.match(mobileSource, /button\.disabled = option\.disabled/);
  assert.match(mobileSource, /button\.dataset\.starLocked = String\(gate\.starLocked\)/);
  assert.match(mobileSource, /button\.setAttribute\('aria-label', option\.textContent\)/);
  assert.match(mobileSource, /gate\.starLocked \? '🔒 ' \+ gate\.earned \+ '\/' \+ gate\.required \+ '★' : '🔒 未解锁'/);
  assert.match(mobileSource, /if\(gate\?\.starLocked\)\s*\{[\s\S]*?gateSelectionIndex=index;renderLobby\(\);return;/);
  assert.match(mobileSource, /\$\('stage'\)\.addEventListener\('change'/);
  assert.match(mobileSource, /id="race-start"/);
  assert.match(mobileSource, /id="race-replay"/);
  assert.match(mobileSource, /id="race-next"/);
  assert.match(mobileSource, /id="race-lobby"/);
  assert.match(mobileSource, /\$\('replay'\)\.addEventListener\('click'/);
});

test('stage rail clicks dispatch the existing select change and are ready-only', () => {
  const railClick = mobileSource.match(/\$\('stage-rail'\)\.addEventListener\('click', event => \{([\s\S]*?)\n\}\);/);
  assert.ok(railClick);
  assert.match(railClick[1], /\$\('stage'\)\.value = choice\.dataset\.stageValue/);
  assert.match(railClick[1], /dispatchEvent\(new window\.Event\('change', \{ bubbles: true \}\)\)/);
  assert.doesNotMatch(railClick[1], /career\.(?:setStage|setDaily)\(/);
  assert.match(mobileSource, /\$\('stage-rail'\)\.hidden = next !== 'ready'/);
});

test('responsive home keeps 55 percent clear for the car and a touch-scrollable 44px stage rail', () => {
  assert.match(mobileCss, /@media\s*\(min-width:\s*650px\)\s*and\s*\(orientation:\s*landscape\)/);
  assert.match(mobileCss, /width:\s*min\(40vw,\s*575px\)/);
  assert.match(mobileCss, /max-height:\s*calc\(100% - var\(--race-top\) - var\(--race-bottom\) - 96px\)/);
  assert.match(mobileCss, /\.race-stage-choices[\s\S]*?overflow-x:\s*auto[\s\S]*?scroll-snap-type:\s*x\s+mandatory[\s\S]*?touch-action:\s*pan-x/);
  assert.match(mobileCss, /\.race-stage-choice[\s\S]*?min-height:\s*56px[\s\S]*?scroll-snap-align:\s*start/);
  assert.match(mobileCss, /\.race-stage-choice[\s\S]*?touch-action:\s*pan-x/);
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\] #race-panel,[\s\S]*?#race-kit\[data-phase="finished"\] #race-panel[\s\S]*?width:min\(40vw,575px\)/);
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\] \.race-actions button \{min-height:44px;\}/);
});

test('native stage select remains visually hidden but accessible, and portrait retains rotation guidance', () => {
  assert.match(mobileCss, /\.race-native-stage-select\s*\{[^}]*position:\s*absolute[^}]*width:\s*1px[^}]*height:\s*1px[^}]*clip/);
  assert.doesNotMatch(mobileCss, /\.race-native-stage-select\s*\{[^}]*display:\s*none/);
  assert.match(mobileCss, /\.race-native-stage-select:focus-visible\s*\{[^}]*clip-path:none/);
  assert.match(mobileSource, /const orient = \(\) => \{ syncScreenPresentation\(\);\$\('rotate'\)\.hidden = !portrait\(\);/);
  assert.match(mobileCss, /#race-rotate\s*\{[^}]*position:absolute[^}]*inset:0/);
});

test('daily challenge is a separate visible rail choice mirroring its native option', () => {
  assert.ok(/for \(const option of \[\.\.\.\$\('stage'\)\.options\]\.filter\(option => option\.value !== 'daily'\)\)/.test(mobileSource));
  assert.ok(/const dailyOption = \[\.\.\.\$\('stage'\)\.options\]\.find\(option => option\.value === 'daily'\)/.test(mobileSource));
  const mainChoice = mobileSource.match(/for \(const option of \[\.\.\.\$\('stage'\)\.options\]\.filter\(option => option\.value !== 'daily'\)\) \{([\s\S]*?)button\.className = 'race-stage-choice';([\s\S]*?)choices\.append\(button\);/);
  assert.ok(mainChoice);
  const dailyChoice = mobileSource.match(/const dailyOption = \[\.\.\.\$\('stage'\)\.options\][\s\S]*?choices\.append\(button\);/);
  assert.ok(dailyChoice);
  assert.match(dailyChoice[0], /button\.className = 'race-daily-choice'/);
  assert.doesNotMatch(dailyChoice[0], /race-stage-choice/);
  assert.match(dailyChoice[0], /button\.dataset\.stageValue = dailyOption\.value/);
  assert.match(dailyChoice[0], /button\.disabled = dailyOption\.disabled/);
  assert.match(dailyChoice[0], /button\.setAttribute\('aria-label', dailyOption\.textContent\)/);
  assert.match(dailyChoice[0], /const selected = dailyOption\.value === \$\('stage'\)\.value/);
  assert.match(dailyChoice[0], /button\.setAttribute\('aria-pressed', String\(selected\)\)/);
  assert.match(dailyChoice[0], /button\.classList\.toggle\('selected', selected\)/);
  assert.match(dailyChoice[0], /state\.textContent = dailyOption\.textContent/);
  assert.ok(/#race-kit \.race-stage-choice,\s*#race-kit \.race-daily-choice[\s\S]*?min-height:\s*56px[\s\S]*?scroll-snap-align:\s*start/.test(mobileCss));
  assert.ok(/\$\('stage-rail'\)\.addEventListener\('click', event => \{[\s\S]*?\$\('stage'\)\.value = choice\.dataset\.stageValue;[\s\S]*?dispatchEvent\(new window\.Event\('change', \{ bubbles: true \}\)\)/.test(mobileSource));
});

test('home repair resets the old briefing grid and outranks desktop panel width', () => {
  assert.match(mobileCss, /html\[data-race-mobile\]\[data-race-platform\] #race-kit\[data-phase="ready"\] #race-panel/);
  assert.match(mobileCss, /display:block;grid-template-columns:none;grid-template-areas:none/);
});

test('740x360 sidebar keeps selectors on one row and removes only decorative briefing text', () => {
  assert.match(mobileCss, /max-height:375px[\s\S]*?#race-stage-tag \{max-width:80px;\}/u);
  assert.match(mobileCss, /#race-panel>\.race-eyebrow \{display:none;\}/u);
});
