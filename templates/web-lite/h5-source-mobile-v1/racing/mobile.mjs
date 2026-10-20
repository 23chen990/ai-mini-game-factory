/* global window, document, navigator, localStorage, performance, requestAnimationFrame, setTimeout, fetch, Blob, URL */
import { ManualRaceDriver, TouchActions } from './driver.mjs';
import { RaceWheelSteering } from './wheel-steering.mjs';
import { V11_COURSES,v11RaceFraction } from './v11-course-director.mjs';
import { raceSpeedHUD } from './speed-hud.mjs';
import { RaceDuelTracker } from './duel-loop.mjs';
import { ShortcutDecisionTracker } from './shortcut-decisions.mjs';
import { SHORTCUT_PLANS } from './shortcut-network.mjs';
import { RaceTrialMetrics, rankFinishGapSeconds } from './trial-metrics.mjs';
import { careerCourseSvg, compactRaceObjective, stageRailScrollLeft, rewardedStageStatus, homeOrbitOffset } from './presentation.mjs';
import { RacingCareer } from './runtime.mjs';
import { CarGarage } from './garage.mjs';
import { CAR_MODELS } from './cosmetics.mjs';
import { CAR_THUMBNAILS } from './car-thumbnails.mjs';
import { ITEM_LABELS, ITEM_ICONS } from './items.mjs';
import { installCornerSigns, disposeCornerSigns } from './corner-signs.mjs';
import { syncFuel, FUEL_RULES } from '../fuel.mjs';
import { STAGES, SKIN_NAMES, careerStars, skinUnlocked, localDayKey, stageFailureFeedback } from './career.mjs';
import { clearNativeInput, settleNative, QualityMonitor, normalizeRaceQuality, setRaceSound, raceReady, stageTrackReady, tuneRaceFx, shouldRefreshRaceHud, raceScreenProfile, initialRaceQuality, RaceInputHealth } from './session.mjs';
const MAPS = [{ id: 'city', name: '城市巡回' }, { id: 'aegean', name: '海滨山城' }, { id: 'egypt', name: '沙漠冲刺' }, { id: 'snow', name: '雪地探险' }];
const time = seconds => seconds == null ? '未完成' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const pointerCapabilities=()=>({
  coarse:window.matchMedia('(pointer:coarse)').matches,
  anyCoarse:window.matchMedia('(any-pointer:coarse)').matches,
  touchPoints:navigator.maxTouchPoints||0
});
let mobile=raceScreenProfile(window.innerWidth,window.innerHeight,pointerCapabilities())==='touch';
const root = document.createElement('section'); root.id = 'race-kit'; root.dataset.phase = 'ready';
root.innerHTML = `<button id="race-pause" aria-label="暂停比赛" hidden><span aria-hidden="true">Ⅱ</span></button><div id="race-speed" hidden aria-label="当前速度"><strong id="race-speed-value">0</strong><span>KM/H</span></div>
  <div id="race-compact-goal" hidden></div><div id="race-knockout" hidden><span class="race-knockout-icon" aria-hidden="true">⚑</span><div class="race-knockout-detail"><div id="race-field" aria-hidden="true">${Array.from({length:6},(_,i)=>`<i>${i+1}</i>`).join('')}</div><div id="race-knockout-meter" role="progressbar" aria-label="下一次末位淘汰" aria-valuemin="0" aria-valuemax="100"><span id="race-knockout-fill"></span></div></div></div><div id="race-controls" hidden><div id="race-joystick" role="group" aria-label="按住方向盘圆环旋转，松手回正"><div class="race-stick-track"><i id="race-stick-knob"><span class="race-wheel-hub"></span><span class="race-wheel-spoke spoke-top"></span><span class="race-wheel-spoke spoke-left"></span><span class="race-wheel-spoke spoke-right"></span></i></div></div><div id="race-action-pad"><button data-race-action="drift" aria-label="按住漂移">漂移</button><button data-race-action="small" aria-label="小喷">小喷</button><button data-race-action="nitro" aria-label="使用氮气">氮气</button><button data-race-action="item" aria-label="使用道具">道具</button></div></div>
  <div id="race-panel" role="dialog" aria-label="赛车菜单"><div class="race-eyebrow">ARCADE RACING</div><h1 id="race-heading">极速飞驰</h1><button id="race-export" type="button" aria-label="导出本机试玩数据JSON">导出数据 ↓</button>
    <div id="race-guide"><div class="race-guide-keys" aria-hidden="true"><span>◎</span></div><p>左手转动方向盘 · 右手漂移 / 小喷 / 氮气</p></div>
    <div id="race-ready"><label class="race-visually-hidden" for="race-stage">关卡</label><select id="race-stage" class="race-native-stage-select" aria-label="选择已解锁关卡"></select><select id="race-map" hidden>${MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select><span class="race-round-tag" id="race-stage-tag"></span><label id="race-skin-label" for="race-skin">车漆</label><select id="race-skin" aria-label="选择车漆（部分需要广告永久解锁）"></select><button id="race-skin-ad" type="button" hidden>看广告永久解锁车漆</button></div><div id="race-course-card"><div id="race-course-map" aria-hidden="true"></div><div class="race-course-info"><span class="race-course-kicker">本场赛道</span><strong id="race-course-name">准备出发</strong><small id="race-course-feel"></small></div></div><p id="race-stage-goal"></p><div id="race-fuel-box"><div id="race-fuel-gauge" role="meter" aria-label="油量" aria-valuemin="0" aria-valuemax="30" aria-valuenow="30" hidden>${'<span></span>'.repeat(6)}</div><span id="race-fuel-info"></span><button id="race-fuel-ad" hidden>观看广告 · 加油 +10</button></div>
    <div id="race-result-stars" hidden aria-label="本场与历史星级"></div><p id="race-result-copy" hidden></p><div id="race-result-stats" hidden></div><ol id="race-results" hidden></ol>
    <div id="race-settings" hidden><label for="race-steering-sens">转向</label><select id="race-steering-sens" aria-label="方向盘转向灵敏度"><option value="calm">柔和</option><option value="normal">标准</option><option value="sharp">灵敏</option></select><label for="race-sound">声音</label><button id="race-sound" type="button" aria-pressed="true">声音：开</button><label for="race-quality">画质</label><select id="race-quality"><option value="low">流畅</option><option value="mid">均衡</option><option value="high">清晰</option></select><small id="race-quality-note">优先流畅，暂停时可调整画质</small></div>
    <div class="race-actions"><button id="race-start" disabled>赛道准备中…</button><button id="race-star-ad" class="race-secondary" hidden type="button">看广告永久解锁本关</button><button id="race-resume" hidden>继续比赛</button><button id="race-replay" hidden>再来一次</button><button id="race-next-ad" class="race-secondary" type="button" hidden>看广告解锁下一关</button><button id="race-retry-ad" class="race-secondary" hidden>看广告 · 下局额外氮气</button><button id="race-next" class="race-secondary" hidden>下一关 →</button><button id="race-lobby" class="race-secondary" hidden>返回首页</button><button id="race-restart" class="race-secondary" hidden>重新开始</button></div>
    <p id="race-note" aria-live="polite"></p>
  </div><section id="race-garage" aria-label="选择赛车"><div class="race-garage-title"><span>赛车</span><strong id="race-car-name"></strong><small id="race-car-status"></small></div><div id="race-car-choices" role="group" aria-label="切换赛车"></div><div class="race-garage-actions"><button id="race-car-ad" type="button" hidden><span aria-hidden="true">▶</span> 看广告 · 永久解锁</button><button id="race-car-owned" type="button" hidden>返回已拥有</button></div><p id="race-car-note" role="status" hidden></p></section><nav id="race-stage-rail" aria-label="主线关卡" hidden><div class="race-stage-rail-meta"><span>关卡</span><span>01 — 30</span></div><div class="race-stage-choices" role="group" aria-label="选择关卡"></div></nav><aside id="race-storage-warning" role="status" hidden>⚠ 本地存储不可用，本次试玩不限油</aside><aside id="race-rotate" hidden role="alert"><div class="race-phone" aria-hidden="true">↻</div><b>请使用横屏</b><span>横屏后继续比赛</span></aside>`;
