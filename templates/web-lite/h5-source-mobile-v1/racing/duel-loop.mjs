/**
 * Real-run evidence for skillful cornering, physical AI reversals and replay.
 * Read-only: never mutates player physics, game rank, AI progress or rewards.
 * Values are derived from native PlayerCar/AICar state, not cosmetic timers.
 */
const finite = v => typeof v === 'number' && Number.isFinite(v);
const meters = v => finite(v) ? Math.max(0, Math.round(v)) : null;
const safeName = name => typeof name === 'string' && name.trim()
  ? name.trim().slice(0,12) : '对手';
export const RETRY_LEDGER_KEY = 'h5-mobile:qq-speed:retry-feedback:v1';

export class RaceDuelTracker {
  constructor() { this.reset(); }
  reset() {
    this.sides=new Map();
    this.lastProgress=null;this.lastAt=null;
    this.corner=null;this.lastCornerD=-Infinity;
    this.corners=0;this.cornerContacts=0;this.spinsInCorner=0;
    this.worstCornerDropKmh=0;
    this.lostPositions=0;this.gainedPositions=0;this.lostLead=0;
    this.duelSeconds=0;this.lastPasser='';
    this.lastNativeCrashes=0;
  }
  frame(game) {
    const p=game?.player, tr=game?.track;
    if(game?.state!=='race'||!p||p.finished||!tr||!Array.isArray(game.racers)||
       !finite(p.progress)||!finite(p.s)||!finite(game.raceTime))return null;
    const now=game.raceTime;
    if(this.lastAt!==null&&now<=this.lastAt)return null;
    // Native recovery may move a car back to an old checkpoint: a reset is
    // not evidence that an opponent "passed" through it at racing speed.
    if(this.lastProgress!==null&&p.progress<this.lastProgress-20) {
      this.sides.clear();this.corner=null;
    }
    const dt=this.lastAt===null?0:Math.min(.20,now-this.lastAt);
    this.lastAt=now;this.lastProgress=p.progress;
    const crashes=finite(p.stats?.crash)?p.stats.crash:0;
    const curve=typeof tr.curvAhead==='function'&&finite(p.d)
      ?Math.abs(tr.curvAhead(p.d+22,50)):0;
    if(!this.corner&&curve>=.012&&p.s>=20&&p.progress-this.lastCornerD>=50)
      this.corner={at:p.progress,entrySpeed:p.s,minSpeed:p.s,
        crashes,spun:false};
    if(this.corner) {
      this.corner.minSpeed=Math.min(this.corner.minSpeed,Math.abs(p.s));
      if((p.spin??0)>.15)this.corner.spun=true;
      if((curve<=.0065&&p.progress-this.corner.at>=20)||
         p.progress-this.corner.at>=180) {
        this.corners++;
        const contacts=Math.max(0,crashes-this.corner.crashes);
        this.cornerContacts+=contacts;
        if(this.corner.spun)this.spinsInCorner++;
        const drop=Math.max(0,(this.corner.entrySpeed-this.corner.minSpeed)*3.6);
        this.worstCornerDropKmh=Math.max(this.worstCornerDropKmh,Math.round(drop));
        this.lastCornerD=p.progress;
        this.corner=null;
      }
    }
    this.lastNativeCrashes=crashes;
    let moment=null,close=false;
    for(const rival of game.racers) {
      if(!rival||rival===p||rival.isPlayer||!finite(rival.progress)||
         rival.finished)continue;
      const gap=rival.progress-p.progress; // Positive means the AI is ahead.
      if(Math.abs(gap)<=40)close=true;
      const nextSide=gap>=3?1:gap<=-3?-1:0;
      const old=this.sides.get(rival);
      // A close duel must cross BOTH hysteresis boundaries, with both cars
      // genuinely advancing. Merely reshuffling game.standings cannot count.
      if(nextSide&&old&&old.side!==nextSide&&old.side&&
         now>=3&&rival.progress>=old.rivalProgress-1&&
         p.progress>=old.playerProgress-1) {
        if(nextSide===1){
          this.lostPositions++;
          this.lastPasser=safeName(rival.name);
          if(game.standings?.[0]===rival && old.playerWasFirst)this.lostLead++;
          if(!moment)moment={title:this.lastPasser+'反超了你',kind:'threat'};
        } else {
          this.gainedPositions++;
          if(!moment)moment={title:'你追回了 '+safeName(rival.name),kind:'skill'};
        }
      }
      if(nextSide)this.sides.set(rival,{
        side:nextSide,rivalProgress:rival.progress,playerProgress:p.progress,
        // Hold the last physically stable lead state, not UI standings
        // reshuffled while the two cars were inside the passing threshold.
        playerWasFirst:old?.side===nextSide?old.playerWasFirst:
          game.standings?.[0]===p
      });
    }
    if(close)this.duelSeconds+=dt;
    return moment;
  }
  snapshot(game,stage) {
    const p=game?.player, order=game?.standings;
    const pos=Array.isArray(order)?order.indexOf(p):-1;
    const place=pos>=0?pos+1:null;
    let gapToPassM=null;
    if(place!==null&&stage&&place>stage.rank&&
       Number.isInteger(stage.rank)&&stage.rank>=1&&
       finite(p?.progress)) {
      const target=order[stage.rank-1];
      if(target&&target!==p&&finite(target.progress)&&target.progress>=p.progress)
        gapToPassM=meters(target.progress-p.progress);
    }
    return {
      place, gapToPassM, lostPositions:this.lostPositions,
      gainedPositions:this.gainedPositions,lostLead:this.lostLead,
      duelSeconds:+this.duelSeconds.toFixed(1),lastPasser:this.lastPasser,
      corners:this.corners,cornerContacts:this.cornerContacts,
      spinsInCorner:this.spinsInCorner,
      worstCornerDropKmh:this.worstCornerDropKmh,
      nativeCrashes:finite(p?.stats?.crash)?p.stats.crash:this.lastNativeCrashes
    };
  }
}

