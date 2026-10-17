/* global performance */
/* FPS-only, original mobile UX overlay. Does not alter hit detection, team rules or AI. */
import {cfStartDefense,cfStepDefense,cfAdvanceAssault,cfStartExtraction,cfStepExtraction} from './engine.mjs';
/** CSS/UI stays at native resolution; only CF native WebGL render pixels change.
 * Adjust after sustained measured frame-rate intervals, not single spikes. */
/** A lower WebGL drawing buffer alone does NOT resize Three.js EffectComposer
 * render targets. Sync both before claiming any native pixel-work reduction.
 * Invalid or unsupported renderers are left entirely unchanged. */
export function cfApplyNativePixelRatio(native,ratio) {
  const renderer=native?.renderer,composer=native?.composer;
  if(!Number.isFinite(ratio)||ratio<.6||ratio>1||
    typeof renderer?.setPixelRatio!=='function'||
    typeof composer?.setPixelRatio!=='function')return false;
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  return true;
}
export function cfAdaptivePixelRatio(current,fps,fastIntervals=0) {
  const ratio=Number.isFinite(current)&&current>=.6&&current<=1?current:1;
  if(!Number.isFinite(fps)||fps<=0)return ratio;
  if(fps<16)return Math.max(.6,Math.round((ratio-.15)*100)/100);
  if(fps<28)return Math.max(.6,Math.round((ratio-.1)*100)/100);
  if(fps>48&&fastIntervals>=3)return Math.min(1,Math.round((ratio+.1)*100)/100);
  return ratio;
}
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

/** Native ally sprites must not cover the screen when very near or after a round. */
export function teammateTagOpacity({active,alive,distance}) {
  if (!active || !alive || !Number.isFinite(distance) || distance < 3.5 || distance > 45) return 0;
  return Math.min(.85, .85 * Math.max(0,(distance-3.5)/3));
}
/** Badge labels outside a circular sniper sight picture are misleading. */
export function withinScopedLens({x,y,width,height,scoped}) {
  if (!scoped) return true;
  if (![x,y,width,height].every(Number.isFinite) || width<=0 || height<=0) return false;
  return Math.hypot(x*width/2,y*height/2) <= Math.min(width,height)*.455;
}
/** Let a novice actually take the AWM opening shot while native 3v3 continues. */
export function holdOpeningTeammateFire(actors,ownTeam,now) {
  if(!Number.isFinite(now)) return 0;
  let held=0;
  for(const actor of actors||[]) {
    if(!actor || actor.isPlayer || !actor.alive || actor.team!==ownTeam)continue;
    actor.readyAt=Math.max(Number(actor.readyAt)||0,now+13);
    held++;
  }
  return held;
}
/** Touch-generated mouse compatibility events must never fire the native PC rifle. */
export function blockMobileTouchMouse({touchMode,fromTouch,msSinceTouch}) {
  return touchMode===true && (fromTouch===true ||
    (Number.isFinite(msSinceTouch) && msSinceTouch>=0 && msSinceTouch<=1400));
}
export function sniperScopeLabel(stage) {
  return stage===1 ? '放大' : stage>=2 ? '关镜' : '开镜';
}
/** Briefly keep a real legal scout visible, then return to native bot AI. */
export function mobileScoutHoldExpired(actor, seconds) {
  return (actor?.__mobileTrainingScout === true || actor?.__mobileSniperScout === true) &&
    Number.isFinite(actor?.__mobileTrainingHoldUntil) && Number.isFinite(seconds) &&
    seconds >= actor.__mobileTrainingHoldUntil;
}
/** A readable but genuinely dangerous encounter; the first target is never
 * frozen as a 60s target dummy. It can fire using its ORIGINAL gun, then its
 * ORIGINAL nav/targeting retakes control within the first 12s. */
/** Original opening AI reacts to a legitimate native gunshot or its own
 * registered damage. Retain 1.1s minimum response time after actual injury
 * and 2.2s after sound: bullets/health/position/targeting are untouched. */
export function cfReactToRealScoutThreat({actor,player,challenge,now}={}) {
  if(challenge?.id!=='tags'||challenge?.drill!=='reposition'||
    challenge.elite===true||actor?.__mobileTrainingScout!==true||
    actor?.alive!==true||player?.alive!==true||
    !actor.team||actor.team===player.team||
    !Number.isFinite(now)||now<0||
    !Number.isFinite(actor.readyAt)||
    !Number.isFinite(actor.__mobileTrainingHoldUntil))return false;
  const shot=Number.isFinite(player.stats?.shots)&&player.stats.shots>0;
  const hit=actor.lastAttacker===player&&
    Number.isFinite(actor.lastHurt)&&
    now>=actor.lastHurt&&now-actor.lastHurt<=.65;
  const desired=hit?2:shot?1:0;
  const previous=Number.isInteger(actor.__mkIntroThreatStage)
    ?actor.__mkIntroThreatStage:0;
  if(desired<=previous)return false;
  actor.readyAt=Math.min(actor.readyAt,now+(hit?1.1:2.2));
  actor.__mobileTrainingHoldUntil=Math.min(
    actor.__mobileTrainingHoldUntil,now+(hit?2.7:4.5));
  actor.__mkIntroThreatStage=desired;
  actor.__mkIntroReactionAt=now;
  return true;
}
export function cfScoutHoldSeconds(challenge) {
  if(challenge?.elite===true)return challenge.kind==='kills'?6:4;
  if(challenge?.kind==='kills')return 15;
  if(challenge?.kind==='hits'&&challenge.drill==='reposition')return challenge?.lite===true?9:10;
  return 7;
}
/** Time before the native bot may open fire (not invulnerability).
 * Sniper gets a longer scope-learning window, with the same native physics. */
export function cfScoutReadyDelaySeconds(challenge) {
  if(challenge?.elite===true)return challenge.kind==='kills'?3.5:2.5;
  if(challenge?.kind==='kills')return 6.5;
  return challenge?.kind==='hits'&&challenge.drill==='reposition'?
    (challenge?.lite===true?3.5:4.5):5;
}
/** Original Bot instances use native death/rebirth and gun physics.
 * Only this beginner drill authors a nearby, walkable team respawn lane.
 */
export function cfTrainingRespawnSpots(first,second=null) {
  if(!first||![first.x,first.z,first.yaw].every(Number.isFinite))return [];
  const spawns=[{x:first.x,z:first.z,yaw:first.yaw}];
  if(second&&[second.x,second.z,second.yaw].every(Number.isFinite)){
    const gap=Math.hypot(first.x-second.x,first.z-second.z);
    if(gap>=3&&gap<=18)spawns.push({x:second.x,z:second.z,yaw:second.yaw});
  }
  return spawns;
}
/** Stabilize only the opening AI lane objective: bot still strafes and fires,
 * and we never move a living actor or touch health/hit counters. */
export function cfStabilizeNoviceScout(actor,challenge) {
  if(challenge?.elite===true||challenge?.drill!=='reposition'||
     actor?.__mobileTrainingScout!==true||actor?.alive!==true||
     !Number.isFinite(actor.pos?.x)||!Number.isFinite(actor.pos?.z))return false;
  actor.role='hold';actor.goal=[actor.pos.x,actor.pos.z];
  actor.path=null;actor.pi=0;actor.holdT=0;
  return true;
}
/** An ordinary training bot still moves and shoots but is not allowed to
 * wander out of its original cargo shooting lane during the lesson. */
export function cfNoviceScoutStrafe(profile,stabilized) {
  const raw=Number(profile?.strafe);
  return !Number.isFinite(raw)?0:stabilized?Math.min(raw,0.07):raw;
}

export function mobileTouchAction(index) {
  return ['fire', 'duplicate-fire', 'jump', 'crouch', 'reload', 'switch', 'scope'][index] || 'unknown';
}

/** Expert mode is earned by an actual recorded win. */
export function cfEliteUnlocked(record) {
  return Number.isSafeInteger(record?.wins) && record.wins > 0;
}
/** First rifle mission trains with auto-fire, while expert needs genuine touch input. */
export function cfAutoFireEligible(challenge, realHits = 0) {
  if(challenge?.lite===true)return false;
  return challenge?.kind === 'hits' && challenge.elite !== true &&
    (challenge.drill !== 'reposition' || (Number.isFinite(realHits) &&
      realHits < challenge.openingHits));
}
/** Progress only when genuine native hit and movement counters increase. */
export function cfAdvanceDrill(challenge, previous = null, native = {}) {
  if (challenge?.drill !== 'reposition') return null;
  const hits=Number.isFinite(native.hits)?Math.max(0,Math.floor(native.hits)):0;
  const travel=Number.isFinite(native.travel)?Math.max(0,native.travel):0;
  let {stage=0,startTravel=0,hitBaseline=null,anchorX=null,anchorZ=null,
    lastX=null,lastZ=null,lastTravel=travel,earnedDistance=0,peakDistance=0} = previous||{};
  const x=Number.isFinite(native.x)?native.x:null;
  const z=Number.isFinite(native.z)?native.z:null;
  if(stage===0&&hits>=challenge.openingHits) {
    stage=1;startTravel=travel;anchorX=x;anchorZ=z;
    earnedDistance=0;peakDistance=0;
  }
  // Native respawn jumps without native walking. Keep genuine earlier
  // movement while never crediting a teleport as progress.
  if(stage===1&&lastX!==null&&lastZ!==null&&x!==null&&z!==null &&
     Math.hypot(x-lastX,z-lastZ)>Math.max(0,travel-lastTravel)+2.4) {
    earnedDistance+=peakDistance;
    peakDistance=0;
    startTravel=travel;anchorX=x;anchorZ=z;
  }
  // Only peak net displacement per life earns progress; joystick oscillation
  // around the same point can't grind the remaining distance.
  const walked=Math.max(0,travel-startTravel);
  const net=anchorX!==null&&anchorZ!==null&&x!==null&&z!==null
    ? Math.hypot(x-anchorX,z-anchorZ):walked;
  if(stage===1)peakDistance=Math.max(peakDistance,Math.min(walked,net));
  let distance=earnedDistance+peakDistance;
  if(stage===1&&distance>=challenge.minTravel) {
    stage=2;hitBaseline=hits;
  }
  if(stage===2)distance=Math.max(challenge.minTravel,distance);
  return {stage,startTravel,hitBaseline,anchorX,anchorZ,
    lastX:x,lastZ:z,lastTravel:travel,earnedDistance,peakDistance,distance,
    follow:stage===2?Math.max(0,hits-hitBaseline):0,firstHit:stage>0};
}
/** Preview copy mirrors each mission's actual input mechanics. */
export function cfTouchTutorial(challenge) {
  if(challenge?.lite===true)return '右手拖动瞄准 · 按住开火追踪';
  if (challenge?.kind === 'hits')
    return challenge.drill==='reposition'
      ? (challenge.elite ? '精英手动首枪，横移后按住开火拖动瞄准' : '首枪自动开火；换位后按住开火拖动瞄准')
      : cfAutoFireEligible(challenge) ? '准星对准敌人，自动开火' : '跟准目标，手动按开火';
  if (challenge?.kind === 'kills') return '先开镜，再点按开火';
  if (challenge?.kind === 'assault') return '到达进攻位后，再亲手击杀敌人';
  if (challenge?.extractSeconds) return '移动并击杀后，赶到撤离区守住位置';
  if (challenge?.kind === 'survive') return '边移动边观察、开火';
  if (challenge?.kind === 'defend') return '左手进据点，右手开火阻止敌军占点';
  return '点按或按住开火';
}
export function mobileChallengeCopy(challenge) {
  if (!challenge) return '';
  if(challenge.lite===true)return Math.ceil(challenge.limitMs/1000)+'秒 · '+challenge.objective;
  if (challenge.kind === 'hits') return challenge.drill==='reposition'
    ? challenge.elite===true
      ? Math.ceil(challenge.limitMs/1000)+'秒精英突围：手动首枪，换位'+
        challenge.minTravel+'米，再命中'+challenge.target+'次；零阵亡'
      : Math.ceil(challenge.limitMs/1000)+'秒步枪突围：首枪辅助，换位'+
        challenge.minTravel+'米，手动再命中'+challenge.target+
        '次；最多阵亡'+challenge.maxDeaths+'次'
    : challenge.elite===true
      ? '精英步枪：45秒内自己瞄准并按开火，命中3次，最多倒下1次'
      : '1v1入门：准星对准敌人自动开火，命中3次';
  if (challenge.kind === 'assault') return Math.ceil(challenge.limitMs/1000)+
    '秒：移动'+challenge.minTravel+'米并进入地图进攻位，再亲自击杀'+challenge.target+
    '名敌人；最多阵亡'+challenge.maxDeaths+'次';
  if (challenge.kind === 'kills') return challenge.minTravel
    ? Math.ceil(challenge.limitMs/1000)+'秒：AWM击杀'+challenge.target+
      '人并移动'+challenge.minTravel+'米；最多阵亡'+challenge.maxDeaths+'次'
    : challenge.elite===true
      ? '精英狙击：75秒内 AWM 击杀1人，最多阵亡1次'
      : '90秒狙击：先找红色敌人，开镜瞄准后击杀1人';
  if (challenge.kind === 'survive') return challenge.minKills
    ? Math.ceil(challenge.limitMs/1000)+'秒：坚持存活，移动'+challenge.minTravel+
      '米，亲手击杀'+challenge.minKills+'人，进入撤离区守'+challenge.extractSeconds+
      '秒；最多阵亡'+challenge.target+'次'
    : challenge.elite===true
      ? '精英生存：坚持45秒，移动30米，最多阵亡1次'
      : '坚持45秒，移动20米，最多被击倒2次';
  if (challenge.kind === 'defend') return challenge.reverse
    ? Math.ceil(challenge.limitMs/1000)+'秒逆向争夺：远端B点→近端A点各守'+
      challenge.holdSeconds+'秒；敌人独占'+challenge.breachSeconds+'秒即失守'
    : challenge.elite===true
      ? '85秒精英反击：先守A再守B，各坚持7秒；零阵亡，敌军也会抢点'
      : '100秒双点反击：亲自守住A和B，各5秒；敌军独占8秒就失守';
  return challenge.instructions || '';
}


