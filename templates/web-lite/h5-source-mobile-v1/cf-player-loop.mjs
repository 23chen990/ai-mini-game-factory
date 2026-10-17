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
export const CF_CONTROL_DEFAULTS=Object.freeze({sensitivity:1,opacity:.85});
const CF_IDS=new Set(['tags','precision','survive','defense','assault','marksman','evac','counter']);
const GRADE_LABELS=['未完成','完成','优秀','完美'];

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
