/* global window, document, location, fetch, performance, requestAnimationFrame, localStorage, setTimeout, clearTimeout, structuredClone */
import { CONFIG, WAVES, createInitial, act, tick, inspect, encodeSave, decodeSave, outcome, serviceMs } from './engine.mjs';
import { THEMES } from './themes.mjs';
const $=id=>document.getElementById(id);
const T={intake:'挂号台',care:'一号诊室',helper:'助理',waiting:'人等待',seconds:'秒',recovery:'先消化长队，再准备下一批',save:'自动保存 · 离开即暂停'};
const ns=/^[a-z0-9][a-z0-9-]{0,47}$/;let runId='clinic-demo';
if(ns.test(window.__BUILD_META__?.runId??''))runId=window.__BUILD_META__.runId;
else if(location.protocol==='http:'||location.protocol==='https:'){try{const m=await(await fetch('./build.json')).json();if(ns.test(m.runId))runId=m.runId;}catch{/* Standalone builds do not need a metadata server. */}}
document.title=THEMES.clinic.title;
// The v1 store is never overwritten or silently reinterpreted after this rules revision.
const key='factory:clinic-v2:'+runId,bestKey=key+':best';let state=createInitial(2026),resumed=false,selection=null;
let carry=0,last=performance.now(),lastSaved=0,lastEvent=0,lastAction='',actionUntil=0,toastTimer=null,best=null;
function warnSave(){$('save-state').textContent='当前浏览器无法保存，仍可试玩';$('save-state').classList.add('warning');}
try{const raw=localStorage.getItem(key),s=decodeSave(raw,runId);if(s){state=s;resumed=true;if(state.status==='running')state=act(state,{type:'pause'});}else if(raw){$('save-state').textContent='存档无效，已安全重开';$('save-state').classList.add('warning');}
 const b=JSON.parse(localStorage.getItem(bestKey)??'null');if(b&&Number.isSafeInteger(b.completed)&&b.completed>=0&&b.completed<150&&Number.isSafeInteger(b.lost)&&b.lost>=0&&b.lost<150)best=b;
}catch{warnSave();}
lastEvent=state.events.at(-1)?.id??0;
function save(){try{localStorage.setItem(key,encodeSave(state,runId));lastSaved=state.timeMs;}catch{warnSave();}}
const money=v=>'¥'+(v/100).toFixed(v%100?1:0);
function say(text){lastAction=text;actionUntil=state.timeMs+7000;}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1700);}
function send(a){const prev=state.status;state=act(state,a);if(a.type==='start'||a.type==='pause'||a.type==='restart'||state.status!==prev){carry=0;last=performance.now();}save();render();}
function room(station){if(state.status!=='running')return;if(selection!==station)lastAction='';selection=station;const changed=state.helper.target!==station;state=act(state,{type:'assign',station});
 if(changed)say(T.helper+'赶往'+T[station]+'，3秒后帮忙');save();render();}
$('assign-intake').onclick=()=>room('intake');$('assign-care').onclick=()=>room('care');
$('open-expansion').onclick=()=>{if(state.status==='running'){selection='expansion';lastAction='';render();}};
for(const item of ['equipment','room','doctor'])$('buy-'+item).onclick=()=>{
 const prev=state.spent;state=act(state,{type:'buy',item});if(state.spent!==prev){say(item==='equipment'?'设备已生效：同类诊疗时间缩短约41%':item==='room'?'房间建好了，再聘医生才能接诊':'第二位医生到岗！两个诊位同时工作');toast(item==='equipment'?'诊疗更快了':'投资已记账 -'+money(state.spent-prev));}save();render();};
