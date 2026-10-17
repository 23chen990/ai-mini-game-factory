/* global window, document, location, localStorage, performance, requestAnimationFrame, fetch, KeyboardEvent, setTimeout */
import { newProgress, startRound, tickRound, pauseRound, resumeRound, finishRound, rewardRound, saveProgress, loadProgress, adAllowed, purchaseAssist, racePhase, challengesFor, challengeResult, cfEliteChallenge, newChallengeProgress, saveChallengeProgress, loadChallengeProgress, recordChallenge } from './engine.mjs';
import { requestRewardedVideo, createFpsAdapter } from './themes.mjs';
import { createFpsMobileUx, mobileChallengeCopy, cfMissionDebrief, cfEliteUnlocked, cfMissionFacts, cfResultFacts } from './fps-mobile-ux.mjs';
import {CF_CONTROL_DEFAULTS,cfNormalizeControls,cfLoadControls,cfSaveControls,cfApplyControls,cfNewMastery,cfLoadMastery,cfSaveMastery,cfRecordMastery,cfRecordLabel,cfNextMedalGoal} from './cf-player-loop.mjs';
export function fpsSimulatedDeltaMs(previousSeconds, nowSeconds) {
  const a = Number(previousSeconds), b = Number(nowSeconds);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.min(300, (b - a) * 1000)) : 0;
}


