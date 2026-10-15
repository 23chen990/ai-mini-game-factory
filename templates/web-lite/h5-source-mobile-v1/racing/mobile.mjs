/* global window, document, navigator, localStorage, performance, requestAnimationFrame, setTimeout, fetch */
import { RaceDriver, TouchSteering } from './driver.mjs';
import { RacingCareer } from './runtime.mjs';
import { ITEM_LABELS, ITEM_ICONS } from './items.mjs';
import { roadHint } from './road-coach.mjs';
import { installCornerSigns, disposeCornerSigns } from './corner-signs.mjs';
import { STAGES, SKIN_NAMES, SKIN_STARS, careerStars, stageUnlocked, skinUnlocked, localDayKey } from './career.mjs';
import { clearNativeInput, settleNative, QualityMonitor, normalizeRaceQuality, setRaceSound, raceReady, stageTrackReady, tuneRaceFx } from './session.mjs';
const MAPS = [{ id: 'city', name: '城市巡回' }, { id: 'aegean', name: '海滨山城' }, { id: 'egypt', name: '沙漠冲刺' }, { id: 'snow', name: '雪地探险' }];
const time = seconds => seconds == null ? '未完成' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const mobile = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer:coarse)').matches;
const root = document.createElement('section'); root.id = 'race-kit'; root.dataset.phase = 'ready';
root.innerHTML = `<button id="race-pause" aria-label="暂停比赛" hidden><span aria-hidden="true">Ⅱ</span></button>
  <div id="race-live-goal" hidden></div><div id="race-road-hint" hidden aria-live="off"></div><div id="race-knockout" hidden><span class="race-knockout-icon" aria-hidden="true">⚑</span><div class="race-knockout-detail"><div id="race-field" aria-hidden="true">${Array.from({length:6},(_,i)=>`<i>${i+1}</i>`).join('')}</div><div id="race-knockout-meter" role="progressbar" aria-label="下一次末位淘汰" aria-valuemin="0" aria-valuemax="100"><span id="race-knockout-fill"></span></div></div></div><div id="race-held-item" hidden aria-live="off"></div><div id="race-controls" hidden><button id="race-left" data-race-direction="left" aria-label="按住向左转" aria-pressed="false"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M29 11 16 24l13 13"/></svg></button><button id="race-right" data-race-direction="right" aria-label="按住向右转" aria-pressed="false"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m19 11 13 13-13 13"/></svg></button></div>
  <div id="race-panel" role="dialog" aria-label="赛车菜单"><div class="race-eyebrow">3D 赛车 · 双键驾驶</div><h1 id="race-heading">双键飞驰</h1>
    <div id="race-guide"><div class="race-guide-keys" aria-hidden="true"><span>‹</span><span>›</span></div><p>按住左右转弯，松手回正<br><small>自动油门和弯前减速 · 自动漂移/道具 · 逆行回正</small></p></div>
    <div id="race-ready"><label for="race-stage">关卡</label><select id="race-stage" aria-label="选择已解锁关卡"></select><select id="race-map" hidden>${MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select><span class="race-round-tag" id="race-stage-tag"></span><label for="race-skin">车身</label><select id="race-skin" aria-label="已解锁车身颜色"></select></div><p id="race-stage-goal"></p><div id="race-fuel-box"><div id="race-fuel-gauge" role="meter" aria-label="油量" aria-valuemin="0" aria-valuemax="10" aria-valuenow="10" hidden>${'<span></span>'.repeat(10)}</div><span id="race-fuel-info"></span><button id="race-fuel-ad" hidden>观看广告 · 加油 +2</button></div>
    <p id="race-result-copy" hidden></p><div id="race-result-stats" hidden></div><ol id="race-results" hidden></ol>
    <div id="race-settings" hidden><label for="race-sound">声音</label><button id="race-sound" type="button" aria-pressed="true">声音：开</button><label for="race-quality">画质</label><select id="race-quality"><option value="low">流畅</option><option value="mid">均衡</option><option value="high">清晰</option></select><small id="race-quality-note">均衡画质，性能不足时自动调低</small></div>
    <div class="race-actions"><button id="race-start" disabled>赛道准备中…</button><button id="race-resume" hidden>继续比赛</button><button id="race-replay" hidden>再来一次</button><button id="race-next" class="race-secondary" hidden>下一场 →</button><button id="race-lobby" class="race-secondary" hidden>返回选关</button><button id="race-restart" class="race-secondary" hidden>重新开始</button></div>
    <p id="race-note">漂移集气，干净出弯更容易获得完美小喷</p>
  </div><aside id="race-storage-warning" role="status" hidden>⚠ 本地存储不可用，本次试玩不限油</aside><aside id="race-rotate" hidden role="alert"><div class="race-phone" aria-hidden="true">↻</div><b>横过来，准备出发</b><span>左右拇指各管一键</span><small>转回横屏后，点击继续比赛</small></aside>`;
