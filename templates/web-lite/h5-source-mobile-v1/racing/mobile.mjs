/* global window, document, navigator, localStorage, performance, requestAnimationFrame, setTimeout */
import { RaceDriver, TouchSteering } from './driver.mjs';
import { RacingCareer } from './runtime.mjs';
import { STAGES, SKIN_NAMES, SKIN_STARS, careerStars, stageUnlocked, skinUnlocked } from './career.mjs';
import { clearNativeInput, settleNative, QualityMonitor, raceReady, tuneRaceFx } from './session.mjs';
const MAPS = [{ id: 'city', name: '城市巡回' }, { id: 'aegean', name: '海滨山城' }, { id: 'egypt', name: '沙漠冲刺' }, { id: 'snow', name: '雪地探险' }];
const time = seconds => seconds == null ? '未完成' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const mobile = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer:coarse)').matches;
const root = document.createElement('section'); root.id = 'race-kit'; root.dataset.phase = 'ready';
root.innerHTML = `<button id="race-pause" aria-label="暂停比赛" hidden><span aria-hidden="true">Ⅱ</span></button>
  <div id="race-live-goal" hidden></div><div id="race-controls" hidden><button id="race-left" data-race-direction="left" aria-label="按住向左转" aria-pressed="false"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M29 11 16 24l13 13"/></svg></button><button id="race-right" data-race-direction="right" aria-label="按住向右转" aria-pressed="false"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m19 11 13 13-13 13"/></svg></button></div>
  <div id="race-panel" role="dialog" aria-label="赛车菜单"><div class="race-eyebrow">3D 赛车 · 双键驾驶</div><h1 id="race-heading">双键飞驰</h1>
    <div id="race-guide"><div class="race-guide-keys" aria-hidden="true"><span>‹</span><span>›</span></div><p>按住左右转弯，松手回正<br><small>漂移、出弯小喷和氮气自动触发</small></p></div>
    <div id="race-ready"><label for="race-stage">关卡</label><select id="race-stage" aria-label="选择已解锁关卡"></select><select id="race-map" hidden>${MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select><span class="race-round-tag" id="race-stage-tag"></span><label for="race-skin">车身</label><select id="race-skin" aria-label="已解锁车身颜色"></select></div><p id="race-stage-goal"></p><div id="race-fuel-box"><span id="race-fuel-info"></span><button id="race-fuel-ad" hidden>观看广告 · 加油 +2</button></div>
    <p id="race-result-copy" hidden></p><div id="race-result-stats" hidden></div><ol id="race-results" hidden></ol>
    <div id="race-settings" hidden><label for="race-quality">画质</label><select id="race-quality"><option value="low">流畅</option><option value="mid">均衡</option><option value="high">清晰</option></select><small id="race-quality-note">均衡画质，性能不足时自动调低</small></div>
    <div class="race-actions"><button id="race-start" disabled>赛道准备中…</button><button id="race-resume" hidden>继续比赛</button><button id="race-replay" hidden>再来一次</button><button id="race-next" class="race-secondary" hidden>下一场 →</button><button id="race-restart" class="race-secondary" hidden>重新开始</button></div>
    <p id="race-note">漂移集气，干净出弯更容易获得完美小喷</p>
  </div><aside id="race-rotate" hidden role="alert"><div class="race-phone" aria-hidden="true">↻</div><b>横过来，准备出发</b><span>左右拇指各管一键</span><small>转回横屏后，点击继续比赛</small></aside>`;