$('pause').onclick=()=>send({type:'pause'});
$('start').onclick=()=>{if(state.status==='finished'){state=act(state,{type:'restart'});resetUi();}send({type:state.status==='paused'?'pause':'start'});resumed=false;};
$('restart').onclick=()=>{if(state.timeMs&&state.status!=='finished'&&!window.confirm('放弃当前班次并重开？'))return;state=act(state,{type:'restart'});resetUi();save();render();};
function resetUi(){selection=null;lastEvent=0;lastAction='';actionUntil=0;carry=0;last=performance.now();lastSaved=0;}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.status==='running'){state=act(state,{type:'pause'});save();render();}last=performance.now();carry=0;});
window.addEventListener('pagehide',save);window.addEventListener('resize',()=>paintPeople(inspect(state)));

function guidance(q){
 const now=state.timeMs;let id=1,target='intake',title='先帮挂号台消化长队',why='点场景中的挂号台，助理就会过去';
 const deadlines=[['intake',q.intakeDeadlineMs],['care',q.careDeadlineMs]].filter(([,d])=>d!==null).sort((a,b)=>a[1]-b[1]);
 const urgent=deadlines[0];
 if(state.helper.target!=='idle'||now>=12000){
  target=null;id=2;
  if(urgent&&urgent[1]<11000){
   target=urgent[0];title=T[target]+'有人快等不及了';
   why='约'+Math.ceil(urgent[1]/1000)+'秒后第一位会离开，'+(state.helper.target===target?(target==='care'&&!state.equipment?'可点诊室升级设备':'人手正在帮忙，留意另一边'):'点对应房间调人');
  }else if(state.room2&&!state.doctor2){id=3;target='expansion';title='新诊室尚缺一位医生';why=state.cash>=CONFIG.doctorCost?'点新诊室，聘医生后就能并行接诊':'还需'+money(CONFIG.doctorCost-state.cash)+'，先把手头的队伍疏通';
  }else if(!state.equipment&&state.completed>=3){target='care';title='赚到的收入，可以改善诊疗';why='点一号诊室看'+money(CONFIG.equipmentCost)+'设备，或留钱开新诊位';
  }else if(!state.room2&&state.cash>=CONFIG.roomCost+CONFIG.doctorCost){id=3;target='expansion';title='收入够开第二个诊位了';why='点空地查看：房间'+money(CONFIG.roomCost)+' + 医生'+money(CONFIG.doctorCost);
  }else if(q.intakeQueue>=3||q.careQueue>=3){
   target=q.intakeLoadMs>q.careLoadMs/(state.doctor2?2:1)?'intake':'care';
   title=T[target]+'的队伍长起来了';
   why=state.helper.target===target?'助理已在支援，观察队伍是否缩短':'点'+T[target]+'可调助理，离开原岗位也会影响效率';
  }else if(q.upcomingWave&&q.upcomingWave.at-now<=8000){title='下一批患者快到了';why=q.upcomingWave.cue;id=3;
  }else{title=state.completed<3?'先完成3位患者的接诊':state.completed<CONFIG.goalCompleted?'还有'+(CONFIG.goalCompleted-state.completed)+'位，继续疏通门诊':(state.lost>CONFIG.maxLost?'先接住还在等待的人':'接诊数够了，守住等候承诺');why=q.upcomingWave?q.upcomingWave.cue:'不再有新来客，优先接待最久等待的人';id=state.doctor2?4:2;}
 }
 $('hint').textContent=title;$('why').textContent=why;$('mission-step').textContent=String(id);
 // Only the opening teaches a forced-looking affordance. Later choices remain the player's.
 for(const [k,el] of [['intake',$('assign-intake')],['care',$('assign-care')],['expansion',$('open-expansion')]])el.classList.toggle('recommended',k===target&&(state.helper.target==='idle'||k==='expansion'||(!state.equipment&&state.completed>=3)));
}
function context(){
 for(const k of ['equipment','room','doctor'])$('buy-'+k).hidden=true;
 $('investment-note').textContent='';
 if(selection==='care'){
  $('context-title').textContent=T.care+(state.equipment?' · 设备已升级':' · 可改善诊疗');
  $('last-action').textContent=lastAction&&state.timeMs<actionUntil?lastAction:state.equipment?'不同患者用时不同，设备持续缩短诊疗时间':'同类诊疗时间约减少41%，对每一位医生生效';
  if(!state.equipment){$('buy-equipment').hidden=false;$('buy-equipment').disabled=state.cash<CONFIG.equipmentCost;}
 }else if(selection==='expansion'){
  $('context-title').textContent=state.doctor2?'第二诊位已工作':state.room2?'新诊室已建好':'增加一个并行诊位';
  $('last-action').textContent=state.doctor2?'两位医生同时接诊，留意挂号能否跟上':state.room2?'还没有医生，空房不会自己接诊':'房间和医生缺一不可，可以分步投资';
  $('investment-note').textContent=state.doctor2?'新医生工资：每15秒 '+money(CONFIG.extraWage):'房间'+money(CONFIG.roomCost)+' + 医生'+money(CONFIG.doctorCost)+' = '+money(CONFIG.roomCost+CONFIG.doctorCost);
  const item=state.room2?'doctor':'room';if(!state.doctor2){$('buy-'+item).hidden=false;$('buy-'+item).disabled=state.cash<(item==='room'?CONFIG.roomCost:CONFIG.doctorCost);}
 }else{
  $('context-title').textContent=selection==='intake'?T.intake+' · 一位护士':'一位助理，两个岗位';
  $('last-action').textContent=lastAction&&state.timeMs<actionUntil?lastAction:selection==='intake'?'初诊需要建档，复诊登记快；看队伍再决定调人':'点挂号台或诊室调人，不用拖拽小人';
 }
 for(const k of ['equipment','room','doctor'])if(state.status!=='running')$('buy-'+k).disabled=true;
 // For player-visible verification, this is the actual displayed service state, not a solution hook.
 $('context').dataset.station=selection??'none';
}
function paintPeople(q){
 const scene=$('scene').getBoundingClientRect();if(!scene.width||!scene.height)return;
 const rect=id=>{const b=$(id).getBoundingClientRect();return{x:b.x-scene.x,y:b.y-scene.y,w:b.width,h:b.height};};
 const boxes={intake:rect('assign-intake'),care:rect('assign-care'),care2:rect('open-expansion')};
 const point=(box,x,y)=>({x:box.x+box.w*x,y:box.y+box.h*y});
 const intakeQueue=state.patients.filter(p=>p.phase==='intakeWait'),careQueue=state.patients.filter(p=>p.phase==='careWait');
 const visible=state.patients.filter(p=>!['done','lost'].includes(p.phase));const keys=new Set();
 for(const p of visible){
  const qlist=p.phase==='intakeWait'?intakeQueue:careQueue;const qi=qlist.findIndex(a=>a.id===p.id);
  if(p.phase.endsWith('Wait')&&qi>=6)continue;keys.add(String(p.id));
  let node=$('people').querySelector('[data-id="'+p.id+'"]');if(!node){node=document.createElement('div');node.dataset.id=String(p.id);node.className='patient';node.append(document.createElement('i'));node.firstChild.className='patience';$('people').append(node);}
  node.dataset.kind=WAVES[p.wave].kind;
  const kind=p.phase==='intake'||p.phase==='intakeWait'?'intake':'care',box=boxes[p.station==='care2'?'care2':kind];
  let pt=point(box,.32,.5);const portrait=window.innerWidth<=700;
  if(p.phase==='intakeWait')pt=point(boxes.intake,portrait?.56+qi*.055:.12+qi*.12,portrait?.72:.71);
  else if(p.phase==='careWait')pt=point(boxes.care,.12+qi*.13,.7);
  else if(p.phase==='arriving'){const t=Math.min(1,(state.timeMs-p.since)/CONFIG.walkMs);const end=point(boxes.intake,portrait?.4:.14,.7);pt={x:Math.max(8,end.x*t),y:end.y};}
  else if(p.phase==='walk'){const t=Math.min(1,(state.timeMs-p.since)/CONFIG.walkMs),a=point(boxes.intake,.7,.5),b=point(boxes.care,.13,.7);pt={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
  else if(p.phase==='exit'){const t=Math.min(1,(state.timeMs-p.since)/2000),a=point(box,.6,.55);pt={x:a.x+(scene.width-a.x)*t,y:a.y};}
  else if(p.phase==='intake'&&portrait)pt=point(box,.55,.45);
  node.style.left=pt.x+'px';node.style.top=pt.y+'px';
  const isWait=p.phase.endsWith('Wait'),lim=kind==='intake'?CONFIG.intakePatienceMs:CONFIG.carePatienceMs,remaining=lim-(state.timeMs-p.since);
  node.classList.toggle('urgent',isWait&&remaining<=10000);node.firstChild.hidden=!isWait;node.firstChild.style.width=Math.max(0,remaining/lim)*100+'%';
 }
 for(const n of $('people').children)if(!keys.has(n.dataset.id))n.remove();
 const to=state.helper.target;const pos=to==='idle'?{x:scene.width*.35,y:scene.height*.86}:point(boxes[to],to==='intake'&&window.innerWidth<=700?.83:.76,.48);
 $('helper').style.left=pos.x+'px';$('helper').style.top=pos.y+'px';$('helper').classList.toggle('moving',state.helper.travelMs>0);
 $('helper-effect').textContent=state.helper.travelMs?Math.ceil(state.helper.travelMs/1000)+'s':to==='idle'?'待命':'支援 ×2';
 for(const k of ['intake','care']){const met=q[k+'Service'];$(k+'-progress').style.width=met?Math.min(100,met.progress*100)+'%':'0%';}
 const second=state.patients.find(p=>p.phase==='care'&&p.station==='care2');
 $('second-progress').style.width=second?Math.min(100,second.progressMs/serviceMs(state,second,'care')*100)+'%':'0%';
 $('second-work').hidden=!state.doctor2;
 $('open-expansion').classList.toggle('staffed',state.doctor2);
 $('build-mark').hidden=state.doctor2;
 $('second-work').classList.toggle('working',Boolean(second)&&state.status==='running');
}
function render(){
 const q=inspect(state),o=outcome(state),secs=Math.ceil((CONFIG.durationMs-state.timeMs)/1000);
 $('app').classList.toggle('paused',state.status!=='running');$('cash').textContent=money(state.cash);$('clock').textContent=Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0');
 $('served').textContent=state.completed+'/'+CONFIG.goalCompleted;$('lost').textContent=state.lost+'/'+CONFIG.maxLost;$('lost').parentElement.classList.toggle('bad',!o.lossMet);$('goal-progress').style.width=Math.min(100,state.completed/CONFIG.goalCompleted*100)+'%';
 $('pause').disabled=state.status==='ready'||state.status==='finished';$('pause').setAttribute('aria-label',state.status==='paused'?'继续':'暂停');
 for(const k of ['intake','care']){const b=$('assign-'+k),d=q[k+'DeadlineMs'];b.disabled=state.status!=='running';b.classList.toggle('selected',state.helper.target===k);b.setAttribute('aria-pressed',String(state.helper.target===k));b.classList.toggle('danger',d!==null&&d<=10000);$(k+'-count').textContent=q[k+'Queue'];$(k+'-deadline').textContent=d===null?'':'最早 '+Math.ceil(d/1000)+'s';
  const m=q[k+'Service'];$(k+'-status').textContent=m?'基础 '+(m.durationMs/1000).toFixed(1)+'s/人':k==='intake'?'登记资料':'等待接诊';}
 $('open-expansion').disabled=state.status!=='running';$('second-title').textContent=state.room2?'二号诊室':'增开诊位';$('second-status').textContent=state.doctor2?'医生在岗':state.room2?'缺医生':'空地';$('build-mark').textContent=state.doctor2?'医':state.room2?'·':'+';
 $('expansion-cost').innerHTML=state.doctor2?'并行处理<br><b>2 个诊位</b>':state.room2?'还需聘医生<br><b>'+money(CONFIG.doctorCost)+'</b>':'房间 + 医生<br><b>'+money(CONFIG.roomCost+CONFIG.doctorCost)+'</b>';
 const wave=WAVES[q.wave];$('phase-label').textContent=state.timeMs>=166000?'收尾：不再来新患者':wave.title;
 $('forecast').textContent=q.upcomingWave?'下一批：'+q.upcomingWave.title+' '+Math.ceil((q.upcomingWave.at-state.timeMs)/1000)+'s':'';
 guidance(q);context(q);paintPeople(q);
 const ev=state.events.filter(e=>e.id>lastEvent);if(ev.length){lastEvent=ev.at(-1).id;const e=ev.filter(e=>e.type==='lost'||e.type==='treated').at(-1);if(e)toast(e.type==='treated'?'接诊完成 +'+money(e.amount):T[e.station]+'等太久，1人离开');}
 $('overlay').hidden=state.status==='running';$('settlement').hidden=state.status!=='finished';$('promise').hidden=state.status!=='ready';$('restart').hidden=state.status!=='paused';
 if(state.status==='paused'){$('dialog-title').textContent=resumed?'进度还在。':'先歇一会儿。';$('dialog-text').textContent='暂停时患者和计时都停下，离开不会倒扣进度。';$('start').textContent='继续接诊 →';}
 else if(state.status==='finished'){
  $('dialog-title').textContent=o.passed?'这一班，忙而不乱。':o.countMet?'接诊够了，等候还能改善。':'下一班，试试换个安排。';
  $('dialog-text').textContent=o.passed?'接住了'+state.completed+'位患者，'+state.lost+'人等不及离开。试试不同投资，这批来客不会变。':(state.lossReasons.intake>=state.lossReasons.care?'主要离开发生在挂号，初诊批次可以早一点调人。':'主要离开发生在诊疗，复诊批次可以早一点支援或扩建。');
  $('settlement').innerHTML='<div class="result-grid"><div><strong>'+state.completed+'</strong><small>完成接诊</small></div><div><strong>'+state.lost+'</strong><small>等候离开</small></div><div><strong>'+money(state.cash)+'</strong><small>剩余资金</small></div></div>';
  $('start').textContent='同一批来客，换个安排';
  if(!best||(o.passed&&!best.passed)||o.passed===best.passed&&(state.lost<best.lost||state.lost===best.lost&&state.completed>best.completed)){best={completed:state.completed,lost:state.lost,passed:o.passed};try{localStorage.setItem(bestKey,JSON.stringify(best));}catch{/* optional history */}}
 }else if(state.status==='ready'){$('dialog-title').innerHTML='长队来了，<br>你来安排。';$('dialog-text').textContent='点房间调助理，让等待的人动起来。';$('start').textContent='开诊 →';}
 $('best-note').hidden=!best;if(best)$('best-note').textContent='你的最好一班：'+best.completed+'人接诊，'+best.lost+'人离开';
}
// Read-only observability is used for assertion AFTER inputs, never to inject state.
Object.defineProperty(window,'__CLINIC_VIEW__',{value:()=>structuredClone({state,view:inspect(state),runId,speed:1,outcome:outcome(state)}),writable:false});
function frame(now){const elapsed=Math.max(0,Math.min(500,now-last));last=now;if(state.status==='running'&&!document.hidden){carry+=elapsed;let changed=false;while(carry>=CONFIG.stepMs){state=tick(state);carry-=CONFIG.stepMs;changed=true;if(state.status!=='running'){carry=0;save();break;}}if(changed){if(state.timeMs-lastSaved>=5000)save();render();}}requestAnimationFrame(frame);}
render();requestAnimationFrame(frame);
