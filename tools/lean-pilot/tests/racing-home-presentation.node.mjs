/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAGES } from '../../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import { homeOrbitOffset } from '../../../templates/web-lite/h5-source-mobile-v1/racing/presentation.mjs';

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

test('V11.7 home hero restores a low mobile-safe moving shot without changing the native race camera', async () => {
  const { patchGeneratedCarPresentation } = await import('../racing-mobile-build.mjs');
  const native = [
    'function updateCamera(dt, st, cam) {',
    "    if (st === 'menu') {",
    '      this.demoT += dt;',
    '      target = this.racers[0];',
    '    }',
    '    if (!target) return;',
    "    if (st === 'menu' || (st === 'finish' && this.resultShown)) {",
    '      oldMenuOrbit();',
    '    }',
    '    const P = target;',
    '    originalRaceCamera();',
    '}',
  ].join('\n');
  const patched = patchGeneratedCarPresentation(native);
  assert.match(patched, /Original racer presentation camera/);
  assert.match(patched, /if \(st === 'menu'\) target = this\.racers\[0\]/);
  assert.match(patched, /const distance = 7\.3/);
  assert.match(patched, /const fov = 52/);
  assert.match(patched, /ty \+ 2\.78/);
  assert.match(patched, /start gantry \/ over-road structures/);
  assert.doesNotMatch(patched, /const distance = 10\.2/);
  assert.match(patched, /Math\.sin\(this\.time \* 0\.42\)/);
  assert.match(patched, /prefers-reduced-motion: reduce/);
  assert.match(patched, /const P = target;\s+originalRaceCamera\(\);/);
  assert.doesNotMatch(patched, /this\.scene\.add\(/, 'presentation must not allocate new scene geometry');
  assert.equal(patchGeneratedCarPresentation(patched), patched, 'patch must be idempotent');
  assert.throws(() => patchGeneratedCarPresentation('unrelated engine'), /anchor/);
});

test('V11.7 ready overlay keeps the car visible, noninteractive, and desktop garage compact', () => {
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\]::before\s*\{[^}]*pointer-events:none/);
  assert.match(mobileCss, /width:min\(36vw,545px\)/);
  assert.match(mobileCss, /width:min\(44vw,665px\)/);
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\] #race-car-choices button\s*\{min-height:68px;\}/);
  assert.match(mobileCss, /@media\(prefers-reduced-motion:reduce\)/);
});

test('V11.8 home fog uses reversible native uniforms and never changes the race-camera path', async () => {
  const { patchGeneratedCarPresentation, patchHomeAtmosphere } = await import('../racing-mobile-build.mjs');
  const source = [
    "    if (st === 'menu') {",
    '      this.demoT += dt;',
    '      target = this.racers[0];',
    '    }',
    '    if (!target) return;',
    "    if (st === 'menu' || (st === 'finish' && this.resultShown)) {",
    '      oldCameraOrbit();',
    '    }',
    '    const P = target;',
    '    nativeRaceCamera();',
  ].join('\n');
  const changed = patchHomeAtmosphere(patchGeneratedCarPresentation(source));
  assert.match(changed, /V11\.8 reversible home fog/);
  assert.match(changed, /this\.__homeFogNear = heroFog\.near/);
  assert.match(changed, /this\.__homeFogFar = heroFog\.far/);
  assert.match(changed, /st === 'menu' \|\| \(st === 'finish' && this\.resultShown\)/);
  assert.match(changed, /: this\.__homeFogNear/);
  assert.match(changed, /: this\.__homeFogFar/);
  assert.match(changed, /const P = target;\s+nativeRaceCamera\(\);/);
  assert.doesNotMatch(changed, /new THREE\.(?:SpotLight|PointLight|Mesh|Texture)/);
  assert.equal(patchHomeAtmosphere(changed), changed);
  assert.throws(() => patchHomeAtmosphere('unrecognized engine'), /anchor/);
});
test('V11.8 foreground tint stays menu-only and has no expensive backdrop filter', () => {
  assert.match(mobileCss, /V11\.8 showroom atmosphere/);
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\]::before/);
  const latest = mobileCss.slice(mobileCss.lastIndexOf('V11.8 showroom atmosphere'));
  assert.doesNotMatch(latest, /backdrop-filter\s*:/, 'no active full-screen backdrop filter declaration');
  assert.doesNotMatch(latest, /data-phase="race"/);
});

