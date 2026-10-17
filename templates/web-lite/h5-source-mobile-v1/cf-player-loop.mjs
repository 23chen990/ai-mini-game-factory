/**
 * CF-only long-term practice loop. Built from already-confirmed native
 * challenge results; never changes player health, bot AI, shots or scores.
 * No shared racing/pelican state is touched.
 */
import {challengeResult} from './engine.mjs';

/** Campaign level order is fixed for the 8-stage V13 internal build:
 * Chapter 1 uses the original ship, Chapter 2 uses authored depot geometry. */
export function cfArenaForLevel(index) {
  return Number.isInteger(index)&&index>=4&&index<8?'depot':'ship';
}
/** CF V18 mobile-first mission layer.
 * Preserve old challenge IDs and saved records. Old base challenges remain
 * intact for historical tests/replays; only new sessions get lite rules.
 * The one visible objective follows what the player can actually perceive.
 */
export function cfMobileMission(base) {
  if(!base || typeof base.id!=='string')return base;
  const elite=base.elite===true;
  const variants={
    tags:{title:'01 · 货箱破门',target:elite?4:2,limitMs:elite?60000:75000,maxDeaths:elite?0:2,
      objective:'亲手击倒'+(elite?4:2)+'名敌人',
      encounter:'清理船舱入口 · 利用箱体换角度'},
    precision:{title:'02 · 远点狙击',limitMs:elite?65000:80000,
      objective:'AWM击倒1名敌人',encounter:'找到视线 · 开镜射击'},
    survive:{title:'03 · 围攻生存',limitMs:45000,minTravel:0,minKills:1,maxDeaths:elite?1:2,target:elite?1:2,
      objective:'坚守45秒并亲手击倒1人',encounter:'跟住敌人 · 利用掩体活下来'},
    defense:{title:'04 · 港口守点',target:1,holdSeconds:elite?9:7,limitMs:elite?65000:80000,
      objective:'守住A区'+(elite?9:7)+'秒',encounter:'敌人会争夺A区 · 先清掉威胁'},
    assault:{title:'05 · 仓库突破',minTravel:0,target:elite?3:2,limitMs:elite?75000:90000,
      objective:'抵达进攻位并击倒'+(elite?3:2)+'人',
      encounter:'穿过仓库侧路 · 抵达亮起的进攻位'},
    marksman:{title:'06 · 通道狙击',minTravel:0,target:elite?3:2,limitMs:elite?80000:100000,
      objective:'AWM击倒'+(elite?3:2)+'人',encounter:'观察掩体间隙 · 不强制绕路'},
    evac:{title:'07 · 装卸区撤离',minTravel:0,minKills:elite?2:1,extractSeconds:elite?8:5,
      finishOnExtract:true,limitMs:elite?85000:90000,
      objective:'击倒'+(elite?2:1)+'名敌人并到撤离区坚守'+(elite?8:5)+'秒',
      encounter:'撤离点就在前方 · 清出通路即可离开'},
    counter:{title:'08 · 逆线夺点',target:1,reverse:true,holdSeconds:elite?9:7,
      limitMs:elite?75000:85000,
      objective:'抢占并守住远端B区'+(elite?9:7)+'秒',
      encounter:'先逼退防守敌人 · 守住B区即可完成'}
  };
  const config=variants[base.id];
  return config?{...base,...config,lite:true,
    instructions:config.objective}:base;
}
export const CF_CONTROL_DEFAULTS=Object.freeze({sensitivity:1,opacity:.85});
const CF_IDS=new Set(['tags','precision','survive','defense','assault','marksman','evac','counter']);
const GRADE_LABELS=['未完成','完成','优秀','完美'];
/** Real drill progress as short combat status. Full rules live on ready UI. */
export function cfRifleCombatStatus(challenge,metrics={}) {
  if(challenge?.lite===true||challenge?.id!=='tags'||challenge?.drill!=='reposition')return null;
  if(metrics.drillFirstHit!==true)return '◎ 前方交火 · 找准目标';
  const travel=Math.max(0,Number(metrics.drillTravel)||0);
  if(metrics.drillStage!==2)
    return '↗ 掩体换位 '+Math.min(Math.floor(travel),challenge.minTravel)+
      '/'+challenge.minTravel+'m';
  const hits=Math.max(0,Math.floor(Number(metrics.drillFollowUpHits)||0));
  return '✦ 追击命中 '+Math.min(hits,challenge.target)+'/'+challenge.target;
}

