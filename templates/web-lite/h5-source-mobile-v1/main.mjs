/* global window, document, location, localStorage, performance, requestAnimationFrame, fetch, KeyboardEvent, setTimeout */
import { newProgress, startRound, tickRound, pauseRound, resumeRound, finishRound, rewardRound, saveProgress, loadProgress, adAllowed, purchaseAssist, racePhase, challengesFor, challengeResult, newChallengeProgress, saveChallengeProgress, loadChallengeProgress, recordChallenge } from './engine.mjs';
import { requestRewardedVideo, createFpsAdapter } from './themes.mjs';
import { createFpsMobileUx, mobileChallengeCopy } from './fps-mobile-ux.mjs';

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
  let selected = levels.find(c => c.id === challengeProgress.selected), activeChallenge;
  let fpsUx = null;
  let round = null, startedAt = performance.now(), last = performance.now(), native, fishStart = 0, jumpStart = 0, lastNativePhase = 'ready', assistActive = false;
  const root = document.createElement('section'); root.id = 'mobile-kit';
  root.innerHTML = `<header class="mk-header"><b id="mk-title"></b><span>最佳 <b id="mk-best">0</b></span><button id="mk-pause" aria-label="暂停">⏸ 暂停</button></header>
    <div class="mk-meter"><span id="mk-status">准备出发</span><span>积分 <b id="mk-score">0</b></span><span id="mk-time"></span><progress id="mk-goal" max="8" value="0"></progress></div>
    <div id="mk-panel"><h2 id="mk-heading"></h2><p id="mk-copy"></p><nav id="mk-challenges" aria-label="选择挑战"></nav><button id="mk-start" disabled>▶ 场景准备中</button><button id="mk-resume" hidden>▶ 继续</button><button id="mk-replay" hidden>↻ 再来一局</button><button id="mk-assist" hidden>🧭 10补给换下局15秒追鱼辅助</button><button id="mk-ad" hidden>观看广告，补给翻倍</button><p id="mk-notice"></p><small id="mk-storage"></small></div>
    <nav id="mk-controls"><button data-code="ArrowLeft">◀ 左</button><button data-code="ArrowRight">右 ▶</button><button id="mk-action" data-code="Space">⤒ 跳跃</button></nav><aside id="mk-rotate" hidden>📱 ↻<b>请横屏游玩</b><span>转动手机后点击继续</span></aside>`;
  document.body.append(root); const $ = x => root.querySelector('#mk-' + x);
  root.dataset.game = id; root.dataset.phase = 'ready';
  const names = { 'pelican-bike': '骑行抓鱼 · 挑战', 'qq-speed': '赛车 · 私有触控试玩', 'cf-transport-ship': '运输船 · 任务挑战' };
  $('title').textContent = names[id]; $('heading').textContent = names[id]; $('best').textContent = progress.best;
  $('copy').textContent = id === 'pelican-bike' ? '追随前方发光的鱼，左右调整车道。90秒抓到8分；金鱼分数更高。刷新保留最佳成绩和补给，本局会重开。' : '左手移动、右手瞄准，按住开火。手机横屏游玩；离开页面自动暂停。';
  if (!storageAvailable) $('storage').textContent = '存储不可用，本次仍可游玩';
  const persist = () => { try { localStorage.setItem(key, saveProgress(progress, id)); localStorage.setItem(challengeKey, saveChallengeProgress(challengeProgress)); } catch { storageAvailable = false; $('storage').textContent = '存储不可用，本次仍可游玩'; } };
  const renderSelection = () => {
    $('heading').textContent = selected.title; $('copy').textContent = id === 'cf-transport-ship' ? mobileChallengeCopy(selected) : selected.instructions;
    $('challenges').innerHTML = levels.map(c => `<button data-challenge-id="${c.id}" aria-pressed="${c.id === selected.id}"><b>${c.title}</b><small>${challengeProgress.records[c.id]?.wins ? '✓ 已完成' : Math.ceil(c.limitMs/1000)+'秒'}</small></button>`).join('');
    $('goal').max = id === 'cf-transport-ship' && selected.kind === 'survive' ? selected.limitMs / 1000 : selected.target; $('goal').value = 0; root.dataset.challenge = selected.id;
  };
  $('challenges').addEventListener('click', e => { const c = levels.find(c => c.id === e.target.closest('[data-challenge-id]')?.dataset.challengeId); if (!c || round?.phase === 'running' || round?.phase === 'paused') return; selected = c; challengeProgress.selected = c.id; persist(); if (round?.phase === 'finished') location.reload(); else renderSelection(); });
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
    if (id === 'cf-transport-ship' && window.__H5NativeGame?.hud && !document.getElementById('menu')?.classList.contains('hidden')) { const g = window.__H5NativeGame; native = createFpsAdapter(g, document); const originalStart = native.start; native.start = c => { g.opts.primary = c.weapon; originalStart(); }; native.metrics = () => ({hits:g.player?.stats?.hits||0,kills:g.player?.stats?.k||0,deaths:g.player?.stats?.d||0}); fpsUx = createFpsMobileUx(g, root, document); break; }
    await wait();
  }
  if (!native) { $('copy').textContent = '加载尚未完成，请刷新或换用支持 WebGL 的浏览器。'; return; }
  root.dataset.loaded = 'true'; $('start').disabled = false; $('start').textContent = '▶ 开始';
  if (id !== 'pelican-bike') root.querySelector('#mk-controls').hidden = true;
  const showPhase = phase => {
    root.dataset.phase = phase;
    $('panel').hidden = phase === 'running'; $('start').hidden = phase !== 'ready';
    $('challenges').hidden = !['ready','finished'].includes(phase);
    $('resume').hidden = phase !== 'paused'; $('replay').hidden = phase !== 'finished';
    $('pause').disabled = !round || !['running', 'paused'].includes(round.phase);
    $('pause').textContent = phase === 'paused' ? '▶ 继续' : '⏸ 暂停';
  };
  const portraitBlocked = () => id !== 'pelican-bike' && window.innerHeight > window.innerWidth;
  const start = async () => { if (portraitBlocked() || root.dataset.phase !== 'ready') return; activeChallenge = selected; $('start').disabled = true; $('heading').textContent = '准备场景…'; showPhase('loading'); try { await native.start(activeChallenge); round = startRound(progress, activeChallenge.limitMs); fpsUx?.onStart(activeChallenge); last = performance.now(); showPhase('running'); persist(); if (portraitBlocked()) pause(); } catch (error) { $('copy').textContent = '准备失败：' + error.message; showPhase('ready'); } finally { $('start').disabled = false; } };
  const pause = () => { if (round?.phase !== 'running') return; pauseRound(round); native.pause(); clearInput(); $('heading').textContent = '已暂停'; $('copy').textContent = '点击继续，从当前画面接着玩。'; showPhase('paused'); persist(); };
  const resume = () => { if (portraitBlocked() || round?.phase !== 'paused') return; resumeRound(round); native.resume(); last = performance.now(); showPhase('running'); };
  $('start').addEventListener('click', start); $('pause').addEventListener('click', () => round?.phase === 'paused' ? resume() : pause()); $('resume').addEventListener('click', resume);
  $('replay').addEventListener('click', () => location.reload());
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
        tickRound(round, dt, native.score());
        if (assistActive && round.elapsedMs >= 15000) { window.__pelican.settings.autopilot = false; assistActive = false; }
        const result = challengeResult(activeChallenge, native.metrics(), round.phase === 'finished' || phase === 'finished');
        round.score = result.rewardScore;
        $('status').textContent = activeChallenge.kind === 'survive'
          ? '❤ 可失误 ' + Math.max(0, activeChallenge.target - (native.metrics().deaths || 0)) + ' 次'
          : result.label;
        $('goal').value = activeChallenge.kind === 'survive'
          ? Math.min(activeChallenge.limitMs / 1000, Math.round(round.elapsedMs / 1000))
          : Math.min(result.value, activeChallenge.target);
        if (result.outcome !== 'running') {
          finishRound(round, progress); native.pause(); clearInput(); persist();
          recordChallenge(challengeProgress, activeChallenge, round.score, result.outcome); persist();
          root.dataset.outcome = result.outcome;
          $('heading').textContent = result.outcome === 'won' ? '✓ ' + activeChallenge.title + '完成！' : '本次挑战未完成';
          $('copy').textContent = result.outcome === 'won'
            ? '任务成功！本局 ' + round.score + ' 分 · 累计补给 ' + progress.bank
            : '这次未达成：' + mobileChallengeCopy(activeChallenge) + '。再试一次吧。';
          $('challenges').querySelector(`[data-challenge-id="${activeChallenge.id}"] small`).textContent = result.outcome === 'won' ? '✓ 已完成' : '可重试';
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
