/* global performance */
/* FPS-only, original mobile UX overlay. Does not alter hit detection, team rules or AI. */
export function teamSide(ownTeam, actorTeam) {
  if (!['BL', 'GR'].includes(ownTeam) || !['BL', 'GR'].includes(actorTeam)) return 'unknown';
  return ownTeam === actorTeam ? 'ally' : 'enemy';
}

export function playerRelativeScore(score, ownTeam) {
  if (!score || !['BL', 'GR'].includes(ownTeam)) return { ally: 0, enemy: 0 };
  const other = ownTeam === 'BL' ? 'GR' : 'BL';
  return { ally: Math.max(0, Number(score[ownTeam]) || 0), enemy: Math.max(0, Number(score[other]) || 0) };
}

/** Render enemy badges only if actually visible; never give the player a wallhack. */
export function enemyBadgeAllowed({ side, alive, distance, x, y, z, coverDistance }) {
  return side === 'enemy' && alive === true &&
    Number.isFinite(distance) && distance > 0 && distance <= 44 &&
    Number.isFinite(x) && Math.abs(x) < 0.93 &&
    Number.isFinite(y) && y > -0.76 && y < 0.79 &&
    Number.isFinite(z) && z >= -1 && z <= 1 &&
    (coverDistance === null || (Number.isFinite(coverDistance) && coverDistance >= distance - 0.45));
}

export function mobileTouchAction(index) {
  return ['fire', 'duplicate-fire', 'jump', 'crouch', 'reload', 'switch', 'scope'][index] || 'unknown';
}

export function mobileChallengeCopy(challenge) {
  if (!challenge) return '';
  if (challenge.kind === 'hits') return '60秒内，射中敌人3次';
  if (challenge.kind === 'kills') return '90秒内，使用 AWM 狙击枪击杀1名敌人';
  if (challenge.kind === 'survive') return '坚持45秒，移动20米，最多被击倒2次';
  return challenge.instructions || '';
}


// Mobile-first tuning: soften the first encounter; increase pressure with time
// and demonstrated player success. These are bot perception/behavior knobs,
// not health, weapon damage, hitboxes, spawn cheats or automatic player kills.
export function mobileEnemyDifficulty(kind, seconds = 0, stats = {}) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hits = Math.max(0, Number(stats.hits) || 0);
  const kills = Math.max(0, Number(stats.k) || 0);
  const deaths = Math.max(0, Number(stats.d) || 0);
  const ramp = clamp((elapsed - 22) / 40 + (hits >= 2 ? 0.24 : 0) +
    (kills >= 1 ? 0.18 : 0) - (deaths >= 2 ? 0.16 : 0));
  const lerp = (a, b) => +(a + (b - a) * ramp).toFixed(3);
  const sniper = kind === 'kills';
  const survivor = kind === 'survive';
  return {
    react: [lerp(survivor ? 0.9 : 1.1, 0.55), lerp(survivor ? 1.4 : 1.65, 0.94)],
    aimErr: lerp(survivor ? 0.105 : 0.13, 0.074),
    turn: lerp(2.6, 3.7),
    track: lerp(1.65, 2.45),
    headP: lerp(0.005, sniper ? 0.035 : 0.075),
    ctrl: lerp(1.0, 0.94),
    comp: lerp(0.4, 0.58),
    strafe: lerp(sniper ? 0.10 : 0.14, sniper ? 0.28 : 0.42),
    see: lerp(38, 52), fov: lerp(1.48, 1.75), bunny: 0
  };
}

// Select among *existing authored spawn points* instead of teleporting into
// combat. A clear forward route reduces first-session container dead ends.
export function selectMobileSpawn(spawns, team, actors, world) {
  if (!Array.isArray(spawns) || !spawns.length || !world?.raycast) return null;
  const others = (actors || []).filter(a => a.alive && a.team === team && !a.isPlayer);
  let best = null;
  for (const sp of spawns) {
    if (![sp.x, sp.z, sp.yaw].every(Number.isFinite)) continue;
    const fx = -Math.sin(sp.yaw), fz = -Math.cos(sp.yaw);
    const hit = world.raycast(sp.x, 1.55, sp.z, fx, 0, fz, 24, 'sight');
    const clearance = hit && Number.isFinite(hit.t) ? Math.max(0, hit.t) : 24;
    const nearAlly = others.some(a => Math.hypot(a.pos.x - sp.x, a.pos.z - sp.z) < 2.0);
    const score = clearance - (nearAlly ? 18 : 0);
    if (!best || score > best.score) best = { spawn: sp, clearance, score };
  }
  return best;
}