// Mobile-first tuning: soften the first encounter; increase pressure with time
// and demonstrated player success. These are bot perception/behavior knobs,
// not health, weapon damage, hitboxes, spawn cheats or automatic player kills.
export function mobileEnemyDifficulty(kind, seconds = 0, stats = {}, elite = false) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const expert = elite === true;
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const hits = Math.max(0, Number(stats.hits) || 0);
  const kills = Math.max(0, Number(stats.k) || 0);
  const deaths = Math.max(0, Number(stats.d) || 0);
  const ramp = clamp((elapsed - (expert ? 6 : 22)) / (expert ? 30 : 40) + (hits >= 2 ? 0.24 : 0) +
    (kills >= 1 ? 0.18 : 0) - (deaths >= 2 ? 0.16 : 0));
  const lerp = (a, b) => +(a + (b - a) * ramp).toFixed(3);
  const sniper = kind === 'kills';
  const survivor = kind === 'survive';
  return {
    react: [lerp(expert ? 0.7 : survivor ? 0.9 : 1.1, expert ? 0.40 : 0.55),
      lerp(expert ? 1.1 : survivor ? 1.4 : 1.65, expert ? 0.74 : 0.94)],
    aimErr: lerp(expert ? 0.095 : survivor ? 0.105 : 0.13, expert ? 0.054 : 0.074),
    turn: lerp(expert ? 3.2 : 2.6, expert ? 4.7 : 3.7),
    track: lerp(expert ? 2.0 : 1.65, expert ? 3.45 : 2.45),
    headP: lerp(expert ? 0.025 : 0.005, expert ? sniper ? 0.07 : 0.13 : sniper ? 0.035 : 0.075),
    ctrl: lerp(expert ? 0.96 : 1.0, expert ? 0.86 : 0.94),
    comp: lerp(expert ? 0.55 : 0.4, expert ? 0.74 : 0.58),
    strafe: lerp(expert ? 0.24 : sniper ? 0.10 : 0.14, expert ? 0.62 : sniper ? 0.28 : 0.42),
    see: lerp(expert ? 42 : 38, expert ? 57 : 52),
    fov: lerp(expert ? 1.6 : 1.48, expert ? 1.9 : 1.75),
    bunny: expert ? 0.015 : 0
  };
}

/** CF lite: more counterplay, never fabricated damage or omniscient aim.
 * Enemy reaction tightens after combat begins; player shots and native
 * geometry/LOS decide the real outcome. Friendly bots retain base behavior. */
export function cfLiteEnemyProfile(base,challenge,elapsedSec=0) {
  if(!base||challenge?.lite!==true)return base;
  const weight={tags:.12,precision:.07,survive:.20,defense:.22,
    assault:.20,marksman:.13,evac:.24,counter:.27}[challenge.id]??.12;
  const elapsed=Number.isFinite(elapsedSec)?Math.max(0,elapsedSec):0;
  const k=weight*(.45+.55*Math.min(1,elapsed/24));
  const limit=(v,min,max)=>Math.min(max,Math.max(min,v));
  return {...base,
    react:base.react.map(v=>+limit(v*(1-k),.22,2.4).toFixed(3)),
    aimErr:+limit(base.aimErr*(1-k*.38),.038,.20).toFixed(3),
    strafe:+limit(base.strafe*(1+k*.75),.07,.9).toFixed(3),
    track:+limit(base.track*(1+k*.20),1.2,5.5).toFixed(3)};
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
/** Face only a LAST SEEN enemy position from a historically verified clear
 * firing lane; no present-day hidden enemy GPS or automatic aim movements. */
export function cfLastSeenLookCue(player,known) {
  if(!player?.pos || !Number.isFinite(player.yaw) ||
    !Number.isFinite(known?.x)||!Number.isFinite(known?.z))return null;
  const dx=known.x-player.pos.x,dz=known.z-player.pos.z;
  if(Math.hypot(dx,dz)<1.2)return null;
  const bearing=Math.atan2(-dx,-dz);
  const error=Math.atan2(Math.sin(bearing-player.yaw),Math.cos(bearing-player.yaw));
  if(error>0.18)return '← 向左转视角 · 寻找红色敌人';
  if(error< -0.18)return '→ 向右转视角 · 寻找红色敌人';
  return '↔ 左右探身 · 找回刚才的射击视线';
}
export function routeArrow(player, goal, stopDistance=2.2) {
  if (!player || !goal) return null;
  const dx = goal[0] - player.pos.x, dz = goal[1] - player.pos.z;
  const distance = Math.hypot(dx,dz);
  if (!Number.isFinite(distance) || distance < stopDistance) return null;
  const angle = Math.atan2(-dx,-dz);
  const offset = Math.atan2(Math.sin(angle-player.yaw),Math.cos(angle-player.yaw));
  return {
    symbol:offset>0.42?'←':offset< -0.42?'→':'↑',
    label:offset>0.42?'往左绕行':offset< -0.42?'往右绕行':'沿通道前进',
    distance:Math.round(distance)
  };
}

/**
 * Suggest a genuinely navigable lateral lane after the first confirmed hit.
 * Pure map geometry only: no enemy tracking, no fabricated movement, no
 * player's statistics or native physics modified. Returning null is safe.
 */
export function cfFlankWaypoint({player,world,nav,minDistance=8,lastSeen=null}) {
  if(!player?.pos || !Number.isFinite(player.yaw) ||
     !world?.blocked || !nav?.idx || !nav?.walkable || !nav?.findPath) return null;
  const x=player.pos.x,z=player.pos.z,yaw=player.yaw;
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const required=Math.max(2,Math.min(22,Number(minDistance)||8));
  const rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
  const forwardX=-Math.sin(yaw),forwardZ=-Math.cos(yaw);
  let best=null;
  for(const radius of [required+1.5,required+3.0,required+4.5]) {
    for(const side of [1,-1]) {
      for(const along of [0,-2]) {
        const tx=x+rightX*radius*side+forwardX*along;
        const tz=z+rightZ*radius*side+forwardZ*along;
        const k=nav.idx(tx,tz);
        if(k<0||!nav.walkable(k)||world.blocked(tx,.05,tz,.38,1.9))continue;
        const path=nav.lineFree?.(x,z,tx,tz)
          ? [[x,z],[tx,tz]]
          : nav.findPath(x,z,tx,tz);
        if(!Array.isArray(path)||path.length<2)continue;
        let length=0,valid=true;
        for(let i=1;i<path.length;i++){
          const a=path[i-1],b=path[i];
          if(!Array.isArray(a)||!Array.isArray(b)||
            ![...a,...b].every(Number.isFinite)){valid=false;break;}
          length+=Math.hypot(b[0]-a[0],b[1]-a[1]);
        }
        // A waypoint behind a very long detour isn't useful to a beginner.
        if(!valid||length>radius*1.8+3)continue;
        // A side route is useful only when it opens an actual firing lane.
        // lastSeen is the already rendered opponent position, never a hidden
        // live bot lookup. Prefer sightlines without making blocked paths legal.
        const sightClear=cfSeenLaneSight(world,{x:tx,z:tz},lastSeen,
          (Number.isFinite(player.pos.y)?player.pos.y:0)+
          (Number.isFinite(player.eyeH)?player.eyeH:1.6));
        const score=length+Math.abs(along)*.7+(along>0?1.8:0)+
          (lastSeen&&sightClear!==true?24:0);
        if(!best||score<best.score)
          best={x:tx,z:tz,score,pathLength:length,side,sightClear};
      }
    }
    // If a farther legal flank reopens sight, prefer it to a nearer blind end.
    if(best&&(!lastSeen||best.sightClear===true))return best;
  }
  return null;
}

/** World-geometry ray from an accessible floor position to a location that
 * a player has ALREADY seen. No current hidden actor coordinates are read. */
export function cfSeenLaneSight(world,origin,lastSeen,eyeY=1.6) {
  if(!world?.raycast||![origin?.x,origin?.z,lastSeen?.x,lastSeen?.z,eyeY]
    .every(Number.isFinite))return null;
  const dx=lastSeen.x-origin.x,dz=lastSeen.z-origin.z,dy=1.45-eyeY;
  const length=Math.hypot(dx,dy,dz);
  if(length<1.5||length>52)return false;
  return !world.raycast(origin.x,eyeY,origin.z,
    dx/length,dy/length,dz/length,Math.max(0,length-0.6),'sight');
}

/** Stop retreating all the way to the first shot after an 8m flank. Find
 * the NEAREST still-walkable, LOS-checked vantage on that remembered corridor.
 * Returning null means the current lane is already clear: turn the camera
 * and shoot instead of needlessly walking backward. */
export function cfReacquireLane({player,firstHitSpot,lastSeen,world,nav}) {
  if(!player?.pos||![player.pos.x,player.pos.z,firstHitSpot?.x,
    firstHitSpot?.z,lastSeen?.x,lastSeen?.z].every(Number.isFinite)||
    !world?.blocked||!world?.raycast||!nav?.idx||!nav?.walkable||
    !nav?.findPath)return null;
  const x=player.pos.x,z=player.pos.z;
  const eyeY=(Number.isFinite(player.pos.y)?player.pos.y:0)+
    (Number.isFinite(player.eyeH)?player.eyeH:1.6);
  if(cfSeenLaneSight(world,{x,z},lastSeen,eyeY)===true)return null;
  const dx=firstHitSpot.x-x,dz=firstHitSpot.z-z,dist=Math.hypot(dx,dz);
  if(dist<0.4)return null;
  for(const fraction of [0.16,0.3,0.44,0.58,0.72,0.86,1]) {
    const tx=x+fraction*dx,tz=z+fraction*dz;
    const id=nav.idx(tx,tz);
    if(id<0||!nav.walkable(id)||world.blocked(tx,0.05,tz,0.38,1.9))continue;
    if(cfSeenLaneSight(world,{x:tx,z:tz},lastSeen,eyeY)!==true)continue;
    const path=nav.lineFree?.(x,z,tx,tz)
      ? [[x,z],[tx,tz]]
      : nav.findPath(x,z,tx,tz);
    if(!Array.isArray(path)||path.length<2)continue;
    let travelled=0,valid=true;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      if(!Array.isArray(a)||!Array.isArray(b)||
        ![...a,...b].every(Number.isFinite)){valid=false;break;}
      travelled+=Math.hypot(b[0]-a[0],b[1]-a[1]);
    }
    if(valid&&travelled<=Math.max(3,dist*fraction*1.9+2))
      return {x:tx,z:tz,travel:travelled,seenOnly:true};
  }
  return null;
}

/** Use the ACTUAL native rifle direction (yaw/pitch plus gun recoil), not
 * the apparent screen camera angle, when offering firing-only aim friction. */
export function cfNativeShotAimError({targetYaw,targetPitch,playerYaw,playerPitch,
  recoilYaw=0,recoilPitch=0}) {
  if(![targetYaw,targetPitch,playerYaw,playerPitch,recoilYaw,recoilPitch]
    .every(Number.isFinite))return null;
  const yaw=targetYaw-(playerYaw+recoilYaw);
  return {yawError:Math.atan2(Math.sin(yaw),Math.cos(yaw)),
    pitchError:targetPitch-(playerPitch+recoilPitch)};
}

// A genuine, hittable intro opponent placed inside an existing clear cargo
// lane. Candidate positions are derived from the user's forward bearing and
// checked against real world geometry, nav walkability and line of sight.
export function chooseFirstEncounterSpot({player, world, nav, actors = [], distances = [10.0,8.5,7.0]}) {
  if (!player?.pos || !world?.blocked || !world?.raycast || !nav?.walkable || !nav?.idx) return null;
  const forwardX=-Math.sin(player.yaw), forwardZ=-Math.cos(player.yaw);
  const rightX=Math.cos(player.yaw), rightZ=-Math.sin(player.yaw);
  for(const range of distances) {
    for(const lateral of [0.65,-0.65,0]) {
      const x=player.pos.x+forwardX*range+rightX*lateral;
      const z=player.pos.z+forwardZ*range+rightZ*lateral;
      const id=nav.idx(x,z);
      if(id<0 || !nav.walkable(id) || world.blocked(x,0.05,z,0.38,1.9))continue;
      if(actors.some(a=>a?.alive && Math.hypot(a.pos.x-x,a.pos.z-z)<1.65))continue;
      const sy=player.pos.y+(Number.isFinite(player.eyeH)?player.eyeH:1.6);
      const ex=x-player.pos.x, ez=z-player.pos.z, ey=1.45-sy;
      const dist=Math.hypot(ex,ey,ez);
      if(world.raycast(player.pos.x,sy,player.pos.z,
        ex/dist,ey/dist,ez/dist,Math.max(0,dist-0.65),'sight'))continue;
      const yaw=Math.atan2(-(player.pos.x-x),-(player.pos.z-z));
      return {x,z,yaw,distance:+range.toFixed(1)};
    }
  }
  return null;
}


/** Choose an authored player spawn with a *genuinely clear* sniper view.
 * Never teleport mid-round, spawn a fake target, or ignore real map collision.
 */
export function chooseMobileSniperLane({player,spawns,world,nav,actors=[],distances=[18,16,14,12,10,8.5,7]}) {
  if (!player || !Array.isArray(spawns) || !world?.blocked || !nav?.idx) return null;
  for(const spawn of spawns) {
    if (![spawn.x,spawn.z,spawn.yaw].every(Number.isFinite)) continue;
    if(world.blocked(spawn.x,0.05,spawn.z,0.38,1.9))continue;
    const originId=nav.idx(spawn.x,spawn.z);
    if(originId<0 || !nav.walkable(originId))continue;
    if(actors.some(a=>a?.alive && a!==player &&
      Math.hypot(a.pos.x-spawn.x,a.pos.z-spawn.z)<2.1))continue;
    const probe={pos:{x:spawn.x,y:0.02,z:spawn.z},yaw:spawn.yaw,eyeH:player.eyeH};
    const spot=chooseFirstEncounterSpot({player:probe,world,nav,actors,distances});
    if(!spot)continue;
    // Do not place a teammate directly in the target firing lane.
    const dx=spot.x-spawn.x,dz=spot.z-spawn.z,dd=dx*dx+dz*dz;
    const blockedByFriend=actors.some(a=>{
      if(!a?.alive || a===player || a.team!==player.team)return false;
      const t=Math.max(0,Math.min(1,((a.pos.x-spawn.x)*dx+(a.pos.z-spawn.z)*dz)/dd));
      return t>0.05 && t<0.95 &&
        Math.hypot(a.pos.x-(spawn.x+t*dx),a.pos.z-(spawn.z+t*dz))<1.2;
    });
    if(!blockedByFriend)return {spawn,spot};
  }
  return null;
}

