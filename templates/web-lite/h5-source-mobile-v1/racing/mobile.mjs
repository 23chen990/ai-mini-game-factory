/* global window, document, navigator, localStorage, performance, requestAnimationFrame, setTimeout, fetch, Blob, URL */
import { ManualRaceDriver, TouchActions } from './driver.mjs';
import { RacingJoystick } from './joystick.mjs';
import { careerCourseDetails } from './track-design.mjs';
import { raceSpeedHUD } from './speed-hud.mjs';
import { RaceDuelTracker } from './duel-loop.mjs';
import { ShortcutDecisionTracker } from './shortcut-decisions.mjs';
import { SHORTCUT_PLANS } from './shortcut-network.mjs';
import { RaceTrialMetrics, rankFinishGapSeconds } from './trial-metrics.mjs';
import { careerCourseSvg, compactRaceObjective } from './presentation.mjs';
import { RacingCareer } from './runtime.mjs';
import { ITEM_LABELS, ITEM_ICONS } from './items.mjs';
import { installCornerSigns, disposeCornerSigns } from './corner-signs.mjs';
import { STAGES, SKIN_NAMES, SKIN_STARS, careerStars, stageUnlocked, skinUnlocked, localDayKey, stageFailureFeedback } from './career.mjs';
import { clearNativeInput, settleNative, QualityMonitor, normalizeRaceQuality, setRaceSound, raceReady, stageTrackReady, tuneRaceFx, shouldRefreshRaceHud } from './session.mjs';
const MAPS = [{ id: 'city', name: '城市巡回' }, { id: 'aegean', name: '海滨山城' }, { id: 'egypt', name: '沙漠冲刺' }, { id: 'snow', name: '雪地探险' }];
const time = seconds => seconds == null ? '未完成' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const mobile = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer:coarse)').matches;
const root = document.createElement('section'); root.id = 'race-kit'; root.dataset.phase = 'ready';
root.innerHTML = `<button id="race-pause" aria-label="暂停比赛" hidden><span aria-hidden="true">Ⅱ</span></button><div id="race-speed" hidden aria-label="当前速度"><strong id="race-speed-value">0</strong><span>KM/H</span></div>
  <div id="race-compact-goal" hidden></div><div id="race-knockout" hidden><span class="race-knockout-icon" aria-hidden="true">⚑</span><div class="race-knockout-detail"><div id="race-field" aria-hidden="true">${Array.from({length:6},(_,i)=>`<i>${i+1}</i>`).join('')}</div><div id="race-knockout-meter" role="progressbar" aria-label="下一次末位淘汰" aria-valuemin="0" aria-valuemax="100"><span id="race-knockout-fill"></span></div></div></div><div id="race-controls" hidden><div id="race-joystick" role="group" aria-label="左右拖动方向轮盘，松手回正"><div class="race-stick-track"><span aria-hidden="true" class="race-stick-left">‹</span><span aria-hidden="true" class="race-stick-right">›</span><i id="race-stick-knob"></i></div></div><div id="race-action-pad"><button data-race-action="drift" aria-label="按住漂移">漂移</button><button data-race-action="small" aria-label="小喷">小喷</button><button data-race-action="nitro" aria-label="使用氮气">氮气</button><button data-race-action="item" aria-label="使用道具">道具</button></div></div>
  <div id="race-panel" role="dialog" aria-label="赛车菜单"><div class="race-eyebrow">ARCADE RACING / CAREER</div><h1 id="race-heading">极速飞驰</h1><button id="race-export" type="button" aria-label="导出本机试玩数据JSON">导出数据 ↓</button>
    <div id="race-guide"><div class="race-guide-keys" aria-hidden="true"><span>◎</span></div><p>左手轮盘 · 右手漂移 / 小喷 / 氮气</p></div>
    <div id="race-ready"><label for="race-stage">关卡</label><select id="race-stage" aria-label="选择已解锁关卡"></select><select id="race-map" hidden>${MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select><span class="race-round-tag" id="race-stage-tag"></span><label for="race-skin">车身</label><select id="race-skin" aria-label="已解锁车身颜色"></select></div><div id="race-course-card"><div id="race-course-map" aria-hidden="true"></div><div class="race-course-info"><span class="race-course-kicker">本场赛道</span><strong id="race-course-name">准备出发</strong><small id="race-course-feel"></small></div></div><p id="race-stage-goal"></p><div id="race-fuel-box"><div id="race-fuel-gauge" role="meter" aria-label="油量" aria-valuemin="0" aria-valuemax="10" aria-valuenow="10" hidden>${'<span></span>'.repeat(10)}</div><span id="race-fuel-info"></span><button id="race-fuel-ad" hidden>观看广告 · 加油 +2</button></div>
    <p id="race-result-copy" hidden></p><div id="race-result-stats" hidden></div><ol id="race-results" hidden></ol>
    <div id="race-settings" hidden><label for="race-steering-sens">转向</label><select id="race-steering-sens" aria-label="轮盘转向灵敏度"><option value="calm">柔和</option><option value="normal">标准</option><option value="sharp">灵敏</option></select><label for="race-sound">声音</label><button id="race-sound" type="button" aria-pressed="true">声音：开</button><label for="race-quality">画质</label><select id="race-quality"><option value="low">流畅</option><option value="mid">均衡</option><option value="high">清晰</option></select><small id="race-quality-note">均衡画质，性能不足时自动调低</small></div>
    <div class="race-actions"><button id="race-start" disabled>赛道准备中…</button><button id="race-resume" hidden>继续比赛</button><button id="race-replay" hidden>再来一次</button><button id="race-retry-ad" class="race-secondary" hidden>看广告 · 下局额外氮气</button><button id="race-next" class="race-secondary" hidden>下一场 →</button><button id="race-lobby" class="race-secondary" hidden>返回选关</button><button id="race-restart" class="race-secondary" hidden>重新开始</button></div>
    <p id="race-note"></p>
  </div><aside id="race-storage-warning" role="status" hidden>⚠ 本地存储不可用，本次试玩不限油</aside><aside id="race-rotate" hidden role="alert"><div class="race-phone" aria-hidden="true">↻</div><b>请使用横屏</b><span>横屏后继续比赛</span></aside>`;