test('V11.9 native-canvas showcase drag is bounded and does not capture race controls', () => {
  assert.equal(homeOrbitOffset(0, 40), 0.104);
  assert.equal(homeOrbitOffset(0.18, 40), 0.2);
  assert.equal(homeOrbitOffset(-0.18, -40), -0.2);
  assert.equal(homeOrbitOffset(NaN, 0), 0);
  assert.equal(homeOrbitOffset(0.07, NaN), 0.07);
  assert.match(mobileSource, /const showcaseCanvas = document\.querySelector\('#gl'\)/);
  assert.match(mobileSource, /showcaseCanvas\.addEventListener\('pointerdown'/);
  assert.match(mobileSource, /phase !== 'ready' \|\| loading \|\| backgrounded/);
  assert.match(mobileSource, /event\.clientX > window\.innerWidth \* 0\.46/);
  assert.match(mobileSource, /g\.__homeLookOffset = homeOrbitOffset\(/);
  assert.match(mobileSource, /pointercancel', 'lostpointercapture/);
  const stageTag = mobileSource.match(/\$\('stage-tag'\)\.textContent = [\s\S]*?;/)?.[0];
  assert.ok(stageTag && !stageTag.includes('V11.6'), 'home must not display a development version label');
  assert.match(mobileCss, /V11\.9 garage focus/);
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\] #race-export::after/);
  assert.match(mobileCss, /#race-kit\[data-phase="ready"\] #race-guide \.race-guide-keys \{display:none;\}/);
});

test('V11.9 camera and parked glow are presentation-only, with untouched game projection', async () => {
  const { patchGeneratedCarPresentation } = await import('../racing-mobile-build.mjs');
  const native = [
    "    if (st === 'menu') {",
    '      this.demoT += dt;',
    '      target = this.racers[0];',
    '    }',
    '    if (!target) return;',
    "    if (st === 'menu' || (st === 'finish' && this.resultShown)) {",
    '      oldOrbit();',
    '    }',
    '    const P = target;',
    '    nativeRaceFollowCamera();',
  ].join('\n');
  const changed = patchGeneratedCarPresentation(native);
  assert.match(changed, /const userOrbit = Math\.max\(-0\.2, Math\.min\(0\.2, this\.__homeLookOffset \|\| 0\)\)/);
  assert.match(changed, /heroGlow\.opacity = 0\.24/);
  assert.match(changed, /const P = target;\s+nativeRaceFollowCamera\(\);/);
  assert.doesNotMatch(changed, /new THREE\.(?:Mesh|Texture|Light)/);
  assert.equal(patchGeneratedCarPresentation(changed), changed);
});

test('V11.10 start gate and blue urban arch disappear ONLY in the home/result hero', async () => {
  const { patchHomeOccluderProps, patchHomeOccluderCamera } = await import('../racing-mobile-build.mjs');
  const reference = [
    'function buildStartGate(parent, track, style) {',
    '  const s = track.sample(0, {});',
    '  const grp = new THREE.Group();',
    '  const H = style.h || 11;',
    '  parent.add(grp);',
    '}',
    'function buildArchBridge(ctx, d, color) {',
    '  const { track, parent } = ctx;',
    '    parent.add(hanger);',
    '    parent.add(arch);',
    '    parent.add(beam);',
    '}',
    '// ======================= 情迷爱琴海 =======================',
  ].join('\n');
  const changed = patchHomeOccluderProps(reference);
  assert.match(changed,/grp\.name = 'race-start-gantry'/);
  assert.match(changed,/archRoot\.name = 'race-home-arch-occluder'/);
  for (const name of ['hanger','arch','beam']) assert.match(changed,new RegExp('archRoot\\.add\\('+name+'\\)'));
  assert.equal((changed.match(/parent\.add\(archRoot\)/g)||[]).length,1);
  assert.equal(patchHomeOccluderProps(changed),changed);
  assert.throws(()=>patchHomeOccluderProps(reference.replace('    parent.add(arch);','    unknown.add(arch);')),/anchor changed/);
  assert.throws(()=>patchHomeOccluderProps(reference.replace('  const H = style.h || 11;','  const H = 12;')),/anchor changed/);
  const camera = '    // V11.8 reversible home fog\n    const heroFog = this.scene?.fog;';
  const built = patchHomeOccluderCamera(camera);
  assert.match(built,/this\.__homeOccluderTrack !== this\.track/);
  assert.match(built,/this\.scene\.getObjectByName\(name\)/);
  assert.match(built,/node\.visible = !hideFromHero/);
  assert.match(built,/st === 'menu' \|\| \(st === 'finish' && this\.resultShown\)/);
  assert.equal(patchHomeOccluderCamera(built),built);
  assert.throws(()=>patchHomeOccluderCamera('unrelated native camera'),/anchor changed/);
});