document.body.append(root);
const $ = id => root.querySelector('#race-' + id);
const pointers = new TouchSteering(), driver = new RaceDriver(), quality = new QualityMonitor();
driver.enabled = mobile;
let g, phase = 'ready', started = false, result = null, loading = true, previousRank = null, lastFrame = performance.now(), inputTime = performance.now(), noticeUntil = 0;
let events = [], best = {};
const STORE = 'h5-qq-mobile-20261013:two-button:v1';
try { best = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { best = {}; }
let storageRef;
try { storageRef = localStorage; }
catch { storageRef = { getItem() { throw Error('本地存储不可用'); }, setItem() { throw Error('本地存储不可用'); } }; }
const career = new RacingCareer(storageRef, best);
function fuelView() {
  $('fuel-info').textContent = career.fuelText();
  $('fuel-ad').hidden = !career.canOfferAd();
  $('fuel-ad').disabled = career.adBusy;
}
function renderLobby() {
  const stage = career.stage;
  $('stage').replaceChildren();
  for (let index = 0; index < STAGES.length; index++) {
    const s = STAGES[index], open = stageUnlocked(career.progress, index);
    const option = document.createElement('option');
    option.value = String(index);option.disabled = !open;
    const stars = career.progress.stars[s.id] ?? 0;
    option.textContent = open ? (s.id + ' · ' + s.name + ' ' + '★'.repeat(stars)) : ('🔒 ' + s.id + ' · ' + s.name);
    $('stage').append(option);
  }
  $('stage').value = String(career.index);
  $('stage-tag').textContent = '第 ' + stage.chapter + ' 章 · ' + stage.laps + ' 圈 · ' + (stage.mode === 'item' ? '道具赛' : '竞速赛') + ' · 6 车起步';
  $('stage-goal').textContent = '目标：' + stage.goal + ' · 累计 ' + careerStars(career.progress) + ' 星';
  $('skin').replaceChildren();
  for (let i = 0; i < SKIN_NAMES.length; i++) {
    const opt = document.createElement('option');opt.value = String(i);opt.disabled = !skinUnlocked(career.progress, i);
    opt.textContent = SKIN_NAMES[i] + (opt.disabled ? ' · 需 ' + SKIN_STARS[i] + ' 星' : '');$('skin').append(opt);
  }
  $('skin').value = String(career.progress.skin);
  fuelView();
}
Object.defineProperty(window, '__RACE_EVIDENCE__', { get: () => ({ events: events.map(e => ({ ...e })), phase, mode: driver.enabled ? 'two-button' : 'keyboard', quality: g?.settings.quality }) });
const portrait = () => window.innerHeight > window.innerWidth;
function releaseInput() {
  pointers.clear(); driver.suspend();
  if (g) clearNativeInput(g.input);
  for (const button of root.querySelectorAll('[data-race-direction]')) { button.classList.remove('held'); button.setAttribute('aria-pressed', 'false'); }
}
function display(next) {
  phase = next; root.dataset.phase = next;
  const racing = next === 'race' || next === 'countdown';
  $('panel').hidden = racing; $('controls').hidden = !racing; $('pause').hidden = !racing;
  $('start').hidden = next !== 'ready'; $('resume').hidden = next !== 'paused'; $('restart').hidden = next !== 'paused';
  $('replay').hidden = next !== 'finished'; $('next').hidden = next !== 'finished' || career.nextStage() === career.index;
  $('guide').hidden = next !== 'ready' || career.progress.rounds > 0; $('ready').hidden = next !== 'ready'; $('settings').hidden = next !== 'paused';
  for (const id of ['result-copy', 'result-stats', 'results']) $(id).hidden = next !== 'finished';
  $('note').hidden = next === 'finished';$('live-goal').hidden = !(next === 'race' && ['time','relay'].includes(career.stage.kind));
  for (const button of root.querySelectorAll('[data-race-direction]')) button.disabled = next !== 'race';
  if (next === 'paused') { $('heading').textContent = '休息一下'; $('quality').value = g.settings.quality; $('note').textContent = '已松开所有按键，准备好再继续'; }
}
function feedback(text, kind = 'boost') {
  if (!g || (phase !== 'race' && phase !== 'countdown')) return;
  const el = document.getElementById('msgs');
  if (kind === 'pass' && performance.now() < noticeUntil) return;
  el.replaceChildren(); const chip = document.createElement('div'); chip.className = 'race-feedback ' + kind; chip.textContent = text;
  el.append(chip); noticeUntil = performance.now() + 850; setTimeout(() => chip.remove(), 1050);
}
function pause() {
  if (!g || !started || result || !['race', 'countdown'].includes(g.state)) { releaseInput(); return; }
  g.togglePause(); releaseInput(); display('paused');
}
function resume() {
  if (!g || portrait() || result || g.state !== 'paused' || !['race', 'countdown'].includes(g.pausedFrom)) return;
  releaseInput(); g.togglePause(); inputTime = performance.now(); display(g.state);
}
function start() {
  if (!g || loading || portrait() || career.adBusy) return;
  if (!career.canStart()) {
    $('note').textContent = '油量不足，等待自然恢复或主动看广告加油';
    display('ready');fuelView();return;
  }
  releaseInput();result = null;previousRank = null;events = [];started = true;
  try {
    career.configure(g);
    g.camMode = 1;g.mobileMode = driver.enabled;g.startRace();career.begin(g);
    inputTime = performance.now();$('heading').textContent = career.stage.name;display('countdown');
  } catch (error) {
    started = false;$('note').textContent = '比赛启动失败：' + error.message;
    display('ready');renderLobby();
  }
}
function finish() {
  if (result) return;
  if (!g.resultShown) g.showResults();
  result = settleNative(g);releaseInput();
  const graded = career.finalize(g, result);
  const stars = graded?.stars ?? 0;
  $('heading').textContent = stars ? '挑战成功！' + '★'.repeat(stars) : '再试一次，争取过关';
  if (result.finished && (!best[result.map] || result.time < best[result.map])) {
    best[result.map] = result.time;try { localStorage.setItem(STORE, JSON.stringify(best)); } catch { /* Play remains available. */ }
  }
  $('result-copy').textContent = stars
    ? '第 ' + result.place + ' 名 · ' + time(result.time) + ' · 本关最佳 ' + time(graded.best) + ' · 累计 ' + graded.total + ' 星'
    : '目标未完成：' + career.stage.goal + ' · ' + (result.finished ? '名次 ' + result.place : '已完成 ' + Math.floor(result.completion * 100) + '%');
  $('result-stats').innerHTML = [['有效漂移', graded?.metric.cleanDrifts ?? 0], ['弯道超车', graded?.metric.cleanPasses ?? 0], ['拾取道具', graded?.metric.pickups ?? 0], ['小喷', result.stats.small]].map(([label, value]) => `<span><b>${value ?? 0}</b>${label}</span>`).join('');
  $('results').replaceChildren();
  for (const row of result.rows) {
    const li = document.createElement('li'); if (row.me) li.className = 'me';
    for (const value of [row.place, row.me ? '我' : row.name, time(row.time)]) { const span = document.createElement('span'); span.textContent = String(value); li.append(span); }
    $('results').append(li);
  }
  display('finished');renderLobby();
}
async function loadTrack(id, autoStart) {
  if (!g || loading) return;
  releaseInput();loading = true; $('start').disabled = true; $('next').disabled = true; $('map').disabled = true;
  $('heading').textContent = '准备下一场…';
  try {
    const sameMap = g.map?.id === id && !!g.track;
    if (!sameMap) { g.settings.map = id;g.save();await g.loadMap(id); }
    g.startDemo();result = null;loading = false;$('map').value = id;
    if (autoStart && career.canStart()) start();
    else { $('heading').textContent = '双键飞驰';display('ready');renderLobby(); }
  } catch (error) { $('note').textContent = '赛道加载失败：' + error.message;display('ready'); }
  finally { loading = false;$('start').disabled = false;$('next').disabled = false;$('map').disabled = false; }
}
$('start').addEventListener('click', start); $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
// A second finger is not guaranteed to synthesize click while the steering finger stays down.
$('pause').addEventListener('pointerdown', event => { event.preventDefault();pause(); });
$('replay').addEventListener('click', start);$('restart').addEventListener('click', start);
$('next').addEventListener('click', () => {
  const next = career.nextStage();if (next === career.index) return;
  career.setStage(next);renderLobby();loadTrack(career.stage.map, true);
});
$('stage').addEventListener('change', () => {
  if (!career.setStage(Number($('stage').value))) {renderLobby();return;}
  renderLobby();loadTrack(career.stage.map, false);
});
$('skin').addEventListener('change', () => {career.setSkin(Number($('skin').value));renderLobby();});
$('fuel-ad').addEventListener('click', async () => {
  if (!['ready','finished'].includes(phase) || career.adBusy) return;
  $('fuel-ad').disabled = true;$('fuel-info').textContent = '广告加载中…';
  const out = await career.watchFuelAd();
  renderLobby();
  $('note').textContent = out.status === 'completed' ? '加油成功，可以继续参赛' : '广告未完整播放或暂不可用，油量不变';
});
$('quality').addEventListener('change', () => { quality.manual = true;g.settings.quality = $('quality').value;g.setupQuality();g.save();$('quality-note').textContent = '已使用你选择的画质'; });
for (const button of root.querySelectorAll('[data-race-direction]')) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault();if (!g || phase !== 'race') return;
    driver.enabled = true;g.mobileMode = true;button.setPointerCapture(e.pointerId);
    pointers.press(e.pointerId, button.dataset.raceDirection, performance.now());button.classList.add('held');button.setAttribute('aria-pressed', 'true');
  });
  const off = e => { e.preventDefault();pointers.release(e.pointerId, performance.now());button.classList.remove('held');button.setAttribute('aria-pressed', 'false'); };
  button.addEventListener('pointerup', off);button.addEventListener('pointercancel', e => { pointers.clear();off(e); });button.addEventListener('lostpointercapture', off);
}
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
const orient = () => { $('rotate').hidden = !portrait();if (portrait()) pause(); };
window.addEventListener('resize', orient);window.addEventListener('orientationchange', orient);orient();
window.addEventListener('keydown', e => {
  if (!mobile && ['ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyW'].includes(e.code)) { driver.enabled = false;if (g) g.mobileMode = false; }
});
async function boot() {
  for (let attempts = 0; attempts < 1500; attempts++) {
    if (raceReady(window.game)) { g = window.game; break; }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  if (!g) throw Error('赛道加载未完成，请刷新或使用支持 WebGL 的浏览器');
  const loadedMap = g.map?.id;
  g.mobileMode = mobile;g.camMode = 1;g.settings.quality = 'mid';career.configure(g);g.setupQuality();
  career.patchNative(g);
  career.setupAd(window.__PLATFORM_META__ ?? { status: 'PENDING' }, window.tap);
  if (!window.__PLATFORM_META__) fetch('platform.json').then(r => r.ok ? r.json() : null).then(meta => {
    if (meta) {career.setupAd(meta, window.tap);fuelView();}
  }).catch(() => { /* The racing preview remains free-to-play. */ });
  tuneRaceFx(g);
  document.getElementById('gaugelbl').textContent = '集气';
  document.querySelector('#lapbox .s').textContent = '圈数';
  for (const id of ['n2o0', 'n2o1']) { document.getElementById(id).textContent = '';document.getElementById(id).setAttribute('aria-hidden', 'true'); }
  const nativeFrame = g.input.frame.bind(g.input);
  g.input.frame = () => {
    const now = g.last ?? performance.now(), dt = Math.min(.05, Math.max(0, (now - inputTime) / 1000)); inputTime = now;
    const held = pointers.snapshot(performance.now());g.input.touch.left = held.left;g.input.touch.right = held.right;
    const raw = nativeFrame(), canStep = g.acc + dt >= 1 / 120;
    const translated = driver.frame(dt, raw, g.player, g.track, g.state, { canStep });
    if (g.itemMode && driver.enabled) translated.nitroPressed = career.itemInput(g, canStep);
    return translated;
  };
  const nativeEvents = g.handleEvents.bind(g);
  g.handleEvents = player => {
    const pending = player.events.map(event => ({ ...event, data: { ...event.data } }));nativeEvents(player);
    for (const event of pending) {
      career.onEvent(event, g);events.push({ atRaceSec: g.raceTime, type: event.type, ...event.data }); if (events.length > 800) events.shift();
      if (event.type === 'driftStart') feedback('漂移集气', 'drift');
      if (event.type === 'crash') feedback('碰撞减速', 'crash');
    }
  };
  g.hud.message = text => feedback(text.replace('集气完成 +1 N₂O', '集气满 · 出弯加速').replaceAll('!', ''));
  const nativeCountdown = g.hud.countdown.bind(g.hud);g.hud.countdown = text => nativeCountdown(text === 'GO!' ? '出发' : text);
  g.hud.drawSpeedo = () => {}; // Desktop speedo is compatibility-only and absent from this HUD.
  loading = false;root.dataset.loaded = 'true';$('start').disabled = false;$('start').textContent = '开始比赛';$('map').value = g.settings.map;renderLobby();
  if (loadedMap !== career.stage.map) await loadTrack(career.stage.map, false);
  if (!mobile) $('note').textContent = '键盘保留原操作；点按左右按钮可切入双键驾驶';
  display('ready');
  let lastFuelTick = 0;
  const frame = now => {
    const dt = (now - lastFrame) / 1000;lastFrame = now;
    if ((phase === 'ready' || phase === 'finished') && now - lastFuelTick > 1000) { lastFuelTick = now;fuelView(); }
    if (started && !result) {
      if (g.player.finished || g.resultShown) finish();
      else if (g.state !== phase && ['race', 'countdown', 'paused'].includes(g.state)) display(g.state);
      if (g.state === 'race') {
        const failure = career.frame(g);
        for (const message of career.drainNotices()) feedback(message, message.includes('超车') ? 'pass' : 'boost');
        $('live-goal').textContent = career.timerLabel(g);
        if (failure) {feedback(failure, 'crash');if (!g.resultShown) g.showResults();finish();}
        root.classList.toggle('drifting', g.player.drifting);
        const rank = g.standings.indexOf(g.player) + 1;
        if (previousRank !== null && rank < previousRank && g.raceTime > 1) feedback(`超车 +${previousRank - rank}`, 'pass');
        previousRank = rank;
        const lower = quality.frame(dt, g.settings.quality);
        if (lower) { g.settings.quality = lower;g.setupQuality();$('quality-note').textContent = '已自动调低画质，优先保持驾驶流畅'; }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot().catch(error => { $('heading').textContent = '加载需要再试一次';$('note').textContent = error.message;root.dataset.error = 'true'; });