document.body.append(root);
const $ = id => root.querySelector('#race-' + id);
const duel = new RaceDuelTracker();
const shortcutDecisions = new ShortcutDecisionTracker();
const joystick = new RacingJoystick(), actions = new TouchActions(),
  driver = new ManualRaceDriver(actions), quality = new QualityMonitor();
const SENS_STORE = 'h5-qq-mobile-20261013:steering-sensitivity:v1';
try { joystick.setSensitivity(localStorage.getItem(SENS_STORE)); } catch { /* Default safe sensitivity. */ }
$('steering-sens').value = joystick.sensitivity;
// Mobile always uses the joystick. Desktop can still use original keyboard input
// for development accessibility, but no two-key steering mode exists.
let touchDriving = mobile;
let g, phase = 'ready', started = false, result = null, loading = true, lastFrame = performance.now(), inputTime = performance.now();
let nativeStartRace, policyReady = false, backgrounded = document.hidden;
let events = [], best = {}, lastRacePassed = false;
let replayTapCount = 0;
let touchSerial=0,consumedTouchSerial=-1,lastStickEventAt=0,lastTouchSampleAgeMs=null;
let justFinishedPassed = null;
let adNotice = '', adNoticeUntil = 0;
const STORE = 'h5-qq-mobile-20261013:two-button:v1'; // Preserve legacy save key across input migration.
const QUALITY_STORE = 'h5-qq-mobile-20261013:graphics-quality:v1';
const SOUND_STORE = 'h5-qq-mobile-20261013:audio-enabled:v1';
let soundEnabled = true;
try { soundEnabled = localStorage.getItem(SOUND_STORE) !== '0'; } catch { /* Private browsing keeps audio on. */ }
try { best = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { best = {}; }
let storageRef;
try { storageRef = localStorage; }
catch { storageRef = { getItem() { throw Error('本地存储不可用'); }, setItem() { throw Error('本地存储不可用'); } }; }
const career = new RacingCareer(storageRef, best);
const trial = new RaceTrialMetrics(storageRef);
function fuelView() {
  $('fuel-info').textContent = (!career.storageOK ? '本地存储不可用 · 不限油' : career.fuelEnabled ? career.fuelText() : '自由试玩 · 不限油') + (performance.now() < adNoticeUntil ? ' · ' + adNotice : '');
  const metered = career.fuelEnabled, empty = metered && !career.canStart();
  $('fuel-gauge').hidden = !metered;
  $('fuel-gauge').setAttribute('aria-valuenow', String(career.fuel.amount));
  for (const [index, segment] of [...$('fuel-gauge').children].entries()) segment.classList.toggle('filled', index < career.fuel.amount);
  $('fuel-box').classList.toggle('empty', metered && career.fuel.amount === 0);
  $('storage-warning').hidden = career.storageOK;
  for (const id of ['start', 'replay', 'restart', 'next','retry-ad']) $(id).disabled = loading || !policyReady || career.adBusy || empty;
  $('start').textContent = !policyReady ? '读取油量规则…' : empty ? '⏳ 等待油量恢复' :
    career.hasFreeReplay() ? '免费再赛 ↻' : '开始比赛';
  $('fuel-ad').hidden = !career.canOfferAd();
  $('fuel-ad').disabled = career.adBusy;
}
function renderLobby() {
  const stage = career.stage;
  $('stage').replaceChildren();
  let chapterGroup = null, activeChapter = -1;
  for (let index = 0; index < STAGES.length; index++) {
    const s = STAGES[index], open = stageUnlocked(career.progress, index);
    if (s.chapter !== activeChapter) {
      activeChapter = s.chapter;
      chapterGroup = document.createElement('optgroup');
      chapterGroup.label = '第 ' + activeChapter + ' 章';
      $('stage').append(chapterGroup);
    }
    const option = document.createElement('option');
    option.value = String(index);option.disabled = !open;
    const stars = career.progress.stars[s.id] ?? 0;
    option.textContent = open ? (s.id + ' · ' + s.name + ' ' + '★'.repeat(stars)) : ('🔒 ' + s.id + ' · ' + s.name);
    chapterGroup.append(option);
  }
  const dailyOption = document.createElement('option');
  dailyOption.value = 'daily';dailyOption.disabled = !career.canDaily();
  const today = localDayKey();
  const earnedToday = career.progress.daily.date === today ? career.progress.daily.stars : 0;
  dailyOption.textContent = career.canDaily() ? '📅 每日挑战 ' + '★'.repeat(earnedToday) : '🔒 每日挑战（通过第4关解锁）';
  $('stage').append(dailyOption);
  $('stage').value = career.dailySnapshot ? 'daily' : String(career.index);
  root.dataset.courseId = stage.course;
  root.dataset.previewRevision = 'racing-v80-integrated';
  const courseInfo=careerCourseDetails(stage.course.slice(-2));
  $('stage-tag').textContent = (career.dailySnapshot ? '每日挑战' : '第 ' + stage.chapter + ' 章') +
    ' · ' + stage.laps + ' 圈 · ' + (stage.mode === 'item' ? '道具赛' : '竞速赛') + ' · V8.0';
  $('course-map').innerHTML = careerCourseSvg(stage.course);
  $('course-name').textContent = courseInfo?.title ?? stage.name;
  $('course-feel').textContent = (courseInfo?.feel ?? '') +
    (SHORTCUT_PLANS[stage.course] ? ' · 可选择近道' : '');
  $('stage-goal').textContent = stage.goal + ' · ★ ' + careerStars(career.progress);
  $('skin').replaceChildren();
  for (let i = 0; i < SKIN_NAMES.length; i++) {
    const opt = document.createElement('option');opt.value = String(i);opt.disabled = !skinUnlocked(career.progress, i);
    opt.textContent = SKIN_NAMES[i] + (opt.disabled ? ' · 需 ' + SKIN_STARS[i] + ' 星' : '');$('skin').append(opt);
  }
  $('skin').value = String(career.progress.skin);
  if (phase === 'ready') $('note').textContent = '';
  fuelView();
}
Object.defineProperty(window, '__RACE_EVIDENCE__', { get: () => ({ events: events.map(e => ({ ...e })), phase, mode: touchDriving ? 'joystick' : 'keyboard', quality: g?.settings.quality, requestedCourse: career.stage.course, actualCourse: g?.track?.__RACE_COURSE_ID ?? null, actualTrackLength: Number.isFinite(g?.track?.length) ? Math.round(g.track.length) : null, steerAxis: Number(joystick.snapshot().toFixed(3)), duel: g ? duel.snapshot(g,career.stage) : null, replayTapCount, shortcut:shortcutDecisions.snapshot(),fpsEstimate:quality.fps,touchToInputSampleMs:lastTouchSampleAgeMs, trial: trial.snapshot(), revision: 'V8.0' }) });
const portrait = () => window.innerHeight > window.innerWidth;
function syncJoystickVisual() {
  $('stick-knob').style.transform = `translate(calc(-50% + ${joystick.knobX.toFixed(1)}px), -50%)`;
  $('joystick').classList.toggle('held',joystick.active);
}
function releaseInput() {
  joystick.clear(); actions.clear();
  if (g) clearNativeInput(g.input);
  syncJoystickVisual();
  for (const button of root.querySelectorAll('[data-race-action]')) button.classList.remove('held');
}
function display(next) {
  phase = next; root.dataset.phase = next; root.dataset.stageKind = career.stage.kind;
  const racing = next === 'race' || next === 'countdown';
  $('panel').hidden = racing; $('controls').hidden = !racing; $('pause').hidden = !racing;
  $('start').hidden = next !== 'ready'; $('resume').hidden = next !== 'paused'; $('restart').hidden = next !== 'paused';
  const canAdvance = lastRacePassed && career.nextStage() !== career.index;
  $('replay').hidden = next !== 'finished'; $('retry-ad').hidden = next !== 'finished' || !career.canOfferRetryBoost(); $('next').hidden = next !== 'finished' || !canAdvance; $('lobby').hidden = next !== 'finished';
  $('replay').classList.toggle('race-secondary', next === 'finished' && canAdvance);
  $('next').classList.remove('race-secondary');
  $('export').hidden = next !== 'ready' && next !== 'finished';
  $('guide').hidden = next !== 'ready' || career.progress.rounds > 0; $('ready').hidden = next !== 'ready'; $('settings').hidden = next !== 'paused';
  for (const id of ['result-copy', 'result-stats', 'results']) $(id).hidden = next !== 'finished';
  if (next !== 'race') $('knockout').hidden = true;
  $('speed').hidden = next !== 'race'; $('compact-goal').hidden = next !== 'race' || !$('compact-goal').textContent;
  $('note').hidden = next !== 'ready'; // :empty CSS hides silence; critical loading errors remain visible.
  for (const button of root.querySelectorAll('[data-race-action]')) button.disabled = next !== 'race';
  $('joystick').setAttribute('aria-disabled',String(next !== 'race'));
  $('joystick').classList.toggle('disabled',next !== 'race');
  root.dataset.itemMode = career.stage.mode === 'item' ? 'true' : 'false';
  if (next === 'paused') { $('heading').textContent = '暂停'; $('quality').value = g.settings.quality; $('sound').textContent = soundEnabled ? '声音：开' : '声音：关'; $('sound').setAttribute('aria-pressed', String(soundEnabled)); }
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
  releaseInput();result = null;events = [];lastRacePassed = false;
  duel.reset();shortcutDecisions.reset();$('compact-goal').textContent = '';started = true;
  try {
    career.configure(g);
    // Mobile camera / anti-jitter settings follow the actual touch mode.
    // ManualRaceDriver has no .enabled flag after the single-wheel migration.
    g.camMode = 1;g.mobileMode = touchDriving;nativeStartRace();
    if (g.state !== 'countdown') throw Error('原生比赛未进入倒计时');
    career.begin(g);
    trial.start(career.stage);
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
  const forkRun=shortcutDecisions.finish();
  trial.finish(career.stage,result,stars,g.raceTime,duel.snapshot(g,career.stage),forkRun);
  lastRacePassed = stars > 0;
  justFinishedPassed = lastRacePassed;
  $('heading').textContent = result.finished ? '第 ' + result.place + ' 名' : '未完赛';
  if (result.finished && (!best[result.map] || result.time < best[result.map])) {
    best[result.map] = result.time;try { localStorage.setItem(STORE, JSON.stringify(best)); } catch { /* Play remains available. */ }
  }
  const newSkin = SKIN_STARS.findIndex((required,i) => i > 0 && beforeStars < required && graded?.total >= required);
  const failure = stars ? null : stageFailureFeedback(career.stage, result, graded?.metric ?? {});
  $('replay').textContent = career.hasFreeReplay() ? '免费再来一局 ↻' : '再来一局 ↻';
  $('result-copy').textContent = stars
    ? (career.dailySnapshot
      ? '每日挑战成功 · 第 ' + result.place + ' 名 · ' + time(result.time) + ' · 当日最佳 ' + time(graded.best) +
        ' · 连续挑战 ' + career.progress.daily.streak + ' 天'
      : '第 ' + result.place + ' 名 · ' + time(result.time) + ' · 最佳 ' + time(graded.best) + ' · 累计 ' + graded.total + ' 星' +
        (newSkin > 0 ? ' · 解锁车漆：' + SKIN_NAMES[newSkin] : ''))
    : (result.finished ? '未达成目标 · ' : '未完赛 · ') + failure.reason +
      (() => { const gap = rankFinishGapSeconds(career.stage,result);
        return gap !== null ? ' · 距目标名次 ' + gap.toFixed(1) + ' 秒' : ''; })();
  if (forkRun.entries > 0)
    $('result-copy').textContent += ' · 近道 ' + forkRun.completed + '/' + forkRun.entries;
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
    // Different stages in the same biome must still load DIFFERENT geometry.
    career.configure(g);
    const sameCourse = g.map?.id === id && g.track?.__RACE_COURSE_ID === career.stage.course;
    if (!sameCourse) {
      disposeCornerSigns(g);await g.loadMap(id);
      installCornerSigns(g,window.__RACE_THREE__,document);
    }
    g.startDemo();loading = false;$('map').value = id;
    if (autoStart && career.canStart()) start();
    else { $('heading').textContent = '极速飞驰';display('ready');renderLobby(); }
  } catch (error) { $('note').textContent = '赛道加载失败：' + error.message;display('ready'); }
  finally { loading = false;$('map').disabled = false;fuelView(); }
}
/** Download only after explicit tap. All bytes remain on the player's device;
 * failed downloads report failure instead of pretending an export succeeded. */
$('export').addEventListener('click', () => {
  const button=$('export');
  try {
    const content=trial.exportJSON();
    const blob=new Blob([content],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='racing-v80-local-playtest.json';
    document.body.append(anchor);anchor.click();anchor.remove();
    button.textContent='数据已准备';
    setTimeout(()=>{ URL.revokeObjectURL(url); button.textContent='导出数据 ↓'; },1500);
  } catch {
    button.textContent='导出失败';
    setTimeout(()=>{ button.textContent='导出数据 ↓'; },1500);
  }
});
$('start').addEventListener('click', start); $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
// A second finger is not guaranteed to synthesize click while the steering finger stays down.
$('pause').addEventListener('pointerdown', event => { event.preventDefault();pause(); });
$('replay').addEventListener('click', () => {
  // Count actual voluntary replays only after the native countdown starts.
  const wasFinished=phase==='finished';start();
  if(wasFinished && phase==='countdown'){
    replayTapCount++;
    trial.replay(career.stage,justFinishedPassed === true);
    justFinishedPassed = null;
  }
});$('restart').addEventListener('click', start);
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
  trial.rewardedOutcome(out.status);
  adNotice = out.status === 'completed' ? '已加油 +2' :
    out.status === 'session-credit' ? '广告已完成但存档失败，本次不限油' :
    '广告未完成，油量不变';
  adNoticeUntil = performance.now() + 7000;
  renderLobby();fuelView();
  if (phase === 'ready') $('note').textContent = '';
});
$('retry-ad').addEventListener('click',async()=>{
  if(phase!=='finished'||!career.canOfferRetryBoost())return;
  $('retry-ad').disabled=true;
  const out=await career.watchRetryBoostAd();
  trial.rewardedOutcome(out.status);
  if(out.status==='completed'){
    $('result-copy').textContent+=' · 下局同关额外氮气 +1（手动使用）';
    $('replay').textContent='带氮气再战 ↻';
  }
  display('finished');fuelView();
});
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (g) setRaceSound(g.audio,soundEnabled);
  $('sound').textContent = soundEnabled ? '声音：开' : '声音：关';
  $('sound').setAttribute('aria-pressed',String(soundEnabled));
  try { localStorage.setItem(SOUND_STORE,soundEnabled ? '1' : '0'); } catch { /* Keep playing. */ }
});
$('steering-sens').addEventListener('change', () => {
  joystick.setSensitivity($('steering-sens').value);
  try { localStorage.setItem(SENS_STORE,joystick.sensitivity); } catch { /* No persistent storage. */ }
});
$('quality').addEventListener('change', () => {
  quality.manual = true;g.settings.quality = normalizeRaceQuality($('quality').value);
  g.setupQuality();g.save();
  try {localStorage.setItem(QUALITY_STORE,g.settings.quality);} catch { /* Private browsing stays playable. */ }
  $('quality-note').textContent = '已保存画质偏好，下次打开继续生效';
});
const joystickSurface = $('joystick');
const recordStickEvent=()=>{touchSerial++;lastStickEventAt=performance.now();};
joystickSurface.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!g || phase !== 'race') return;
  const r = joystickSurface.getBoundingClientRect();
  if (!joystick.press(e.pointerId, e.clientX, r.left + r.width / 2, r.width / 2)) return;
  touchDriving = true; g.mobileMode = true;recordStickEvent();
  joystickSurface.setPointerCapture(e.pointerId); syncJoystickVisual();
});
joystickSurface.addEventListener('pointermove', e => {
  if (joystick.update(e.pointerId, e.clientX)) {
    recordStickEvent();
    if (e.cancelable) e.preventDefault();
    syncJoystickVisual();
  }
});
joystickSurface.addEventListener('pointerup', e => {
  if (joystick.release(e.pointerId)) {e.preventDefault();recordStickEvent(); syncJoystickVisual();}
});
const endStick = e => {
  if (joystick.release(e.pointerId)) {if (e.cancelable) e.preventDefault();recordStickEvent(); syncJoystickVisual();}
};
joystickSurface.addEventListener('pointercancel', endStick);
joystickSurface.addEventListener('lostpointercapture', endStick);
for (const button of root.querySelectorAll('[data-race-action]')) {
  const action = button.dataset.raceAction;
  button.addEventListener('pointerdown',e=>{
    e.preventDefault(); if (phase !== 'race') return;
    touchDriving = true; if (g) g.mobileMode = true;
    button.setPointerCapture(e.pointerId); actions.press(e.pointerId,action,g?.raceTime ?? 0);button.classList.add('held');
  });
  button.addEventListener('pointerup',e=>{ e.preventDefault();actions.release(e.pointerId);button.classList.toggle('held',actions.isHeld(action)); });
  const cancel=e=>{ if(e.cancelable)e.preventDefault(); actions.cancel(e.pointerId);button.classList.toggle('held',actions.isHeld(action)); };
  button.addEventListener('pointercancel',cancel);button.addEventListener('lostpointercapture',cancel);
}
const background = () => { backgrounded = true;pause(); };
window.addEventListener('blur', background);
window.addEventListener('focus', () => { backgrounded = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) background();else backgrounded = false; });
const orient = () => { $('rotate').hidden = !portrait();if (portrait()) pause(); };
window.addEventListener('resize', orient);window.addEventListener('orientationchange', orient);orient();
window.addEventListener('keydown', e => {
  if (!mobile && ['ArrowUp', 'ArrowDown', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyW'].includes(e.code)) { touchDriving = false;if (g) g.mobileMode = false; }
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
    // Native keyboard stays available on desktop; the only touch input is
    // analogue steering plus the explicit drift, spray, nitro, and item actions.
    g.input.touch.left = false; g.input.touch.right = false;
    const raw = nativeFrame(), canStep = g.acc + dt >= 1 / 120;
    if (!touchDriving) return raw;
    raw.steerAxis = joystick.snapshot();
    if(touchSerial!==consumedTouchSerial){
      consumedTouchSerial=touchSerial;
      lastTouchSampleAgeMs=Math.min(500,Math.max(0,Math.round(performance.now()-lastStickEventAt)));
    }
    const translated = driver.frame(raw,g.player,g.state,{canStep,itemMode:g.itemMode,track:g.track,now:g.raceTime ?? 0});
    if (career.index > 0 && g.state === 'race' && g.raceTime < .28) translated.upPressed = false;
    return translated;
  };
  const nativeEvents = g.handleEvents.bind(g);
  g.handleEvents = player => {
    const pending = player.events.map(event => ({ ...event, data: { ...event.data } }));nativeEvents(player);
    for (const event of pending) {
      career.onEvent(event, g);events.push({ atRaceSec: g.raceTime, type: event.type, ...event.data }); if (events.length > 800) events.shift();
    }
  };
  // No transient text banners over live driving. Native car motion, audio, impact
  // effect, minimap and objective counter remain authoritative feedback.
  g.hud.message = () => {};
  const nativeCountdown = g.hud.countdown.bind(g.hud);g.hud.countdown = text => nativeCountdown(text === 'GO!' ? '出发' : text);
  g.hud.drawSpeedo = () => {}; // Desktop speedo is compatibility-only and absent from this HUD.
  loading = false;$('start').disabled = false;$('start').textContent = '开始比赛';$('map').value = g.settings.map;renderLobby();
  if (loadedMap !== career.stage.map || g.track?.__RACE_COURSE_ID !== career.stage.course)
    await loadTrack(career.stage.map, false);
  if (!stageTrackReady(g,career.stage)) throw Error('赛道身份校验失败，禁止开始错误的关卡');
  root.dataset.loaded = 'true';
  display('ready');
  let lastFuelTick = 0, lastHudTick=-Infinity;
  const frame = now => {
    const dt = (now - lastFrame) / 1000;lastFrame = now;
    if ((phase === 'ready' || phase === 'finished') && now - lastFuelTick > 1000) { lastFuelTick = now;fuelView(); }
    if (started && !result && g.player) {
      if (g.player.finished || g.resultShown) finish();
      else if (g.state !== phase && ['race', 'countdown', 'paused'].includes(g.state)) display(g.state);
      if (g.state === 'race') {
        const failure = career.frame(g);
        duel.frame(g); // Keep genuine native overtakes for test telemetry; no toast.
        shortcutDecisions.frame(g); // Observe native Track.project; no speed or progress changes.
        career.drainNotices(); // Lifecycle notices are not a running commentary.
        if(shouldRefreshRaceHud(now,lastHudTick)) {
          lastHudTick=now;
          const objective=compactRaceObjective(career.stage,career.metrics,g.raceTime);
          if ($('compact-goal').textContent!==objective) $('compact-goal').textContent=objective;
          $('compact-goal').hidden=!objective;
          const speedView = raceSpeedHUD(g.player);
          if ($('speed-value').textContent !== speedView.value) $('speed-value').textContent = speedView.value;
          $('speed').dataset.boost = String(speedView.boost);
          $('speed').dataset.slow = String(speedView.slow);
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
          // Native item races also earn nitro from manually controlled drifting.
          if (g.itemMode && touchDriving) document.getElementById('gaugebox')?.classList.remove('hidden');
          const nitroBtn = root.querySelector('[data-race-action="nitro"]');
          if (nitroBtn) {
            nitroBtn.classList.toggle('ready',g.player.nitroCount > 0);
            const label = g.player.nitroCount > 0 ? '氮气 ×' + g.player.nitroCount : '氮气';
            if (nitroBtn.textContent !== label) nitroBtn.textContent = label;
          }
          const smallBtn = root.querySelector('[data-race-action="small"]');
          if (smallBtn) smallBtn.classList.toggle('ready',g.player.smallWindow > 0);
          const itemBtn = root.querySelector('[data-race-action="item"]');
          if (itemBtn) itemBtn.classList.toggle('ready',!!g.player.items?.[0]);
          const held = g.player.items?.[0];
          if (itemBtn) {
            const icon=held ? (ITEM_ICONS[held] ?? '❔') : '道具';
            if(itemBtn.textContent!==icon)itemBtn.textContent=icon;
            itemBtn.setAttribute('aria-label',held?'使用'+(ITEM_LABELS[held]??'道具'):'使用道具');
          }
        }
        if (failure) {if (!g.resultShown) g.showResults();finish();}
        root.classList.toggle('drifting', g.player.drifting);
        const lower = quality.frame(dt, g.settings.quality);
        if (lower) { g.settings.quality = lower;g.setupQuality();$('quality-note').textContent = '已自动调低画质，优先保持驾驶流畅'; }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot().catch(error => { $('heading').textContent = '加载需要再试一次';$('note').textContent = error.message;root.dataset.error = 'true'; });