function snapped(value,fallback,min,max) {
  if(typeof value!=='number'||!Number.isFinite(value))return fallback;
  return Math.round(Math.max(min,Math.min(max,value))*100)/100;
}
export function cfNormalizeControls(controls) {
  return {
    sensitivity:snapped(controls?.sensitivity,CF_CONTROL_DEFAULTS.sensitivity,.65,1.55),
    opacity:snapped(controls?.opacity,CF_CONTROL_DEFAULTS.opacity,.4,1)
  };
}
export function cfLoadControls(raw) {
  try {
    if(typeof raw!=='string'||raw.length>512)return {...CF_CONTROL_DEFAULTS};
    const parsed=JSON.parse(raw);
    if(parsed?.version!==1||!parsed.controls||typeof parsed.controls!=='object')
      return {...CF_CONTROL_DEFAULTS};
    return cfNormalizeControls(parsed.controls);
  } catch {return {...CF_CONTROL_DEFAULTS};}
}
export function cfSaveControls(controls) {
  return JSON.stringify({version:1,controls:cfNormalizeControls(controls)});
}
export function cfApplyControls(game,controls,originalSensitivity) {
  if(!game?.opts||!Number.isFinite(originalSensitivity)||originalSensitivity<=0)
    return false;
  // All genuine look inputs (right screen and original fire-drag finger)
  // use native Player.update sens; never scale bullet or recoil physics.
  game.opts.sens=originalSensitivity*cfNormalizeControls(controls).sensitivity;
  return true;
}

export function cfMissionMedal(challenge,metrics,outcome,elapsedMs) {
  if(!CF_IDS.has(challenge?.id)||outcome!=='won'||
     !Number.isFinite(elapsedMs)||elapsedMs<=0||
     elapsedMs>challenge.limitMs||!metrics||challenge?.bonusDeaths===1||
     metrics.adRevived===true||
     challengeResult(challenge,metrics,true,elapsedMs).outcome!=='won')return null;
  const deaths=Number(metrics.deaths)||0;
  // Survival has a mandatory FULL-TIME requirement. A time-under-75%
  // gold threshold would be impossible to earn; reward actual movement
  // and zero deaths instead (native player travel, never fabricated).
  const flawless=deaths===0 && (challenge.kind==='survive'
    ? Number(metrics.travel)>=Math.max(0,Number(challenge.minTravel)||0)+10
    : elapsedMs<=challenge.limitMs*.75);
  const stars=flawless?3:deaths<=1?2:1;
  const timeMs=Math.max(1,Math.round(elapsedMs));
  const shots=Math.max(0,Math.floor(Number(metrics.shots)||0));
  const hits=Math.max(0,Math.floor(Number(metrics.hits)||0));
  // Lifetime local accuracy is illustrative, not a source of extra hits.
  const accuracy=shots>0?Math.round(Math.min(1,hits/shots)*100):null;
  return {stars,label:GRADE_LABELS[stars],timeMs,accuracy};
}
/** An actionable replay target, visible only after a real result screen.
 * Do not add intrusive tactical text inside the real-time FPS view. */
export function cfNextMedalGoal(challenge,medal) {
  if(!medal||!challenge||medal.stars>=3)return '';
  if(challenge.kind==='survive')
    return '三星目标：零阵亡，真实移动至少'+
      (Math.max(0,Number(challenge.minTravel)||0)+10)+'米'+
      (challenge.minKills?'，真实击杀至少'+challenge.minKills+'人':'');
  return '三星目标：零阵亡，在'+
    Math.ceil(challenge.limitMs*.75/1000)+'秒内完成';
}
export function cfNewMastery() {return {version:1,records:{}};}
export function cfMasteryKey(challenge) {
  return CF_IDS.has(challenge?.id)
    ? challenge.id+':'+(challenge.elite===true?'elite':'normal'):null;
}
export function cfRecordMastery(profile,challenge,metrics,outcome,elapsedMs) {
  if(profile?.version!==1||!profile.records||typeof profile.records!=='object')
    return null;
  const key=cfMasteryKey(challenge);
  if(!key)return null;
  const previous=profile.records[key]||{
    attempts:0,wins:0,bestStars:0,bestMs:0};
  const record={...previous};
  if(record.attempts>=1000000)return null;
  const medal=cfMissionMedal(challenge,metrics,outcome,elapsedMs);
  record.attempts++;
  let newBest=false,newMedal=false;
  if(medal){
    record.wins++;
    if(record.bestMs===0||medal.timeMs<record.bestMs){
      record.bestMs=medal.timeMs;
      newBest=true;
    }
    if(medal.stars>record.bestStars){
      record.bestStars=medal.stars;
      newMedal=true;
    }
  }
  profile.records[key]=record;
  return {record,medal,newBest,newMedal};
}
export function cfLoadMastery(raw) {
  try {
    if(typeof raw!=='string'||raw.length>3500)return cfNewMastery();
    const p=JSON.parse(raw);
    if(p?.version!==1||!p.records||typeof p.records!=='object'||
       Array.isArray(p.records))return cfNewMastery();
    const validKeys=new Set([...CF_IDS].flatMap(id=>[id+':normal',id+':elite']));
    const clean=cfNewMastery();
    for(const [key,r] of Object.entries(p.records)){
      if(!validKeys.has(key)||!r||typeof r!=='object')return cfNewMastery();
      if(!['attempts','wins','bestStars','bestMs'].every(k=>
          Number.isInteger(r[k])&&r[k]>=0&&r[k]<=1000000)||
         r.wins>r.attempts||r.bestStars>3||
         (r.wins===0&&(r.bestStars>0||r.bestMs>0))||
         (r.wins>0&&(r.bestStars===0||r.bestMs===0)))
        return cfNewMastery();
      clean.records[key]={attempts:r.attempts,wins:r.wins,
        bestStars:r.bestStars,bestMs:r.bestMs};
    }
    return clean;
  } catch{return cfNewMastery();}
}
export function cfSaveMastery(profile) {
  return JSON.stringify(cfLoadMastery(JSON.stringify(profile)));
}
export function cfRecordLabel(profile,challenge) {
  const key=cfMasteryKey(challenge),r=key?profile?.records?.[key]:null;
  if(!r?.wins)return '尚未通关';
  const secs=(r.bestMs/1000).toFixed(1);
  return '★'.repeat(r.bestStars)+'☆'.repeat(3-r.bestStars)+' · 最速 '+secs+'秒';
}