/** Only camera-visible and actually unobstructed marker positions may
 * generate novice aiming directions. No actor tracking behind walls. */
/** Fire button finger doubles as a view joystick, without creating a shot or
 * editing any hit/health stat. Cap one outlier touchmove for a steady thumb. */
/** End/cancel a real mobile fire gesture without swallowing a short tap.
 * Ordinary touchend leaves native firePressed pending until Player.update().
 * OS cancellation, pause, restart and destroy discard that pending tap. */
/** The original button listener can be skipped on some touch dispatch paths.
 * Captured touches which actually START on the visible fire control may
 * drive that SAME native Player.touch state. Never fabricate bullets or hits.
 * A held touch must not repeatedly restart firePressed after Player.update.
 */
/** Cancel orphaned mobile fingers when WebKit/Chrome interrupts an input sequence.
 * Only input state is affected; bullets, health, movement position and stats remain native. */
export function cfResetMobileTouch(player,aimTouches,fireTouches) {
  let changed=false;
  for(const map of [aimTouches,fireTouches]){
    if(map?.size){map.clear();changed=true;}
  }
  if(!player)return changed;
  const t=player.touch;
  if(t){
    for(const key of ['fire','firePressed','jump','crouch']){
      if(key==='crouch'&&!(key in t))continue;
      if(t[key]!==false){t[key]=false;changed=true;}
    }
    for(const key of ['mx','mz']){
      if(t[key]!==0){t[key]=0;changed=true;}
    }
  }
  if(player.touchLook){
    for(const key of ['x','y']){
      if(player.touchLook[key]!==0){player.touchLook[key]=0;changed=true;}
    }
  }
  if(player.mouse){
    for(const key of ['l','r','lp','rp']){
      if(player.mouse[key]!==false){player.mouse[key]=false;changed=true;}
    }
  }
  return changed;
}
/** A circular, dead-zoned virtual stick. Coordinates are genuine finger
 * positions relative to the visible native pad; this does not move an actor. */
/** A short genuine-input grace window for intermittent grounded frames.
 * Only allows the ORIGINAL Player.update() to perform legal native jumps.
 * It cannot change actor velocity, position or enemy state. */
export function cfBufferedJumpAllowed({now,pressedAt,grounded,cooldown,alive}={}) {
  return alive===true&&grounded===true&&
    Number.isFinite(now)&&Number.isFinite(pressedAt)&&
    now>=pressedAt&&now-pressedAt<=.25&&
    Number.isFinite(cooldown)&&cooldown<=0;
}
export function cfJoystickVector(x,y,cx,cy,radius=60,deadzone=0.10) {
  if(![x,y,cx,cy,radius,deadzone].every(Number.isFinite)||
     radius<=0||deadzone<0||deadzone>=1)
    return {mx:0,mz:0,dx:0,dy:0};
  const dx=x-cx,dy=y-cy,len=Math.hypot(dx,dy);
  if(len<=radius*deadzone)return {mx:0,mz:0,dx:0,dy:0};
  const t=Math.min(1,len/radius),power=(t-deadzone)/(1-deadzone);
  return {mx:+((dx/len)*power).toFixed(4),
    mz:+((-dy/len)*power).toFixed(4),
    dx:Math.max(-radius,Math.min(radius,dx)),
    dy:Math.max(-radius,Math.min(radius,dy))};
}
/** Native match restart reuses the existing renderer/world (no full page reload).
 * Only the CF result panel opts into this path; other game adapters unchanged. */
export function cfWarmRestartAllowed(gameId,phase) {
  return gameId==='cf-transport-ship'&&phase==='finished';
}
export function cfBeginTouchFire(touch) {
  if(!touch)return false;
  if(touch.fire!==true)touch.firePressed=true;
  touch.fire=true;
  return true;
}
export function cfReleaseTouchFire(touch,cancelPending=false) {
  if(!touch)return;
  touch.fire=false;
  if(cancelPending)touch.firePressed=false;
}
/** Symmetric free-turn with target friction. Friction scales ONLY real input;
 * there is no invisible aim delta, camera snap or look inertia. */
export function cfFireDragLookDelta(dx,dy,friction=1) {
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return {x:0,y:0};
  const f=Number.isFinite(friction)?Math.max(.55,Math.min(1,friction)):1;
  const clamp=v=>Math.max(-96,Math.min(96,v*2.9*f));
  return {x:clamp(dx),y:clamp(dy)};
}
export function cfVisibleAimCoach(x,y) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return '';
  if(x<=-0.23)return '← 按住开火向左滑动';
  if(x>=0.23)return '→ 按住开火向右滑动';
  if(y>=0.30)return '↑ 按住开火向上滑动';
  if(y<=-0.30)return '↓ 按住开火向下滑动';
  return '◎ 准星接近敌人 · 按住开火';
}

export function mobileAimCorrection({ yawError, pitchError, distance, visible, firing, sniperReady, training=false }) {
  const limitYaw=training?0.19:0.14,limitPitch=training?0.13:0.105;
  if (!visible || !firing || sniperReady === false ||
    !Number.isFinite(distance) || distance < 1 || distance > 27 ||
    !Number.isFinite(yawError) || !Number.isFinite(pitchError) ||
    Math.abs(yawError) > limitYaw || Math.abs(pitchError) > limitPitch)
    return {yaw:0,pitch:0};
  const maxYaw=training?0.025:0.019,maxPitch=training?0.019:0.014;
  return {
    yaw: Math.max(-maxYaw, Math.min(maxYaw, yawError * (training?0.36:0.30))),
    pitch: Math.max(-maxPitch, Math.min(maxPitch, pitchError * (training?0.36:0.30)))
  };
}

/** A first-shot tutorial may assist only an ACTUALLY ON-SCREEN enemy with an
 * unobstructed real ray to its chest. It never chooses hidden targets. */
export function cfIntroAssistCandidate({side,alive,visible,blocked,distance,yawError,pitchError}) {
  return side==='enemy'&&alive===true&&visible===true&&blocked===false &&
    Number.isFinite(distance)&&distance>1&&distance<=27 &&
    Number.isFinite(yawError)&&Math.abs(yawError)<=0.19 &&
    Number.isFinite(pitchError)&&Math.abs(pitchError)<=0.13;
}
export function mobileSimpleFireAllowed({kind,weapon,side,alive,distance,blocked,heldSeconds,yawError,pitchError,engaged}) {
  return engaged===true && kind==='hits' && weapon==='m4a1' && side==='enemy' &&
    alive===true && blocked===false && Number.isFinite(distance) &&
    distance>0 && distance<=28 && Number.isFinite(heldSeconds) && heldSeconds>=0.14 &&
    Number.isFinite(yawError) && Number.isFinite(pitchError) &&
    Math.abs(yawError)<=0.047 && Math.abs(pitchError)<=0.050;
}


/** Only actual native hit-counter increments create a brief onscreen confirmation. */
/** UI-only differential of the ACTUAL native player. A new match/respawn or
 * missing field never creates a hit, kill or phantom damage animation. */
export function cfRealCombatFeedback(previous,current) {
  const none={kind:null,hpLoss:0,hits:0,kills:0};
  if(!previous||!current||previous.alive!==true||current.alive!==true||
    !['hits','kills','hp'].every(k=>Number.isFinite(previous[k])&&
      Number.isFinite(current[k]))||
    current.hits<previous.hits||current.kills<previous.kills||
    current.hp>previous.hp)return none;
  const hits=Math.max(0,Math.floor(current.hits-previous.hits));
  const kills=Math.max(0,Math.floor(current.kills-previous.kills));
  const hpLoss=Math.max(0,Math.round(previous.hp-current.hp));
  return {kind:kills?'kill':hits?'hit':hpLoss?'damage':null,
    hpLoss,hits,kills};
}
/** Optional device haptics depend strictly on original native player events. */
export function cfCombatHapticPattern(event) {
  if(!event||!Number.isFinite(event.hpLoss))return null;
  if(event.kind==='kill'&&event.kills>0)return [24,38,16];
  if(event.kind==='hit'&&event.hits>0)return 12;
  if(event.kind==='damage'&&event.hpLoss>=10)return 8;
  return null;
}
/** A personal kill requires a forward delta in the ORIGINAL actor's k stat;
 * never decorate team score, a replay reset, or a mere native hit as a kill. */
export function cfNativeKillPayoff(previousKills,currentKills) {
  if(!Number.isSafeInteger(previousKills)||!Number.isSafeInteger(currentKills)||
    previousKills<0||currentKills<=previousKills)return '';
  const delta=currentKills-previousKills;
  if(previousKills===0)return '✦ 首杀 · 打开突破口';
  return delta>1?'✦ 连续击倒 +'+delta:'✦ 亲手击倒 +1';
}
/** Results-only native fire line: enemy shots are NOT injuries or kills. */
export function cfBattleRecap(metrics,firstKillMs=null) {
  if(!metrics||!['shots','hits','kills','enemyShots'].every(k=>
    Number.isSafeInteger(metrics[k])&&metrics[k]>=0&&metrics[k]<=100_000))
    return '';
  const text=['实战：命中'+metrics.hits+'次',
    '亲手击倒'+metrics.kills+'人',
    '敌方开火'+metrics.enemyShots+'发'];
  if(metrics.kills>0&&Number.isFinite(firstKillMs)&&firstKillMs>=0&&
    firstKillMs<=30_000)
    text.push('首杀'+(firstKillMs/1000).toFixed(1)+'秒');
  return text.join(' · ');
}
export function cfHitCue(challenge, nativeHits, increase, drill = null) {
  if (!challenge || !Number.isFinite(nativeHits) || !Number.isFinite(increase) ||
      nativeHits < 1 || increase < 1) return '';
  const hits = Math.floor(nativeHits), delta = Math.floor(increase);
  if (challenge.kind === 'hits') {
    if (challenge.drill==='reposition') return drill?.stage===2
      ? '✓ 追击命中 ' + Math.min(drill.follow,challenge.target) + '/' + challenge.target
      : '✓ 首枪命中 · 向掩体换位';
    return '✓ 命中 ' + Math.min(hits, challenge.target) + '/' + challenge.target;
  }
  return '✓ 有效命中 +' + delta;
}

/** Near-win feedback is shown only AFTER a real result, never as clutter
 * on the combat HUD and never from AI team scores. Advertisements remain
 * completely optional regardless of the outcome. */
export function cfNearMissCue(challenge, metrics={}, elapsedMs=0) {
  if(!challenge||!metrics)return null;
  if(challenge.lite===true){
    const defeated=challenge.kind==='hits'?Math.max(0,Math.floor(Number(metrics.kills)||0)):
      challenge.kind==='kills'?Math.max(0,Math.floor(Number(metrics.awmKills)||0)):
      challenge.kind==='assault'?Math.max(0,Math.floor(Number(metrics.assaultKills)||0)):0;
    if(challenge.kind==='defend'&&metrics.defenseCaptured===1)return null;
    if(defeated>0&&defeated+1===challenge.target)
      return '已经击倒'+defeated+'人，就差最后一人';
    return null;
  }
  const count=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
  const goal=count(challenge.target);
  if(challenge.kind==='defend'&&metrics.defenseSitesValid===true){
    const cap=count(metrics.defenseCaptured);
    if(cap>=1&&cap<goal)
      return '已守住第一处据点，第二处还没拿下';
    if(cap===0&&Number(metrics.defenseHeld)>=Number(challenge.holdSeconds)*.65)
      return '第一处据点已经守住大半时间';
  }
  if(challenge.kind==='assault'&&metrics.assaultStage===1){
    const kills=count(metrics.assaultKills);
    if(kills>=1&&kills<goal)
      return '已经抵达真实进攻位，只差最后'+(goal-kills)+'次亲手击杀';
  }
  if(challenge.kind==='kills'&&goal===1&&
    count(metrics.awmKills)===0&&count(metrics.hits)>=1)
    return 'AWM已经命中目标，补上关键一枪即可过关';
  if(challenge.kind==='kills'&&goal>1){
    const kills=count(metrics.awmKills);
    if(kills>=1&&kills<goal)
      return 'AWM已击杀'+kills+'人，再击杀'+(goal-kills)+'人并完成移动';
  }
  if(challenge.kind==='hits'&&challenge.drill==='reposition'&&
    metrics.drillStage===2){
    const hits=count(metrics.drillFollowUpHits);
    if(hits>=1&&hits<goal)
      return '换位已完成，追击还差'+(goal-hits)+'次有效命中';
  }
  if(challenge.kind==='survive'&&Number.isFinite(elapsedMs)&&
    Number.isFinite(challenge.limitMs)&&
    elapsedMs>=challenge.limitMs*.7&&
    Number(metrics.travel)>=Number(challenge.minTravel||0)*.8&&
    (!challenge.minKills||count(metrics.kills)>=challenge.minKills)){
    const left=Math.max(0,Math.ceil((challenge.limitMs-elapsedMs)/1000));
    if(challenge.extractSeconds&&!metrics.evacExtracted){
      if(metrics.evacSiteValid===true)return '移动和击杀已基本完成，但还没守住撤离区';
      return null;
    }
    if(left>0)return '坚持到最后阶段，还差'+left+'秒';
  }
  return null;
}

/** Rewarded video never raises HP directly: the actual native engine owns
 * its 4-second death/respawn cycle. The UI mirrors its remaining time. */
export function cfNativeReviveStatus(metrics={},rewarded=false) {
  const sec=Number(metrics.nativeRespawnSec);
  return rewarded===true&&metrics.alive===false&&
    Number.isFinite(sec)&&sec>0 ?'✚ 续战已生效 · '+Math.ceil(sec)+'秒后复活':null;
}