// Small manual-aim correction only when aiming closely at an unobstructed
// opponent. Never snap across the screen, through walls or into a teammate.
export function firstEncounterDestination(team) {
  // Reviewed cargo lane: never derived from a hidden opponent's location.
  if (team === 'BL') return [-17.5, -7.0];
  if (team === 'GR') return [17.5, 7.0];
  return null;
}
export function routeArrow(player, goal) {
  if (!player || !goal) return null;
  const dx = goal[0] - player.pos.x, dz = goal[1] - player.pos.z;
  const distance = Math.hypot(dx,dz);
  if (!Number.isFinite(distance) || distance < 2.2) return null;
  const angle = Math.atan2(-dx,-dz);
  const offset = Math.atan2(Math.sin(angle-player.yaw),Math.cos(angle-player.yaw));
  return {
    symbol:offset>0.42?'←':offset< -0.42?'→':'↑',
    label:offset>0.42?'往左绕行':offset< -0.42?'往右绕行':'沿通道前进',
    distance:Math.round(distance)
  };
}
export function mobileAimCorrection({ yawError, pitchError, distance, visible, firing, sniperReady }) {
  if (!visible || !firing || sniperReady === false ||
    !Number.isFinite(distance) || distance < 1 || distance > 27 ||
    !Number.isFinite(yawError) || !Number.isFinite(pitchError) ||
    Math.abs(yawError) > 0.14 || Math.abs(pitchError) > 0.105) return {yaw:0,pitch:0};
  return {
    yaw: Math.max(-0.019, Math.min(0.019, yawError * 0.30)),
    pitch: Math.max(-0.014, Math.min(0.014, pitchError * 0.30))
  };
}

export function mobileSimpleFireAllowed({kind,weapon,side,alive,distance,blocked,heldSeconds}) {
  return kind==='hits' && weapon==='m4a1' && side==='enemy' &&
    alive===true && blocked===false && Number.isFinite(distance) &&
    distance>0 && distance<=28 && Number.isFinite(heldSeconds) && heldSeconds>=0.14;
}

