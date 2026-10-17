/* global performance */
/* FPS-only, original mobile UX overlay. Does not alter hit detection, team rules or AI. */
import {cfStartDefense,cfStepDefense} from './engine.mjs';
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
/** Keep a novice opponent in an honest mid-range firefight before it rushes;
    its gun remains enabled at the real readyAt, not an invulnerable dummy. */
export function cfScoutHoldSeconds(challenge) {
  if(challenge?.elite===true)return challenge.kind==='kills'?7:3;
  if(challenge?.kind==='kills')return 20;
  // Beginner learn-to-flank scenario: one normal, shooting bot remains at
  // original visible cover until the actual 60s challenge expires. It is
  // NOT invulnerable, no input/hit is forged, and elite still rushes.
  return challenge?.kind==='hits'&&challenge.drill==='reposition'
    ? Math.ceil((challenge.limitMs||60000)/1000)+5 : 7;
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
  if (challenge?.kind === 'hits')
    return challenge.drill==='reposition'
      ? (challenge.elite ? '精英手动首枪，横移后按住开火拖动瞄准' : '首枪自动开火；换位后按住开火拖动瞄准')
      : cfAutoFireEligible(challenge) ? '准星对准敌人，自动开火' : '跟准目标，手动按开火';
  if (challenge?.kind === 'kills') return '先开镜，再点按开火';
  if (challenge?.kind === 'survive') return '边移动边观察、开火';
  if (challenge?.kind === 'defend') return '左手进据点，右手开火阻止敌军占点';
  return '点按或按住开火';
}
export function mobileChallengeCopy(challenge) {
  if (!challenge) return '';
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
  if (challenge.kind === 'kills') return challenge.elite===true
    ? '精英狙击：75秒内 AWM 击杀1人，最多阵亡1次'
    : '90秒狙击：先找红色敌人，开镜瞄准后击杀1人';
  if (challenge.kind === 'survive') return challenge.elite===true
    ? '精英生存：坚持45秒，移动30米，最多阵亡1次'
    : '坚持45秒，移动20米，最多被击倒2次';
  if (challenge.kind === 'defend') return challenge.elite===true
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
export function cfFireDragLookDelta(dx,dy) {
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return {x:0,y:0};
  const clamp=v=>Math.max(-96,Math.min(96,v*1.6));
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

/** End-of-round teaching based on observed player stats, never simulated rewards. */
export function cfMissionDebrief(challenge, metrics = {}, outcome = 'lost') {
  if (!challenge || !['hits','kills','survive','defend'].includes(challenge.kind)) return '';
  const actual = v => Number.isFinite(v) ? Math.max(0,Math.floor(v)) : 0;
  const hits = actual(metrics.hits), awmKills = actual(metrics.awmKills);
  const deaths = actual(metrics.deaths), travel = actual(metrics.travel);
  const goal = actual(challenge.target);
  if (challenge.kind === 'defend') {
    const captured=actual(metrics.defenseCaptured),site='AB'[Math.min(1,captured)];
    if(outcome==='won')
      return 'A、B双点防守成功！下次尝试零阵亡，缩短真实占点耗时。';
    if(metrics.defenseSitesValid!==true)
      return '据点路线不可用，本局没有虚构奖励。请重试或切换支持 WebGL 的设备。';
    if(metrics.defenseBreached===true)
      return '敌军在'+site+'点独占过久。下次提前到位，或在敌方接近时迎击。';
    if(deaths>challenge.maxDeaths)
      return '阵亡'+deaths+'次，超过本关'+challenge.maxDeaths+'次限制。下次试试沿掩体侧路回点。';
    return '真实守住 '+captured+'/'+goal+' 处。前往'+site+
      '点：只有玩家亲自站在圈内、活着的敌人离开圈外，进度才会增加。';
  }
  if (outcome === 'won') {
    if (challenge.kind === 'hits'&&challenge.drill==='reposition')
      return '战术突围完成：首枪命中、离开原位 '+actual(metrics.drillTravel)+
        ' 米、手动追击 '+actual(metrics.drillFollowUpHits)+
        ' 次。下一关挑战 AWM 精准击杀。';
    if (challenge.kind === 'hits')
      return '亲自命中 ' + hits + ' 次。下一关要使用 AWM 取得真正的击杀。';
    if (challenge.kind === 'kills')
      return 'AWM 真实击杀 ' + awmKills + ' 人。接下来试试移动与生存的配合。';
    return '累计移动 ' + travel + ' 米、被击倒 ' + deaths + ' 次。下次试试零死亡通关。';
  }
  if (Number.isInteger(challenge.maxDeaths) && deaths > challenge.maxDeaths)
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
    if (awmKills === 0 && hits > 0)
      return '命中 ' + hits + ' 次，但 AWM 击杀仍为 0/' + goal +
        '。命中不等于击杀，下次开镜锁定目标再补枪。';
    return 'AWM 击杀 ' + awmKills + '/' + goal +
      '。先找红色目标，开镜瞄准胸部，再按开火。';
  }
  if (deaths > goal)
    return '被击倒 ' + deaths + ' 次，超过最多 ' + goal +
      ' 次的限制。下次沿集装箱掩体换位，减少正面暴露。';
  const min = actual(challenge.minTravel);
  if (travel < min)
    return '只移动 ' + travel + '/' + min + ' 米，还差 ' +
      (min-travel) + ' 米。下次用左手摇杆沿掩体移动，不要原地停留。';
  return '移动和阵亡条件已达成，但未坚持到时限。借助掩体保持移动直到倒计时结束。';
}


/** Short, accurate mission facts for the start screen. All values are authored rules. */
export function cfMissionFacts(challenge) {
  if (!challenge || !['hits','kills','survive','defend'].includes(challenge.kind)) return [];
  const weapon = challenge.weapon === 'awm' ? 'AWM' :
    challenge.weapon === 'mp5' ? 'MP5' : 'M4A1';
  const target = challenge.kind === 'hits' ? challenge.drill==='reposition'
    ? '1枪→'+challenge.minTravel+'m→'+challenge.target+'枪' : '命中 ' + challenge.target + ' 次' :
    challenge.kind === 'kills' ? '击杀 ' + challenge.target + ' 人' :
    challenge.kind === 'defend' ? '守 A → B · 各'+challenge.holdSeconds+'秒' :
      '移动 ' + (challenge.minTravel || 0) + ' m';
  return [
    { label:'装备',value:weapon },
    { label:'目标',value:target },
    { label:'限时',value:Math.ceil(challenge.limitMs/1000) + ' s' }
  ];
}

/** Stat chips are derived from native player measurements, never team kills. */
export function cfResultFacts(challenge, metrics = {}, elapsedMs = 0) {
  if (!challenge || !['hits','kills','survive','defend'].includes(challenge.kind)) return [];
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
    {label:'命中',value:String(number(metrics.hits))},
    {label:'阵亡',value:String(deaths)}
  ];
  if (challenge.kind === 'defend') return [
    {label:'据点',value:number(metrics.defenseCaptured)+' / '+challenge.target},
    {label:'敌军',value:metrics.defenseBreached===true?'已攻破':'未攻破'},
    {label:'阵亡',value:deaths+' / '+challenge.maxDeaths}
  ];
  return [
    {label:'生存',value:Math.min(Math.floor(number(elapsedMs)/1000),Math.ceil(challenge.limitMs/1000)) + ' / ' + Math.ceil(challenge.limitMs/1000) + ' s'},
    {label:'移动',value:number(metrics.travel) + ' / ' + challenge.minTravel + ' m'},
    {label:'阵亡',value:deaths + ' / ' + challenge.target}
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
  let lastTouchAt=-Infinity;
  const markTouch=()=>{lastTouchAt=performance.now();};
  const onTouchStart=e=>{
    markTouch();
    if(!game.playing||game.paused||game.ended)return;
    if(e.target?.closest?.('.btn[data-mk-action="fire"]')){
      // Native fire-button touchstart stops bubbling, so the upstream window
      // camera listener cannot reuse this SAME right thumb for aiming.
      for(const t of e.changedTouches||[])
        fireDragTouches.set(t.identifier,{x:t.clientX,y:t.clientY});
      // Document capture executes even when the original native fire-button
      // listener stops bubbling. Keep the original gun/cooldown untouched.
      if(game.player?.alive)cfBeginTouchFire(game.player.touch);
      return;
    }
    if(!cfAutoFireEligible(activeChallenge,game.player?.stats?.hits||0))return;
    if(e.target?.closest?.('.btn,.pad'))return;
    const limit=(doc.defaultView?.innerWidth||844)*0.44;
    for(const t of e.changedTouches||[])if(t.clientX>limit)
      aimTouchStarts.set(t.identifier,{x:t.clientX,y:t.clientY});
  };
  const onTouchMove=e=>{
    markTouch();
    if(!game.playing||game.paused||game.ended)return;
    const p=game.player;
    for(const t of e.changedTouches||[]){
      const v=fireDragTouches.get(t.identifier);
      if(v){
        const delta=cfFireDragLookDelta(t.clientX-v.x,t.clientY-v.y);
        v.x=t.clientX;v.y=t.clientY;
        if(p?.alive){
          // The actual fire-finger identity is stronger evidence than a
          // momentary flag lost during native touch dispatch. A continuous
          // press keeps BOTH the genuine native gun and camera responsive.
          if(p.touch&&!p.touch.fire)cfBeginTouchFire(p.touch);
          p.touchLook ||= {x:0,y:0};
          p.touchLook.x+=delta.x;p.touchLook.y+=delta.y;
        }
        continue;
      }
      if(cfAutoFireEligible(activeChallenge,p?.stats?.hits||0)){
        const aim=aimTouchStarts.get(t.identifier);
        if(aim&&Math.hypot(t.clientX-aim.x,t.clientY-aim.y)>12)
          playerEngaged=true;
      }
    }
  };
  const releaseNativeFire=(cancelPending=false)=>{
    cfReleaseTouchFire(game.player?.touch,cancelPending);
  };
  const onTouchEnd=e=>{
    markTouch();
    const hadFireFinger=fireDragTouches.size>0;
    for(const t of e.changedTouches||[]){
      aimTouchStarts.delete(t.identifier);
      fireDragTouches.delete(t.identifier);
    }
    // The upstream button listens to touchend, not touchcancel.
    // Clear the native fire flag on either ending path, even after a dragged
    // thumb leaves the button or the operating system interrupts the gesture.
    if(hadFireFinger&&fireDragTouches.size===0)
      releaseNativeFire(e.type==='touchcancel');
  };
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
  const guide = doc.createElement('div');
  guide.id = 'mk-fps-guide';
  guide.textContent = '◆ 蓝色队友 · ▼ 红色敌人';
  guide.hidden = true;
  root.append(guide);
  const markers = new Map();
  let started = 0, nextUpdate = 0, lastBoard = '', lastTarget = '';
  let activeChallenge = null, nextBalanceAt = 0, lastHits = 0, cueExpiresAt = 0;
  let drill = null, drillStageAt = 0, flankGoal = null, flankDeaths = -1;
  let autoAimActor = null, autoAimSince = 0, autoFireActive = false;
  let routePath = null, routeLastAt = 0, lastVisibleEnemy = null, firstHitSpot = null;
  let visibleAimCoach = '';
  let originalEnemySpawns=null, trainingSpawnTeam=null;
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
        scout.readyAt=Math.max(scout.readyAt,game.time+(activeChallenge?.elite===true?4:13));
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
    const follow=activeChallenge?.drill==='reposition'&&drill?.stage===2;
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
        actor.role='rush';
        actor.pickGoal?.();
      } else {
        stabilized=cfStabilizeNoviceScout(actor,activeChallenge);
      }
      // Only opponents gain expert reaction and aim: allies cannot carry the mission.
      const profile=expertProfile&&actor.team!==p.team ? expertProfile : normalProfile;
      actor.diff = {...profile,strafe:cfNoviceScoutStrafe(profile,stabilized),
        react:[...profile.react]};
      actor.recoilControl = profile.ctrl;
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
          training:activeChallenge?.drill==='reposition'&&activeChallenge.elite!==true
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
      if(activeChallenge?.drill==='reposition'&&drill?.stage===2){
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
    onSelect(challenge) { updateTutorial(challenge); },
    onStart(challenge) {
      activeChallenge = challenge || null;
      if(originalEnemySpawns&&trainingSpawnTeam&&game.map?.spawns)
        game.map.spawns[trainingSpawnTeam]=originalEnemySpawns;
      originalEnemySpawns=null;trainingSpawnTeam=null;
      drill=cfAdvanceDrill(activeChallenge);
      drillStageAt=0;flankGoal=null;flankDeaths=-1;
      updateTutorial(activeChallenge);
      autoAimActor=null;autoAimSince=0;autoFireActive=false;
      playerEngaged=false;aimTouchStarts.clear();fireDragTouches.clear();
      releaseNativeFire(true);
      guide.textContent = activeChallenge?.elite===true
        ? '⚡ 精英：自己瞄准开火'
        : activeChallenge?.kind === 'kills'
        ? '先观察，找到目标后开镜'
        : activeChallenge?.kind === 'survive'
          ? '沿掩体移动，注意身后'
          : '前方有目标 · 右手瞄准';
      started = performance.now();
      startedGameSeconds = Number(game.time) || 0;
      routePath=null;routeLastAt=0;lastVisibleEnemy=null;firstHitSpot=null;
      nextUpdate = 0;
      nextBalanceAt = 0;
      lastHits = game.player?.stats?.hits || 0;
      cueExpiresAt = 0;
      hitCue.hidden = true;
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
        challenge: activeChallenge?.id,autoFireActivations:0,playerEngaged:false};
      const rendezvous=prepareFirstEncounter();
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
      html.dataset.fpsActive = String(active);
      if (!active || now >= cueExpiresAt) hitCue.hidden = true;
      const p = game.player;
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
      if (!p) { target.hidden = true; guide.hidden = true; clearMarkers(); return; }
      html.dataset.fpsOwnTeam = p.team;
      if (active && p.alive) {
        if (previousPosition) {
          const step = Math.hypot(p.pos.x - previousPosition.x, p.pos.z - previousPosition.z);
          if (step < 2.4 && Number.isFinite(step)) walkedMeters += step;
        }
        previousPosition = { x:p.pos.x, z:p.pos.z };
      } else previousPosition = null;
      if(active&&activeChallenge?.drill==='reposition'&&p) {
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
      if (!active) {
        if (activeChallenge?.kind==='hits') p.mouse.l=false;
        if(fireDragTouches.size>0) {
          releaseNativeFire(true);fireDragTouches.clear();
        }
        autoAimActor=null;autoFireActive=false;
        target.hidden = true; guide.hidden = true; clearMarkers(); return;
      }
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
        if(activeChallenge?.drill==='reposition'&&drill?.stage===1&&p.alive){
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
        const hits = p.stats?.hits || 0;
        if (hits > lastHits) {
          // This is driven solely by native player.stats.hits, not aiming or shooting.
          const text = cfHitCue(activeChallenge, hits, hits-lastHits, drill);
          if (text) {
            hitCue.textContent = text;
            hitCue.hidden = false;
            cueExpiresAt = now + 680;
          }
        }
        lastHits = hits;
        const seen = [...markers.values()].some(el => !el.hidden);
        if (activeChallenge?.drill==='reposition'&&drill?.stage===1) {
          const turn=routeArrow(p,routePath);
          guide.textContent=(turn?.symbol||'↔')+' 换位 '+
            Math.floor(drill.distance)+'/'+activeChallenge.minTravel+'m'+
            (turn?' · 沿可走路线':' · 左右横移');
        } else if(activeChallenge?.drill==='reposition'&&drill?.stage===2) {
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
      doc.removeEventListener('touchstart',onTouchStart,true);
      doc.removeEventListener('touchmove',onTouchMove,true);
      doc.removeEventListener('touchend',onTouchEnd,true);
      doc.removeEventListener('touchcancel',onTouchEnd,true);
      doc.removeEventListener('mousedown',stopCompatibilityMouse,true);
      doc.removeEventListener('mouseup',stopCompatibilityMouse,true);
      aimTouchStarts.clear();fireDragTouches.clear();releaseNativeFire(true);
      html.removeAttribute('data-fps-active');
      html.removeAttribute('data-fps-own-team');
      board.remove(); target.remove(); hitCue.remove(); guide.remove(); tutorial.remove();
      for (const button of buttons) {
        button.removeAttribute('data-mk-action');
        button.removeAttribute('aria-label');
      }
      for (const el of markers.values()) el.remove();
      markers.clear();
    }
  };
}