async function boot() {
  const id = document.documentElement.dataset.referenceGame;
  if (!['pelican-bike', 'qq-speed', 'cf-transport-ship'].includes(id)) throw Error('Unbound reference game');
  const meta = window.__BUILD_META__ ?? await fetch('build.json').then(r => r.json());
  const key = 'h5-mobile:' + meta.runId + ':' + id + ':v1';
  let progress = newProgress(), storageAvailable = true;
  try { progress = loadProgress(localStorage.getItem(key), id) ?? progress; } catch { storageAvailable = false; }
  const levels = challengesFor(id), challengeKey = key + ':challenges';
  let challengeProgress = newChallengeProgress(id);
  try { challengeProgress = loadChallengeProgress(localStorage.getItem(challengeKey), id) ?? challengeProgress; } catch { storageAvailable = false; }
  // CF mobile preferences and task medals live in their own versioned keys:
  // no changes to the existing games' local saves or engine contracts.
  const cfControlsKey='h5-cf:controls:v1', cfMedalsKey='h5-cf:mastery:v1';
  let cfControls={...CF_CONTROL_DEFAULTS},cfMastery=cfNewMastery(),cfOriginalSens=null;
  if(id==='cf-transport-ship') {
    try {
      cfControls=cfLoadControls(localStorage.getItem(cfControlsKey));
      cfMastery=cfLoadMastery(localStorage.getItem(cfMedalsKey));
    } catch {storageAvailable=false;}
  }
  let selected = levels.find(c => c.id === challengeProgress.selected), activeChallenge;
  let elite = id === 'cf-transport-ship' && challengeProgress.elite === true;
  let fpsUx = null;
  let round = null, startedAt = performance.now(), last = performance.now(), lastFpsNativeSec = 0, native, fishStart = 0, jumpStart = 0, lastNativePhase = 'ready', assistActive = false;
  const root = document.createElement('section'); root.id = 'mobile-kit';
  root.innerHTML = `<header class="mk-header"><b id="mk-title"></b><span>最佳 <b id="mk-best">0</b></span><button id="mk-pause" aria-label="暂停">⏸ 暂停</button></header>
    <div class="mk-meter"><span id="mk-status">准备出发</span><span>积分 <b id="mk-score">0</b></span><span id="mk-time"></span><progress id="mk-goal" max="8" value="0"></progress></div>
    <div id="mk-panel"><div id="mk-fps-kicker" hidden>FIELD OPS / 任务选择</div><h2 id="mk-heading"></h2><p id="mk-copy"></p><div id="mk-fps-brief" hidden aria-label="当前任务参数"></div><div id="mk-fps-results" hidden role="group" aria-label="本局真实战绩"></div>
    <div id="mk-fps-award" hidden role="status" aria-live="polite"></div>
    <div id="mk-fps-options" hidden>
      <button id="mk-fps-pref-toggle" type="button" aria-expanded="false">⚙ 操作设置</button>
      <div id="mk-fps-pref-form" hidden>
        <label for="mk-fps-pref-look">视角灵敏度 <output id="mk-fps-pref-look-value">1.00×</output></label>
        <input id="mk-fps-pref-look" type="range" min="0.65" max="1.55" step="0.05" value="1"/>
        <label for="mk-fps-pref-opacity">触控按钮透明度 <output id="mk-fps-pref-opacity-value">85%</output></label>
        <input id="mk-fps-pref-opacity" type="range" min="0.4" max="1" step="0.05" value="0.85"/>
        <button id="mk-fps-pref-reset" type="button">恢复默认</button>
      </div>
    </div><nav id="mk-challenges" aria-label="选择挑战"></nav><button id="mk-elite" hidden aria-pressed="false">⚡ 精英复战</button><div id="mk-fps-actions"><button id="mk-start" disabled>▶ 场景准备中</button><button id="mk-resume" hidden>▶ 继续</button><button id="mk-replay" hidden>↻ 再来一局</button><button id="mk-next" hidden>▶ 下一关</button></div><button id="mk-assist" hidden>🧭 10补给换下局15秒追鱼辅助</button><button id="mk-ad" hidden>观看广告，补给翻倍</button><p id="mk-notice"></p><small id="mk-storage"></small></div>
    <nav id="mk-controls"><button data-code="ArrowLeft">◀ 左</button><button data-code="ArrowRight">右 ▶</button><button id="mk-action" data-code="Space">⤒ 跳跃</button></nav><aside id="mk-rotate" hidden>📱 ↻<b>请横屏游玩</b><span>转动手机后点击继续</span></aside>`;
  document.body.append(root); const $ = x => root.querySelector('#mk-' + x);
  root.dataset.game = id; root.dataset.phase = 'ready';
  const names = { 'pelican-bike': '骑行抓鱼 · 挑战', 'qq-speed': '赛车 · 私有触控试玩', 'cf-transport-ship': '运输船 · 任务挑战' };
  $('title').textContent = names[id]; $('heading').textContent = names[id]; $('best').textContent = progress.best;
  $('copy').textContent = id === 'pelican-bike' ? '追随前方发光的鱼，左右调整车道。90秒抓到8分；金鱼分数更高。刷新保留最佳成绩和补给，本局会重开。' : '左手移动、右手瞄准，按住开火。手机横屏游玩；离开页面自动暂停。';
  if (!storageAvailable) $('storage').textContent = '存储不可用，本次仍可游玩';
  const persist = () => { try {
    localStorage.setItem(key, saveProgress(progress, id));
    localStorage.setItem(challengeKey, saveChallengeProgress(challengeProgress));
    if(id==='cf-transport-ship'){
      localStorage.setItem(cfControlsKey,cfSaveControls(cfControls));
      localStorage.setItem(cfMedalsKey,cfSaveMastery(cfMastery));
    }
  } catch { storageAvailable = false; $('storage').textContent = '存储不可用，本次仍可游玩'; } };
  const renderFpsPrefs = () => {
    if(id!=='cf-transport-ship')return;
    $('fps-pref-look').value=String(cfControls.sensitivity);
    $('fps-pref-opacity').value=String(cfControls.opacity);
    $('fps-pref-look-value').textContent=cfControls.sensitivity.toFixed(2)+'×';
    $('fps-pref-opacity-value').textContent=Math.round(cfControls.opacity*100)+'%';
    // All original native touch and fire-drag look inputs share sensitivity.
    const g=window.__H5NativeGame;
    if(g?.opts&&cfOriginalSens===null)cfOriginalSens=g.opts.sens;
    if(g?.opts)cfApplyControls(g,cfControls,cfOriginalSens);
    document.documentElement.style.setProperty('--cf-touch-opacity',String(cfControls.opacity));
  };
  const setFpsPrefs = patch => {
    cfControls=cfNormalizeControls({...cfControls,...patch});
    renderFpsPrefs();persist();
  };
  if(id==='cf-transport-ship'){
    $('fps-pref-toggle').addEventListener('click',()=>{
      const open=$('fps-pref-form').hidden;
      $('fps-pref-form').hidden=!open;
      $('fps-pref-toggle').setAttribute('aria-expanded',String(open));
    });
    $('fps-pref-look').addEventListener('input',event=>
      setFpsPrefs({sensitivity:Number(event.target.value)}));
    $('fps-pref-opacity').addEventListener('input',event=>
      setFpsPrefs({opacity:Number(event.target.value)}));
    $('fps-pref-reset').addEventListener('click',()=>setFpsPrefs({...CF_CONTROL_DEFAULTS}));
    renderFpsPrefs();
  }
  // Real DOM text instead of hidden stats, templates, or fabricated battle scores.
  const renderFacts = (element, facts) => {
    element.replaceChildren(...facts.map(({label,value}) => {
      const item=document.createElement('span'),name=document.createElement('small'),number=document.createElement('b');
      name.textContent=label; number.textContent=value;
      item.append(name,number); return item;
    }));
  };
  const renderSelection = () => {
    const available = id === 'cf-transport-ship' && cfEliteUnlocked(challengeProgress.records[selected.id]);
    if (!available) { elite = false; if (id === 'cf-transport-ship') challengeProgress.elite = false; }
    $('elite').hidden = !available || root.dataset.phase !== 'ready';
    $('elite').setAttribute('aria-pressed', String(elite));
    $('elite').textContent = elite
      ? '⚡ 精英模式已开启 · 点击返回普通'
      : '⚡ 进阶复战 · 敌人更强，无自动辅助';
    $('heading').textContent = selected.title;
    const displayChallenge = id==='cf-transport-ship'&&elite
      ? cfEliteChallenge(selected) : {...selected,elite:false};
    $('copy').textContent = id === 'cf-transport-ship'
      ? mobileChallengeCopy(displayChallenge)
      : selected.instructions;
    $('challenges').innerHTML = levels.map(c => {
      const record = challengeProgress.records[c.id];
      const medalLabel=id==='cf-transport-ship'?
        cfRecordLabel(cfMastery,c):'';
      const state=medalLabel&&medalLabel!=='尚未通关'?medalLabel
        : record?.eliteWins > 0 ? '⚡ 精英通关'
        : record?.wins ? '✓ 已完成' : Math.ceil(c.limitMs / 1000) + '秒';
      return `<button data-challenge-id="${c.id}" data-kind="${c.kind}" aria-pressed="${c.id === selected.id}"><b>${c.title}</b><small>${state}</small></button>`;
    }).join('');
    $('goal').max = id === 'cf-transport-ship' && displayChallenge.drill==='reposition'
      ? displayChallenge.openingHits + displayChallenge.minTravel + displayChallenge.target
      : id === 'cf-transport-ship' && selected.kind === 'defend'
        ? displayChallenge.target*displayChallenge.holdSeconds
      : id === 'cf-transport-ship' && selected.kind === 'survive' ? selected.limitMs / 1000 : selected.target;
    $('goal').value = 0; root.dataset.challenge = selected.id;
    if (id === 'cf-transport-ship') {
      renderFacts($('fps-brief'),cfMissionFacts(displayChallenge));
      fpsUx?.onSelect(displayChallenge);
      $('fps-brief').hidden=false;
      $('fps-results').hidden=true;
      $('fps-award').hidden=true;
      if(root.dataset.loaded==='true')$('start').textContent=elite?'⚡ 开始精英挑战 →':'进入战场 →';
    }
  };
  $('challenges').addEventListener('click', e => {
    const c = levels.find(c => c.id === e.target.closest('[data-challenge-id]')?.dataset.challengeId);
    if (!c || round?.phase === 'running' || round?.phase === 'paused') return;
    selected = c; elite = false;
    if (id === 'cf-transport-ship') challengeProgress.elite = false;
    challengeProgress.selected = c.id; persist();
    if (round?.phase === 'finished') location.reload(); else renderSelection();
  });
  $('elite').addEventListener('click', () => {
    if (id !== 'cf-transport-ship' || root.dataset.phase !== 'ready' ||
        !cfEliteUnlocked(challengeProgress.records[selected.id])) return;
    elite = !elite;
    challengeProgress.elite = elite;
    persist(); renderSelection();
  });
  renderSelection();
  const emit = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const held = new Set();
  const clearInput = () => { for (const code of held) emit(code, 'keyup'); held.clear(); native?.clearInput?.(); };
  for (const button of root.querySelectorAll('[data-code]')) {
    button.addEventListener('pointerdown', e => { e.preventDefault(); if (!round || round.phase !== 'running') return; button.setPointerCapture(e.pointerId); const code = button.dataset.code; held.add(code); emit(code, 'keydown'); button.classList.add('held'); });
    const release = () => { const code = button.dataset.code; held.delete(code); emit(code, 'keyup'); button.classList.remove('held'); };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  }
  const wait = () => new Promise(resolve => setTimeout(resolve, 40));
  for (let tries = 0; tries < 500; tries++) {
    if (id === 'pelican-bike' && window.__pelican) {
      const p = window.__pelican; p.S.paused = true; p.settings.autopilot = false;
      p.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1)); p.renderer.shadowMap.enabled = false;
      p.setCamMode('chase', true);
      native = { start: () => { document.getElementById('startMute').click(); p.S.distance = 0; p.S.nextFishAt = 30; p.S.fish = 0; p.S.time = 0; p.S.paused = false; fishStart = p.S.fish; jumpStart = p.S.jumps; assistActive = progress.assistTokens > 0; if (assistActive) progress.assistTokens--; p.settings.autopilot = assistActive; }, pause: () => { p.S.paused = true; }, resume: () => { p.S.paused = false; }, phase: () => p.S.paused ? 'paused' : 'running', score: () => p.S.fish - fishStart, metrics: () => ({points:p.S.fish-fishStart,jumps:p.S.jumps-jumpStart}), clearInput: () => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(c => emit(c, 'keyup')) };
      break;
    }
    if (id === 'qq-speed' && window.game?.input && window.game.track && !window.game.loading) {
      const g = window.game; g.settings.laps = 1; g.settings.diff = 0; g.settings.quality = 'low'; g.setupQuality(); g.buildMenu();
      native = { start: async c => { g.settings.map = c.map; if (g.map?.id !== c.map) await g.loadMap(c.map); document.getElementById('start').click(); }, pause: () => { if (['race', 'countdown', 'finish'].includes(g.state)) g.togglePause(); }, resume: () => { if (g.state === 'paused') g.togglePause(); }, phase: () => racePhase(g.state), score: () => g.state === 'finish' && g.player.finished ? 1 : 0, clearInput: () => { g.input.down.clear(); for (const k of Object.keys(g.input.touch)) g.input.touch[k] = false; } };
      native.metrics = () => ({finished:!!g.player?.finished,place:g.standings.indexOf(g.player)+1,drifts:g.player?.stats?.drift||0});
      break;
    }
    if (id === 'cf-transport-ship' && window.__H5NativeGame?.hud && !document.getElementById('menu')?.classList.contains('hidden')) { const g = window.__H5NativeGame; native = createFpsAdapter(g, document); const originalStart = native.start; if (!g.__mkAwmKillHooked) {
        const underlyingKill = g.kill;
        g.__mkAwmKills = 0;
        g.kill = function (victim, attacker, weapon, ...rest) {
          if (attacker === g.player && victim !== attacker && victim?.team !== attacker?.team && weapon === 'awm') g.__mkAwmKills++;
          return underlyingKill.call(this, victim, attacker, weapon, ...rest);
        };
        g.__mkAwmKillHooked = true;
      }
      native.start = c => { g.opts.primary = c.weapon; g.__mkAwmKills = 0; originalStart(c); };
      native.metrics = () => ({hits:g.player?.stats?.hits||0,shots:g.player?.stats?.shots||0,
        kills:g.player?.stats?.k||0,awmKills:g.__mkAwmKills||0,deaths:g.player?.stats?.d||0,
        travel:fpsUx?.distanceMeters()||0,...fpsUx?.drillMetrics(),
        ...fpsUx?.defenseMetrics()});
      native.simulatedSeconds = () => g.time;
      fpsUx = createFpsMobileUx(g, root, document);
      renderFpsPrefs();break; }
    await wait();
  }
  if (!native) { $('copy').textContent = '加载尚未完成，请刷新或换用支持 WebGL 的浏览器。'; return; }
  root.dataset.loaded = 'true'; $('start').disabled = false; $('start').textContent = '▶ 开始';
  if (id === 'cf-transport-ship') {
    $('replay').textContent='↻ 重试本关';
    renderSelection();
  }
  if (id !== 'pelican-bike') root.querySelector('#mk-controls').hidden = true;
  const showPhase = phase => {
    root.dataset.phase = phase;
    $('panel').hidden = phase === 'running'; $('start').hidden = phase !== 'ready';
    $('challenges').hidden = !['ready','finished'].includes(phase);
    $('resume').hidden = phase !== 'paused'; $('replay').hidden = phase !== 'finished';
    $('elite').hidden = phase !== 'ready' || id !== 'cf-transport-ship' || !cfEliteUnlocked(challengeProgress.records[selected.id]);
    if (id === 'cf-transport-ship') {
      $('fps-kicker').hidden=false;
      $('fps-kicker').textContent=phase==='finished'
        ? (root.dataset.outcome==='won' ? 'MISSION COMPLETE / 战绩结算' : 'MISSION FAILED / 复盘')
        : phase==='paused' ? 'PAUSED / 已暂停' : 'FIELD OPS / 选择挑战';
      $('fps-brief').hidden=phase!=='ready';
      $('fps-results').hidden=phase!=='finished';
      $('fps-award').hidden=phase!=='finished';
      $('fps-options').hidden=!['ready','paused'].includes(phase);
      if(!['ready','paused'].includes(phase)) {
        $('fps-pref-form').hidden=true;
        $('fps-pref-toggle').setAttribute('aria-expanded','false');
      }
    }
    const nextIndex = activeChallenge ? levels.findIndex(c => c.id === activeChallenge.id)+1 : -1;
    const next = id === 'cf-transport-ship' && phase === 'finished' &&
      root.dataset.outcome === 'won' ? levels[nextIndex] : null;
    $('next').hidden = !next;
    if(next)$('next').textContent = '下一关 · ' + next.title + ' →';
    $('pause').disabled = !round || !['running', 'paused'].includes(round.phase);
    $('pause').textContent = phase === 'paused' ? '▶ 继续' : '⏸ 暂停';
  };
  const portraitBlocked = () => id !== 'pelican-bike' && window.innerHeight > window.innerWidth;
  const start = async () => { if (portraitBlocked() || root.dataset.phase !== 'ready') return; activeChallenge = id === 'cf-transport-ship' ? (elite && cfEliteUnlocked(challengeProgress.records[selected.id]) ? cfEliteChallenge(selected) : {...selected,elite:false}) : selected; $('start').disabled = true; $('heading').textContent = '准备场景…'; showPhase('loading'); try {
    if(activeChallenge?.drill==='reposition')
      $('goal').max=activeChallenge.openingHits+activeChallenge.minTravel+activeChallenge.target;
    if(activeChallenge?.kind==='defend')
      $('goal').max=activeChallenge.target*activeChallenge.holdSeconds;
    await native.start(activeChallenge); round = startRound(progress, activeChallenge.limitMs); fpsUx?.onStart(activeChallenge); last = performance.now(); lastFpsNativeSec = native.simulatedSeconds?.() || 0; showPhase('running'); persist(); if (portraitBlocked()) pause(); } catch (error) { $('copy').textContent = '准备失败：' + error.message; showPhase('ready'); } finally { $('start').disabled = false; } };
  const pause = () => { if (round?.phase !== 'running') return; pauseRound(round); native.pause(); clearInput(); $('heading').textContent = '已暂停'; $('copy').textContent = '点击继续，从当前画面接着玩。'; showPhase('paused'); persist(); };
  const resume = () => { if (portraitBlocked() || round?.phase !== 'paused') return; resumeRound(round); native.resume(); last = performance.now(); showPhase('running'); };
  $('start').addEventListener('click', start); $('pause').addEventListener('click', () => round?.phase === 'paused' ? resume() : pause()); $('resume').addEventListener('click', resume);
  $('replay').addEventListener('click', () => location.reload());
  $('next').addEventListener('click', () => {
    if (id !== 'cf-transport-ship' || root.dataset.phase !== 'finished' ||
        root.dataset.outcome !== 'won') return;
    const index = levels.findIndex(c => c.id === activeChallenge?.id);
    const next = levels[index + 1];
    if(!next)return;
    challengeProgress.selected=next.id;
    challengeProgress.elite=false;
    persist();
    location.reload();
  });
  window.addEventListener('blur', pause); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  const orientation = () => { const blocked = portraitBlocked(); $('rotate').hidden = !blocked; if (blocked) pause(); };
  window.addEventListener('resize', orientation); orientation();
  const config = window.__PLATFORM_META__ ?? await fetch('platform.json').then(r => r.json()).catch(() => ({status:'PENDING',source:'NOT_RUN'}));
  $('assist').hidden = id !== 'pelican-bike';
  $('assist').addEventListener('click', () => { const bought = purchaseAssist(progress); persist(); $('notice').textContent = bought ? '已准备下局追鱼辅助' : '需要10补给，且一次只准备一个辅助'; });
  $('ad').addEventListener('click', async () => {
    const current = round;
    if (!current || !adAllowed(current, progress, performance.now() - startedAt)) return;
    $('ad').disabled = true; $('notice').textContent = '广告加载中…';
    const result = await requestRewardedVideo({ tap: window.tap, config });
    if (current !== round) return;
    const rewarded = rewardRound(current, progress, result.status === 'completed'); persist();
    $('notice').textContent = rewarded ? '补给已翻倍' : '没有发放额外奖励，仍可直接重开'; $('ad').disabled = false; $('ad').hidden = rewarded;
  });
  showPhase('ready');
  function frame(now) {
    const dt = Math.min(1000, Math.max(0, now - last)); last = now;
    const phase = native.phase();
    fpsUx?.update(round?.phase === 'running', now);
    if (round && round.phase === 'running') {
      if (phase === 'paused') pause();
      else {
        const roundTickMs = id === 'cf-transport-ship' && native.simulatedSeconds
          ? fpsSimulatedDeltaMs(lastFpsNativeSec, native.simulatedSeconds()) : dt;
        if (id === 'cf-transport-ship' && native.simulatedSeconds) lastFpsNativeSec = native.simulatedSeconds();
        tickRound(round, roundTickMs, native.score());
        if (assistActive && round.elapsedMs >= 15000) { window.__pelican.settings.autopilot = false; assistActive = false; }
        const metrics = native.metrics();
        const result = challengeResult(activeChallenge, metrics, round.phase === 'finished' || phase === 'finished', round.elapsedMs);
        round.score = result.rewardScore;
        $('status').textContent = activeChallenge.kind==='defend'
          ? (metrics.defenseBreached?'✕ 据点失守':
             '◆ '+(metrics.defenseSite||'A')+' '+
             Math.floor(metrics.defenseHeld||0)+'/'+activeChallenge.holdSeconds+'秒'+
             (metrics.defenseContested?' · 争夺中':
              (metrics.defenseEnemyHeld||0)>=2
                ? ' · 敌'+Math.floor(metrics.defenseEnemyHeld)+'/'+activeChallenge.breachSeconds+'秒':''))
          : activeChallenge.drill==='reposition'
          ? result.label
          : activeChallenge.kind === 'survive'
          ? '❤ 余' + Math.max(0, activeChallenge.target - (metrics.deaths || 0)) + '次 · ↗ ' +
            Math.floor(metrics.travel || 0) + '/' + (activeChallenge.minTravel || 0) + 'm'
          : activeChallenge.maxDeaths!==undefined
            ? '☠ ' + (metrics.deaths||0) + '/' + activeChallenge.maxDeaths + ' · ' + result.label
            : result.label;
        $('goal').value = activeChallenge.kind==='defend'
          ? Math.min(activeChallenge.target,(metrics.defenseCaptured||0))*activeChallenge.holdSeconds+
            Math.min(activeChallenge.holdSeconds,metrics.defenseHeld||0)
          : activeChallenge.drill==='reposition'
          ? (metrics.drillFirstHit?activeChallenge.openingHits:0) +
            Math.min(activeChallenge.minTravel,metrics.drillTravel||0) +
            Math.min(activeChallenge.target,metrics.drillFollowUpHits||0)
          : activeChallenge.kind === 'survive'
            ? Math.min(activeChallenge.limitMs / 1000, Math.round(round.elapsedMs / 1000))
            : Math.min(result.value, activeChallenge.target);
        if (result.outcome !== 'running') {
          finishRound(round, progress); native.pause(); clearInput(); persist();
          recordChallenge(challengeProgress, activeChallenge, round.score, result.outcome);
          const award=id==='cf-transport-ship'
            ?cfRecordMastery(cfMastery,activeChallenge,metrics,result.outcome,round.elapsedMs):null;
          persist();
          root.dataset.outcome = result.outcome;
          if(id==='cf-transport-ship'){
            const medal=award?.medal;
            const best=award?.record?.bestMs;
            $('fps-award').textContent=medal
              ? '★'.repeat(medal.stars)+'☆'.repeat(3-medal.stars)+' '+
                medal.label+(award.newBest?' · 最速纪录！':'')+
                ' · 本局'+(medal.timeMs/1000).toFixed(1)+'秒'+
                (medal.accuracy!==null?' · 命中率'+medal.accuracy+'%':'')+
                (best?' · 最快'+(best/1000).toFixed(1)+'秒':'')+
                (cfNextMedalGoal(activeChallenge,medal)
                  ? ' · '+cfNextMedalGoal(activeChallenge,medal):'')
              : '本次未取得勋章 · 完成挑战可解锁个人最速与星级';
          }
          $('heading').textContent = result.outcome === 'won' ? (activeChallenge.elite ? '⚡ 精英复战成功！' : '✓ ' + activeChallenge.title + '完成！') : (activeChallenge.elite ? '精英复战失败' : '本次挑战未完成');
          $('copy').textContent = id === 'cf-transport-ship'
            ? cfMissionDebrief(activeChallenge, metrics, result.outcome)
            : `${result.label} · ${activeChallenge.instructions} 本局 ${round.score}分 · 补给 ${progress.bank}。`;
          if (id === 'cf-transport-ship')
            renderFacts($('fps-results'), cfResultFacts(activeChallenge,metrics,round.elapsedMs));
          $('challenges').querySelector(`[data-challenge-id="${activeChallenge.id}"] small`).textContent =
            id==='cf-transport-ship'&&cfRecordLabel(cfMastery,activeChallenge)!=='尚未通关'
              ?cfRecordLabel(cfMastery,activeChallenge)
              :result.outcome==='won'?(activeChallenge.elite?'⚡ 精英通关':'✓ 已完成'):'可重试';
          $('best').textContent = progress.best; showPhase('finished');
          // The placement is wired but hidden until the actual H5 account's check_ads_status is verified.
          $('ad').hidden = config.status !== 1 || !adAllowed(round, progress, now - startedAt);
        }
      }
      $('score').textContent = round.score;
      $('time').textContent = round.limitMs ? Math.max(0, Math.ceil((round.limitMs - round.elapsedMs) / 1000)) + '秒' : '原生对局';
      root.classList.toggle('urgent', round.limitMs !== null && round.limitMs - round.elapsedMs < 15000);
      if (assistActive) $('status').textContent += ' · 🧭 辅助';
    }
    if (phase !== lastNativePhase) { root.dataset.nativePhase = phase; lastNativePhase = phase; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
boot().catch(error => { const p = document.createElement('p'); p.textContent = '手机适配加载失败：' + error.message; document.body.append(p); });