export function createFpsMobileUx(game, root, doc) {
  const html = doc.documentElement;
  const header = root.querySelector('.mk-header');
  // A source-first FPS still contains desktop tutorial and menu markup. Remove
  // the desktop-only directions while retaining the programmatic start buttons.
  const nativeMenu = doc.getElementById('menu');
  nativeMenu?.querySelector('.keys')?.remove();
  nativeMenu?.querySelectorAll('.note').forEach(el => el.remove());
  const legacyTouchNote = doc.getElementById('touchNote');
  if (legacyTouchNote) legacyTouchNote.textContent = '';
  const touchControls = doc.getElementById('touch');
  const buttons = touchControls ? [...touchControls.querySelectorAll('.btn')] : [];
  for (const [index, button] of buttons.entries()) {
    const action = mobileTouchAction(index);
    button.dataset.mkAction = action;
    if (action === 'fire') button.textContent = '开火';
    if (action === 'reload') button.textContent = '换弹';
    if (action === 'jump') button.textContent = '跳';
    if (action === 'scope') button.textContent = '开镜';
    if (action === 'duplicate-fire' || action === 'crouch' || action === 'switch') {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('tabindex', '-1');
    }
    // The original source only handles touchend, not cancellation.
    if (action === 'fire') button.addEventListener('touchstart', () => nudgeAim(true), {capture:true,passive:true});
    button.addEventListener('touchcancel', () => {
      if (action === 'fire' && game.player?.touch) {
        game.player.touch.fire = false;
        game.player.touch.firePressed = false;
      }
    }, { passive: true });
  }
  const tutorial = doc.createElement('div');
  tutorial.id = 'mk-fps-tutorial';
  tutorial.setAttribute('aria-label', '手机操作指南');
  tutorial.innerHTML = '<span><b>①</b> 左手摇杆移动</span><span><b>②</b> 右侧滑动瞄准</span><span><b>③</b> 点按或按住开火</span>';
  root.querySelector('#mk-panel')?.insertBefore(tutorial, root.querySelector('#mk-challenges'));
  const originalToast = game.hud.toast.bind(game.hud);
  game.hud.toast = (value, duration) => {
    let message = String(value);
    if (message.includes('团队竞技') && message.includes('率先达到')) return;
    if (/Esc|Tab|按 R|按 B|鼠标|键盘/.test(message)) {
      message = '手机操作：左手移动，右手瞄准；需要时点“暂停”';
    }
    originalToast(message, duration);
  };
  const board = doc.createElement('strong');
  board.id = 'mk-fps-board';
  board.setAttribute('aria-label', '当前比分');
  header.prepend(board);
  const target = doc.createElement('div');
  target.id = 'mk-fps-target';
  target.hidden = true;
  target.setAttribute('aria-live', 'off');
  root.append(target);
  const guide = doc.createElement('div');
  guide.id = 'mk-fps-guide';
  guide.textContent = '◆ 蓝色队友 ｜ ▼ 红色敌人　·　左手移动，右手滑动瞄准';
  guide.hidden = true;
  root.append(guide);
  const markers = new Map();
  let started = 0, nextUpdate = 0, lastBoard = '', lastTarget = '';
  let activeChallenge = null, nextBalanceAt = 0, lastHits = 0;
  let autoAimActor = null, autoAimSince = 0, autoFireActive = false;
  let routePath = null, routeLastAt = 0;
  let walkedMeters = 0, previousPosition = null, startedGameSeconds = 0;

  function recolorNativeAllies() {
    // Original source colors friend name tags by faction (BL = orange!). Repaint by relation.
    for (const tag of game.tags || []) {
      if (tag.__mkAllyLabel || teamSide(game.player?.team, tag.actor?.team) !== 'ally') continue;
      const sprite = tag.sprite, tex = sprite?.material?.map, canvas = tex?.image;
      const ctx = canvas?.getContext?.('2d');
      if (!ctx || !sprite) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 26px system-ui, sans-serif';
      const label = '◆ 队友 ' + String(tag.actor.name || '').slice(0, 9);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0, 10, 26, 0.95)';
      ctx.strokeText(label, canvas.width / 2, canvas.height / 2, canvas.width - 8);
      ctx.fillStyle = '#8edcff';
      ctx.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 8);
      tex.needsUpdate = true;
      sprite.scale.x = Math.max(1.55, sprite.scale.x);
      tag.__mkAllyLabel = true;
    }
  }

  function prepareFirstEncounter() {
    const p=game.player, destination=firstEncounterDestination(p?.team);
    if (!destination || !game.nav?.findPath) return false;
    const candidates=(game.actors||[]).filter(a =>
      a && !a.isPlayer && a.team!==p.team && a.alive && a.primary!=='awm');
    for(const bot of candidates) {
      const path=game.nav.findPath(bot.pos.x,bot.pos.z,destination[0],destination[1]);
      if(!Array.isArray(path) || path.length<2)continue;
      bot.role='rush';bot.stage=0;bot.path=path;bot.pi=1;
      bot.goal=[...destination];bot.__mobileFirstEncounter=true;
      return true;
    }
    return false;
  }
  function findRoute() {
    const p=game.player, dest=firstEncounterDestination(p?.team);
    if(!p || !dest || !game.nav?.findPath) return null;
    const path=game.nav.findPath(p.pos.x,p.pos.z,dest[0],dest[1]);
    if(!Array.isArray(path) || path.length<2)return null;
    return path.find((pt,i)=>i>0 && Array.isArray(pt) &&
      Math.hypot(pt[0]-p.pos.x,pt[1]-p.pos.z)>2.2) || dest;
  }
  function applyBalance(elapsed) {
    const p = game.player;
    if (!p) return;
    const profile = mobileEnemyDifficulty(activeChallenge?.kind, elapsed, p.stats);
    // Both teams stay comparable: do not let allied bots farm all enemies
    // before a novice player gets a first encounter.
    for (const actor of game.actors || []) {
      if (!actor || actor.isPlayer || !actor.diff) continue;
      actor.diff = {...profile, react: [...profile.react]};
      actor.recoilControl = profile.ctrl;
    }
  }

  function nudgeAim(forceFiring = false) {
    const p = game.player, cam = game.renderer?.camera;
    const simple = activeChallenge?.kind==='hits' && p?.weapon?.id==='m4a1';
    if (!p?.alive || !game.playing || game.paused || !cam ||
        !(forceFiring || p.touch?.fire || simple)) return;
    const sniper = p.weapon?.def?.type === 'sniper';
    const ready = !sniper || (p.scoped > 0 && p.scopeReady);
    if (!ready) return;
    const eye = p.eye(cam.position.clone());
    let best = null, bestScore = Infinity;
    for (const actor of game.actors || []) {
      if (!actor.alive || actor.protectT > 0 || actor.team === p.team || !actor.soldier) continue;
      const chest = actor.soldier.chestWorld(cam.position.clone());
      const dir = chest.sub(eye), distance = dir.length();
      if (!(distance > 1 && distance <= 27)) continue;
      const trueYaw = Math.atan2(-dir.x, -dir.z);
      const errYaw = Math.atan2(Math.sin(trueYaw-p.yaw), Math.cos(trueYaw-p.yaw));
      const errPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) - p.pitch;
      const aim = mobileAimCorrection({
        yawError: errYaw, pitchError: errPitch, distance, visible: true,
        firing: true, sniperReady: ready
      });
      if (!aim.yaw && !aim.pitch) continue;
      const hit = game.world.raycast(eye.x, eye.y, eye.z,
        dir.x / distance, dir.y / distance, dir.z / distance, distance - 0.15, 'sight');
      if (hit) continue;
      const score = Math.abs(errYaw) + Math.abs(errPitch);
      if (score < bestScore) { bestScore = score; best = aim; }
    }
    if (best) {
      p.yaw += best.yaw;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + best.pitch));
    }
  }

  function updateAutoFire() {
    const p=game.player, actor=game.aimTarget;
    const simple=activeChallenge?.kind==='hits';
    if (!simple || !p?.alive || !game.playing || game.paused) {
      if (simple && p) p.mouse.l=false;
      autoAimActor=null;autoFireActive=false;
      return;
    }
    if (!actor?.alive || actor.team===p.team || !actor.soldier) {
      p.mouse.l=false;autoAimActor=null;autoFireActive=false;return;
    }
    const eye=p.eye(game.renderer.camera.position.clone());
    const aim=actor.soldier.chestWorld(eye.clone()).sub(eye);
    const distance=aim.length();
    const blocked=distance>0 && !!game.world.raycast(eye.x,eye.y,eye.z,
      aim.x/distance,aim.y/distance,aim.z/distance,Math.max(0,distance-0.18),'sight');
    if (actor!==autoAimActor) {
      autoAimActor=actor;autoAimSince=Number(game.time)||0;
    }
    const allowed=mobileSimpleFireAllowed({
      kind:activeChallenge?.kind,weapon:p.weapon?.id,side:teamSide(p.team,actor.team),
      alive:p.alive,distance,blocked,heldSeconds:(Number(game.time)||0)-autoAimSince
    });
    p.mouse.l=allowed;
    if(allowed&&!autoFireActive) {
      game.__mobileBalanceReview.autoFireActivations++;
    }
    autoFireActive=allowed;
  }
  function updateAim() {
    const p = game.player, actor = game.aimTarget;
    const side = p?.alive && actor?.alive ? teamSide(p.team, actor.team) : 'unknown';
    const label = side === 'ally' ? '◆ 队友 · 不要射击' : side === 'enemy'
      ? activeChallenge?.kind==='hits' ? '▼ 敌人 · 对准自动开火' : '▼ 敌人 · 可以射击'
      : '';
    html.dataset.fpsAimSide = side;
    target.hidden = !label;
    if (label !== lastTarget) {
      target.textContent = label;
      target.dataset.side = side;
      lastTarget = label;
    }
  }

  function clearMarkers() {
    for (const el of markers.values()) el.hidden = true;
  }

  function updateEnemyMarkers() {
    const p = game.player, cam = game.renderer?.camera;
    if (!p?.alive || !cam || !game.world) { clearMarkers(); return; }
    const shown = new Set();
    for (const actor of game.actors || []) {
      if (teamSide(p.team, actor.team) !== 'enemy' || !actor.alive || !actor.soldier) continue;
      // A projected head location is not enough: an obstruction ray is required.
      const candidates=[
        actor.soldier.headWorld(cam.position.clone()),
        actor.soldier.chestWorld(cam.position.clone())
      ];
      let projected=null;
      for(const body of candidates) {
        const dir=body.clone().sub(cam.position);
        const distance=dir.length();
        if(!(distance>0 && distance<=44))continue;
        const pos=body.clone().project(cam);
        const cover=game.world.raycast(cam.position.x,cam.position.y,cam.position.z,
          dir.x/distance,dir.y/distance,dir.z/distance,Math.max(0,distance-0.18),'sight');
        if(!enemyBadgeAllowed({
          side:'enemy',alive:true,distance,
          x:pos.x,y:pos.y,z:pos.z,coverDistance:cover?.t??null
        }) || cover)continue;
        projected=pos;break;
      }
      if(!projected)continue;
      let el = markers.get(actor);
      if (!el) {
        el = doc.createElement('div');
        el.className = 'mk-fps-enemy';
        el.textContent = '▼ 敌人';
        el.setAttribute('aria-hidden', 'true');
        root.append(el);
        markers.set(actor, el);
      }
      el.hidden = false;
      el.style.left = ((projected.x + 1) * 50).toFixed(2) + '%';
      el.style.top = ((1 - projected.y) * 50).toFixed(2) + '%';
      shown.add(actor);
    }
    // Clear unused actors from finished/restarted matches; prevent unbounded nodes.
    for (const [actor, el] of markers) {
      if (!shown.has(actor)) el.hidden = true;
      if (!game.actors.includes(actor)) { el.remove(); markers.delete(actor); }
    }
  }

  return {
    distanceMeters() { return +walkedMeters.toFixed(2); },
    onStart(challenge) {
      activeChallenge = challenge || null;
      const tip=tutorial.querySelector('span:last-child');
      if(tip)tip.innerHTML=activeChallenge?.kind==='hits'
        ? '<b>③</b> 对准敌人自动开火'
        : activeChallenge?.kind==='kills'
          ? '<b>③</b> 开镜后点开火'
          : '<b>③</b> 点按或按住开火';
      autoAimActor=null;autoAimSince=0;autoFireActive=false;
      guide.textContent = activeChallenge?.kind === 'kills'
        ? '◆ 蓝色队友 ｜ ▼ 红色敌人 · 先点开镜，再滑动瞄准开火'
        : activeChallenge?.kind === 'survive'
          ? '◆ 蓝色队友 ｜ ▼ 红色敌人 · 左手移动躲避，右侧观察敌人'
          : '◆ 蓝色队友 ｜ ▼ 红色敌人 · 先找目标，对准自动开火';
      started = performance.now();
      startedGameSeconds = Number(game.time) || 0;
      routePath=null;routeLastAt=0;
      nextUpdate = 0;
      nextBalanceAt = 0;
      lastHits = 0;
      walkedMeters = 0;
      previousPosition = null;
      lastBoard = '';
      const p = game.player;
      const spawns = game.map?.spawns?.[p?.team];
      const clear = selectMobileSpawn(spawns, p?.team, game.actors, game.world);
      if (p && clear && clear.clearance > 4) {
        p.pos.set(clear.spawn.x, 0.02, clear.spawn.z);
        p.yaw = clear.spawn.yaw;
        p.pitch = 0;
        p.vel.set(0, 0, 0);
      }
      game.__mobileBalanceReview = {startingLaneMeters: clear?.clearance ?? null,
        challenge: activeChallenge?.id,autoFireActivations:0};
      const rendezvousOk=prepareFirstEncounter();
      game.__mobileBalanceReview.firstRendezvousPath=rendezvousOk;
      applyBalance(0);
      recolorNativeAllies();
    },
    update(running, now = performance.now()) {
      const active = !!(running && game.playing && !game.paused && !game.ended);
      html.dataset.fpsActive = String(active);
      const p = game.player;
      html.dataset.fpsSniper = String(p?.weapon?.def?.type === 'sniper');
      if (/按 R|按 B|Esc|Tab/.test(game.hud?.el?.aHint?.textContent || '')) {
        game.hud.el.aHint.textContent = '点“换弹”';
      }
      if (p && !p.alive && game.hud?.el?.cSmall) {
        game.hud.el.cSmall.textContent = '即将自动复活';
      }
      tutorial.hidden = active && now - started > 6500;
      if (!p) { target.hidden = true; guide.hidden = true; clearMarkers(); return; }
      html.dataset.fpsOwnTeam = p.team;
      if (active && p.alive) {
        if (previousPosition) {
          const step = Math.hypot(p.pos.x - previousPosition.x, p.pos.z - previousPosition.z);
          if (step < 2.4 && Number.isFinite(step)) walkedMeters += step;
        }
        previousPosition = { x:p.pos.x, z:p.pos.z };
      } else previousPosition = null;
      if (!active) {
        if (activeChallenge?.kind==='hits') p.mouse.l=false;
        autoAimActor=null;autoFireActive=false;
        target.hidden = true; guide.hidden = true; clearMarkers(); return;
      }
      const score = playerRelativeScore(game.score, p.team);
      const msg = '◆ 我方 ' + score.ally + ' : ' + score.enemy + ' 敌方 ▼';
      if (msg !== lastBoard) { board.textContent = msg; lastBoard = msg; }
      updateAim();
      updateAutoFire();
      const elapsed = Math.max(0,(Number(game.time)||0)-startedGameSeconds);
      if (now >= nextBalanceAt) {
        nextBalanceAt = now + 1000;
        applyBalance(Math.max(0,(Number(game.time) || 0)-startedGameSeconds));
      }
      if(now >= routeLastAt) {
        routeLastAt=now+1500;
        routePath=findRoute();
      }
      if (now >= nextUpdate) {
        nextUpdate = now + 120;
        recolorNativeAllies();
        updateEnemyMarkers();
        nudgeAim();
        const hits = p.stats?.hits || 0;
        if (hits > lastHits) {
          originalToast('✓ 命中！继续对准红色敌人', 1.8);
          lastHits = hits;
        }
        const seen = [...markers.values()].some(el => !el.hidden);
        if (hits === 0 && elapsed >= 5) {
          const turn=routeArrow(p,routePath);
          guide.textContent = seen
            ? '▼ 前方有敌人！滑动准星对准目标自动开火'
            : turn ? turn.symbol+' '+turn.label+' · '+turn.distance+'米后进入交火区'
              : '沿集装箱外侧通道推进，寻找红色敌人';
        }
      }
      guide.hidden = !p.alive ||
        (p.stats?.hits ? elapsed>8 : elapsed>23 && elapsed%12>5);
    },
    destroy() {
      if(activeChallenge?.kind==='hits'&&game.player)game.player.mouse.l=false;
      html.removeAttribute('data-fps-active');
      html.removeAttribute('data-fps-own-team');
      board.remove(); target.remove(); guide.remove(); tutorial.remove();
      for (const button of buttons) {
        button.removeAttribute('data-mk-action');
      }
      for (const el of markers.values()) el.remove();
      markers.clear();
    }
  };
}
