/* global window, document, location, fetch, performance, requestAnimationFrame, localStorage, setTimeout */
import { CONFIG, createInitial, act, tick, inspect, encodeSave, decodeSave } from './engine.mjs';
import { THEMES } from './themes.mjs';

const $=id=>document.getElementById(id);
const namespace=/^[a-z0-9][a-z0-9-]{0,47}$/;
let runId='clinic-demo';
if(window.__BUILD_META__?.runId&&namespace.test(window.__BUILD_META__.runId))runId=window.__BUILD_META__.runId;
else if(location.protocol==='http:'||location.protocol==='https:'){
  try{const m=await (await fetch('./build.json')).json();if(namespace.test(m.runId))runId=m.runId;}catch{/* Standalone preview has no metadata endpoint. */}
}
document.title=THEMES.clinic.title+' · 调度试验';
const saveKey='factory:clinic-queue-v1:'+runId;
let state=createInitial(2026),speed=1,lastTime=performance.now(),carry=0,savedAt=0,lastEvent=0,resumed=false;
try{const raw=localStorage.getItem(saveKey);const restored=decodeSave(raw,runId);if(restored){state=restored;resumed=state.status!=='ready';if(state.status==='running')state=act(state,{type:'pause'});}else if(raw){$('save-state').textContent='旧存档损坏 · 已安全重开';$('save-state').classList.add('warning');}}catch{storageWarning();}
lastEvent=state.events.at(-1)?.id??0;
function storageWarning(){$('save-state').textContent='无法保存 · 仍可试玩';$('save-state').classList.add('warning');}
function save(){try{localStorage.setItem(saveKey,encodeSave(state,runId));savedAt=state.timeMs;}catch{storageWarning();}}
function send(action){state=act(state,action);carry=0;lastTime=performance.now();save();render();}
$('start').onclick=()=>{if(state.status==='finished'){state=act(state,{type:'restart'});lastEvent=0;}send({type:state.status==='paused'?'pause':'start'});resumed=false;};
$('pause').onclick=()=>send({type:'pause'});
$('speed').onclick=()=>{speed=speed===1?3:1;carry=0;lastTime=performance.now();render();};
$('restart').onclick=()=>{if(state.timeMs>0&&state.status!=='finished'&&!window.confirm('结束当前班次并重新开始？已投入的进度不会保留。'))return;state=act(state,{type:'restart'});lastEvent=0;save();render();};
$('assign-intake').onclick=()=>send({type:'assign',station:'intake'});
$('assign-care').onclick=()=>send({type:'assign',station:'care'});
for(const item of ['equipment','room','doctor'])$('buy-'+item).onclick=()=>send({type:'buy',item});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.status==='running'){state=act(state,{type:'pause'});save();render();}lastTime=performance.now();carry=0;});
window.addEventListener('pagehide',save);
const fmt=n=>'¥'+(n/100).toFixed(n%100?1:0);
function pos(patient,s,queues){
  const age=s.timeMs-patient.since;
  if(patient.phase==='arriving')return{x:1+Math.min(1,age/CONFIG.walkMs)*10,y:79};
  if(patient.phase==='intakeWait'){const i=queues.intake.indexOf(patient.id);return{x:14+(i%5)*3.8,y:75+Math.floor(i/5)*8};}
  if(patient.phase==='intake')return{x:28,y:54};
  if(patient.phase==='walk'){const t=Math.min(1,age/CONFIG.walkMs);return{x:31+13*t,y:54+22*t};}
  if(patient.phase==='careWait'){const i=queues.care.indexOf(patient.id);return{x:46+(i%6)*3.8,y:75+Math.floor(i/6)*8};}
  if(patient.phase==='care')return{x:patient.station==='care2'?87:60,y:54};
  if(patient.phase==='exit'){const t=Math.min(1,age/2000);return{x:(patient.station==='care2'?87:60)+(patient.station==='care2'?13:40)*t,y:54+27*t};}
  return{x:-5,y:80};
}
function paintPeople(){
  const active=state.patients.filter(p=>!['done','lost'].includes(p.phase));
  const keys=new Set(active.map(p=>String(p.id)));
  for(const el of $('people').children)if(!keys.has(el.dataset.id))el.remove();
  const queues={intake:state.patients.filter(p=>p.phase==='intakeWait').map(p=>p.id),care:state.patients.filter(p=>p.phase==='careWait').map(p=>p.id)};
  for(const p of active){
    let el=$('people').querySelector('[data-id="'+p.id+'"]');
    if(!el){el=document.createElement('div');el.dataset.id=String(p.id);el.dataset.color=String(p.id%4);el.append(document.createElement('em'));$('people').append(el);}
    const xy=pos(p,state,queues);el.style.left=xy.x+'%';el.style.top=Math.min(94,xy.y)+'%';
    const waiting=p.phase.endsWith('Wait');const limit=p.phase==='intakeWait'?CONFIG.intakePatienceMs:CONFIG.carePatienceMs;
    const ratio=waiting?Math.max(0,1-(state.timeMs-p.since)/limit):1;
    el.className='patient '+p.phase+(waiting&&ratio<.35?' urgent':'');
    el.firstElementChild.style.width=(ratio*100)+'%';el.firstElementChild.hidden=!waiting;
    el.setAttribute('aria-label','患者'+p.id+' '+({arriving:'抵达',intakeWait:'等挂号',intake:'正在挂号',walk:'前往诊室',careWait:'等诊疗',care:'正在诊疗',exit:'完成离院'}[p.phase]));
  }
}
function paintHelper(){
  const xy={idle:{x:42,y:45},intake:{x:33,y:39},care:{x:65,y:39}};
  const a=xy[state.helper.station],b=xy[state.helper.target],t=state.helper.travelMs?1-state.helper.travelMs/CONFIG.helperTravelMs:1;
  $('helper').style.left=(a.x+(b.x-a.x)*t)+'%';$('helper').style.top=(a.y+(b.y-a.y)*t)+'%';
  $('helper').classList.toggle('working',state.status==='running'&&!state.helper.travelMs&&state.helper.station!=='idle');
}
function render(){
  const q=inspect(state);$('cash').textContent=fmt(state.cash);$('served').innerHTML=state.completed+'<span>/26</span>';
  const seconds=Math.ceil((CONFIG.durationMs-state.timeMs)/1000);$('clock').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  $('app').classList.toggle('paused',state.status!=='running');$('pause').disabled=state.status==='ready'||state.status==='finished';$('pause').textContent=state.status==='paused'?'继续':'暂停';
  $('speed').textContent=speed+'×';$('speed').setAttribute('aria-label','游戏速度 '+speed+'倍，点击切换');
  $('phase-label').textContent=state.status==='ready'?'准备开诊':state.status==='finished'?'本班结算':state.timeMs<30000?'开诊时段':state.timeMs<70000?'午间来客增加':state.timeMs<110000?'调整窗口':state.timeMs<150000?'第二波高峰':'最后一轮';
  const suggestion=q.bottleneck==='none'?'看着来客，把钱留给下一个瓶颈':q.bottleneck==='care'?'诊疗积压 '+q.careQueue+' 人：助理或设备能帮上忙':'挂号积压 '+q.intakeQueue+' 人：把助理调到前台';
  $('hint').textContent=state.status==='ready'?'先开诊，再决定助理支援哪里':state.status==='paused'?'已暂停，不会离线扣钱或流失患者':suggestion;
  $('intake-count').textContent=q.intakeQueue;$('care-count').textContent=q.careQueue;
  document.querySelector('.intake-sign').classList.toggle('danger',q.intakeQueue>=4);document.querySelector('.care-sign').classList.toggle('danger',q.careQueue>=4);
  $('incoming').textContent='未来5秒 '+q.nextFiveSeconds+' 人';$('lost').textContent=state.lost;$('wages').textContent=fmt(state.wages);
  $('intake-status').textContent=q.intakeBusy?'正在挂号':'等待来客';$('care-status').textContent=q.careBusy?'正在诊疗 · '+q.careMs/1000+'秒':'等待患者';
  $('second-title').textContent=state.room2?'二号诊室':'待扩建';$('second-status').textContent=state.doctor2?'医生已到岗':state.room2?'缺医生 · 尚无新增产能':'开诊室后还需医生';
  document.querySelector('.second').style.display=state.doctor2?'flex':'none';
  document.querySelector('.nurse').classList.toggle('working',Boolean(q.intakeBusy)&&state.status==='running');
  document.querySelector('.doctor').classList.toggle('working',Boolean(q.careBusy)&&state.status==='running');
  $('load-label').textContent='等待 '+(q.intakeQueue+q.careQueue)+' 人 · 工作诊位 '+q.careCapacity+' 个';
  $('helper-label').textContent=state.helper.travelMs?'正在赶往'+(state.helper.target==='care'?'诊室':'前台')+'…':state.helper.station==='idle'?'助理待命':state.helper.station==='care'?'助理在诊室':'助理在前台';
  for(const station of ['intake','care']){const b=$('assign-'+station);b.disabled=state.status==='ready'||state.status==='finished';b.classList.toggle('selected',state.helper.target===station);b.setAttribute('aria-pressed',String(state.helper.target===station));}
  for(const [item,owned,cost] of [['equipment',state.equipment,CONFIG.equipmentCost],['room',state.room2,CONFIG.roomCost],['doctor',state.doctor2,CONFIG.doctorCost]]){
    const b=$('buy-'+item);b.disabled=Boolean(owned)||state.cash<cost||state.status==='ready'||state.status==='finished'||item==='doctor'&&!state.room2;b.classList.toggle('owned',Boolean(owned));
    b.querySelector('small').textContent=owned?'已投入 · 生效中':item==='doctor'&&!state.room2?'先开第二诊室':fmt(cost)+(item==='equipment'?' · 8.5秒 → 5秒':item==='room'?' · 新增空间':' · 工资增加');
  }
  paintPeople();paintHelper();
  const event=state.events.filter(e=>e.id>lastEvent&&['treated','lost','purchase','rush','dispatch'].includes(e.type)).at(-1);
  if(event){lastEvent=event.id;$('toast').textContent=event.type==='treated'?'完成接诊 +¥12':event.type==='lost'?(event.station==='care'?'等诊疗':'等挂号')+'太久，1位患者离开':event.type==='dispatch'?'助理调动需要3秒':event.type==='rush'?'新一波患者来了':event.item==='room'?'新诊室已建好，还需要医生':event.item==='doctor'?'第二位医生到岗！':'设备到位，基础诊疗缩短至5秒';$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1900);}
  const show=state.status==='ready'||state.status==='finished'||state.status==='paused';$('overlay').hidden=!show;
  if(show){
    $('settlement').hidden=state.status!=='finished';
    if(state.status==='finished'){
      $('dialog-title').textContent=state.completed>=26?'这班，安排得不错。':'下一班，换个安排。';
      $('dialog-text').textContent='接诊'+state.completed+'位，'+state.lost+'位因等待离开，'+q.unfinished+'位留待后续。'+(state.lossReasons.care>=state.lossReasons.intake?'主要压力在诊疗环节。':'主要压力在挂号环节。');
      $('settlement').innerHTML='<div class="result-grid"><div><strong>'+fmt(state.income)+'</strong><small>接诊收入</small></div><div><strong>'+fmt(state.spent+state.wages)+'</strong><small>投资与工资</small></div><div><strong>'+fmt(state.cash)+'</strong><small>期末资金</small></div></div>';
      $('start').textContent='再开一班 · 试试不同安排';
    }else if(state.status==='paused'){$('dialog-title').textContent=resumed?'进度还在。':'先歇一会儿。';$('dialog-text').textContent='离开时会暂停。不倒扣进度，不用担心患者在后台流失。';$('start').textContent='继续接诊';}
    else{$('dialog-title').innerHTML='让门诊<br>转起来。';$('dialog-text').innerHTML='患者会自己来。你只有一位机动助理：<br>帮挂号，还是帮诊疗？把钱花在真正的瓶颈上。';$('start').textContent='开诊 · 3分钟';}
  }
}
// Read-only observation surface: QA may inspect a clone but cannot set engine state.
Object.defineProperty(window,'__CLINIC_VIEW__',{value:()=>JSON.parse(JSON.stringify({state,view:inspect(state),runId,speed})),writable:false});
function frame(now){
  const elapsed=Math.max(0,Math.min(500,now-lastTime));lastTime=now;
  if(state.status==='running'&&!document.hidden){carry+=elapsed*speed;let changed=false;while(carry>=CONFIG.stepMs){state=tick(state);carry-=CONFIG.stepMs;changed=true;if(state.status!=='running'){carry=0;save();break;}}if(changed){if(state.timeMs-savedAt>=5000)save();render();}}
  requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);
