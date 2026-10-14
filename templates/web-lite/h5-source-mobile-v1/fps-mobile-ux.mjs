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
    Number.isFinite(distance) && distance > 0 && distance <= 32 &&
    Number.isFinite(x) && Math.abs(x) < 0.87 &&
    Number.isFinite(y) && y > -0.76 && y < 0.79 &&
    Number.isFinite(z) && z >= -1 && z <= 1 &&
    (coverDistance === null || (Number.isFinite(coverDistance) && coverDistance >= distance - 0.45));
}

export function createFpsMobileUx(game, root, doc) {
  const html = doc.documentElement;
  const header = root.querySelector('.mk-header');
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

  function updateAim() {
    const p = game.player, actor = game.aimTarget;
    const side = p?.alive && actor?.alive ? teamSide(p.team, actor.team) : 'unknown';
    const label = side === 'ally' ? '◆ 队友 · 不要射击' : side === 'enemy' ? '▼ 敌人 · 可以射击' : '';
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
      const head = actor.soldier.headWorld(cam.position.clone());
      head.y += 0.36;
      const dir = head.clone().sub(cam.position);
      const distance = dir.length();
      if (!(distance > 0 && distance <= 32)) continue;
      const projected = head.clone().project(cam);
      const hit = game.world.raycast(cam.position.x, cam.position.y, cam.position.z,
        dir.x / distance, dir.y / distance, dir.z / distance, distance, 'sight');
      if (!enemyBadgeAllowed({
        side: 'enemy', alive: true, distance,
        x: projected.x, y: projected.y, z: projected.z, coverDistance: hit ? hit.t : null
      })) continue;
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
    onStart() {
      started = performance.now();
      nextUpdate = 0;
      lastBoard = '';
      recolorNativeAllies();
    },
    update(running, now = performance.now()) {
      const active = !!(running && game.playing && !game.paused && !game.ended);
      html.dataset.fpsActive = String(active);
      const p = game.player;
      if (!p) { target.hidden = true; guide.hidden = true; clearMarkers(); return; }
      html.dataset.fpsOwnTeam = p.team;
      if (!active) { target.hidden = true; guide.hidden = true; clearMarkers(); return; }
      const score = playerRelativeScore(game.score, p.team);
      const msg = '◆ 我方 ' + score.ally + ' : ' + score.enemy + ' 敌方 ▼';
      if (msg !== lastBoard) { board.textContent = msg; lastBoard = msg; }
      updateAim();
      guide.hidden = now - started > 8000 || ((p.stats?.shots || 0) > 0 && now - started > 3500);
      if (now >= nextUpdate) {
        nextUpdate = now + 120;
        recolorNativeAllies();
        updateEnemyMarkers();
      }
    },
    destroy() {
      html.removeAttribute('data-fps-active');
      html.removeAttribute('data-fps-own-team');
      board.remove(); target.remove(); guide.remove();
      for (const el of markers.values()) el.remove();
      markers.clear();
    }
  };
}
