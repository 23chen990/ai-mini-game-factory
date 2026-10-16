// Player-facing, truthful replay feedback. No ad gating or artificial losses.
// A lost run carries a measurable marker; the next attempt can beat that marker.
const laneNames=['左','中','右'];
export function failureSummary(run){
 const total=Math.max(1,Number(run?.level?.distance)||1);
 const travelled=Math.max(0,Math.min(total,Number(run?.distance)||0));
 const metres=Math.floor(travelled),remaining=Math.ceil(total-travelled);
 const percent=Math.min(100,Math.floor(travelled/total*100));
 const avoided=Array.isArray(run?.events)
  ?run.events.filter(e=>e?.type==='obstacle-avoided'||e?.type==='barrier-cleared').length:0;
 const failedObstacle=run?.obstacles?.find(o=>o.id===run.lastCollisionId);
 const lane=Number.isInteger(failedObstacle?.lane)?laneNames[failedObstacle.lane]:null;
 const reason=run?.reason;
 const title=reason==='vehicle'?'🚗 撞上来车！':reason==='barrier'?'💥 撞上路障！':
  reason==='timeout'?'⏱ 时间用完了':reason==='fish-short'?'🐟 鱼还不够':reason==='gold-short'?'🌟 少了金鱼':'本次挑战结束';
 const progress=remaining===0? `到达终点 · 完成 ${percent}% 路程`:
  `已骑 ${metres}/${total} 米（${percent}%） · 还剩 ${remaining} 米`;
 const earned=`躲开 ${avoided} 处危险 · 🐟 ${Math.max(0,run?.count||0)} 条 · 🌟 ${Math.max(0,run?.gold||0)} 条金鱼`;
 const advice=reason==='vehicle'? `刚才${lane?`是${lane}侧来车`:'是来车'}：汽车不能跳，提前看红色预警并移到空位。`:
  reason==='barrier'? `刚才${lane?`${lane}侧`:'前方'}有路障：看到 ↟ 时起跳，或提前绕开。`:
  reason==='timeout'?'碰到行人会停车三秒，倒计时不停；提早绕开行人。':
  reason==='fish-short'?`终点还差 ${Math.max(0,(run?.level?.goal?.count||0)-(run?.count||0))} 条鱼，优先选择安全鱼路。`:
  reason==='gold-short'?`终点还差 ${Math.max(0,(run?.level?.goal?.gold||0)-(run?.gold||0))} 条金鱼，注意路障后方的金鱼。`:
  '回想刚才的路况，下一次试试另一条安全路线。';
 const close=remaining>0&&percent>=75?'差一点就骑到终点了！':'';
 return {title,body:[progress,earned,close,advice].filter(Boolean).join('\n'),percent,remaining,avoided,retryLabel:'↻ 立即再试'};
}
export function safeGateCue(lanes){
 if(!Array.isArray(lanes)||lanes.length!==3)return null;
 const danger=lanes.map(l=>Boolean(l?.kind?.startsWith('danger')));
 if(danger.filter(Boolean).length!==2)return null;
 const open=danger.indexOf(false);
 return open>=0?`⚠️ 两条路被挡住 · 走${laneNames[open]}侧空位`:null;
}
export function passedPreviousFailure(distance,previous){
 return Number.isFinite(distance)&&Number.isFinite(previous)&&previous>0&&distance>previous+5;
}
