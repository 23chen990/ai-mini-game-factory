// Genuine player progress, never fabricated proximity or simulated ad rewards.
const safeDistance=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
const validRecord=n=>Number.isSafeInteger(n)&&n>=0?n:0;
export function endlessRecordStory(run,previousBest=0){
 if(!run?.level?.endless)return null;
 const distance=safeDistance(run.distance),record=validRecord(previousBest);
 if(record>0&&distance>record)return {
  kind:'broken',headline:'🏆 海岸新纪录！',
  detail:`超过之前的 ${record} 米纪录 ${distance-record} 米`,gap:0,
 };
 if(record>=150&&distance<record&&record-distance<=80)return {
  kind:'close',headline:'就差一点追平纪录！',
  detail:`还差 ${record-distance} 米就能追平上次的 ${record} 米`,
  gap:record-distance,
 };
 if(record>0&&distance===record)return {
  kind:'equal',headline:'追平了历史纪录！',detail:`已经达到 ${record} 米，下局多骑一米就能突破`,gap:0,
 };
 if(record===0&&distance>=100)return {
  kind:'first',headline:'🏁 第一次海岸纪录！',
  detail:`已留下 ${distance} 米纪录，下次争取超过它`,gap:0,
 };
 return {kind:'try-again',headline:'还可以再远一点',
  detail:`这次骑了 ${distance} 米，看看下一次能否走得更远`,
  gap:record>distance?record-distance:null};
}
// A user would need to have actually invested time/progress before an
// optional rewarded-ad revive is worth interrupting the round. No API calls.
export function reviveOpportunity(run,previousBest=0){
 if(!run||run.phase!=='finished'||run.settled||run.revives!==0||
    !['vehicle','barrier'].includes(run.reason))return {eligible:false,reason:'not-collision'};
 const distance=safeDistance(run.distance),elapsed=Math.max(0,Number(run.elapsed)||0);
 if(elapsed<30)return {eligible:false,reason:'short-session'};
 if(run.level?.endless){
  const record=validRecord(previousBest),gap=record-distance;
  if(record>=250&&distance>=220&&gap>=0&&gap<=80)
   return {eligible:true,reason:'near-record',message:`还差 ${gap} 米就能追平 ${record} 米纪录`};
  if(distance>=360)
   return {eligible:true,reason:'long-ride',message:`已骑行 ${distance} 米，继续挑战更远的海岸`};
  return {eligible:false,reason:'not-enough-progress'};
 }
 const total=Number(run.level?.distance);
 if(!Number.isFinite(total)||total<=0||distance<total*.72)
  return {eligible:false,reason:'not-near-finish'};
 return {eligible:true,reason:'near-finish',
  message:`距离本关终点还有 ${Math.max(0,Math.ceil(total-distance))} 米`};
}