/** End-of-round teaching based on observed player stats, never simulated rewards. */
export function cfMissionDebrief(challenge, metrics = {}, outcome = 'lost') {
  if (!challenge || !['hits','kills','survive','defend','assault'].includes(challenge.kind)) return '';
  if(challenge.lite===true){
    if(outcome==='won')return '任务完成！这次亲手击倒'+
      Math.max(0,Math.floor(Number(metrics.kills)||0))+'人。';
    if(challenge.kind==='defend')return '据点尚未守住：留意标记区域与进入区域的敌人。';
    if(challenge.extractSeconds)return '撤离未完成：清掉敌人，进入撤离区并守到进度结束。';
    if(challenge.kind==='assault')return '尚未突破进攻位：先进入标记区域，再击败守军。';
    return '这次还没完成 '+challenge.objective+'。可以免费再试一次。';
  }
  const actual = v => Number.isFinite(v) ? Math.max(0,Math.floor(v)) : 0;
  const hits = actual(metrics.hits), awmKills = actual(metrics.awmKills);
  const deaths = actual(metrics.deaths), travel = actual(metrics.travel);
  const goal = actual(challenge.target);
  if (challenge.kind === 'defend') {
    const captured=actual(metrics.defenseCaptured),site=(challenge.reverse?'BA':'AB')[Math.min(1,captured)];
    if(outcome==='won')
      return (challenge.reverse?'B→A逆向占领':'A→B双点防守')+
        '成功！下次尝试零阵亡，缩短真实占点耗时。';
    if(metrics.defenseSitesValid!==true)
      return '据点路线不可用，本局没有虚构奖励。请重试或切换支持 WebGL 的设备。';
    if(metrics.defenseBreached===true)
      return '敌军在'+site+'点独占过久。下次提前到位，或在敌方接近时迎击。';
    if(deaths>challenge.maxDeaths+(challenge.bonusDeaths===1?1:0))
      return '阵亡'+deaths+'次，超过本关允许的阵亡限制。下次试试沿掩体侧路回点。';
    return '真实守住 '+captured+'/'+goal+' 处。前往'+site+
      '点：只有玩家亲自站在圈内、活着的敌人离开圈外，进度才会增加。';
  }
  if (challenge.kind === 'assault') {
    const moved=actual(metrics.assaultTravel),killed=actual(metrics.assaultKills);
    if(metrics.assaultSiteValid!==true)
      return '进攻位路线不可用，此局不结算虚构胜利。';
    return outcome==='won'
      ?'真实走到进攻位，移动 '+moved+'米后，亲手击杀 '+killed+' 人。'
      :'移动 '+moved+'/'+challenge.minTravel+'米'+
        (metrics.assaultStage===1?'、已进入进攻位':'、尚未进入地图上的进攻位')+
        '；到位之后亲手击杀 '+killed+'/'+challenge.target+'人。';
  }
  if (outcome === 'won') {
    if (challenge.kind === 'hits'&&challenge.drill==='reposition')
      return '战术突围完成：首枪命中、离开原位 '+actual(metrics.drillTravel)+
        ' 米、手动追击 '+actual(metrics.drillFollowUpHits)+
        ' 次。下一关挑战 AWM 精准击杀。';
    if (challenge.kind === 'hits')
      return '亲自命中 ' + hits + ' 次。下一关要使用 AWM 取得真正的击杀。';
    if (challenge.kind === 'kills')
      return 'AWM 真实击杀 ' + awmKills + ' 人'+
        (challenge.minTravel?'，同时移动'+travel+'米':'')+'。';
    return '累计真实移动 '+travel+' 米、被击倒 '+deaths+' 次'+
      (challenge.minKills?'、亲手击杀'+actual(metrics.kills)+'人':'')+
      (challenge.extractSeconds?'，已在原生地图撤离区完成守点。':'。下次试试零死亡通关。');
  }
  if (Number.isInteger(challenge.maxDeaths) && deaths > challenge.maxDeaths+(challenge.bonusDeaths===1?1:0))
    return '被击倒 ' + deaths + ' 次，本关最多允许 ' +
      challenge.maxDeaths + ' 次。下次借掩体换位，先避开敌方火力。';
  if (challenge.kind === 'hits'&&challenge.drill==='reposition') {
    const follow=actual(metrics.drillFollowUpHits);
    const moved=actual(metrics.drillTravel);
    if(metrics.drillFirstHit!==true)
      return '还没有第一次真实命中。跟住红色目标，准星对准后' +
        (challenge.elite?'手动按开火。':'自动开火。');
    if(metrics.drillStage===1)
      return '首枪已命中，但只换位 '+moved+'/'+challenge.minTravel+
        '米。下次沿集装箱移动，让敌人失去原来的射击角度。';
    return '换位已完成，追击命中 '+follow+'/'+challenge.target+
      '次。下次重新找角度，按开火按钮补足剩余命中。';
  }
  if (challenge.kind === 'hits') {
    if (hits === 0)
      return '0/' + goal + ' 次命中。用右手移动准星寻找红色敌人，' +
        (cfAutoFireEligible(challenge) ? '瞄准后自动开火。' : '手动点按开火。');
    return '已经命中 ' + hits + '/' + goal + ' 次，还差 ' +
      Math.max(0,goal-hits) + ' 次。下次继续跟住目标，直到出现命中确认。';
  }
  if (challenge.kind === 'kills') {
    if(challenge.minTravel&&travel<challenge.minTravel)
      return '击杀 '+awmKills+'/'+challenge.target+'人，移动'+travel+'/'+
        challenge.minTravel+'米；两个条件都要完成。';
    if (awmKills === 0 && hits > 0)
      return '命中 ' + hits + ' 次，但 AWM 击杀仍为 0/' + goal +
        '。命中不等于击杀，下次开镜锁定目标再补枪。';
    return 'AWM 击杀 ' + awmKills + '/' + goal +
      '。先找红色目标，开镜瞄准胸部，再按开火。';
  }
  if (deaths > goal+(challenge.bonusDeaths===1?1:0))
    return '被击倒 ' + deaths + ' 次，超过最多 ' +
      (goal+(challenge.bonusDeaths===1?1:0)) + ' 次的限制。';
  const min = actual(challenge.minTravel);
  if (travel < min)
    return '只移动 ' + travel + '/' + min + ' 米，还差 ' +
      (min-travel) + ' 米。下次用左手摇杆沿掩体移动，不要原地停留。';
  if(challenge.minKills&&actual(metrics.kills)<challenge.minKills)
    return '已移动'+travel+'米，但自己的击杀为'+actual(metrics.kills)+'/'+
      challenge.minKills+'。队友击杀不计算。';
  if(challenge.extractSeconds){
    if(metrics.evacSiteValid!==true)return '没有合法撤离区，不能发放任务胜利。';
    if(metrics.evacExtracted!==true)
      return '本人必须抵达撤离点，赶走敌人并坚守满'+challenge.extractSeconds+
        '秒；本局只守住 '+Math.floor(metrics.evacHeldSec||0)+' 秒。';
  }
  return '移动和阵亡条件已达成，但未坚持到时限。借助掩体保持移动直到倒计时结束。';
}


/** Short, accurate mission facts for the start screen. All values are authored rules. */
export function cfMissionFacts(challenge) {
  if (!challenge || !['hits','kills','survive','defend','assault'].includes(challenge.kind)) return [];
  const weapon = challenge.weapon === 'awm' ? 'AWM' :
    challenge.weapon === 'mp5' ? 'MP5' : 'M4A1';
  if(challenge.lite===true)return [
    {label:'装备',value:weapon},{label:'任务',value:challenge.objective},
    {label:'限时',value:Math.ceil(challenge.limitMs/1000)+'秒'}];
  const target = challenge.kind === 'hits' ? challenge.drill==='reposition'
    ? '1枪→'+challenge.minTravel+'m→'+challenge.target+'枪' : '命中 ' + challenge.target + ' 次' :
    challenge.kind === 'kills' ? '击杀 '+challenge.target+' 人'+(challenge.minTravel?' · 行进'+challenge.minTravel+'米':'') :
    challenge.kind === 'assault' ? '行进'+challenge.minTravel+'米→攻坚位→杀'+challenge.target+'人' :
    challenge.kind === 'defend' ? '守 '+(challenge.reverse?'B → A':'A → B')+' · 各'+challenge.holdSeconds+'秒' :
      challenge.minKills
        ?'移动'+(challenge.minTravel||0)+'米 · 击杀'+challenge.minKills+
          (challenge.extractSeconds?' · 撤离'+challenge.extractSeconds+'秒':'')
        :'移动 ' + (challenge.minTravel || 0) + ' m';
  return [
    { label:'装备',value:weapon },
    { label:'目标',value:target },
    { label:'限时',value:Math.ceil(challenge.limitMs/1000) + ' s' }
  ];
}

/** Stat chips are derived from native player measurements, never team kills. */
export function cfResultFacts(challenge, metrics = {}, elapsedMs = 0) {
  if (!challenge || !['hits','kills','survive','defend','assault'].includes(challenge.kind)) return [];
  if(challenge.lite===true){
    const count=x=>Math.max(0,Math.floor(Number(x)||0));
    const value=challenge.kind==='defend'?count(metrics.defenseCaptured):
      challenge.kind==='assault'?count(metrics.assaultKills):
      challenge.kind==='kills'?count(metrics.awmKills):count(metrics.kills);
    const label=challenge.kind==='defend'?'守住据点':
      challenge.kind==='assault'?'进攻位击倒':
      challenge.kind==='survive'?'亲手击倒':'亲手击倒';
    const goal=challenge.kind==='survive'?challenge.minKills||0:challenge.target;
    return [{label,value:value+'/'+goal},
      {label:'阵亡',value:String(count(metrics.deaths))},
      {label:'耗时',value:Math.ceil(elapsedMs/1000)+'秒'}];
  }
  const number = value => Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0;
  const deaths = number(metrics.deaths);
  if (challenge.kind === 'hits') return challenge.drill==='reposition'
    ? [
      {label:'追击',value:number(metrics.drillFollowUpHits)+' / '+challenge.target},
      {label:'换位',value:number(metrics.drillTravel)+' / '+challenge.minTravel+' m'},
      {label:'阵亡',value:deaths+' / '+challenge.maxDeaths}
    ] : [
      {label:'命中',value:number(metrics.hits) + ' / ' + challenge.target},
      {label:'阵亡',value:String(deaths)},
      {label:'耗时',value:Math.ceil(number(elapsedMs)/1000) + ' s'}
    ];
  if (challenge.kind === 'kills') return [
    {label:'狙杀',value:number(metrics.awmKills) + ' / ' + challenge.target},
    {label:challenge.minTravel?'移动':'命中',value:challenge.minTravel
      ? number(metrics.travel)+' / '+challenge.minTravel+' m':String(number(metrics.hits))},
    {label:'阵亡',value:String(deaths)}
  ];
  if (challenge.kind === 'assault') return [
    {label:'换位进攻位',value:metrics.assaultStage===1?'已到达':
      number(metrics.assaultTravel)+' / '+challenge.minTravel+' m'},
    {label:'本人击杀',value:number(metrics.assaultKills)+' / '+challenge.target},
    {label:'阵亡',value:deaths+' / '+challenge.maxDeaths}
  ];
  if (challenge.kind === 'defend') return [
    {label:'据点',value:number(metrics.defenseCaptured)+' / '+challenge.target},
    {label:'敌军',value:metrics.defenseBreached===true?'已攻破':'未攻破'},
    {label:'阵亡',value:deaths+' / '+challenge.maxDeaths}
  ];
  return [
    {label:challenge.extractSeconds?'撤离':'生存',value:challenge.extractSeconds
      ?(metrics.evacExtracted===true?'已完成':
          number(metrics.evacHeldSec)+' / '+challenge.extractSeconds+' s')
      :Math.min(Math.floor(number(elapsedMs)/1000),Math.ceil(challenge.limitMs/1000)) +
        ' / '+Math.ceil(challenge.limitMs/1000)+' s'},
    {label:'移动',value:number(metrics.travel) + ' / ' + challenge.minTravel + ' m'},
    {label:challenge.minKills?'亲手击杀':'阵亡',value:challenge.minKills
      ?number(metrics.kills)+' / '+challenge.minKills:deaths+' / '+challenge.target}
  ];
}

/**
 * Only two already-existing, walkable 3D-map locations qualify as objectives.
 * Both the player AND an actual enemy bot need genuine world-nav paths. Never
 * spawn a target, mutate collision geometry or credit a phantom zone.
 */
export function cfChooseDefenseSites({player,nav,world,actors=[]}) {
  if(!player?.pos||!['BL','GR'].includes(player.team)||
    !nav?.findPath||!nav?.idx||!nav?.walkable||!world?.blocked)return null;
  const side=player.team==='BL'?1:-1;
  const foes=actors.filter(a=>a?.team!==player.team&&a?.alive&&a?.pos);
  if(!foes.length)return null;
  const candidates=[
    [[-22,-6.8],[-18,-6.8],[-20,6.8],[-16,-6.8],[-16,7],[-14,-8],[-13,1.5]],
    [[-8,6.8],[-10,6.8],[-8,-6.8],[-5,7.8],[-6,-7.6],[-4,1.5],[1,7.8]]
  ];
  const sites=[];
  const isLegal=(x,z,from)=>{
    const idx=nav.idx(x,z);
    if(idx<0||!nav.walkable(idx)||world.blocked(x,.05,z,.55,1.75))return false;
    const path=nav.findPath(from.x,from.z,x,z);
    return Array.isArray(path)&&path.length>=2;
  };
  for(let i=0;i<2;i++){
    let found=null;
    for(const [ax,az] of candidates[i]){
      const x=ax*side,z=az*side;
      const origin=sites.at(-1)||player.pos;
      if(i>0&&Math.hypot(x-sites[0].x,z-sites[0].z)<8)continue;
      if(!isLegal(x,z,origin))continue;
      if(!foes.some(enemy=>isLegal(x,z,enemy.pos)))continue;
      found={id:'AB'[i],x,z};
      break;
    }
    if(!found)return null;
    sites.push(found);
  }
  return sites;
}