document.body.append(root);
root.dataset.platform=mobile?'touch':'desktop';
document.documentElement.dataset.racePlatform=root.dataset.platform;
const $ = id => root.querySelector('#race-' + id);
const duel = new RaceDuelTracker();
const shortcutDecisions = new ShortcutDecisionTracker();
const joystick = new RaceWheelSteering(), actions = new TouchActions(),
  driver = new ManualRaceDriver(actions), quality = new QualityMonitor(), touchHealth = new RaceInputHealth();
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
let wheelCaptureFallback=false;
let justFinishedPassed = null;
let adNotice = '', adNoticeUntil = 0;
let gateSelectionIndex = null; // Gate shown only when a player explicitly chooses that locked stage.
let railStageValue = null;
let pendingSkinIndex = null; // Preview selection only; never equips an unowned paint.
let nextStageAdPending = null;
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
let garageNotice='';
const garage=new CarGarage(career,id=>g.previewCar(id),fuelView,()=>phase==='ready');
// The only drag-enabled surface is the exposed native canvas on the right.
// Car/paint cards, the bottom stage rail and race controls remain untouched.
const showcaseCanvas = document.querySelector('#gl');
let showcaseGesture = null;
if (showcaseCanvas) {
  showcaseCanvas.addEventListener('pointerdown', event => {
    const isHeroArea = event.clientX > window.innerWidth * 0.46 &&
      event.clientY > window.innerHeight * 0.18 &&
      event.clientY < window.innerHeight * 0.83;
    if (phase !== 'ready' || loading || backgrounded || garage.busy || !g ||
        !isHeroArea || event.isPrimary === false ||
        (event.pointerType === 'mouse' && event.button !== 0)) return;
    showcaseGesture = { id: event.pointerId, x: event.clientX };
    try { showcaseCanvas.setPointerCapture(event.pointerId); }
    catch { /* Lost capture must not affect the ability to start a race. */ }
  }, { passive: true });
  showcaseCanvas.addEventListener('pointermove', event => {
    if (!showcaseGesture || event.pointerId !== showcaseGesture.id || phase !== 'ready' || !g) return;
    const delta = event.clientX - showcaseGesture.x;
    showcaseGesture.x = event.clientX;
    g.__homeLookOffset = homeOrbitOffset(g.__homeLookOffset, delta);
  }, { passive: true });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    showcaseCanvas.addEventListener(type, event => {
      if (showcaseGesture?.id === event.pointerId) showcaseGesture = null;
    });
  }
}

