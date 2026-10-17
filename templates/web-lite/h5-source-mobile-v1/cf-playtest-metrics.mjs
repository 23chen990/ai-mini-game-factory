/** CF-specific, local-only voluntary playtest measurements.
 * Neither telemetry nor user/device IDs, exact time, GPS, coordinates,
 * hardware attributes, advertisements or network requests exist here.
 * Counters MUST be observed in the original native Three.js player.
 */
const VALID=new Set(['tags','precision','survive','defense','assault',
  'marksman','evac','counter']);
const LIMIT=30;
const TIMES=['firstMoveMs','firstShotMs','firstHitMs','firstKillMs'];
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
  for(const key of COUNTS)if(!nonnegative(e[key])||e[key]>100_000)return false;
  for(const key of TIMES)if(e[key]!==null&&
    (!nonnegative(e[key])||e[key]>30000))return false;
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
        ...Object.fromEntries(TIMES.map(k=>[k,e[k]])),
        ...Object.fromEntries(COUNTS.map(k=>[k,e[k]]))
      }))};
  } catch{return cfNewPlaytest();}
}
export function cfBeginPlaytest(book,mission,native={}) {
  if(!book||!VALID.has(mission)||book.starts>=1_000_000)return null;
  book.starts++;
  return {
    mission,baseline:snap(native),
    lastElapsedMs:0,firstMoveMs:null,firstShotMs:null,
    firstHitMs:null,firstKillMs:null,closed:false,entry:null
  };
}
export function cfSamplePlaytest(session,elapsedMs,native={}) {
  if(!session||session.closed||!VALID.has(session.mission)||
    !Number.isFinite(elapsedMs)||elapsedMs<0)return false;
  const time=Math.max(session.lastElapsedMs,elapsedMs);
  session.lastElapsedMs=time;
  if(time>30_000)return false;
  const current=snap(native);
  for(const [key,field] of [
    ['shots','firstShotMs'],['hits','firstHitMs'],['kills','firstKillMs']]){
    if(session[field]===null&&current[key]>session.baseline[key])
      session[field]=rounded(time);
  }
  if(session.firstMoveMs===null&&Number.isFinite(native?.travel)&&
    native.travel>=1.25)session.firstMoveMs=rounded(time);
  return true;
}
export function cfFinishPlaytest(book,session,elapsedMs,outcome,native={}) {
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
    durationSec:Math.min(2000,Math.round(elapsedMs/1000)),
    ...Object.fromEntries(TIMES.map(k=>[k,session[k]])),
    ...Object.fromEntries(COUNTS.map(k=>[
      k,Math.max(0,current[k]-session.baseline[k])]))
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
    note:'Manual self-export. Rounded play time and real native stats only; no network, IDs, device or location data.',
    ...data
  },null,2);
}