/** Send existing native bots down real NavGrid paths, not through obstacles.
 * Native senses, ballistics, hitboxes and attack logic still take priority. */
/** A single genuine bot may take a walkable side path toward its OWN recent
 * last-seen enemy position. Never use a hidden live position or teleport. */
export function cfObservedFlankPlan({actor,player,world,nav,now}={}) {
  if(!actor?.alive||actor.isPlayer||actor.team===player?.team||
    actor.visible===true||actor.target!==player||
    !actor.pos||!actor.lastSeen||!Number.isFinite(now)||
    !Number.isFinite(actor.lastSeenT)||now<actor.lastSeenT||
    now-actor.lastSeenT>3.5||!world?.blocked||
    !nav?.idx||!nav?.walkable||!nav?.findPath)return null;
  const seen=actor.lastSeen;
  const dx=seen.x-actor.pos.x,dz=seen.z-actor.pos.z;
  const distance=Math.hypot(dx,dz);
  if(!Number.isFinite(distance)||distance<7||distance>48)return null;
  const fx=dx/distance,fz=dz/distance;
  for(const side of [1,-1]){
    const x=seen.x-fx*2-fz*side*5;
    const z=seen.z-fz*2+fx*side*5;
    if(world.blocked(x,.05,z,.55,1.8))continue;
    const cell=nav.idx(x,z);
    if(cell<0||!nav.walkable(cell))continue;
    const path=nav.findPath(actor.pos.x,actor.pos.z,x,z);
    if(Array.isArray(path)&&path.length>=2)return {goal:[x,z],path};
  }
  return null;
}
export function cfRouteDefenseBots(game,site) {
  if(!site||!game?.player||!game?.nav?.findPath)return 0;
  let routed=0;
  for(const bot of game.actors||[]){
    if(!bot?.alive||bot.isPlayer||bot.team===game.player.team||!bot.pos)continue;
    if(bot.visible===true||Number(game.time)-Number(bot.lastSeenT)<2.5)continue;
    const distance=Math.hypot(bot.pos.x-site.x,bot.pos.z-site.z);
    const key=site.id+':'+(bot.stats?.d||0);
    if(distance<=2.5){
      if(bot.__mkDefenseGoalKey!==key||bot.role!=='hold'){
        bot.role='hold';bot.goal=[site.x,site.z];
        bot.path=null;bot.pi=0;
        bot.holdYaw=game.player.team==='BL'?-Math.PI/2:Math.PI/2;
        bot.holdT=0;bot.__mkDefenseGoalKey=key;
      }
      routed++;
      continue;
    }
    if(bot.__mkDefenseGoalKey===key&&Array.isArray(bot.path)&&bot.pi<bot.path.length)continue;
    const path=game.nav.findPath(bot.pos.x,bot.pos.z,site.x,site.z);
    if(!Array.isArray(path)||path.length<2)continue;
    bot.role='rush';bot.stage=0;bot.path=path;bot.pi=1;
    bot.goal=[site.x,site.z];bot.__mkDefenseGoalKey=key;
    routed++;
  }
  return routed;
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
  let playerEngaged=false;
  const aimTouchStarts=new Map();
  const fireDragTouches=new Map();
  const nativePads=[...(touchControls?.querySelectorAll('.pad')||[])];
  const pad=nativePads[0],stickKnob=nativePads[1];
  let moveFinger=null;
  let queuedJumpAt=null;
  let lastTouchAt=-Infinity;
  const markTouch=()=>{lastTouchAt=performance.now();};
  const stickCenter=()=>{
    const rect=pad?.getBoundingClientRect();
    return rect&&rect.width>0&&rect.height>0
      ?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null;
  };
  const resetKnob=()=>{
    if(stickKnob){stickKnob.style.left='70px';stickKnob.style.bottom='82px';}
  };
  const resetAllTouches=()=>{
    moveFinger=null;queuedJumpAt=null;
    resetKnob();
    return cfResetMobileTouch(game.player,aimTouchStarts,fireDragTouches);
  };
  const controlledTarget=e=>!!e.target?.closest?.(
    '.btn,button,input,textarea,select,a,#mk-panel');
  const onTouchStart=e=>{
    markTouch();
    if(!game.playing||game.paused||game.ended)return;
    if(e.target?.closest?.('.btn[data-mk-action="fire"]')){
      // Fire button still belongs to the native gun; camera movement from
      // THIS thumb is routed separately since native buttons stop bubbling.
      for(const t of e.changedTouches||[])
        fireDragTouches.set(t.identifier,{x:t.clientX,y:t.clientY});
      if(game.player?.alive)cfBeginTouchFire(game.player.touch);
      return;
    }
    if(e.target?.closest?.('.btn[data-mk-action="jump"]')){
      // Native touch.js owns the first press. Retain only its timestamp, so
      // a momentary step/fall or a dropped mobile frame cannot eat the press.
      // Actor.move() remains the sole source of actual jump physics.
      queuedJumpAt=Number(game.time)||0;
      return;
    }
    if(controlledTarget(e))return; // Keep native jump, reload and scope actions.
    // Native upstream TouchControls captures left/right IDs in window bubble
    // handlers, which are not reset on pagehide. Take ownership of ONLY the
    // neutral look/stick surface here, before their window listeners fire.
    e.stopPropagation();
    const center=stickCenter(),W=doc.defaultView?.innerWidth||844;
    for(const t of e.changedTouches||[]){
      const nearPad=center&&Math.hypot(t.clientX-center.x,t.clientY-center.y)<=110;
      if(moveFinger===null&&nearPad&&t.clientX<W*.40){
        moveFinger=t.identifier;
        const move=cfJoystickVector(t.clientX,t.clientY,center.x,center.y);
        if(game.player?.touch){
          game.player.touch.mx=move.mx;game.player.touch.mz=move.mz;
        }
      }else if(t.clientX>W*.38&&aimTouchStarts.size===0){
        aimTouchStarts.set(t.identifier,{x:t.clientX,y:t.clientY,
          originX:t.clientX,originY:t.clientY});
      }
    }
  };
  const aimFriction=()=>{
    const p=game.player,target=game.aimTarget;
    return activeChallenge?.lite===true&&p?.alive&&target?.alive&&
      target.team!==p.team ? .65 : 1;
  };
  const onTouchMove=e=>{
    markTouch();
    if(!game.playing||game.paused||game.ended)return;
    if(!controlledTarget(e))e.stopPropagation();
    const p=game.player;
    for(const t of e.changedTouches||[]){
      if(t.identifier===moveFinger){
        const center=stickCenter();
        if(!center)continue;
        const move=cfJoystickVector(t.clientX,t.clientY,center.x,center.y);
        if(p?.alive&&p.touch){
          p.touch.mx=move.mx;p.touch.mz=move.mz;
        }
        if(stickKnob){
          stickKnob.style.left=(70+move.dx)+'px';
          stickKnob.style.bottom=(82-move.dy)+'px';
        }
        continue;
      }
      const fire=fireDragTouches.get(t.identifier);
      if(fire){
        const delta=cfFireDragLookDelta(t.clientX-fire.x,t.clientY-fire.y,aimFriction());
        fire.x=t.clientX;fire.y=t.clientY;
        if(p?.alive){
          if(p.touch&&!p.touch.fire)cfBeginTouchFire(p.touch);
          p.touchLook ||= {x:0,y:0};
          // One active camera thumb at a time: when independent free-look is
          // held, avoid accumulating two gestures into doubled sensitivity.
          if(aimTouchStarts.size===0){
            p.touchLook.x+=delta.x;p.touchLook.y+=delta.y;
          }
        }
        continue;
      }
      const aim=aimTouchStarts.get(t.identifier);
      if(aim){
        const delta=cfFireDragLookDelta(t.clientX-aim.x,t.clientY-aim.y,aimFriction());
        aim.x=t.clientX;aim.y=t.clientY;
        if(p?.alive){
          p.touchLook ||= {x:0,y:0};
          p.touchLook.x+=delta.x;p.touchLook.y+=delta.y;
          if(Math.hypot(t.clientX-aim.originX,t.clientY-aim.originY)>12)
            playerEngaged=true;
        }
      }
    }
  };
  const releaseNativeFire=(cancelPending=false)=>{
    cfReleaseTouchFire(game.player?.touch,cancelPending);
  };
  const onTouchEnd=e=>{
    markTouch();
    if(!controlledTarget(e))e.stopPropagation();
    if(e.type==='touchcancel'){
      // iOS can cancel one finger while others remain down. Fail closed:
      // release every held native action; no synthetic shots or movement.
      resetAllTouches();
      return;
    }
    const hadFireFinger=fireDragTouches.size>0;
    for(const t of e.changedTouches||[]){
      if(t.identifier===moveFinger){
        moveFinger=null;resetKnob();
        if(game.player?.touch){
          game.player.touch.mx=0;game.player.touch.mz=0;
        }
      }
      aimTouchStarts.delete(t.identifier);
      fireDragTouches.delete(t.identifier);
    }
    if(hadFireFinger&&fireDragTouches.size===0)releaseNativeFire();
  };
  const onLifecycleInterrupt=()=>resetAllTouches();
  const onVisibilityInterrupt=()=>{if(doc.hidden)resetAllTouches();};
  // The pinned desktop Player.bind() fires a bullet on canvas mousedown.
  // Browsers synthesize mousedown after short touch-aim gestures unless this
  // compatibility event is stopped at document CAPTURE. Preserve clicks for
  // menu/replay UI and preserve the original on-screen fire touch handler.
  const stopCompatibilityMouse=e=>{
    if(!blockMobileTouchMouse({touchMode:game.touchMode===true,
      fromTouch:e.sourceCapabilities?.firesTouchEvents===true,
      msSinceTouch:performance.now()-lastTouchAt}))return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  doc.addEventListener('mousedown',stopCompatibilityMouse,true);
  doc.addEventListener('mouseup',stopCompatibilityMouse,true);
  doc.addEventListener('touchstart',onTouchStart,{capture:true,passive:true});
  doc.addEventListener('touchmove',onTouchMove,{capture:true,passive:true});
  doc.addEventListener('touchend',onTouchEnd,{capture:true,passive:true});
  doc.addEventListener('touchcancel',onTouchEnd,{capture:true,passive:true});
  doc.defaultView?.addEventListener('blur',onLifecycleInterrupt);
  doc.defaultView?.addEventListener('pagehide',onLifecycleInterrupt);
  doc.addEventListener('visibilitychange',onVisibilityInterrupt);
  const buttons = touchControls ? [...touchControls.querySelectorAll('.btn')] : [];
  for (const [index, button] of buttons.entries()) {
    const action = mobileTouchAction(index);
    button.dataset.mkAction = action;
    if (action === 'fire') {
      button.textContent = '开火';
      button.setAttribute('aria-label','按住开火并拖动瞄准');
    }
    if (action === 'reload') button.textContent = '换弹';
    if (action === 'jump') button.textContent = '跳';
    if (action === 'scope') button.textContent = '开镜';
    if (action === 'duplicate-fire' || action === 'crouch' || action === 'switch') {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('tabindex', '-1');
    }
    // The original source only handles touchend, not cancellation.
    if (action === 'fire') button.addEventListener('touchstart', () => {
      if(cfAutoFireEligible(activeChallenge,game.player?.stats?.hits||0))playerEngaged=true;
      if(activeChallenge?.elite!==true)nudgeAim(true);
    }, {capture:true,passive:true});
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
  function updateTutorial(challenge) {
    const tip=tutorial.querySelector('span:last-child');
    if(tip)tip.innerHTML='<b>③</b> ' + cfTouchTutorial(challenge);
  }
  const originalToast = game.hud.toast.bind(game.hud);
  game.hud.toast = (value, duration) => {
    let message = String(value);
    if (message.includes('团队竞技') && message.includes('率先达到')) return;
    if (/Esc|Tab|按 R|按 B|鼠标|键盘/.test(message)) {
      message = '手机操作：左手移动，右手瞄准；需要时点“暂停”';
    }
    originalToast(message, duration);
  };
  const board = doc.createElement('div');
  board.id = 'mk-fps-board';
  board.setAttribute('aria-label', '实时双方比分');
  board.innerHTML = '<span class="mk-fps-team mk-fps-ally"><small>我方</small><b data-mk-score="ally">0</b></span>' +
    '<span class="mk-fps-versus" aria-hidden="true">:</span>' +
    '<span class="mk-fps-team mk-fps-foe"><b data-mk-score="enemy">0</b><small>敌方</small></span>';
  const scoreAlly = board.querySelector('[data-mk-score="ally"]');
  const scoreEnemy = board.querySelector('[data-mk-score="enemy"]');
  header.prepend(board);
  const target = doc.createElement('div');
  target.id = 'mk-fps-target';
  target.hidden = true;
  target.setAttribute('aria-live', 'off');
  root.append(target);
  const hitCue = doc.createElement('div');
  hitCue.id = 'mk-fps-hit-feedback';
  hitCue.hidden = true;
  hitCue.setAttribute('aria-live', 'off');
  root.append(hitCue);
  const damageVignette = doc.createElement('div');
  damageVignette.id = 'mk-fps-damage-vignette';
  damageVignette.setAttribute('aria-hidden','true');
  damageVignette.hidden=true;root.append(damageVignette);
  const guide = doc.createElement('div');
  guide.id = 'mk-fps-guide';
  guide.textContent = '◆ 蓝色队友 · ▼ 红色敌人';
  guide.hidden = true;
  root.append(guide);
  const defensePin=doc.createElement('div');
  defensePin.id='mk-fps-defense-pin';
  defensePin.hidden=true;defensePin.setAttribute('aria-hidden','true');
  root.append(defensePin);
  const markers = new Map();
  let started = 0, nextUpdate = 0, lastBoard = '', lastTarget = '';
  let activeChallenge = null, nextBalanceAt = 0, cueExpiresAt = 0;
  let previousCombat=null,damageExpiresAt=0;
  let drill = null, drillStageAt = 0, flankGoal = null, flankDeaths = -1;
  let autoAimActor = null, autoAimSince = 0, autoFireActive = false;
  let routePath = null, routeLastAt = 0, lastVisibleEnemy = null, firstHitSpot = null;
  let visibleAimCoach = '';
  let originalEnemySpawns=null, trainingSpawnTeam=null;
  let walkedMeters = 0, previousPosition = null, startedGameSeconds = 0;
  let defense=null,nextDefenseRouteAt=0,assault=null,extraction=null;
  let plannedObservedFlank=false;
  let perfWindowStart=0,perfFrames=0,perfFastWindows=0,perfLastAdjust=0;

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
      sprite.scale.x = Math.min(1.3, sprite.scale.x);
      tag.__mkAllyLabel = true;
    }
  }

  function fadeNativeAllies(active) {
    const camera=game.renderer?.camera;
    for (const tag of game.tags || []) {
      if(!tag.__mkAllyLabel || !tag.sprite?.material) continue;
      const distance=tag.actor?.pos?.distanceTo?.(camera?.position);
      // The native engine sets sprite.visible on every simulation frame.
      // Material opacity persists through the render and hides post-round ghosts.
      tag.sprite.material.opacity=teammateTagOpacity({
        active,alive:tag.actor?.alive===true,distance
      });
    }
  }
  function prepareFirstEncounter() {
    const p=game.player, destination=firstEncounterDestination(p?.team);
    if(!p || !destination || !game.nav?.findPath) return {path:false,trainingScout:false};
    const enemies=(game.actors||[]).filter(a=>
      a && !a.isPlayer && a.team!==p.team && a.alive && a.primary!=='awm');
    if((activeChallenge?.kind==='hits' || activeChallenge?.kind==='kills') && enemies.length) {
      const sniper=activeChallenge.kind==='kills';
      let spot=chooseFirstEncounterSpot({player:p,world:game.world,nav:game.nav,actors:game.actors,
        distances:sniper?[18,16,14,12,10,8.5,7]:undefined});
      if(!spot && sniper) {
        const lane=chooseMobileSniperLane({player:p,spawns:game.map?.spawns?.[p.team],
          world:game.world,nav:game.nav,actors:game.actors});
        if(lane){
          // A match-start spawn choice among the ORIGINAL authored BL/GR spawns.
          // No movement or enemy coordinates are changed during live combat.
          p.pos.set(lane.spawn.x,0.02,lane.spawn.z);
          p.yaw=lane.spawn.yaw;p.pitch=0;p.vel.set(0,0,0);
          spot=lane.spot;
        }
      }
      if(spot) {
        // Scripted level opening: reposition one EXISTING enemy before play,
        // rather than spawning a dummy or giving the player free hits.
        const scout=enemies[0];
        if(activeChallenge?.drill==='reposition'&&activeChallenge.elite!==true&&
           Array.isArray(game.map?.spawns?.[scout.team])) {
          const secondary=chooseFirstEncounterSpot({
            player:p,world:game.world,nav:game.nav,actors:game.actors,
            distances:[14,13,12]
          });
          const authored=cfTrainingRespawnSpots(spot,secondary);
          if(authored.length){
            originalEnemySpawns=game.map.spawns[scout.team];
            trainingSpawnTeam=scout.team;
            game.map.spawns[scout.team]=authored;
          }
        }
        scout.spawn({x:spot.x,z:spot.z,yaw:spot.yaw});
        scout.onSpawn?.();
        // Hold the first readable sight line briefly; never grant fake hits.
        scout.role='hold';
        scout.goal=[spot.x,spot.z];
        scout.path=null;
        scout.pi=0;
        scout.holdYaw=spot.yaw;
        scout.holdT=0;
        scout.protectT=0;
        // Allow new players several *simulation seconds* to recognize, aim
        // and shoot. Afterward the standard Bot can shoot normally.
        scout.readyAt=Math.max(scout.readyAt,game.time+
          cfScoutReadyDelaySeconds(activeChallenge));
        scout.__mobileTrainingScout=!sniper;
        scout.__mobileSniperScout=sniper;
        if(sniper) holdOpeningTeammateFire(game.actors,p.team,game.time);
        scout.__mobileTrainingHoldUntil=game.time+cfScoutHoldSeconds(activeChallenge);
        return {path:true,trainingScout:!sniper,sniperScout:sniper,range:spot.distance,
          initialVisibleSpot:[spot.x,spot.z]};
      }
    }
    for(const bot of enemies) {
      const path=game.nav.findPath(bot.pos.x,bot.pos.z,destination[0],destination[1]);
      if(!Array.isArray(path) || path.length<2)continue;
      bot.role='rush';bot.stage=0;bot.path=path;bot.pi=1;
      bot.goal=[...destination];bot.__mobileFirstEncounter=true;
      return {path:true,trainingScout:false};
    }
    return {path:false,trainingScout:false};
  }
  function findRoute() {
    const p=game.player;
    // New players should RECOVER the proven first-shot sightline instead of
    // blindly charging a remembered enemy's position through container walls.
    // Both coordinates are genuinely observed player history, never hidden
    // enemy world positions. Expert players still pursue sightings directly.
    const follow=activeChallenge?.lite!==true&&activeChallenge?.drill==='reposition'&&drill?.stage===2;
    const observedShotLane=follow&&activeChallenge?.elite!==true&&firstHitSpot
      ? [firstHitSpot.x,firstHitSpot.z] : null;
    const known=follow?lastVisibleEnemy:null;
    // First try a fresh shooting lane: the nearest safe, walkable point
    // with clear world sight to a formerly visible enemy, not the original
    // first-shot tile. No live hidden opponent coordinates are used.
    const sightLane=observedShotLane&&known&&p
      ? cfReacquireLane({player:p,firstHitSpot,lastSeen:known,
        world:game.world,nav:game.nav}) : null;
    if(observedShotLane&&known&&p&&!sightLane&&
      cfSeenLaneSight(game.world,p.pos,known,
        p.pos.y+(Number.isFinite(p.eyeH)?p.eyeH:1.6))===true)return null;
    const dest=sightLane?[sightLane.x,sightLane.z]:observedShotLane||
      (known?[known.x,known.z]:firstEncounterDestination(p?.team));
    if(!p || !dest || !game.nav?.findPath) return null;
    const path=game.nav.findPath(p.pos.x,p.pos.z,dest[0],dest[1]);
    if(!Array.isArray(path)||path.length<2)
      return observedShotLane||null;
    const minStep=observedShotLane?0.6:2.2;
    return path.find((pt,i)=>i>0 && Array.isArray(pt) &&
      Math.hypot(pt[0]-p.pos.x,pt[1]-p.pos.z)>minStep) || dest;
  }
  function applyBalance(elapsed) {
    const p = game.player;
    if (!p) return;
    const normalProfile = mobileEnemyDifficulty(activeChallenge?.kind, elapsed, p.stats);
    const expertProfile = activeChallenge?.elite===true
      ? mobileEnemyDifficulty(activeChallenge.kind, elapsed, p.stats, true) : null;
    // Both teams stay comparable: do not let allied bots farm all enemies
    // before a novice player gets a first encounter.
    for (const actor of game.actors || []) {
      if (!actor || actor.isPlayer || !actor.diff) continue;
      let stabilized=false;
      if(mobileScoutHoldExpired(actor,game.time)) {
        actor.__mobileTrainingScout=false;
        actor.__mobileSniperScout=false;
        // End temporary opponent spawn-camping when the intro ends.
        // No current actor gets teleported; only future native respawns use
        // the legitimate authored spawn pool again.
        if(originalEnemySpawns&&trainingSpawnTeam&&game.map?.spawns){
          game.map.spawns[trainingSpawnTeam]=originalEnemySpawns;
          originalEnemySpawns=null;trainingSpawnTeam=null;
        }
        actor.role='rush';
        actor.pickGoal?.();
      } else {
        stabilized=cfStabilizeNoviceScout(actor,activeChallenge);
      }
      // Only opponents gain expert reaction and aim: allies cannot carry the mission.
      const baseProfile=expertProfile&&actor.team!==p.team ? expertProfile : normalProfile;
      const profile=actor.team!==p.team
        ?cfLiteEnemyProfile(baseProfile,activeChallenge,elapsed):baseProfile;
      actor.diff = {...profile,strafe:cfNoviceScoutStrafe(profile,stabilized),
        react:[...profile.react]};
      actor.recoilControl = profile.ctrl;
      if(!plannedObservedFlank&&elapsed>=16&&
        ['survive','assault','hits'].includes(activeChallenge?.kind)&&
        activeChallenge?.elite!==true&&actor.team!==p.team&&!stabilized){
        const plan=cfObservedFlankPlan({
          actor,player:p,world:game.world,nav:game.nav,now:game.time});
        if(plan){
          actor.role='flank';actor.stage=1;actor.goal=plan.goal;
          actor.path=plan.path;actor.pi=1;actor.huntFor=actor.lastSeenT;
          plannedObservedFlank=true;
          if(game.__mobileBalanceReview)
            game.__mobileBalanceReview.observedFlankAt=+elapsed.toFixed(1);
        }
      }
    }
  }

  function nudgeAim(forceFiring = false) {
    if(activeChallenge?.elite===true)return;
    const p = game.player, cam = game.renderer?.camera;
    // After the tutorial hit we stop automatic shooting and idle aim snaps.
    // A small native sight correction remains ONLY while the user holds fire,
    // avoiding the abrupt aim-feel cliff common on mobile FPS.
    const simple=cfAutoFireEligible(activeChallenge,p?.stats?.hits||0) &&
      p?.weapon?.id==='m4a1';
    if (!p?.alive || !game.playing || game.paused || !cam ||
        !(forceFiring || p.touch?.fire || (simple&&playerEngaged))) return;
    const sniper = p.weapon?.def?.type === 'sniper';
    const ready = !sniper || (p.scoped > 0 && p.scopeReady);
    if (!ready) return;
    const eye = p.eye(cam.position.clone());
    let best = null, bestScore = Infinity;
    for (const [actor,marker] of markers) {
      // Only use a CURRENTLY rendered and world-LOS verified enemy marker.
      if (marker.hidden||!actor.alive||actor.protectT>0||
        actor.team===p.team||!actor.soldier)continue;
      // Original marker may show an exposed head while the torso remains
      // behind a container. A chest-only aid silently fails there.
      for(const [part,body] of [
        ['chest',actor.soldier.chestWorld(eye.clone())],
        ['head',actor.soldier.headWorld(eye.clone())]
      ]){
        const dir=body.sub(eye),distance=dir.length();
        if(!(distance>1&&distance<=27))continue;
        const hit=game.world.raycast(eye.x,eye.y,eye.z,
          dir.x/distance,dir.y/distance,dir.z/distance,
          Math.max(0,distance-0.15),'sight');
        if(hit)continue;
        const angles=cfNativeShotAimError({
          targetYaw:Math.atan2(-dir.x,-dir.z),
          targetPitch:Math.atan2(dir.y,Math.hypot(dir.x,dir.z)),
          playerYaw:p.yaw,playerPitch:p.pitch,
          recoilYaw:p.punchY||0,recoilPitch:p.punchP||0
        });
        if(!angles)continue;
        // An exposed head is a smaller manual target than a visible torso.
        // Do not snap a novice to a tiny head from a wide camera angle.
        if(part==='head'&&
          (Math.abs(angles.yawError)>0.11||
           Math.abs(angles.pitchError)>0.085))continue;
        const aim=mobileAimCorrection({
          ...angles,distance,visible:true,
          firing:!!(forceFiring||p.touch?.fire||(simple&&playerEngaged)),
          sniperReady:ready,
          training:activeChallenge?.lite!==true&&
            activeChallenge?.drill==='reposition'&&activeChallenge.elite!==true
        });
        if(!aim.yaw&&!aim.pitch)continue;
        const score=Math.abs(angles.yawError)+Math.abs(angles.pitchError)+
          (part==='head'?0.06:0);
        if(score<bestScore){bestScore=score;best=aim;}
      }
    }
    if (best) {
      p.yaw += best.yaw;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + best.pitch));
    }
  }

  function updateAutoFire() {
    const p=game.player;
    const simple=cfAutoFireEligible(activeChallenge,p?.stats?.hits||0);
    let actor=game.aimTarget;
    // The pinned renderer's exact hitbox ray may be null even when the enemy
    // has a genuinely visible, LOS-checked HUD marker directly ahead.
    // First-hit assistance can select that already seen actor in a narrow cone.
    // Native M4 bullets, impact physics and hit counters remain untouched.
    if(simple&&p?.alive&&playerEngaged&&
       (!actor?.alive||actor.team===p.team)){
      const cam=game.renderer?.camera,world=game.world;
      if(cam&&world){
        const eye=p.eye(cam.position.clone());
        let closest=Infinity;
        for(const [candidate,marker] of markers){
          if(marker.hidden||!candidate?.alive||candidate.team===p.team||
             !candidate.soldier)continue;
          const dir=candidate.soldier.chestWorld(eye.clone()).sub(eye);
          const distance=dir.length();
          if(!(distance>1&&distance<=27))continue;
          const blocked=!!world.raycast(eye.x,eye.y,eye.z,
            dir.x/distance,dir.y/distance,dir.z/distance,
            Math.max(0,distance-0.18),'sight');
          const yaw=Math.atan2(-dir.x,-dir.z),pitch=Math.atan2(dir.y,Math.hypot(dir.x,dir.z));
          const yawError=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));
          const pitchError=pitch-p.pitch;
          if(!cfIntroAssistCandidate({side:teamSide(p.team,candidate.team),
             alive:true,visible:true,blocked,distance,yawError,pitchError}))continue;
          const score=Math.abs(yawError)+Math.abs(pitchError);
          if(score<closest){closest=score;actor=candidate;}
        }
      }
    }
    if (!simple || !p?.alive || !game.playing || game.paused || !playerEngaged) {
      if (p && (simple || autoFireActive)) p.mouse.l=false;
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
    const toYaw=Math.atan2(-aim.x,-aim.z), horiz=Math.hypot(aim.x,aim.z);
    const yawError=Math.atan2(Math.sin(toYaw-p.yaw),Math.cos(toYaw-p.yaw));
    const pitchError=Math.atan2(aim.y,horiz)-p.pitch;
    const allowed=mobileSimpleFireAllowed({
      kind:activeChallenge?.kind,weapon:p.weapon?.id,side:teamSide(p.team,actor.team),
      alive:p.alive,distance,blocked,heldSeconds:(Number(game.time)||0)-autoAimSince,
      yawError,pitchError,engaged:playerEngaged
    });
    p.mouse.l=allowed;
    if(game.__mobileBalanceReview)game.__mobileBalanceReview.playerEngaged=playerEngaged;
    if(allowed&&!autoFireActive) {
      game.__mobileBalanceReview.autoFireActivations++;
    }
    autoFireActive=allowed;
  }
  function updateAim() {
    const p = game.player, actor = game.aimTarget;
    const side = p?.alive && actor?.alive ? teamSide(p.team, actor.team) : 'unknown';
    const label = side === 'ally' ? '◆ 友军' : side === 'enemy'
      ? activeChallenge?.kind==='hits'
        ? (cfAutoFireEligible(activeChallenge,p?.stats?.hits||0) ? '▼ 敌方目标' : '▼ 点击开火')
        : '▼ 敌方目标'
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
    visibleAimCoach='';
    for (const el of markers.values()) el.hidden = true;
  }

  function updateEnemyMarkers() {
    const p = game.player, cam = game.renderer?.camera;
    if (!p?.alive || !cam || !game.world) { clearMarkers(); return; }
    const shown = new Set();
    visibleAimCoach='';
    let closestAim=Infinity;
    for (const actor of game.actors || []) {
      if (teamSide(p.team, actor.team) !== 'enemy' || !actor.alive || !actor.soldier) continue;
      // A projected head location is not enough: an obstruction ray is required.
      const candidates=[
        ['chest',actor.soldier.chestWorld(cam.position.clone())],
        ['head',actor.soldier.headWorld(cam.position.clone())]
      ];
      let projected=null,visiblePart='';
      for(const [part,body] of candidates) {
        const dir=body.clone().sub(cam.position);
        const distance=dir.length();
        if(!(distance>0 && distance<=44))continue;
        const pos=body.clone().project(cam);
        const cover=game.world.raycast(cam.position.x,cam.position.y,cam.position.z,
          dir.x/distance,dir.y/distance,dir.z/distance,Math.max(0,distance-0.18),'sight');
        if(!enemyBadgeAllowed({
          side:'enemy',alive:true,distance,
          x:pos.x,y:pos.y,z:pos.z,coverDistance:cover?.t??null
        }) || cover ||
          !withinScopedLens({x:pos.x,y:pos.y,width:doc.defaultView?.innerWidth||844,
            height:doc.defaultView?.innerHeight||390,scoped:p.scoped>0}))continue;
        projected=pos;visiblePart=part;break;
      }
      if(!projected)continue;
      if(activeChallenge?.lite!==true&&activeChallenge?.drill==='reposition'&&drill?.stage===2){
        const delta=Math.hypot(projected.x,projected.y);
        if(delta<closestAim){
          closestAim=delta;
          visibleAimCoach=visiblePart==='head'&&delta<0.23
            ? '◎ 敌人露头 · 瞄高后开火'
            : cfVisibleAimCoach(projected.x,projected.y);
        }
      }
      // The projected marker passed both camera-frustum and LOS raycast tests:
      // remembering this location is equivalent to a real player's sighting.
      if(activeChallenge?.drill==='reposition')
        lastVisibleEnemy={x:actor.pos.x,z:actor.pos.z,at:game.time};
      let el = markers.get(actor);
      if (!el) {
        el = doc.createElement('div');
        el.className = 'mk-fps-enemy';
        el.textContent = '▼ 敌';
        if(actor.__mobileTrainingScout)el.classList.add('mk-fps-training-enemy');
        el.setAttribute('aria-hidden', 'true');
        root.append(el);
        markers.set(actor, el);
      }
      el.hidden = false;
      // Signal only a visible LOS-confirmed opponent already reacting to
      // authentic combat; no through-wall pings or additional target assist.
      el.classList.toggle('mk-fps-returnfire',
        (actor.__mkIntroThreatStage||0)>0&&
        Number(game.time)-Number(actor.__mkIntroReactionAt)<=2.5);
      el.dataset.visiblePart=visiblePart;
      el.textContent=visiblePart==='head'?'▼ 露头':'▼ 敌';
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
    drillMetrics() {
      return drill?{drillStage:drill.stage,drillFirstHit:drill.firstHit,
        drillTravel:drill.distance,drillFollowUpHits:drill.follow}:{};
    },
    assaultMetrics() {
      return assault?{assaultStage:assault.stage,assaultTravel:assault.travel,
        assaultKills:assault.postKills,assaultNet:assault.net,
        assaultSiteValid:assault.checkpointValid===true,
        assaultInZone:assault.inZone===true,
        assaultSiteDistance:assault.checkpointDistance}:{};
    },
    extractionMetrics() {
      if(!extraction)return {};
      return {evacSiteValid:extraction.valid===true,
        evacExtracted:extraction.extracted===true,
        evacHeldSec:extraction.held,evacInZone:extraction.inside===true,
        evacContested:extraction.contested===true};
    },
    defenseMetrics() {
      if(!defense)return {};
      return {defenseSitesValid:defense.valid===true,
        defenseCaptured:defense.captured,defenseStage:defense.stage,
        defenseBreached:defense.breached===true,
        defenseHeld:defense.held,defenseEnemyHeld:defense.enemyHeld,
        defenseInside:defense.playerInside===true,
        defenseContested:defense.contested===true,
        defenseSite:defense.sites?.[defense.stage]?.id||null};
    },
    onSelect(challenge) { updateTutorial(challenge); defensePin.hidden=true; },
    beforeNativeStart() {
      // A previous beginner scout may have authored short-term team spawns.
      // Restore them BEFORE original Game.startMatch() chooses new positions,
      // not afterward (that is too late for a real warm replay).
      if(originalEnemySpawns&&trainingSpawnTeam&&game.map?.spawns)
        game.map.spawns[trainingSpawnTeam]=originalEnemySpawns;
      originalEnemySpawns=null;trainingSpawnTeam=null;
      resetAllTouches();
    },
    onStart(challenge) {
      activeChallenge = challenge || null;
      root.dataset.fpsLite=String(activeChallenge?.lite===true);
      if(activeChallenge?.lite===true && game?.opts){
        // An authored narrow combat FOV enlarges target silhouettes on phones.
        // Original camera follows opts.fov through Player.update().
        game.opts.fov=70;
      }
      if(originalEnemySpawns&&trainingSpawnTeam&&game.map?.spawns)
        game.map.spawns[trainingSpawnTeam]=originalEnemySpawns;
      originalEnemySpawns=null;trainingSpawnTeam=null;
      drill=cfAdvanceDrill(activeChallenge);
      defense=null;assault=null;extraction=null;nextDefenseRouteAt=0;defensePin.hidden=true;
      plannedObservedFlank=false;
      drillStageAt=0;flankGoal=null;flankDeaths=-1;
      updateTutorial(activeChallenge);
      autoAimActor=null;autoAimSince=0;autoFireActive=false;
      playerEngaged=false;resetAllTouches();
      guide.textContent = activeChallenge?.lite===true
        ? activeChallenge.encounter
        :activeChallenge?.elite===true
        ? '⚡ 精英：自己瞄准开火'
        : activeChallenge?.kind === 'kills'
        ? '先观察，找到目标后开镜'
        : activeChallenge?.extractSeconds
          ? '完成移动击杀后，去远端撤离点坚守'
          : activeChallenge?.kind === 'survive'
          ? '沿掩体移动，注意身后'
          : activeChallenge?.kind === 'assault'
          ? '沿路线前往进攻位，再亲手击杀'
          : activeChallenge?.kind === 'defend'
          ? (activeChallenge.reverse?'先攻B区，再回防A区':'先守A区，再守B区')
          : '前方有目标 · 右手瞄准';
      started = performance.now();
      startedGameSeconds = Number(game.time) || 0;
      routePath=null;routeLastAt=0;lastVisibleEnemy=null;firstHitSpot=null;
      nextUpdate = 0;
      nextBalanceAt = 0;
      perfWindowStart=performance.now();perfFrames=0;perfFastWindows=0;
      perfLastAdjust=perfWindowStart;
      previousCombat=game.player?{
        hits:game.player.stats?.hits||0,kills:game.player.stats?.k||0,
        hp:game.player.hp,alive:game.player.alive===true}:null;
      cueExpiresAt = 0;damageExpiresAt=0;
      hitCue.hidden = true;damageVignette.hidden=true;
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
      // The visible mission clock is authoritative in lite PVE. An unrelated
      // original team kill limit must never terminate the player's objective.
      if(activeChallenge?.lite===true)game.goal=Math.max(300,Number(game.goal)||0);
      game.__mobileBalanceReview = {startingLaneMeters: clear?.clearance ?? null,
        challenge: activeChallenge?.id,autoFireActivations:0,playerEngaged:false};
      const rendezvous=activeChallenge?.kind==='defend'
        ?{path:false,trainingScout:false} :prepareFirstEncounter();
      const needsSites=activeChallenge?.kind==='defend'||
        activeChallenge?.kind==='assault'||!!activeChallenge?.extractSeconds;
      const sites=needsSites?cfChooseDefenseSites({
        player:p,nav:game.nav,world:game.world,actors:game.actors}):null;
      if(activeChallenge?.kind==='assault'){
        assault=cfAdvanceAssault(activeChallenge,null,{
          kills:p?.stats?.k||0,travel:0,x:p?.pos?.x,z:p?.pos?.z,
          alive:p?.alive===true,checkpoint:sites?.[0]});
        game.__mobileBalanceReview.assaultSiteValid=assault?.checkpointValid===true;
        game.__mobileBalanceReview.assaultSite=assault?.checkpoint;
      }
      if(activeChallenge?.extractSeconds){
        const far=sites?.[1];
        const playerPath=far&&game.nav?.findPath?.(
          p.pos.x,p.pos.z,far.x,far.z);
        extraction=cfStartExtraction(Array.isArray(playerPath)&&
          playerPath.length>=2?far:null);
        game.__mobileBalanceReview.evacSiteValid=extraction.valid;
        game.__mobileBalanceReview.evacSite=extraction.site;
      }
      if(activeChallenge?.kind==='defend') {
        let defenseSites=sites;
        if(defenseSites&&activeChallenge.reverse){
          const far=defenseSites[1];
          const path=game.nav?.findPath?.(p.pos.x,p.pos.z,far.x,far.z);
          defenseSites=Array.isArray(path)&&path.length>=2?[far,defenseSites[0]]:null;
        }
        defense=cfStartDefense(defenseSites);
        game.__mobileBalanceReview.defenseSitesValid=defense.valid;
        game.__mobileBalanceReview.defenseSites=defense.sites;
        if(defense.valid)cfRouteDefenseBots(game,defense.sites[0]);
      }
      if(rendezvous.trainingScout&&Array.isArray(rendezvous.initialVisibleSpot))
        lastVisibleEnemy={x:rendezvous.initialVisibleSpot[0],
          z:rendezvous.initialVisibleSpot[1],at:game.time};
      game.__mobileBalanceReview.firstRendezvousPath=rendezvous.path;
      game.__mobileBalanceReview.trainingScout=rendezvous.trainingScout;
       game.__mobileBalanceReview.sniperScout=rendezvous.sniperScout===true;
      game.__mobileBalanceReview.trainingScoutRange=rendezvous.range??null;
      game.__mobileBalanceReview.teamSize=game.opts.size;
      applyBalance(0);
      recolorNativeAllies();
    },
    update(running, now = performance.now()) {
      const active = !!(running && game.playing && !game.paused && !game.ended);
      // Native time advances in real Game.update; on slow software WebGL
      // this lowers raster work, never speeds up actor simulation or rewards.
      if(active&&game.renderer?.renderer?.setPixelRatio) {
        if(!perfWindowStart)perfWindowStart=now;
        perfFrames++;
        const windowMs=now-perfWindowStart;
        if(windowMs>=4000&&now-perfLastAdjust>=4000) {
          const fps=perfFrames*1000/windowMs;
          perfFastWindows=fps>48?perfFastWindows+1:0;
          const renderer=game.renderer.renderer;
          const current=renderer.getPixelRatio();
          const target=cfAdaptivePixelRatio(current,fps,perfFastWindows);
          if(Math.abs(target-current)>.001)
            cfApplyNativePixelRatio(game.renderer,target);
          perfLastAdjust=now;perfWindowStart=now;perfFrames=0;
        }
      }else{perfWindowStart=now;perfFrames=0;perfFastWindows=0;}
      if(queuedJumpAt!==null){
        const actor=game.player;
        if(!active||!actor?.alive||Number(actor.jumpCD)>0.08||
          Number(game.time)-queuedJumpAt>.25)queuedJumpAt=null;
        else if(cfBufferedJumpAllowed({
          now:game.time,pressedAt:queuedJumpAt,alive:actor.alive,
          grounded:actor.onGround,cooldown:actor.jumpCD
        })&&actor.touch)actor.touch.jump=true;
      }
      html.dataset.fpsActive = String(active);
      if (!active || now >= cueExpiresAt) hitCue.hidden = true;
      if (!active || now >= damageExpiresAt)damageVignette.hidden=true;
      const p = game.player;
      if(active&&p?.alive&&activeChallenge?.id==='tags'){
        // Never wake hidden enemies from fabricated hit/health signals.
        // A valid real shot is audible; a fresh real hit causes faster cover AI.
        for(const actor of game.actors||[]){
          if(cfReactToRealScoutThreat({
            actor,player:p,challenge:activeChallenge,now:Number(game.time)})){
            const review=game.__mobileBalanceReview;
            if(review){
              review.openingResponse=actor.__mkIntroThreatStage===2
                ?'real-hit':'real-shot';
              review.responseAtNativeSec=+Number(game.time).toFixed(2);
              review.readyAtNativeSec=+actor.readyAt.toFixed(2);
              review.holdUntilNativeSec=+actor.__mobileTrainingHoldUntil.toFixed(2);
            }
          }
        }
      }
      fadeNativeAllies(active);
      const scopeButton=buttons.find(b=>b.dataset.mkAction==='scope');
      if(scopeButton)scopeButton.textContent=sniperScopeLabel(p?.scoped||0);
      html.dataset.fpsSniper = String(p?.weapon?.def?.type === 'sniper');
      if (/按 R|按 B|Esc|Tab/.test(game.hud?.el?.aHint?.textContent || '')) {
        game.hud.el.aHint.textContent = '点“换弹”';
      }
      if (p && !p.alive && game.hud?.el?.cSmall) {
        game.hud.el.cSmall.textContent = '即将自动复活';
      }
      tutorial.hidden = active && now - started > 6500;
      if (!p) { target.hidden = true; guide.hidden = true; defensePin.hidden=true; clearMarkers(); return; }
      html.dataset.fpsOwnTeam = p.team;
      if (active && p.alive) {
        if (previousPosition) {
          const step = Math.hypot(p.pos.x - previousPosition.x, p.pos.z - previousPosition.z);
          if (step < 2.4 && Number.isFinite(step)) walkedMeters += step;
        }
        previousPosition = { x:p.pos.x, z:p.pos.z };
      } else previousPosition = null;
      if(active&&activeChallenge?.drill==='reposition'&&activeChallenge.lite!==true&&p) {
        const updated=cfAdvanceDrill(activeChallenge,drill,
          {hits:p.stats?.hits||0,travel:walkedMeters,x:p.pos.x,z:p.pos.z});
        if(updated?.stage!==drill?.stage) {
          if(drill?.stage===0&&updated?.stage===1)
            firstHitSpot={x:p.pos.x,z:p.pos.z};
          drillStageAt=Math.max(0,(Number(game.time)||0)-startedGameSeconds);
          guide.textContent=updated?.stage===1
            ? '↔ 首枪命中 · 横向换位 '+Math.floor(updated.distance)+'/'+activeChallenge.minTravel+'m'
            : '◎ 换位完成 · 现在手动开火';
        }
        drill=updated;
      }
      if(active&&activeChallenge?.kind==='assault'){
        const lastStage=assault?.stage;
        assault=cfAdvanceAssault(activeChallenge,assault,{
          kills:p.stats?.k||0,travel:walkedMeters,x:p.pos.x,z:p.pos.z,
          alive:p.alive===true});
        if(activeChallenge?.lite===true&&assault?.checkpoint&&
           !assault?.postKills&&now>=nextDefenseRouteAt){
          nextDefenseRouteAt=now+1800;
          cfRouteDefenseBots(game,{id:'P',...assault.checkpoint});
        }
        if(lastStage===0&&assault?.stage===1){
          hitCue.textContent='◆ 进攻位已到达，开始计入亲手击杀';
          hitCue.hidden=false;cueExpiresAt=now+1200;
        }
      }
      if(active&&activeChallenge?.extractSeconds&&extraction){
        const wasReady=extraction.extracted;
        extraction=cfStepExtraction(extraction,{
          gameTime:Number(game.time),player:p,actors:game.actors,team:p.team,
          travel:walkedMeters,kills:p.stats?.k||0,
          minTravel:activeChallenge.minTravel,minKills:activeChallenge.minKills,
          seconds:activeChallenge.extractSeconds,
          radius:activeChallenge.extractRadius});
        if(!wasReady&&extraction.extracted){
          hitCue.textContent=activeChallenge?.lite===true
            ?'◆ 撤离成功！':'◆ 撤离区坚守成功，活到结束';
          hitCue.hidden=false;cueExpiresAt=now+1400;
        }
      }
      if (!active) {
        if (activeChallenge?.kind==='hits') p.mouse.l=false;
        resetAllTouches();
        autoAimActor=null;autoFireActive=false;
        target.hidden = true; guide.hidden = true; defensePin.hidden=true; clearMarkers(); return;
      }
      if(activeChallenge?.kind==='assault'&&assault?.checkpoint){
        const point=assault.checkpoint;
        const turn=routeArrow(p,[point.x,point.z],activeChallenge.waypointRadius*.75);
        defensePin.textContent=assault.stage===1?'◆ 进攻位已到达 · 击杀计数开启'
          :'◆ 进攻位 · '+(turn?turn.symbol+' '+turn.distance+'米':
          '在圈内继续移动 '+Math.floor(assault.travel)+'/'+activeChallenge.minTravel+'米');
        defensePin.hidden=assault.stage===1;
      }else if(activeChallenge?.extractSeconds&&extraction?.valid){
        const point=extraction.site;
        const eligible=walkedMeters>=activeChallenge.minTravel&&
          (p.stats?.k||0)>=activeChallenge.minKills;
        const turn=routeArrow(p,[point.x,point.z],activeChallenge.extractRadius*.75);
        const remaining=extraction.extracted?'撤离已就绪 · 坚持存活':
          !eligible?'移动'+Math.floor(walkedMeters)+'/'+activeChallenge.minTravel+
            '米，击杀'+(p.stats?.k||0)+'/'+activeChallenge.minKills:
          extraction.contested?'⚔ 敌人在撤离区 · 先清场':
          extraction.inside?'◆ 坚守撤离区 '+Math.floor(extraction.held)+'/'+
            activeChallenge.extractSeconds+'秒':
          (turn?turn.symbol+' '+turn.distance+'米':'进入撤离区');
        defensePin.textContent='◆ 撤离点 · '+remaining;
        defensePin.hidden=false;
        const elapsed=Math.max(0,Number(game.time)-startedGameSeconds);
        if((elapsed>=12||eligible)&&!extraction.extracted&&now>=nextDefenseRouteAt){
          nextDefenseRouteAt=now+1700;
          cfRouteDefenseBots(game,{id:'E',...point});
        }
      }else if(activeChallenge?.kind==='defend'&&defense&&
         !(activeChallenge.lite===true&&defense.stage>=activeChallenge.target)){
        const prevStage=defense.stage;
        defense=cfStepDefense(defense,{
          gameTime:Number(game.time),player:p,actors:game.actors,team:p.team,
          holdSeconds:activeChallenge.holdSeconds,
          breachSeconds:activeChallenge.breachSeconds,
          radius:activeChallenge.radius
        });
        if(defense.stage>prevStage){
          hitCue.textContent='◆ 据点 '+defense.sites[prevStage].id+' 已守住';
          hitCue.hidden=false;cueExpiresAt=now+1050;
        }
        const site=defense.sites?.[defense.stage];
        if(site&&p.alive&&!defense.breached){
          if(now>=nextDefenseRouteAt){
            nextDefenseRouteAt=now+1350;
            cfRouteDefenseBots(game,site);
          }
          const turn=routeArrow(p,[site.x,site.z],activeChallenge.radius*.75);
          const pointText=defense.contested?'⚔ 双方争夺':defense.playerInside
            ?'◆ 守点 '+Math.floor(defense.held)+'/'+activeChallenge.holdSeconds+'秒'
            : (turn?turn.symbol+' '+turn.distance+'米':'已到据点');
          defensePin.textContent='● '+site.id+' · '+pointText;
          defensePin.hidden=false;
        }else defensePin.hidden=true;
      }else defensePin.hidden=true;
      const score = playerRelativeScore(game.score, p.team);
      const msg = score.ally + ':' + score.enemy;
      if (msg !== lastBoard) {
        scoreAlly.textContent = String(score.ally);
        scoreEnemy.textContent = String(score.enemy);
        lastBoard = msg;
      }
      updateAim();
      updateAutoFire();
      const elapsed = Math.max(0,(Number(game.time)||0)-startedGameSeconds);
      if (now >= nextBalanceAt) {
        nextBalanceAt = now + 1000;
        applyBalance(Math.max(0,(Number(game.time) || 0)-startedGameSeconds));
      }
      if(now >= routeLastAt) {
        routeLastAt=now+900;
        if(activeChallenge?.kind==='defend'){
          routePath=null;
        }else if(activeChallenge?.lite!==true&&activeChallenge?.drill==='reposition'&&drill?.stage===1&&p.alive){
          const deaths=p.stats?.d||0;
          if(!flankGoal||deaths!==flankDeaths){
            flankDeaths=deaths;
            flankGoal=cfFlankWaypoint({player:p,world:game.world,nav:game.nav,
              minDistance:Math.max(2,activeChallenge.minTravel-(drill.distance||0)),
              lastSeen:lastVisibleEnemy});
          }
          const path=flankGoal&&game.nav?.findPath?.(
            p.pos.x,p.pos.z,flankGoal.x,flankGoal.z);
          routePath=Array.isArray(path)&&path.length>1
            ? (path.find((pt,i)=>i>0&&Math.hypot(pt[0]-p.pos.x,pt[1]-p.pos.z)>2)
              || [flankGoal.x,flankGoal.z])
            : null;
        } else {
          flankGoal=null;routePath=findRoute();
        }
      }
      if (now >= nextUpdate) {
        nextUpdate = now + (drill?.stage===2?110:160);
        recolorNativeAllies();
        updateEnemyMarkers();
        nudgeAim();
        const hits=p.stats?.hits||0;
        const combat={hits,kills:p.stats?.k||0,hp:p.hp,alive:p.alive===true};
        const beforeCombat=previousCombat;
        const diff=cfRealCombatFeedback(beforeCombat,combat);
        previousCombat=combat;
        const pattern=cfCombatHapticPattern(diff);
        if(pattern!==null&&game.touchMode===true&&
           typeof doc.defaultView?.navigator?.vibrate==='function'){
          try{doc.defaultView.navigator.vibrate(pattern);}
          catch{/* Browser or OS may deny optional haptics. */}
        }
        if(diff.kind==='kill'||diff.kind==='hit'){
          const message=diff.kind==='kill'
            ? cfNativeKillPayoff(beforeCombat?.kills,combat.kills)
            : cfHitCue(activeChallenge,hits,diff.hits,drill);
          if(message){
            hitCue.textContent=message;hitCue.dataset.kind=diff.kind;
            hitCue.dataset.milestone=diff.kind==='kill'&&beforeCombat?.kills===0
              ?'firstkill':'';
            hitCue.hidden=false;cueExpiresAt=now+(diff.kind==='kill'?1100:630);
          }
        }
        if(diff.hpLoss>0){
          damageVignette.hidden=false;damageExpiresAt=now+410;
        }
        const seen = [...markers.values()].some(el => !el.hidden);
        if (activeChallenge?.kind==='defend'||activeChallenge?.kind==='assault'||
          activeChallenge?.extractSeconds) {
          guide.textContent='';
        }else if (activeChallenge?.lite!==true&&activeChallenge?.drill==='reposition'&&drill?.stage===1) {
          const turn=routeArrow(p,routePath);
          guide.textContent=(turn?.symbol||'↔')+' 换位 '+
            Math.floor(drill.distance)+'/'+activeChallenge.minTravel+'m'+
            (turn?' · 沿可走路线':' · 左右横移');
        } else if(activeChallenge?.lite!==true&&activeChallenge?.drill==='reposition'&&drill?.stage===2) {
          const turn=!seen?routeArrow(p,routePath,
            firstHitSpot&&activeChallenge.elite!==true?0.6:2.2):null;
          const reAim=!turn&&lastVisibleEnemy
            ? cfLastSeenLookCue(p,lastVisibleEnemy) : null;
          guide.textContent=seen
            ? (visibleAimCoach||'◎ 对准红色目标按开火')+
              ' · '+drill.follow+'/'+activeChallenge.target
            : turn
              ? '🚶'+turn.symbol+' 绕到可射击的侧翼 · '+drill.follow+'/'+activeChallenge.target
              : reAim
                ? reAim+' · '+drill.follow+'/'+activeChallenge.target
                : '↔ 探身寻找敌人 · '+drill.follow+'/'+activeChallenge.target;
        } else if (hits === 0 && elapsed >= 5) {
          const turn=routeArrow(p,routePath);
          guide.textContent = seen
            ? activeChallenge?.kind==='hits'
              ? (cfAutoFireEligible(activeChallenge) ? '▼ 找到目标 · 对准即可开火' : '▼ 找到目标 · 手动开火')
              : '▼ 目标已出现 · 注意掩体'
            : turn ? turn.symbol + ' 交火区 · ' + turn.distance + ' m'
              : '沿通道推进 · 寻找目标';
        }
      }
      // Combat stays legible: hint only on opening, or briefly when the
      // player has not yet found a target. It never sits on the reticle.
      guide.hidden = !p.alive ||
        ['defend','assault'].includes(activeChallenge?.kind) ||
        !!activeChallenge?.extractSeconds ||
        (activeChallenge?.drill==='reposition'&&drill?.stage>0
          ? drill.stage===2&&drill.follow>0&&elapsed-drillStageAt>7&&
            [...markers.values()].some(el=>!el.hidden)
          : (p.stats?.hits ? elapsed>5 : elapsed>16&&elapsed%12>3));
    },
    destroy() {
      if(originalEnemySpawns&&trainingSpawnTeam&&game.map?.spawns)
        game.map.spawns[trainingSpawnTeam]=originalEnemySpawns;
      originalEnemySpawns=null;trainingSpawnTeam=null;
      if(activeChallenge?.kind==='hits'&&game.player)game.player.mouse.l=false;
      damageVignette.remove();
      doc.removeEventListener('touchstart',onTouchStart,true);
      doc.removeEventListener('touchmove',onTouchMove,true);
      doc.removeEventListener('touchend',onTouchEnd,true);
      doc.removeEventListener('touchcancel',onTouchEnd,true);
      doc.defaultView?.removeEventListener('blur',onLifecycleInterrupt);
      doc.defaultView?.removeEventListener('pagehide',onLifecycleInterrupt);
      doc.removeEventListener('visibilitychange',onVisibilityInterrupt);
      doc.removeEventListener('mousedown',stopCompatibilityMouse,true);
      doc.removeEventListener('mouseup',stopCompatibilityMouse,true);
      resetAllTouches();
      html.removeAttribute('data-fps-active');
      html.removeAttribute('data-fps-own-team');
      board.remove(); target.remove(); hitCue.remove(); guide.remove(); defensePin.remove(); tutorial.remove();
      defense=null;assault=null;extraction=null;
      for (const button of buttons) {
        button.removeAttribute('data-mk-action');
        button.removeAttribute('aria-label');
      }
      for (const el of markers.values()) el.remove();
      markers.clear();
    }
  };
}
