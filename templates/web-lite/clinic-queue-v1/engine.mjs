/* global structuredClone */
// Original bounded clinic simulation. Parameters are design hypotheses, not extracted competitor values.
export const CONFIG = Object.freeze({
  stepMs:250,durationMs:180000,startCash:8000,fee:1200,
  intakeMs:4500,careMs:8500,upgradedCareMs:5000,helperTravelMs:3000,
  intakePatienceMs:24000,carePatienceMs:32000,walkMs:1500,
  equipmentCost:3500,roomCost:6500,doctorCost:7000,
  wageEveryMs:15000,baseWage:200,extraWage:250,maxEvents:120,
});
const PHASES=['arriving','intakeWait','intake','walk','careWait','care','exit','done','lost'];
const STATUSES=['ready','running','paused','finished'];
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const fail=(ok,message)=>{if(!ok)throw new Error(message);};
const bounded=(v,max)=>integer(v)&&v<=max;
function schedule(seed){
  let r=seed>>>0;const a=[1000];let at=1000;
  while(at<CONFIG.durationMs-4000){
    r=(Math.imul(1664525,r)+1013904223)>>>0;
    const interval=at<30000?6000:at<70000?3000:at<110000?5000:at<150000?2500:4000;
    at+=Math.round((interval+(r%3-1)*250)/CONFIG.stepMs)*CONFIG.stepMs;
    if(at<CONFIG.durationMs-4000)a.push(at);
  }
  return a;
}
export function createInitial(seed=1){
  fail(integer(seed)&&seed<=0xffffffff,'Invalid seed');
  return {version:1,seed,status:'ready',timeMs:0,cash:CONFIG.startCash,income:0,spent:0,wages:0,
    equipment:false,room2:false,doctor2:false,helper:{station:'idle',target:'idle',travelMs:0},
    schedule:schedule(seed),patients:[],arrived:0,completed:0,lost:0,
    lossReasons:{intake:0,care:0},peakQueue:0,totalWaitMs:0,events:[],nextEvent:1};
}
function emit(s,type,details={}){
  s.events.push({id:s.nextEvent++,at:s.timeMs,type,...details});
  if(s.events.length>CONFIG.maxEvents)s.events.shift();
}
export function act(state,action){
  fail(action&&typeof action==='object'&&['start','pause','assign','buy','restart'].includes(action.type),'Unknown action');
  if(action.type==='restart')return createInitial(state.seed);
  if(action.type==='start'){
    if(state.status!=='ready')return structuredClone(state);
    const s=structuredClone(state);s.status='running';emit(s,'start');return s;
  }
  if(action.type==='pause'){
    const s=structuredClone(state);if(s.status==='running')s.status='paused';else if(s.status==='paused')s.status='running';return s;
  }
  if(!['running','paused'].includes(state.status))return structuredClone(state);
  const s=structuredClone(state);
  if(action.type==='assign'){
    fail(['intake','care'].includes(action.station),'Invalid station');
    if(s.helper.target===action.station)return s;
    s.helper.target=action.station;s.helper.travelMs=CONFIG.helperTravelMs;emit(s,'dispatch',{station:action.station});
  }
  if(action.type==='buy'){
    fail(['equipment','room','doctor'].includes(action.item),'Invalid purchase');
    const key={equipment:'equipment',room:'room2',doctor:'doctor2'}[action.item];
    const cost={equipment:CONFIG.equipmentCost,room:CONFIG.roomCost,doctor:CONFIG.doctorCost}[action.item];
    if(s[key]||s.cash<cost||(action.item==='doctor'&&!s.room2))return s;
    s[key]=true;s.cash-=cost;s.spent+=cost;emit(s,'purchase',{item:action.item,cost});
  }
  return s;
}
function enter(s,p,phase){p.phase=phase;p.since=s.timeMs;p.progressMs=0;}
function abandon(s,p,station){enter(s,p,'lost');s.lost++;s.lossReasons[station]++;emit(s,'lost',{patient:p.id,station});}
export function tick(state,deltaMs=CONFIG.stepMs){
  fail(deltaMs===CONFIG.stepMs,'Only fixed simulation steps are supported');
  if(state.status!=='running')return structuredClone(state);
  const s=structuredClone(state);s.timeMs+=deltaMs;
  if(s.helper.travelMs>0){s.helper.travelMs=Math.max(0,s.helper.travelMs-deltaMs);if(!s.helper.travelMs){s.helper.station=s.helper.target;emit(s,'helper-arrived',{station:s.helper.station});}}
  while(s.arrived<s.schedule.length&&s.schedule[s.arrived]<=s.timeMs){
    const id=++s.arrived;s.patients.push({id,phase:'arriving',since:s.timeMs,progressMs:0,waitMs:0,station:null});emit(s,'arrive',{patient:id});
  }
  for(const p of s.patients){
    if(p.phase==='arriving'&&s.timeMs-p.since>=CONFIG.walkMs)enter(s,p,'intakeWait');
    else if(p.phase==='walk'&&s.timeMs-p.since>=CONFIG.walkMs)enter(s,p,'careWait');
    else if(p.phase==='exit'&&s.timeMs-p.since>=2000)enter(s,p,'done');
    else if(['intakeWait','careWait'].includes(p.phase)){
      p.waitMs+=deltaMs;s.totalWaitMs+=deltaMs;
      const patience=p.phase==='intakeWait'?CONFIG.intakePatienceMs:CONFIG.carePatienceMs;
      if(s.timeMs-p.since>=patience)abandon(s,p,p.phase==='intakeWait'?'intake':'care');
    }else if(p.phase==='intake'||p.phase==='care'){
      const kind=p.phase==='intake'?'intake':'care';
      // One helper assists one care station, not every doctor at once.
      const assisted=!s.helper.travelMs&&s.helper.station===kind&&(kind==='intake'||p.station==='care1');
      p.progressMs+=deltaMs*(assisted?2:1);
      const duration=kind==='intake'?CONFIG.intakeMs:(s.equipment?CONFIG.upgradedCareMs:CONFIG.careMs);
      if(p.progressMs>=duration){
        if(kind==='intake')enter(s,p,'walk');
        else {enter(s,p,'exit');s.completed++;s.cash+=CONFIG.fee;s.income+=CONFIG.fee;emit(s,'treated',{patient:p.id,amount:CONFIG.fee});}
      }
    }
  }
  if(!s.patients.some(p=>p.phase==='intake')){
    const p=s.patients.find(p=>p.phase==='intakeWait');if(p){enter(s,p,'intake');p.station='intake';}
  }
  for(const station of s.doctor2?['care1','care2']:['care1']){
    if(!s.patients.some(p=>p.phase==='care'&&p.station===station)){
      const p=s.patients.find(p=>p.phase==='careWait');if(p){enter(s,p,'care');p.station=station;}
    }
  }
  s.peakQueue=Math.max(s.peakQueue,inspect(s).intakeQueue+inspect(s).careQueue);
  if(s.timeMs%CONFIG.wageEveryMs===0){
    const paid=Math.min(s.cash,CONFIG.baseWage+(s.doctor2?CONFIG.extraWage:0));
    s.cash-=paid;s.wages+=paid;emit(s,'wages',{amount:paid});
  }
  if(s.timeMs===30000||s.timeMs===110000)emit(s,'rush');
  if(s.timeMs>=CONFIG.durationMs){s.status='finished';emit(s,'settlement',{completed:s.completed,lost:s.lost});}
  return s;
}
export function inspect(s){
  const count=phase=>s.patients.filter(p=>p.phase===phase).length;
  const intakeQueue=count('intakeWait'),careQueue=count('careWait');
  return {intakeQueue,careQueue,arriving:count('arriving'),incomingCare:count('walk'),
    intakeBusy:count('intake'),careBusy:count('care'),careCapacity:s.doctor2?2:1,
    intakeMs:CONFIG.intakeMs,careMs:s.equipment?CONFIG.upgradedCareMs:CONFIG.careMs,
    unfinished:s.arrived-s.completed-s.lost,completed:s.completed,lost:s.lost,
    nextArrivalMs:s.schedule[s.arrived]??null,
    nextFiveSeconds:s.schedule.slice(s.arrived).filter(t=>t<=s.timeMs+5000).length,
    bottleneck:careQueue===0&&intakeQueue===0?'none':careQueue>=intakeQueue?'care':'intake'};
}
export function validateState(s){
  fail(s&&typeof s==='object'&&!Array.isArray(s)&&s.version===1,'Invalid state version');
  fail(integer(s.seed)&&s.seed<=0xffffffff&&STATUSES.includes(s.status),'Invalid state identity');
  fail(bounded(s.timeMs,CONFIG.durationMs)&&s.timeMs%CONFIG.stepMs===0,'Invalid time');
  fail(['cash','income','spent','wages','arrived','completed','lost','peakQueue','totalWaitMs','nextEvent'].every(k=>bounded(s[k],100000000)),'Invalid counter');
  fail(['equipment','room2','doctor2'].every(k=>typeof s[k]==='boolean')&&(!s.doctor2||s.room2),'Invalid investment');
  fail(s.cash===CONFIG.startCash+s.income-s.spent-s.wages&&s.income===s.completed*CONFIG.fee,'Cash conservation');
  fail(s.spent===(s.equipment?CONFIG.equipmentCost:0)+(s.room2?CONFIG.roomCost:0)+(s.doctor2?CONFIG.doctorCost:0),'Purchase conservation');
  fail(s.helper&&['idle','intake','care'].includes(s.helper.station)&&['idle','intake','care'].includes(s.helper.target)&&bounded(s.helper.travelMs,CONFIG.helperTravelMs),'Invalid helper');
  fail(Array.isArray(s.schedule)&&JSON.stringify(s.schedule)===JSON.stringify(schedule(s.seed)),'Invalid schedule');
  fail(Array.isArray(s.patients)&&s.patients.length===s.arrived&&s.arrived<=s.schedule.length,'Invalid patient count');
  for(let i=0;i<s.patients.length;i++){
    const p=s.patients[i];fail(p&&p.id===i+1&&PHASES.includes(p.phase)&&bounded(p.since,s.timeMs)&&bounded(p.progressMs,CONFIG.careMs*2)&&bounded(p.waitMs,CONFIG.durationMs)&&[null,'intake','care1','care2'].includes(p.station),'Invalid patient');
    if(p.phase==='care')fail(['care1','care2'].includes(p.station)&&(p.station!=='care2'||s.doctor2),'Invalid active station');
  }
  fail(s.completed===s.patients.filter(p=>p.phase==='done'||p.phase==='exit').length&&s.lost===s.patients.filter(p=>p.phase==='lost').length,'Invalid outcomes');
  fail(s.lossReasons&&integer(s.lossReasons.intake)&&integer(s.lossReasons.care)&&s.lost===s.lossReasons.intake+s.lossReasons.care,'Invalid loss reasons');
  fail(s.patients.filter(p=>p.phase==='intake').length<=1&&['care1','care2'].every(st=>s.patients.filter(p=>p.phase==='care'&&p.station===st).length<=1),'Station overbooked');
  fail(Array.isArray(s.events)&&s.events.length<=CONFIG.maxEvents&&s.events.every(e=>e&&integer(e.id)&&bounded(e.at,s.timeMs)&&typeof e.type==='string'&&e.type.length<40),'Invalid events');
  fail((s.status==='finished')===(s.timeMs===CONFIG.durationMs),'Invalid terminal state');
  return true;
}
export function encodeSave(state,runId){validateState(state);fail(typeof runId==='string'&&/^[a-z0-9][a-z0-9-]{0,47}$/.test(runId),'Invalid save namespace');return JSON.stringify({format:1,runId,state});}
export function decodeSave(raw,runId){
  if(typeof raw!=='string'||raw.length>180000)return null;
  try {const v=JSON.parse(raw);if(v.format!==1||v.runId!==runId)return null;validateState(v.state);return structuredClone(v.state);}catch{return null;}
}
