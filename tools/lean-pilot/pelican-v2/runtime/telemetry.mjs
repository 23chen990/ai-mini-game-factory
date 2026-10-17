// Privacy-first, offline-only event counters for small human playtests.
// Nothing is uploaded and there are no fingerprints, cookies or player IDs.
const EVENTS=new Set(['start','finish','fail','retire','retry','endless_gate',
 'shop_buy','shop_equip','revive_offer','revive_unavailable']);
const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=9999999;
const validTimestamp=n=>Number.isSafeInteger(n)&&n>=0&&n<=9999999999999;
export function newPlaytestMetrics(){return {version:1,counters:{},events:[]};}
export function loadPlaytestMetrics(raw){
 try{
  if(typeof raw!=='string'||raw.length>16000)return null;
  const data=JSON.parse(raw);
  if(!data||data.version!==1||!data.counters||typeof data.counters!=='object'||Array.isArray(data.counters)||!Array.isArray(data.events)||data.events.length>90)return null;
  for(const [event,n]of Object.entries(data.counters))if(!EVENTS.has(event)||!valid(n))return null;
  const events=data.events.filter(e=>EVENTS.has(e?.event)&&validTimestamp(e?.at)&&[1,2,3,4,5,6].includes(e?.level)&&valid(e?.distance));
  return {version:1,counters:{...data.counters},events:events.slice(-80).map(e=>({event:e.event,level:e.level,distance:e.distance,at:e.at}))};
 }catch{return null;}
}
export function recordPlaytestEvent(metrics,event,{level=1,distance=0}={}){
 if(!EVENTS.has(event))return false;
 const cleanLevel=[1,2,3,4,5,6].includes(level)?level:1;
 const cleanDistance=valid(Math.floor(distance))?Math.floor(distance):0;
 metrics.counters[event]=Math.min(9999999,(metrics.counters[event]??0)+1);
 metrics.events.push({event,level:cleanLevel,distance:cleanDistance,at:Date.now()});
 if(metrics.events.length>80)metrics.events.shift();
 return true;
}
export function exportPlaytestSummary(metrics,collection){
 return {schema:'pelican-offline-playtest-v1',
  notice:'Local anonymous counters only; not official retention or revenue data',
  counters:{...metrics.counters},lastEvents:metrics.events.slice(-80),
  collection:{coins:collection.coins,bestDistance:collection.bestDistance,
   careerRuns:collection.careerRuns,endlessRuns:collection.endlessRuns,
   ownedCount:collection.owned.length}};
}