document.body.append(root);
const $ = id => root.querySelector('#race-' + id);
const pointers = new TouchSteering(), driver = new RaceDriver(), quality = new QualityMonitor();
driver.enabled = mobile;
let g, phase = 'ready', started = false, result = null, loading = true, previousRank = null, lastFrame = performance.now(), inputTime = performance.now(), noticeUntil = 0;
let nativeStartRace, policyReady = false, backgrounded = document.hidden;
let events = [], best = {};
let lastDriftToastAt = -100, lastNoticeAt = -100;
let adNotice = '', adNoticeUntil = 0;
const STORE = 'h5-qq-mobile-20261013:two-button:v1';
const QUALITY_STORE = 'h5-qq-mobile-20261013:graphics-quality:v1';
const SOUND_STORE = 'h5-qq-mobile-20261013:audio-enabled:v1';
let soundEnabled = true;
try { soundEnabled = localStorage.getItem(SOUND_STORE) !== '0'; } catch { /* Private browsing keeps audio on. */ }
try { best = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { best = {}; }
let storageRef;
try { storageRef = localStorage; }
catch { storageRef = { getItem() { throw Error('本地存储不可用'); }, setItem() { throw Error('本地存储不可用'); } }; }
const career = new RacingCareer(storageRef, best);
function fuelView() {
  $('fuel-info').textContent = career.fuelText() + (performance.now() < adNoticeUntil ? ' · ' + adNotice : '');
  const metered = career.fuelEnabled, empty = metered && !career.canStart();
  $('fuel-gauge').hidden = !metered;
  $('fuel-gauge').setAttribute('aria-valuenow', String(career.fuel.amount));
  for (const [index, segment] of [...$('fuel-gauge').children].entries()) segment.classList.toggle('filled', index < career.fuel.amount);
  $('fuel-box').classList.toggle('empty', metered && career.fuel.amount === 0);
  $('storage-warning').hidden = career.storageOK;
  for (const id of ['start', 'replay', 'restart', 'next']) $(id).disabled = loading || !policyReady || career.adBusy || empty;
  $('start').textContent = !policyReady ? '读取油量规则…' : empty ? '⏳ 等待油量恢复' : '开始比赛';
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
  const dailyOption = document.createElement('option');
  dailyOption.value = 'daily';dailyOption.disabled = !career.canDaily();
  const today = localDayKey();
  const earnedToday = career.progress.daily.date === today ? career.progress.daily.stars : 0;
  dailyOption.textContent = career.canDaily() ? '📅 每日挑战 ' + '★'.repeat(earnedToday) : '🔒 每日挑战（通过第4关解锁）';
  $('stage').append(dailyOption);
  $('stage').value = career.dailySnapshot ? 'daily' : String(career.index);
  $('stage-tag').textContent = (career.dailySnapshot ? '每日挑战' : '第 ' + stage.chapter + ' 章') +
    ' · ' + stage.laps + ' 圈 · ' + (stage.mode === 'item' ? '道具赛' : '竞速赛') + ' · 6 车起步';
  $('stage-goal').textContent = '目标：' + stage.goal + ' · 累计 ' + careerStars(career.progress) + ' 星' +
    (career.dailySnapshot ? ' · 连续挑战 ' + career.progress.daily.streak + ' 天' : '');
  $('skin').replaceChildren();
  for (let i = 0; i < SKIN_NAMES.length; i++) {
    const opt = document.createElement('option');opt.value = String(i);opt.disabled = !skinUnlocked(career.progress, i);
    opt.textContent = SKIN_NAMES[i] + (opt.disabled ? ' · 需 ' + SKIN_STARS[i] + ' 星' : '');$('skin').append(opt);
  }
  $('skin').value = String(career.progress.skin);
  if (phase === 'ready') $('note').textContent = career.dailySnapshot ? '每天轮换一个现有赛事，无需联网。' : stage.mode === 'item' ? '选择车道拾取道具，合适时机自动使用' : '贴近弯道内线超车，成功可获得短暂加速';
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
  $('replay').hidden = next !== 'finished'; $('next').hidden = next !== 'finished' || career.nextStage() === career.index; $('lobby').hidden = next !== 'finished';
  $('guide').hidden = next !== 'ready' || career.progress.rounds > 0; $('ready').hidden = next !== 'ready'; $('settings').hidden = next !== 'paused';
  for (const id of ['result-copy', 'result-stats', 'results']) $(id).hidden = next !== 'finished';
  if (next !== 'race') $('knockout').hidden = true;
  $('note').hidden = next === 'finished';$('live-goal').hidden = !(next === 'race' && !!career.objectiveLabel(g));$('road-hint').hidden = next !== 'race';$('held-item').hidden = !racing || career.stage.mode !== 'item';
  for (const button of root.querySelectorAll('[data-race-direction]')) button.disabled = next !== 'race';
  if (next === 'paused') { $('heading').textContent = '休息一下'; $('quality').value = g.settings.quality; $('sound').textContent = soundEnabled ? '声音：开' : '声音：关'; $('sound').setAttribute('aria-pressed', String(soundEnabled)); $('note').textContent = '已松开所有按键，准备好再继续'; }
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
  if (!g || backgrounded || document.hidden || portrait() || result || g.state !== 'paused' || !['race', 'countdown'].includes(g.pausedFrom)) return;
  releaseInput(); g.togglePause(); inputTime = performance.now(); display(g.state);
}
function start() {
  if (!g || loading || !policyReady || backgrounded || document.hidden || portrait() || career.adBusy || !['ready', 'finished', 'paused'].includes(phase)) return;
  if (career.dailySnapshot && career.dailySnapshot.id !== 'daily-' + localDayKey()) {
    career.setDaily();renderLobby();loadTrack(career.stage.map, false);
    return; // Never charge for yesterday's stale challenge.
  }
  if (!stageTrackReady(g, career.stage)) {
    $('note').textContent = '赛道尚未载入，正在重试…';
    loadTrack(career.stage.map, false);
    return; // The native physical map must match the stage objective.
  }
  if (!career.canStart()) {
    $('note').textContent = '油量不足，等待自然恢复或主动看广告加油';
    display('ready');fuelView();return;
  }
  releaseInput();result = null;previousRank = null;events = [];started = true;
  lastDriftToastAt = -100;lastNoticeAt = -100;
  try {
    career.configure(g);
    g.camMode = 1;g.mobileMode = driver.enabled;nativeStartRace();
    if (g.state !== 'countdown') throw Error('原生比赛未进入倒计时');
    career.begin(g);
    inputTime = performance.now();$('heading').textContent = career.stage.name;display('countdown');fuelView();
  } catch (error) {
    started = false;display('ready');renderLobby();
    $('note').textContent = '比赛启动失败：' + error.message;
  }
}
function finish() {
  if (result) return;
  if (!g.resultShown) g.showResults();
  result = settleNative(g);releaseInput();
  const beforeStars = careerStars(career.progress);
  const graded = career.finalize(g, result);
  const stars = graded?.stars ?? 0;
  $('heading').textContent = stars ? '挑战成功！' + '★'.repeat(stars) : '再试一次，争取过关';
  if (result.finished && (!best[result.map] || result.time < best[result.map])) {
    best[result.map] = result.time;try { localStorage.setItem(STORE, JSON.stringify(best)); } catch { /* Play remains available. */ }
  }
  const newSkin = SKIN_STARS.findIndex((required,i) => i > 0 && beforeStars < required && graded?.total >= required);
  const bossFailure = career.stage.kind === 'boss'
    ? ((graded?.metric.beatBoss ? '已超越' : '尚未超越') + '指定车神 · 当前第' + result.place +
       '名，要求前' + career.stage.rank + '名')
    : '';
  $('result-copy').textContent = stars
    ? (career.dailySnapshot
      ? '每日挑战成功 · 第 ' + result.place + ' 名 · ' + time(result.time) + ' · 当日最佳 ' + time(graded.best) +
        ' · 连续挑战 ' + career.progress.daily.streak + ' 天'
      : '第 ' + result.place + ' 名 · ' + time(result.time) + ' · 最佳 ' + time(graded.best) + ' · 累计 ' + graded.total + ' 星' +
        (newSkin > 0 ? ' · 解锁车漆：' + SKIN_NAMES[newSkin] : ''))
    : '目标未完成：' + (bossFailure || career.stage.goal) + ' · ' + (result.finished ? '名次 ' + result.place : '已完成 ' + Math.floor(result.completion * 100) + '%');
  $('result-stats').innerHTML = [['有效漂移', graded?.metric.cleanDrifts ?? 0], ['弯道超车', graded?.metric.cleanPasses ?? 0], ['拾取道具', graded?.metric.pickups ?? 0], ['小喷', result.stats.small]].map(([label, value]) => `<span><b>${value ?? 0}</b>${label}</span>`).join('');
  $('results').replaceChildren();
  for (const row of result.rows) {
    const li = document.createElement('li'); if (row.me) li.className = 'me';
    for (const value of [row.place, row.me ? '我' : row.name, row.time == null && result.finished ? '比赛中' : time(row.time)]) { const span = document.createElement('span'); span.textContent = String(value); li.append(span); }
    $('results').append(li);
  }
  display('finished');renderLobby();
}
async function loadTrack(id, autoStart) {
  if (!g || loading) return;
  releaseInput();started = false;result = null;loading = true; $('start').disabled = true; $('next').disabled = true; $('map').disabled = true;
  $('heading').textContent = '准备下一场…';
  try {
    const sameMap = g.map?.id === id && !!g.track;
    if (!sameMap) {
      disposeCornerSigns(g);g.settings.map = id;g.save();await g.loadMap(id);
      installCornerSigns(g,window.__RACE_THREE__,document);
    }
    g.startDemo();loading = false;$('map').value = id;
    if (autoStart && career.canStart()) start();
    else { $('heading').textContent = '双键飞驰';display('ready');renderLobby(); }
  } catch (error) { $('note').textContent = '赛道加载失败：' + error.message;display('ready'); }
  finally { loading = false;$('map').disabled = false;fuelView(); }
}
$('start').addEventListener('click', start); $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
// A second finger is not guaranteed to synthesize click while the steering finger stays down.
$('pause').addEventListener('pointerdown', event => { event.preventDefault();pause(); });
$('replay').addEventListener('click', start);$('restart').addEventListener('click', start);
$('lobby').addEventListener('click', () => {
  if (!g || loading) return;
  releaseInput();started = false;result = null;g.startDemo();display('ready');renderLobby();
});
$('next').addEventListener('click', () => {
  const next = career.nextStage();if (next === career.index) return;
  career.setStage(next);renderLobby();loadTrack(career.stage.map, true);
});
$('stage').addEventListener('change', () => {
  const value = $('stage').value;
  const selected = value === 'daily' ? career.setDaily() : career.setStage(Number(value));
  if (!selected) {renderLobby();return;}
  renderLobby();loadTrack(career.stage.map, false);
});
$('skin').addEventListener('change', () => {
  if (!career.setSkin(Number($('skin').value))) {renderLobby();return;}
  if (g && !loading && phase === 'ready') {career.configure(g);g.startDemo();}
  renderLobby();
});
$('fuel-ad').addEventListener('click', async () => {
  if (!['ready','finished'].includes(phase) || career.adBusy) return;
  $('fuel-ad').disabled = true;$('fuel-info').textContent = '广告加载中…';
  const out = await career.watchFuelAd();
  adNotice = out.status === 'completed' ? '已加油 +2' :
    out.status === 'session-credit' ? '广告已完成但存档失败，本次不限油' :
    '广告未完成，油量不变';
  adNoticeUntil = performance.now() + 7000;
  renderLobby();fuelView();
  if (phase === 'ready') $('note').textContent = adNotice;
});
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (g) setRaceSound(g.audio,soundEnabled);
  $('sound').textContent = soundEnabled ? '声音：开' : '声音：关';
  $('sound').setAttribute('aria-pressed',String(soundEnabled));
  try { localStorage.setItem(SOUND_STORE,soundEnabled ? '1' : '0'); } catch { /* Keep playing. */ }
});
$('quality').addEventListener('change', () => {
  quality.manual = true;g.settings.quality = normalizeRaceQuality($('quality').value);
  g.setupQuality();g.save();
  try {localStorage.setItem(QUALITY_STORE,g.settings.quality);} catch { /* Private browsing stays playable. */ }
  $('quality-note').textContent = '已保存画质偏好，下次打开继续生效';
});
for (const button of root.querySelectorAll('[data-race-direction]')) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault();if (!g || phase !== 'race') return;
    driver.enabled = true;g.mobileMode = true;button.setPointerCapture(e.pointerId);
    pointers.press(e.pointerId, button.dataset.raceDirection, performance.now());button.classList.add('held');button.setAttribute('aria-pressed', 'true');
  });
  const off = e => { e.preventDefault();pointers.release(e.pointerId, performance.now());button.classList.remove('held');button.setAttribute('aria-pressed', 'false'); };
  button.addEventListener('pointerup', off);button.addEventListener('pointercancel', e => { pointers.clear();off(e); });button.addEventListener('lostpointercapture', off);
}
const background = () => { backgrounded = true;pause(); };
window.addEventListener('blur', background);
window.addEventListener('focus', () => { backgrounded = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) background();else backgrounded = false; });
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
  nativeStartRace = g.startRace.bind(g);
  g.startRace = start; // Native menu/Enter/restart share the same V3 fuel and lifecycle gate.
  const loadedMap = g.map?.id;
  installCornerSigns(g,window.__RACE_THREE__,document);
  const nativeAudioInit = g.audio.init.bind(g.audio);
  g.audio.init = (...args) => {
    const out = nativeAudioInit(...args);
    setRaceSound(g.audio,soundEnabled);
    return out;
  };
  setRaceSound(g.audio,soundEnabled);
  let rememberedQuality;
  try {rememberedQuality = localStorage.getItem(QUALITY_STORE);} catch {rememberedQuality = null;}
  g.mobileMode = mobile;g.camMode = 1;g.settings.quality = normalizeRaceQuality(rememberedQuality);
  quality.manual = rememberedQuality === 'low' || rememberedQuality === 'mid' || rememberedQuality === 'high';
  career.configure(g);g.setupQuality();
  career.patchNative(g);
  const meta = window.__PLATFORM_META__ ?? await fetch('platform.json').then(r => r.ok ? r.json() : null).catch(() => null);
  career.setupAd(meta ?? { status: 'PENDING' }, window.tap);
  policyReady = true;
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
    // The tutorial grants free starting boost; later races must earn position on the track.
    if (career.index > 0 && g.state === 'race' && g.raceTime < .28 && driver.enabled) translated.upPressed = false;
    if (g.itemMode && driver.enabled) translated.nitroPressed = career.itemInput(g, canStep);
    return translated;
  };
  const nativeEvents = g.handleEvents.bind(g);
  g.handleEvents = player => {
    const pending = player.events.map(event => ({ ...event, data: { ...event.data } }));nativeEvents(player);
    for (const event of pending) {
      career.onEvent(event, g);events.push({ atRaceSec: g.raceTime, type: event.type, ...event.data }); if (events.length > 800) events.shift();
      if (event.type === 'driftStart' && g.raceTime - lastDriftToastAt >= 5) { feedback('漂移集气', 'drift');lastDriftToastAt = g.raceTime; }
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
    if (started && !result && g.player) {
      if (g.player.finished || g.resultShown) finish();
      else if (g.state !== phase && ['race', 'countdown', 'paused'].includes(g.state)) display(g.state);
      if (g.state === 'race') {
        const failure = career.frame(g);
        if (g.raceTime - lastNoticeAt >= .9) {
          const message = career.nextNotice();
          if (message) {feedback(message);lastNoticeAt = g.raceTime;}
        }
        const goal = career.objectiveLabel(g);
        if ($('live-goal').textContent !== goal) $('live-goal').textContent = goal;
        const knockout = career.eliminationCue(g);
        $('knockout').hidden = !knockout;
        if (knockout) {
          $('knockout').dataset.near = String(knockout.near);
          $('knockout').dataset.danger = String(knockout.atRisk && knockout.near);
          $('knockout-fill').style.width = knockout.fraction * 100 + '%';
          $('knockout-meter').setAttribute('aria-valuenow', String(Math.round(knockout.fraction * 100)));
          $('knockout-meter').setAttribute('aria-valuetext', `第 ${knockout.round} 次淘汰还剩 ${knockout.remaining} 米，第 ${knockout.place}/${knockout.count} 名`);
          [...$('field').children].forEach((slot, i) => {
            slot.hidden = i >= knockout.count;slot.classList.toggle('me', i + 1 === knockout.place);slot.classList.toggle('last', i + 1 === knockout.count);
          });
        }
        const hint = roadHint(g);
        $('road-hint').hidden = !hint;
        if (hint && $('road-hint').textContent !== hint) $('road-hint').textContent = hint;
        const held = g.player.items?.[0];
        $('held-item').hidden = !g.itemMode || !held;
        if (held) {
          const info = (ITEM_ICONS[held] ?? '❔') + ' ' + (ITEM_LABELS[held] ?? '未知道具') + ' · 自动使用';
          if ($('held-item').textContent !== info) $('held-item').textContent = info;
        }
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