/* CF V14 local-only native first30 records: kept in the registered CF-only
 * source module, not an unregistered shared H5 runtime dependency. */
/** CF-specific, local-only voluntary playtest measurements.
 * Neither telemetry nor user/device IDs, exact time, GPS, coordinates,
 * hardware attributes, advertisements or network requests exist here.
 * Counters MUST be observed in the original native Three.js player.
 */
const VALID=new Set(['tags','precision','survive','defense','assault',
  'marksman','evac','counter']);
const LIMIT=30;
const TIMES=['firstMoveMs','firstShotMs','firstHitMs','firstKillMs'];
const PRESSURE_TIMES=['firstEnemyShotMs','firstDamageMs'];
const COUNTS=['shots','hits','kills','deaths'];
const nonnegative=v=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000;
const whole=(v,max=1_000_000)=>Number.isFinite(v)&&v>=0
  ?Math.min(max,Math.floor(v)):0;
const gameCounter=(s,key)=>whole(s?.[key==='kills'?'k':key==='deaths'?'d':key],100_000);
const snap=s=>Object.fromEntries(COUNTS.map(k=>[k,gameCounter(s,k)]));
const rounded=t=>Math.max(0,Math.min(30_000,Math.round(t/100)*100));
export function cfNewPlaytest() {
  return {version:1,starts:0,finishes:0,retriesAfterLoss:0,recent:[]};
}
function validEntry(e) {
  if(!e||!VALID.has(e.mission)||!['won','lost'].includes(e.result)||
     !nonnegative(e.durationSec)||e.durationSec>2000)return false;
  if(e.assisted!==undefined&&typeof e.assisted!=='boolean')return false;
  for(const key of COUNTS)if(!nonnegative(e[key])||e[key]>100_000)return false;
  for(const key of TIMES)if(e[key]!==null&&
    (!nonnegative(e[key])||e[key]>30000))return false;
  for(const key of PRESSURE_TIMES)if(e[key]!==undefined&&e[key]!==null&&
    (!nonnegative(e[key])||e[key]>30000))return false;
  if(e.enemyShots!==undefined&&(!nonnegative(e.enemyShots)||e.enemyShots>100_000))
    return false;
  return true;
}
export function cfLoadPlaytest(raw){
  if(typeof raw!=='string'||raw.length>12_000)return cfNewPlaytest();
  try {
    const v=JSON.parse(raw);
    if(!v||v.version!==1||!['starts','finishes','retriesAfterLoss']
      .every(k=>nonnegative(v[k]))||
      v.finishes>v.starts||v.retriesAfterLoss>v.starts||
      !Array.isArray(v.recent)||v.recent.length>LIMIT||
      v.recent.length>v.finishes||!v.recent.every(validEntry))
      return cfNewPlaytest();
    return {version:1,starts:v.starts,finishes:v.finishes,
      retriesAfterLoss:v.retriesAfterLoss,recent:v.recent.map(e=>({
        mission:e.mission,result:e.result,durationSec:e.durationSec,
        assisted:e.assisted===true,
        ...Object.fromEntries(TIMES.map(k=>[k,e[k]])),
        ...Object.fromEntries(PRESSURE_TIMES.map(k=>[k,e[k]??null])),
        ...Object.fromEntries(COUNTS.map(k=>[k,e[k]])),
        enemyShots:e.enemyShots??0
      }))};
  } catch{return cfNewPlaytest();}
}
export function cfBeginPlaytest(book,mission,native={}) {
  if(!book||!VALID.has(mission)||book.starts>=1_000_000)return null;
  book.starts++;
  return {
    mission,baseline:snap(native),enemyBaseline:whole(native?.enemyShots,100_000),
    previousHP:Number.isFinite(native?.hp)?Math.max(0,native.hp):null,
    previousDeaths:gameCounter(native,'deaths'),
    lastElapsedMs:0,firstMoveMs:null,firstShotMs:null,
    firstHitMs:null,firstKillMs:null,firstEnemyShotMs:null,firstDamageMs:null,
    closed:false,entry:null
  };
}
export function cfSamplePlaytest(session,elapsedMs,native={}) {
  if(!session||session.closed||!VALID.has(session.mission)||
    !Number.isFinite(elapsedMs)||elapsedMs<0)return false;
  const time=Math.max(session.lastElapsedMs,elapsedMs);
  session.lastElapsedMs=time;
  if(time>30_000)return false;
  const current=snap(native);
  const actualEnemyShots=whole(native?.enemyShots,100_000);
  if(session.firstEnemyShotMs===null&&actualEnemyShots>session.enemyBaseline)
    session.firstEnemyShotMs=rounded(time);
  const hp=Number.isFinite(native?.hp)?Math.max(0,native.hp):null;
  if(session.firstDamageMs===null&&hp!==null&&session.previousHP!==null&&
    hp<session.previousHP&&current.deaths===session.previousDeaths&&
    native?.recentEnemyDamage===true)
    session.firstDamageMs=rounded(time);
  session.previousHP=hp;
  session.previousDeaths=current.deaths;
  for(const [key,field] of [
    ['shots','firstShotMs'],['hits','firstHitMs'],['kills','firstKillMs']]){
    if(session[field]===null&&current[key]>session.baseline[key])
      session[field]=rounded(time);
  }
  if(session.firstMoveMs===null&&Number.isFinite(native?.travel)&&
    native.travel>=1.25)session.firstMoveMs=rounded(time);
  return true;
}
export function cfFinishPlaytest(book,session,elapsedMs,outcome,native={},options={}) {
  if(!session||!book||!VALID.has(session.mission)||
    !['won','lost'].includes(outcome)||!Number.isFinite(elapsedMs)||
    elapsedMs<0)return null;
  if(session.closed)return session.entry;
  cfSamplePlaytest(session,elapsedMs,native);
  session.closed=true;
  const current=snap(native);
  const entry={
    mission:session.mission,
    result:outcome,
    assisted:options?.adAssisted===true,
    durationSec:Math.min(2000,Math.round(elapsedMs/1000)),
    ...Object.fromEntries(TIMES.map(k=>[k,session[k]])),
    ...Object.fromEntries(PRESSURE_TIMES.map(k=>[k,session[k]])),
    ...Object.fromEntries(COUNTS.map(k=>[
      k,Math.max(0,current[k]-session.baseline[k])])),
    enemyShots:Math.max(0,whole(native?.enemyShots,100_000)-session.enemyBaseline)
  };
  session.entry=entry;
  if(book.finishes<1_000_000)book.finishes++;
  book.recent.push(entry);
  if(book.recent.length>LIMIT)book.recent.splice(0,book.recent.length-LIMIT);
  return entry;
}
export function cfMarkReplay(book,{phase,outcome}={}) {
  if(!book||phase!=='finished'||outcome!=='lost'||
    book.retriesAfterLoss>=1_000_000)return false;
  book.retriesAfterLoss++;
  return true;
}
/** Explicit user action only. Not D1, DAU, ad-completion, revenue or attribution. */
export function cfExportPlaytest(book) {
  const data=cfLoadPlaytest(JSON.stringify(book||cfNewPlaytest()));
  return JSON.stringify({
    scope:'only-local-voluntary-export',
    notRetentionOrRevenueProof:true,
    note:'Manual export of native counters and rounded play time. Enemy shots do not imply hits. First damage requires an observed HP decrease from a recent native enemy attacker. Assisted requires verified rewarded video. No ad views, revenue, IDs, device, location, or network data.',
    ...data
  },null,2);
}