for(const [index,model] of CAR_MODELS.entries()) {
  const button=document.createElement('button');button.type='button';button.dataset.carId=model.id;
  button.innerHTML='<span class="race-car-thumb"></span><span class="race-car-label"></span><span class="race-car-lock" aria-hidden="true"></span>';
  const thumb=button.querySelector('.race-car-thumb');
  if(CAR_THUMBNAILS[model.id]) {const image=document.createElement('img');image.src=CAR_THUMBNAILS[model.id];image.alt='';thumb.append(image);}
  else thumb.textContent=index===0?'S':'0'+index;
  button.querySelector('.race-car-label').textContent=model.name;
  $('car-choices').append(button);
}
function renderGarage() {
  const view=garage.snapshot();
  $('garage').hidden=phase!=='ready';
  root.dataset.carId=view.id;root.dataset.carOwned=String(view.owned);root.dataset.carLoading=String(view.busy);
  $('car-name').textContent=view.model?.name??'赛车';
  $('car-status').textContent=view.busy?'加载中…':view.error?'加载失败':view.equipped?'已装备':view.owned?'已拥有':'未解锁';
  for(const button of $('car-choices').children) {
    const model=CAR_MODELS.find(item=>item.id===button.dataset.carId);
    const owned=career.progress.ownedCars.includes(model.id);
    button.setAttribute('aria-pressed',String(model.id===view.id));
    button.setAttribute('aria-label',model.name+'，'+(owned?'已拥有':'看广告永久解锁'));
    button.dataset.owned=String(owned);button.disabled=career.adBusy||loading||phase!=='ready';
    button.querySelector('.race-car-lock').textContent=owned?'✓':'🔒';
  }
  $('car-ad').hidden=phase!=='ready'||view.owned||!career.adReady;
  $('car-ad').disabled=loading||!policyReady||!view.canWatch;
  $('car-ad').textContent=career.adBusy?'广告播放中…':'▶ 看广告 · 永久解锁';
  $('car-owned').hidden=view.id===career.progress.car&&!view.error;
  $('car-owned').disabled=career.adBusy||loading;
  const note=garageNotice||(view.error?'模型加载失败，点选赛车可重试':!view.owned&&!career.adReady?'广告暂不可用，可选择已拥有的赛车':'');
  $('car-note').hidden=!note;$('car-note').textContent=note;
  const paintable=view.model?.paintable!==false;
  $('skin-label').hidden=!paintable;$('skin').hidden=!paintable;
  $('skin-ad').hidden=!paintable||phase!=='ready'||pendingSkinIndex===null||!career.canOfferSkinAd(pendingSkinIndex);
}
function fuelView() {
  $('fuel-info').textContent = (!career.storageOK ? '本地存储不可用 · 不限油' :
    career.fuelText()) + (performance.now() < adNoticeUntil ? ' · ' + adNotice : '');
  const metered=career.fuelEnabled;
  if(metered)career.fuel=syncFuel(career.fuel);
  const empty=metered && !career.hasFreeReplay() && career.fuel.amount<FUEL_RULES.raceCost;
  $('fuel-gauge').hidden=!metered;
  $('fuel-gauge').setAttribute('aria-valuenow',String(career.fuel.amount));
  for(const [index,segment] of [...$('fuel-gauge').children].entries()){
    const filled=Math.max(0,Math.min(1,(career.fuel.amount-index*5)/5));
    segment.style.setProperty('--fill',(filled*100)+'%');
    segment.classList.toggle('filled',filled>=1);
  }
  $('fuel-box').classList.toggle('empty',empty);
  $('storage-warning').hidden=career.storageOK;
  for(const id of ['start','replay','restart','next','retry-ad']) $(id).disabled =
    loading || !policyReady || career.adBusy || empty;
  const garageView=garage.snapshot();
  $('start').disabled ||= gateSelectionIndex!==null||!garageView.canRace;
  $('start').textContent=!policyReady?'读取油量规则…':empty?'⏳ 等待油量恢复':
    career.hasFreeReplay()?'免费再赛 ↻':'开始比赛';
  if(phase==='ready'&&!garageView.canRace)$('start').textContent=garageView.busy?'赛车加载中…':garageView.error?'请选择可用赛车':'请选择已拥有赛车';
  $('fuel-ad').hidden=!career.canOfferAd();
  $('fuel-ad').disabled=career.adBusy||garageView.busy||loading;
  $('star-ad').disabled=loading||garageView.busy||!policyReady||!career.canOfferGateAd(gateSelectionIndex);
  $('skin-ad').disabled=loading||garageView.busy||!policyReady||!career.canOfferSkinAd(pendingSkinIndex);
  $('skin').disabled=career.adBusy||garageView.busy;
  $('lobby').disabled=career.adBusy||loading;
  $('stage').disabled=career.adBusy||loading||garageView.busy;
  for(const choice of root.querySelectorAll('button[data-stage-value]')){
    const option=[...$('stage').options].find(item=>item.value===choice.dataset.stageValue);
    choice.disabled=career.adBusy||loading||garageView.busy||!option||option.disabled;
  }
  nextStageAdView();
  renderGarage();
}
function nextStageAdView() {
  const samePending=nextStageAdPending?.result===result&&phase==='finished'&&
    nextStageAdPending?.stageId===career.stage.id;
  const target=STAGES[career.index+1];
  const available=phase==='finished'&&!!result&&!lastRacePassed&&!!target&&
    !career.dailySnapshot&&career.canOfferNextStageAd();
  $('next-ad').hidden=!samePending&&!available;
  $('next-ad').disabled=loading||!policyReady||career.adBusy||!available;
  $('next-ad').textContent=samePending?'广告加载中…':
    target?'看广告解锁第'+target.id+'关':'看广告解锁下一关';
}
function centerSelectedStage() {
  if($('stage-rail').hidden)return;
  const choices=$('stage-rail').querySelector('.race-stage-choices');
  const selected=choices.querySelector('button[aria-pressed="true"]');
  if(!selected)return;
  const strip=choices.getBoundingClientRect(),card=selected.getBoundingClientRect();
  choices.scrollLeft=stageRailScrollLeft(choices.clientWidth,choices.scrollWidth,
    card.left-strip.left+choices.scrollLeft,card.width);
}
function renderStageRail() {
  const choices = $('stage-rail').querySelector('.race-stage-choices');
  const previousScroll=choices.scrollLeft;
  choices.replaceChildren();
  for (const option of [...$('stage').options].filter(option => option.value !== 'daily')) {
    const index = Number(option.value), stage = STAGES[index], gate = career.gateStatus(index);
    const selected = option.value === $('stage').value;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'race-stage-choice';
    button.dataset.stageValue = option.value;
    button.disabled = option.disabled;
    button.dataset.locked = String(!gate.unlocked);
    button.dataset.starLocked = String(gate.starLocked);
    button.setAttribute('aria-label', option.textContent);
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('selected', selected);
    const number = document.createElement('span');
    number.className = 'race-stage-number';
    number.textContent = '第 ' + stage.id + ' 关';
    const name = document.createElement('span');
    name.className = 'race-stage-name';
    name.textContent = (stage.mode==='item'?'道具赛':'竞速赛')+' · '+
      (v11RaceFraction(stage.course)<1?'单程':stage.laps+' 圈');
    const state = document.createElement('span');
    state.className = 'race-stage-state';
    const stars = career.progress.stars[stage.id] ?? 0;
    state.textContent = gate.unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) :
      gate.starLocked ? '🔒 ' + gate.earned + '/' + gate.required + '★' : '🔒 未解锁';
    button.append(number, name, state);
    choices.append(button);
  }
  const dailyOption = [...$('stage').options].find(option => option.value === 'daily');
  const selected = dailyOption.value === $('stage').value;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'race-daily-choice';
  button.dataset.stageValue = dailyOption.value;
  button.disabled = dailyOption.disabled;
  button.setAttribute('aria-label', dailyOption.textContent);
  button.setAttribute('aria-pressed', String(selected));
  button.classList.toggle('selected', selected);
  const number = document.createElement('span');
  number.className = 'race-stage-number';
  number.textContent = '📅';
  const name = document.createElement('span');
  name.className = 'race-stage-name';
  name.textContent = '每日挑战';
  const state = document.createElement('span');
  state.className = 'race-stage-state';
  state.textContent = dailyOption.textContent;
  button.append(number, name, state);
  choices.append(button);
  choices.scrollLeft=previousScroll;
  if(railStageValue!==$('stage').value){
    railStageValue=$('stage').value;
    requestAnimationFrame(centerSelectedStage);
  }
}
function renderLobby() {
  if(gateSelectionIndex!==null && !career.gateStatus(gateSelectionIndex).starLocked)
    gateSelectionIndex=null;
  const locked=gateSelectionIndex!==null ? career.gateStatus(gateSelectionIndex) : null;
  const stage=locked ? STAGES[gateSelectionIndex] : career.stage;
  $('stage').replaceChildren();
  for (let index = 0; index < STAGES.length; index++) {
    const s=STAGES[index], gate=career.gateStatus(index), open=gate.unlocked;
    const option = document.createElement('option');
    option.value = String(index);option.disabled = !open && !gate.starLocked;
    const stars = career.progress.stars[s.id] ?? 0;
    option.textContent = open ? ('第 ' + s.id + ' 关 · ' + s.name + ' ' + '★'.repeat(stars)+'☆'.repeat(3-stars)) :
      gate.starLocked ? ('🔒 第 ' + s.id + ' 关 · ' + gate.earned+'/'+gate.required+'★') :
      ('🔒 第 ' + s.id + ' 关');
    $('stage').append(option);
  }
  const dailyOption = document.createElement('option');
  dailyOption.value = 'daily';dailyOption.disabled = !career.canDaily();
  const today = localDayKey();
  const earnedToday = career.progress.daily.date === today ? career.progress.daily.stars : 0;
  dailyOption.textContent = career.canDaily() ? '📅 每日挑战 ' + '★'.repeat(earnedToday) : '🔒 每日挑战（通过第4关解锁）';
  $('stage').append(dailyOption);
  $('stage').value = locked ? String(gateSelectionIndex) : career.dailySnapshot ? 'daily' : String(career.index);
  renderStageRail();
  root.dataset.courseId = stage.course;
  root.dataset.previewRevision = 'racing-v116-garage';
  const courseInfo=V11_COURSES[stage.course.slice(-2)];
  $('stage-tag').textContent = (!locked && career.dailySnapshot ? '每日挑战' : '第 ' + stage.id + ' 关') +
    ' · ' + (v11RaceFraction(stage.course)<1?'单程':stage.laps+' 圈') +
    ' · ' + (stage.mode === 'item' ? '道具赛' : '竞速赛');
  $('course-map').innerHTML = careerCourseSvg(stage.course);
  $('course-name').textContent = courseInfo?.identity.split('：')[0] ?? stage.name;
  $('course-feel').textContent = (courseInfo?.identity.split('：').slice(1).join('：') ?? '') +
    (SHORTCUT_PLANS[stage.course] ? ' · 可选择近道' : '');
  $('stage-goal').textContent = locked ?
    ('第 '+stage.id+' 关 · 累计 '+locked.earned+'/'+locked.required+'★') :
    stage.goal+' · 累计 '+careerStars(career.progress)+'/90★';
  $('star-ad').hidden=phase!=='ready'||!locked||!career.canOfferGateAd(gateSelectionIndex);
  $('star-ad').textContent=locked?'看广告永久解锁第 '+stage.id+' 关':'看广告永久解锁本关';
  $('start').hidden=phase!=='ready'||!!locked;
  root.dataset.starLocked=locked?'true':'false';
  $('skin').replaceChildren();
  for (let i = 0; i < SKIN_NAMES.length; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    const owned=skinUnlocked(career.progress,i);
    opt.textContent = (owned ? '✓ ' : '🔒 ') + SKIN_NAMES[i] +
      (owned ? (i===0?' · 默认':' · 已永久拥有') : ' · 看广告永久解锁');
    $('skin').append(opt);
  }
  if(pendingSkinIndex!==null && skinUnlocked(career.progress,pendingSkinIndex))
    pendingSkinIndex=null;
  $('skin').value = String(pendingSkinIndex ?? career.progress.skin);
  $('skin-ad').hidden=phase!=='ready'||pendingSkinIndex===null||
    !career.canOfferSkinAd(pendingSkinIndex);
  if(pendingSkinIndex!==null)
    $('skin-ad').textContent='看广告永久解锁 · '+SKIN_NAMES[pendingSkinIndex];
  if (phase === 'ready' && pendingSkinIndex===null) $('note').textContent = '';
  fuelView();
}
Object.defineProperty(window, '__RACE_EVIDENCE__', { get: () => ({ events: events.map(e => ({ ...e })), phase, mode: touchDriving ? 'wheel' : 'keyboard', quality: g?.settings.quality, requestedCourse: career.stage.course, actualCourse: g?.track?.__RACE_COURSE_ID ?? null, actualTrackLength: Number.isFinite(g?.track?.length) ? Math.round(g.track.length) : null, steerAxis: Number(joystick.snapshot().toFixed(3)), duel: g ? duel.snapshot(g,career.stage) : null, replayTapCount, shortcut:shortcutDecisions.snapshot(),fpsEstimate:quality.fps,touchToInputSampleMs:lastTouchSampleAgeMs, phoneInput:touchHealth.snapshot(), nativeSteer:g?.player?.steer??null, cameraYaw:g?.camYaw??null, renderPixelRatio:g?.renderer?.getPixelRatio()??null, composerActive:!!g?.composer, shadowsActive:!!g?.renderer?.shadowMap?.enabled, trial: trial.snapshot(), revision: 'V11.6', platform: mobile?'touch':'desktop', cameraFov: g?.camera?.fov??null, garage:garage.snapshot(), equippedCar:career.progress.car, ownedCars:[...career.progress.ownedCars], displayedCar:(phase==='ready'?g?.racers?.[0]:g?.player)?.model?.userData?.carId??null, displayedCarAsset:(phase==='ready'?g?.racers?.[0]:g?.player)?.model?.userData?.assetIdentity??null }) });
const portrait=()=>mobile&&window.innerHeight>window.innerWidth;
function syncScreenPresentation(){
  const next=raceScreenProfile(window.innerWidth,window.innerHeight,pointerCapabilities())==='touch';
  if(next!==mobile){releaseInput();mobile=next;touchDriving=next;}
  root.dataset.platform=mobile?'touch':'desktop';
  document.documentElement.dataset.racePlatform=root.dataset.platform;
  const guide=$('guide').querySelector('p');
  const text=mobile?'左手转动方向盘 · 右手漂移 / 小喷 / 氮气':'方向键驾驶 · Shift 漂移 · W 小喷 · Ctrl 氮气 / 道具';
  if(guide.textContent!==text)guide.textContent=text;
  const symbol=$('guide').querySelector('.race-guide-keys span');
  symbol.textContent=mobile?'◎':'⌨';
  if(g)g.mobileMode=touchDriving;
}
function syncJoystickVisual() {
  $('stick-knob').style.transform = `rotate(${joystick.visualDegrees.toFixed(1)}deg)`;
  $('joystick').style.setProperty('--turn-strength',Math.abs(joystick.snapshot()).toFixed(3));
  $('joystick').classList.toggle('held',joystick.active);
}
function releaseInput() {
  joystick.clear(); actions.clear(); wheelCaptureFallback=false;
  if (g) clearNativeInput(g.input);
  syncJoystickVisual();
  for (const button of root.querySelectorAll('[data-race-action]')) button.classList.remove('held');
}
function display(next) {
  phase = next; root.dataset.phase = next; root.dataset.stageKind = career.stage.kind;
  $('stage-rail').hidden = next !== 'ready';
  if(next==='ready')requestAnimationFrame(centerSelectedStage);
  const racing = next === 'race' || next === 'countdown';
  $('panel').hidden = racing; $('controls').hidden = !racing; $('pause').hidden = !racing;
  $('start').hidden = next !== 'ready' || gateSelectionIndex!==null;
  $('star-ad').hidden = next !== 'ready' || gateSelectionIndex===null || !career.canOfferGateAd(gateSelectionIndex);
  $('skin-ad').hidden = next !== 'ready' || pendingSkinIndex===null || !career.canOfferSkinAd(pendingSkinIndex);
  $('resume').hidden = next !== 'paused'; $('restart').hidden = next !== 'paused';
  const canAdvance = lastRacePassed && career.nextStage() !== career.index;
  $('replay').hidden = next !== 'finished'; $('retry-ad').hidden = next !== 'finished' || !career.canOfferRetryBoost(); $('next').hidden = next !== 'finished' || !canAdvance; $('lobby').hidden = next !== 'finished';
  nextStageAdView();
  $('replay').classList.toggle('race-secondary', next === 'finished' && canAdvance);
  $('next').classList.remove('race-secondary');
  $('export').hidden = next !== 'ready' && next !== 'finished';
  $('guide').hidden = next !== 'ready' || career.progress.rounds > 0; $('ready').hidden = next !== 'ready'; $('settings').hidden = next !== 'paused';
  for (const id of ['result-stars','result-copy','result-stats','results']) $(id).hidden = next !== 'finished';
  if (next !== 'race') $('knockout').hidden = true;
  $('speed').hidden = next !== 'race'; $('compact-goal').hidden = next !== 'race' || !$('compact-goal').textContent;
  $('note').hidden = next !== 'ready' && next !== 'finished'; // Ad outcomes remain visible on the same result.
  for (const button of root.querySelectorAll('[data-race-action]')) button.disabled = next !== 'race';
  $('joystick').setAttribute('aria-disabled',String(!racing));
  $('joystick').classList.toggle('disabled',!racing);
  root.dataset.itemMode = career.stage.mode === 'item' ? 'true' : 'false';
  if (next === 'paused') { $('heading').textContent = '暂停'; $('quality').value = g.settings.quality; $('sound').textContent = soundEnabled ? '声音：开' : '声音：关'; $('sound').setAttribute('aria-pressed', String(soundEnabled)); }
  renderGarage();
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
  if (!g || loading || garage.busy || !policyReady || backgrounded || document.hidden || portrait() || career.adBusy || gateSelectionIndex!==null || !['ready', 'finished', 'paused'].includes(phase)) return;
  if(phase==='ready'&&!garage.snapshot().canRace)return;
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
  $('note').textContent='';
  duel.reset();shortcutDecisions.reset();$('compact-goal').textContent = '';started = true;
  try {
    if(!career.configure(g)||!g.carIsReady(career.progress.car))throw Error('所选赛车尚未准备好');
    // Mobile camera / anti-jitter settings follow the actual touch mode.
    // ManualRaceDriver has no .enabled flag after the single-wheel migration.
    g.camMode = 1;g.mobileMode = touchDriving;nativeStartRace();
    if (g.state !== 'countdown') throw Error('原生比赛未进入倒计时');
    garage.reset(false);
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
  const previousBest=career.dailySnapshot ?
    (career.progress.daily.date===career.stage.id.slice(6)?career.progress.daily.stars:0) :
    (career.progress.stars[career.stage.id]??0);
  const graded = career.finalize(g, result);
  const stars = graded?.stars ?? 0;
  const bestStars=career.dailySnapshot ? career.progress.daily.stars :
    (career.progress.stars[career.stage.id]??0);
  const starView=$('result-stars');starView.replaceChildren();
  for(let i=1;i<=3;i++){
    const icon=document.createElement('span');
    icon.textContent='★';icon.className=i<=bestStars?'earned':'empty';
    starView.append(icon);
  }
  const starLabel=document.createElement('small');
  starLabel.textContent=bestStars>previousBest
    ? `本场 ${stars} 星 · 新纪录 ${previousBest} → ${bestStars} 星`
    : `本场 ${stars} 星 · 历史最高 ${bestStars} 星`;
  starView.append(starLabel);
  starView.setAttribute('aria-label',starLabel.textContent);
  const forkRun=shortcutDecisions.finish();
  trial.finish(career.stage,result,stars,g.raceTime,duel.snapshot(g,career.stage),forkRun);
  lastRacePassed = stars > 0; // This run did not win just because an earlier run earned a medal.
  justFinishedPassed = lastRacePassed;
  $('heading').textContent = result.finished ? '第 ' + result.place + ' 名' : '未完赛';
  if (result.finished && (!best[result.map] || result.time < best[result.map])) {
    best[result.map] = result.time;try { localStorage.setItem(STORE, JSON.stringify(best)); } catch { /* Play remains available. */ }
  }
  const failure = stars ? null : stageFailureFeedback(career.stage, result, graded?.metric ?? {});
  $('replay').textContent = career.hasFreeReplay() ? '免费再来一局 ↻' : '再来一局 ↻';
  $('result-copy').textContent = stars
    ? (career.dailySnapshot
      ? '每日挑战成功 · 第 ' + result.place + ' 名 · ' + time(result.time) + ' · 当日最佳 ' + time(graded.best) +
        ' · 连续挑战 ' + career.progress.daily.streak + ' 天'
      : '第 ' + result.place + ' 名 · ' + time(result.time) + ' · 最佳 ' + time(graded.best) + ' · 累计 ' + graded.total + ' 星')
    : (result.finished ? '本次未进前三 · ' : '未完赛 · ') + failure.reason +
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
  g.cancelCarPreview();garage.reset(false);garageNotice='';pendingSkinIndex=null;
  $('heading').textContent = '准备第 '+career.stage.id+' 关…';
  try {
    // Different stages in the same biome must still load DIFFERENT geometry.
    if(!career.configure(g))throw Error('所选赛车未解锁');
    await g.prepareCar(career.progress.car);
    const sameCourse = g.map?.id === id && g.track?.__RACE_COURSE_ID === career.stage.course;
    if (!sameCourse) {
      disposeCornerSigns(g);await g.loadMap(id);
      installCornerSigns(g,window.__RACE_THREE__,document);
    }
    g.startDemo();garage.reset(true);loading = false;$('map').value = id;
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
    const content=JSON.stringify({
      ...JSON.parse(trial.exportJSON()),
      phoneInput:touchHealth.snapshot(),
      phoneInputNotes:'Only pointer-event to input-frame sampling and RAF cadence; NOT display latency or verified human skill'
    },null,2);
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
  if (!g || loading || career.adBusy) return;
  releaseInput();started = false;result = null;garageNotice='';career.configure(g);g.startDemo();garage.reset(true);display('ready');renderLobby();
});
$('next').addEventListener('click', () => {
  if(career.adBusy||loading||phase!=='finished')return;
  const next = career.nextStage();if (next === career.index) return;
  career.setStage(next);renderLobby();loadTrack(career.stage.map, true);
});
$('stage').addEventListener('change', () => {
  if(career.adBusy||garage.busy||loading||phase!=='ready'){renderLobby();return;}
  const value=$('stage').value, index=Number(value);
  const gate=value==='daily'?null:career.gateStatus(index);
  if(gate?.starLocked){
    // This is an explicit player choice, never an unsolicited makeup prompt.
    gateSelectionIndex=index;renderLobby();return;
  }
  gateSelectionIndex=null;
  const selected=value==='daily'?career.setDaily():career.setStage(index);
  if(!selected){renderLobby();return;}
  renderLobby();loadTrack(career.stage.map,false);
});
$('stage-rail').addEventListener('click', event => {
  const choice = event.target.closest('button[data-stage-value]');
  if (!choice || choice.disabled || career.adBusy || garage.busy || loading || phase !== 'ready' || choice.dataset.stageValue === $('stage').value) return;
  $('stage').value = choice.dataset.stageValue;
  $('stage').dispatchEvent(new window.Event('change', { bubbles: true }));
});
async function selectCar(id) {
  if(!g||loading||career.adBusy||phase!=='ready')return;
  garageNotice='';pendingSkinIndex=null;
  const out=await garage.select(id);
  if(phase!=='ready'||out.status==='stale')return;
  if(out.status==='equipped')career.configure(g);
  if(out.status==='save-failed')garageNotice='选车未能保存，已恢复原来的赛车';
  renderLobby();
}
$('car-choices').addEventListener('click',event=>{
  const button=event.target.closest('button[data-car-id]');
  if(button&&!button.disabled)void selectCar(button.dataset.carId);
});
$('car-owned').addEventListener('click',()=>void selectCar(career.progress.car));
$('car-ad').addEventListener('click',async()=>{
  if(!g||loading||phase!=='ready'||!policyReady||!garage.snapshot().canWatch)return;
  const id=garage.id;
  garageNotice='';
  const out=await garage.unlock();
  trial.rewardedOutcome(out.status);
  if(phase!=='ready'||out.status==='stale'){fuelView();return;}
  if(out.status==='completed') {
    if(out.equipped)career.configure(g);
    const name=CAR_MODELS.find(model=>model.id===id).name;
    garageNotice=out.equipped?'已永久解锁并装备，下次进入可直接使用':name+'已永久解锁，点选后可装备';
  } else {
    garageNotice=out.status==='save-failed'?'解锁未能保存，请检查浏览器存储后重试':
      out.status==='cancelled'?'广告未完整观看，赛车仍未解锁':
      '广告暂未完成，请稍后重试';
  }
  renderLobby();
});
$('next-ad').addEventListener('click',async()=>{
  if(phase!=='finished'||!result||lastRacePassed||loading||!policyReady||
     career.adBusy||nextStageAdPending||!career.canOfferNextStageAd())return;
  const sourceResult=result,sourceStage=career.stage.id,sourceIndex=career.index;
  nextStageAdPending={result:sourceResult,stageId:sourceStage};
  $('note').textContent='';
  let out;
  try{
    const pending=career.watchNextStageAd();
    fuelView();
    out=await pending;
  }catch{out={status:'failed'};}
  finally{nextStageAdPending=null;}
  out??={status:'failed'};
  trial.rewardedOutcome(out.status);
  if(phase!=='finished'||result!==sourceResult||career.stage.id!==sourceStage){
    fuelView();return;
  }
  if(out.status==='completed'){
    const target=STAGES[out.targetIndex];
    if(out.targetIndex!==sourceIndex+1||target?.id!==out.stageId||
       !career.gateStatus(out.targetIndex).unlocked){
      $('note').textContent='未确认关卡解锁结果，请重试';fuelView();return;
    }
    gateSelectionIndex=null;pendingSkinIndex=null;
    if(!career.setStage(out.targetIndex)){
      $('note').textContent='第'+target.id+'关已解锁，请返回首页选择';fuelView();return;
    }
    renderLobby();
    await loadTrack(career.stage.map,false);
    if(stageTrackReady(g,career.stage))$('note').textContent='第'+target.id+'关已解锁';
  }else{
    display('finished');
    $('note').textContent=rewardedStageStatus(out.status);
  }
  fuelView();
});
$('star-ad').addEventListener('click',async()=>{
  const index=gateSelectionIndex;
  if(phase!=='ready'||garage.busy||loading||index===null||!career.canOfferGateAd(index))return;
  const button=$('star-ad');button.disabled=true;
  button.textContent='广告加载中…';
  const stageId=career.stage.id;
  const pending=career.watchGateAd(index);fuelView();
  const out=await pending;
  trial.rewardedOutcome(out.status);
  if(phase!=='ready'||career.stage.id!==stageId||gateSelectionIndex!==index){fuelView();return;}
  if(out.status==='completed'){
    gateSelectionIndex=null;
    if(!career.setStage(index)){
      renderLobby();$('note').textContent='通行证已保存，请重新选择该关卡';return;
    }
    renderLobby();await loadTrack(career.stage.map,false);
  }else{
    renderLobby();
    $('note').textContent=out.status==='save-failed'
      ?'存档失败，未发放永久通行证；请检查浏览器存储'
      :'广告未完成，本关仍需满足累计星数';
  }
  fuelView();
});
$('skin').addEventListener('change', () => {
  if(career.adBusy||garage.busy||loading||phase!=='ready'||garage.snapshot().model?.paintable===false){renderLobby();return;}
  const index=Number($('skin').value);
  if(!skinUnlocked(career.progress,index)){
    pendingSkinIndex=index;renderLobby();
    $('note').textContent=career.adReady
      ? '该车漆尚未获得，观看一次完整广告即可永久解锁；当前仍使用已拥有的车漆'
      : '当前平台尚未接入可用的激励广告，暂不能获得该车漆；仍可免费比赛';
    return;
  }
  pendingSkinIndex=null;
  if (!career.setSkin(index)) {
    renderLobby();$('note').textContent='切换车漆未能保存，请检查本地存储';return;
  }
  if (g && !loading && phase === 'ready') {career.configure(g);g.startDemo();garage.reset(true);}
  renderLobby();
});
$('skin-ad').addEventListener('click',async()=>{
  const index=pendingSkinIndex;
  if(phase!=='ready'||garage.busy||loading||garage.snapshot().model?.paintable===false||index===null||!career.canOfferSkinAd(index))return;
  $('skin-ad').disabled=true;$('skin-ad').textContent='广告加载中…';
  const stageId=career.stage.id;
  const pending=career.watchSkinAd(index);fuelView();
  const out=await pending;
  trial.rewardedOutcome(out.status);
  if(phase!=='ready'||career.stage.id!==stageId||pendingSkinIndex!==index){fuelView();return;}
  if(out.status==='completed'){
    pendingSkinIndex=null;
    if(career.setSkin(index) && g && !loading){career.configure(g);g.startDemo();garage.reset(true);}
    renderLobby();
    $('note').textContent='已永久解锁 '+SKIN_NAMES[index]+'，下次进入无需再次看广告';
  }else{
    renderLobby();
    $('note').textContent=out.status==='save-failed'
      ?'广告已完成但存档失败，不能发放永久车漆；请检查本地存储'
      :out.status==='stale'
      ?'广告完成时关卡状态已变化，没有发放车漆'
      :'广告未完整观看，车漆保持锁定；不会扣油或扣星';
  }
  fuelView();
});
$('fuel-ad').addEventListener('click', async () => {
  if (!['ready','finished'].includes(phase) || career.adBusy || garage.busy || loading) return;
  $('fuel-ad').disabled = true;$('fuel-info').textContent = '广告加载中…';
  const pending=career.watchFuelAd();fuelView();
  const out = await pending;
  trial.rewardedOutcome(out.status);
  adNotice = out.status === 'completed' ? '已加油 +10' :
    out.status === 'session-credit' ? '广告已完成但存档失败，本次不限油' :
    '广告未完成，油量不变';
  adNoticeUntil = performance.now() + 7000;
  renderLobby();fuelView();
  if (phase === 'ready') $('note').textContent = '';
});
$('retry-ad').addEventListener('click',async()=>{
  if(phase!=='finished'||!career.canOfferRetryBoost())return;
  $('retry-ad').disabled=true;
  const sourceResult=result,stageId=career.stage.id;
  const pending=career.watchRetryBoostAd();fuelView();
  const out=await pending;
  trial.rewardedOutcome(out.status);
  if(phase!=='finished'||result!==sourceResult||career.stage.id!==stageId){fuelView();return;}
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
const actionButtons=Object.fromEntries([...root.querySelectorAll('[data-race-action]')].map(button=>[button.dataset.raceAction,button]));
const recordStickEvent=(kind='move')=>{if(phase!=='race')return;touchSerial++;lastStickEventAt=performance.now();touchHealth.touch(lastStickEventAt,joystick.snapshot(),kind);};
joystickSurface.addEventListener('pointerdown', e => {
  if (e.cancelable) e.preventDefault();
  if (!g || (phase !== 'race' && phase !== 'countdown')) return;
  const r=joystickSurface.getBoundingClientRect();
  if (!joystick.press(e.pointerId,e.clientX,e.clientY,r.left+r.width/2,r.top+r.height/2,r.width/2)) return;
  touchDriving=true;g.mobileMode=true;recordStickEvent('press');
  try {joystickSurface.setPointerCapture(e.pointerId);wheelCaptureFallback=false;}
  catch {wheelCaptureFallback=true;}
  syncJoystickVisual();
});
joystickSurface.addEventListener('pointermove', e => {
  if(joystick.update(e.pointerId,e.clientX,e.clientY)){
    if(e.cancelable)e.preventDefault();
    recordStickEvent();syncJoystickVisual();
  }
});
const endStick=(e)=>{
  if(joystick.release(e.pointerId)){
    if(e.cancelable)e.preventDefault();
    wheelCaptureFallback=false;recordStickEvent(e.type==='pointerup'?'release':'cancel');syncJoystickVisual();
  }
};
joystickSurface.addEventListener('pointerup',endStick);
joystickSurface.addEventListener('pointercancel', endStick);
joystickSurface.addEventListener('lostpointercapture', endStick);
window.addEventListener('pointermove', e => {
  if(!wheelCaptureFallback||joystick.pointerId!==e.pointerId||joystickSurface.contains(e.target))return;
  if(joystick.update(e.pointerId,e.clientX,e.clientY)){
    if(e.cancelable)e.preventDefault();
    recordStickEvent();syncJoystickVisual();
  }
});
for (const kind of ['pointerup','pointercancel']){
  window.addEventListener(kind,e=>{
    endStick(e);
    const action=actions.pointers.get(e.pointerId);
    if(action){
      if(kind==='pointerup')actions.release(e.pointerId);else actions.cancel(e.pointerId);
      actionButtons[action]?.classList.toggle('held',actions.isHeld(action));
    }
  });
}
for(const button of root.querySelectorAll('[data-race-action]')){
  const action=button.dataset.raceAction;
  button.addEventListener('pointerdown',e=>{
    if(e.cancelable)e.preventDefault();
    if(phase!=='race')return;
    touchDriving=true;if(g)g.mobileMode=true;
    try{button.setPointerCapture(e.pointerId);}catch{/* Window release fallback. */}
    actions.press(e.pointerId,action,g?.raceTime??0);recordStickEvent('action');button.classList.add('held');
  });
  button.addEventListener('pointerup',e=>{
    if(e.cancelable)e.preventDefault();
    actions.release(e.pointerId);button.classList.toggle('held',actions.isHeld(action));
  });
  const cancel=e=>{
    if(e.cancelable)e.preventDefault();
    actions.cancel(e.pointerId);button.classList.toggle('held',actions.isHeld(action));
  };
  button.addEventListener('pointercancel',cancel);
  button.addEventListener('lostpointercapture',cancel);
}
const background = () => { backgrounded = true;pause(); };
window.addEventListener('blur', background);
window.addEventListener('focus', () => { backgrounded = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) background();else backgrounded = false; });
const orient = () => { syncScreenPresentation();$('rotate').hidden = !portrait();if (portrait()) pause(); };
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
  g.mobileMode = mobile;g.camMode = 1;g.settings.quality = initialRaceQuality(rememberedQuality,mobile);
  quality.manual = rememberedQuality === 'low' || rememberedQuality === 'mid' || rememberedQuality === 'high';
  career.configure(g);g.setupQuality();
  $('quality').value = g.settings.quality; // Match the actual renderer, not the select's HTML default.
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
      touchHealth.sample(performance.now());
    }
    const translated = driver.frame(raw,g.player,g.state,{canStep,itemMode:g.itemMode,track:g.track,now:g.raceTime ?? 0});
    if (career.index > 0 && g.state === 'race' && g.raceTime < .28) translated.upPressed = false;
    return translated;
  };
  let v10AuthenticBurstAt=-Infinity;
  const nativeEvents = g.handleEvents.bind(g);
  g.handleEvents = player => {
    const pending = player.events.map(event => ({ ...event, data: { ...event.data } }));nativeEvents(player);
    for (const event of pending) {
      career.onEvent(event, g);events.push({ atRaceSec: g.raceTime, type: event.type, ...event.data }); if (events.length > 800) events.shift();
      // Only real native earned micro-spray or double boost gives a small
      // speedometer highlight. This is never an advice overlay or fake award.
      if ((event.type==='smallBoost'&&event.data?.perfect)||
           event.type==='double') {
        v10AuthenticBurstAt=performance.now();
        root.dataset.v10Burst='true';
      }
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
  else {
    loading=true;
    await garage.select(career.progress.car);
    loading=false;fuelView();
  }
  if (!stageTrackReady(g,career.stage)) throw Error('赛道身份校验失败，禁止开始错误的关卡');
  root.dataset.loaded = 'true';
  display('ready');
  const adaptWarmGraphics = dt => {
    const lower = quality.frame(dt, g.settings.quality);
    if (!lower) return;
    g.settings.quality = lower;
    g.setupQuality();
    $('quality').value = lower;
    $('quality-note').textContent = '已自动调低画质，优先保持驾驶流畅';
  };
  let lastFuelTick = 0, lastHudTick=-Infinity;
  const frame = now => {
    const dt = (now - lastFrame) / 1000;lastFrame = now;
    if(root.dataset.v10Burst==='true'&&now-v10AuthenticBurstAt>550)
      root.dataset.v10Burst='false';
    if(touchDriving && phase==='race')touchHealth.frame(dt);
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
            nitroBtn.dataset.label=label;
          }
          const smallBtn = root.querySelector('[data-race-action="small"]');
          if (smallBtn) smallBtn.classList.toggle('ready',g.player.smallWindow > 0);
          const itemBtn = root.querySelector('[data-race-action="item"]');
          if (itemBtn) itemBtn.classList.toggle('ready',!!g.player.items?.[0]);
          const held = g.player.items?.[0];
          if (itemBtn) {
            const icon=held ? (ITEM_ICONS[held] ?? '❔') : '道具';
            itemBtn.dataset.label=icon;
            itemBtn.setAttribute('aria-label',held?'使用'+(ITEM_LABELS[held]??'道具'):'使用道具');
          }
        }
        if (failure) {if (!g.resultShown) g.showResults();finish();}
        root.classList.toggle('drifting', g.player.drifting);
        adaptWarmGraphics(dt);
      }
    }
    // A slow native menu should not remain expensive until AFTER the start click.
    // Countdown already has its own native render-budget guard.
    if (phase === 'ready' && !loading && !backgrounded && !document.hidden && !portrait()) {
      adaptWarmGraphics(dt);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot().catch(error => { $('heading').textContent = '加载需要再试一次';$('note').textContent = error.message;root.dataset.error = 'true'; });