/** Very short corner cue inside the EXISTING speed HUD; never adds a
 * floating driving overlay or invents a brake button for auto-throttle.
 */
export function cornerEntryCue(game) {
  const p=game?.player,tr=game?.track;
  if(game?.state!=='race'||!p||p.finished||p.airborne||
     (p.wrongWay??0)>.35||!finite(p.s)||p.s<27||
     !finite(p.d)||typeof tr?.curvAhead!=='function')return '';
  const near=tr.curvAhead(p.d+32,48);
  if(!finite(near)||Math.abs(near)<.016)return '';
  const next=tr.curvAhead(p.d+85,50);
  if(finite(next)&&Math.abs(next)>=.012&&Math.sign(near)!==Math.sign(next))
    return '↶↷ S弯·及时反打';
  return near>0?'↶ 左急弯·提前入弯':'↷ 右急弯·提前入弯';
}

/** The margin is distance, NOT fabricated seconds. Return a practical next
 * action only from actual position, mission metric and observed collisions.
 */
export function replayCue(stage,result,stats={},run={},previous=null) {
  if(!stage||!result)return {headline:'这局值得再跑一次',tip:'尝试把入弯线走得更稳',cta:'再挑战'};
  const place=finite(result.place)?result.place:null;
  const missedRank=result.finished&&place!==null&&place>stage.rank;
  const gap=finite(run.gapToPassM)?run.gapToPassM:null;
  let headline='',tip='';
  if(missedRank&&place===stage.rank+1&&gap!==null&&gap<=80)
    headline='离前'+stage.rank+'名只差 '+Math.round(gap)+' 米';
  else if(missedRank)
    headline='本局第 '+place+' 名，目标前 '+stage.rank+' 名';
  else if(result.finished)
    headline='排名已达标，还差一项挑战';
  else
    headline='本局尚未冲线，保住节奏再试一次';

  if((run.nativeCrashes??0)>=2)
    tip='本局撞墙 '+run.nativeCrashes+' 次。下局提前入弯、出弯再加速';
  else if((run.lostPositions??0)>0)
    tip='本局被真实反超 '+run.lostPositions+' 次。下一局提前回正、守住出弯';
  else {
    const target=finite(stage.target)?stage.target:null;
    const metric={
      speed:stats.gateSpeed,drift:stats.cleanDrifts,
      overtake:stats.cleanPasses,item:stats.pickups
    }[stage.kind];
    if(target!==null&&finite(metric)&&metric<target) {
      if(stage.kind==='speed')tip='测速还差 '+Math.ceil(target-metric)+' km/h，留氮气给测速点';
      else if(stage.kind==='drift')tip='还差 '+Math.ceil(target-metric)+' 次有效漂移，入弯早一点';
      else if(stage.kind==='overtake')tip='还差 '+Math.ceil(target-metric)+' 次真实弯道反超';
      else if(stage.kind==='item')tip='还差 '+Math.ceil(target-metric)+' 个实取道具箱，提前选线';
    }
    if(!tip)tip='下局把入弯动作提前，试着保持更高的出弯速度';
  }
  const same=previous&&previous.stage===stage.course;
  const improved=same&&result.finished&&previous.finished&&
    gap!==null&&finite(previous.gapToPassM)&&gap<previous.gapToPassM;
  if(improved)headline+=' · 比上局追近 '+Math.round(previous.gapToPassM-gap)+' 米';
  return {headline,tip,cta:'再挑战这条赛道'};
}

/** Only small anonymous, on-device aggregates; no cloud collection.
 * Never uses synthetic DNF or UI preview data to manufacture a near-miss.
 */
export function readRaceAttempt(storage,stageCourse) {
  try {
    const raw=storage?.getItem(RETRY_LEDGER_KEY);
    if(typeof raw!=='string'||raw.length>1024)return null;
    const data=JSON.parse(raw);
    if(data?.v!==1||data.stage!==stageCourse||
       typeof data.finished!=='boolean'||!Number.isInteger(data.place)||
       data.place<1||data.place>99)return null;
    const gap=data.gapToPassM;
    if(gap!==null&&(!finite(gap)||gap<0||gap>100000))return null;
    return {stage:data.stage,finished:data.finished,
      place:data.place,gapToPassM:gap};
  } catch { return null; }
}
export function saveRaceAttempt(storage,stageCourse,result,run) {
  if(typeof stageCourse!=='string'||!/^race-\d{2}$/.test(stageCourse)||
     !result||!Number.isInteger(result.place)||result.place<1||
     result.place>99)return false;
  try {
    storage?.setItem(RETRY_LEDGER_KEY,JSON.stringify({
      v:1,stage:stageCourse,finished:result.finished===true,
      place:result.place,
      gapToPassM:finite(run?.gapToPassM)?Math.max(0,Math.round(run.gapToPassM)):null
    }));
    return true;
  } catch { return false; }
}
