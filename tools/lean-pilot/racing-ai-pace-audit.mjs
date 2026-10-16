/* global process, console */
// Offline real-native AI lap-time baseline, NOT a natural human/QA run.
// Use exactly the pinned AICar.update, Track and identical seeds on both maps.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { applyTrackDesign } from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';
import { STAGES } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import { tuneOpponentField } from '../../templates/web-lite/h5-source-mobile-v1/racing/rival-pressure.mjs';

const root=process.cwd();
const run=path.join(root,'runs/h5-qq-mobile-20261013');
const src=path.join(run,'workspace/source/qq-speed/src');
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
const raw=await readFile(path.join(src,'layouts.js'),'utf8');
const prefix="import { applyTrackDesign } from './race-track-design.mjs';\n";
const suffix='\napplyTrackDesign(LAYOUTS);';
if(!raw.startsWith(prefix)||!raw.trimEnd().endsWith(suffix))
  throw Error('Unknown pinned racing layout adapter; refusing unverified AI comparison');
const originalText=raw.slice(prefix.length).trimEnd().slice(0,-suffix.length);
const layouts=(await import('data:text/javascript;base64,'+Buffer.from(originalText).toString('base64'))).LAYOUTS;
const revised=JSON.parse(JSON.stringify(layouts));
applyTrackDesign(revised);
const {Track}=await import(pathToFileURL(path.join(src,'track.js')).href);
const {AICar}=await import(pathToFileURL(path.join(src,'ai.js')).href);
const {mulberry32}=await import(pathToFileURL(path.join(src,'util.js')).href);

const profiles=Object.freeze([
  {id:'tutorial',skill:.65},
  {id:'item_middle',skill:1.10},
  {id:'speed_middle',skill:1.26},
  {id:'expert',skill:1.35},
  {id:'boss',skill:1.58},
]);
function runAi(layout, skill, seed, laps = 2) {
  const tr=new Track(layout);
  const ai=new AICar(tr,null,'Pace Probe',skill,mulberry32(seed));
  ai.reset(-25,0);
  const DT=1/120, goal=laps*tr.length;
  let seconds=0,nitros=0,peak=0,avg=0,frames=0;
  for(let i=0;i<120*350;i++){
    const previous=ai.nitroTime;
    ai.update(DT,true,seconds,1);seconds+=DT;
    if(previous<=0 && ai.nitroTime>0)nitros++;
    peak=Math.max(peak,ai.s);avg+=ai.s;frames++;
    if(ai.dist>=goal)return {timeSec:+seconds.toFixed(2),
      avgSpeedKmh:+(avg/frames*3.6).toFixed(1),
      topSpeedKmh:+(peak*3.6).toFixed(1),nitros,
      lapLengthM:Math.round(tr.length)};
  }
  throw Error('Native AI simulation failed to cover '+laps+' laps at '+skill);
}
const data={};
for(const key of ['city','aegean','egypt','snow']){
  const old=[],next=[];
  for(const [i,p] of profiles.entries()){
    const seed=20261015+37*i;
    old.push({profile:p.id,skill:p.skill,...runAi(layouts[key],p.skill,seed)});
    next.push({profile:p.id,skill:p.skill,...runAi(revised[key],p.skill,seed)});
  }
  data[key]={old,next,deltaPercent:Object.fromEntries(profiles.map((p,i)=>
    [p.id,+((next[i].timeSec/old[i].timeSec-1)*100).toFixed(1)]))};
}
// The career bosses are THREE-lap races. Two-lap averages cannot validate them.
const bossThreeLaps={};
for(const [id,map,skill,seed] of [['13','city',1.58,2026101513],['16','aegean',1.35,2026101516]]){
  bossThreeLaps[id]={map,laps:3,skill,
    original:runAi(layouts[map],skill,seed,3),
    reshaped:runAi(revised[map],skill,seed,3)};
}

// Exact stage-specific *actual native* AICar.update two-lap pace comparison.
// The former V3.8 speeds are reconstructed per stage on the SAME V3.9 course.
// This is not human pass probability, item fairness or adaptive rubber-banding.
const oldFastest={ '01':.75,'02':.75,'04':.75,'05':.75,
  '03':1.34,'06':1.18,'08':1.34,'10':1.18,'11':1.38,'14':1.38,
  '09':1.34,'12':1.34,'13':1.58,'15':1.38,'16':1.35};
const stageAI={};
for(const id of ['01','02','04','05','03','06','08','10','11','14','09','12','13','15','16']){
  const stage=STAGES.find(x=>x.id===id),baseline=oldFastest[id],
    rawSkill=stage.diff===0?.75:stage.diff===1?1.05:1.38,
    sample={skill:rawSkill,isPlayer:false},seed=2026101600+Number(id);
  if(!stage||!Number.isFinite(baseline))throw Error('Missing pinned AI stage fixture '+id);
  const configured=tuneOpponentField([sample],stage);
  // Boss stage 13 overrides normal AICar skill in RacingCareer.begin.
  const newSkill=id==='13'?1.58:id==='16'?1.35:sample.skill;
  const was=runAi(revised[stage.course],baseline,seed);
  const now=runAi(revised[stage.course],newSkill,seed);
  const improvementPercent=+((1-now.timeSec/was.timeSec)*100).toFixed(2);
  if(!Number.isFinite(improvementPercent)||improvementPercent>11||
     improvementPercent< -2.5 ||
     ['01','09','12','13','15','16'].includes(id)&&Math.abs(improvementPercent)>.15)
    throw Error('Native stage AI pace unexpectedly distorted: '+id+' '+improvementPercent+'%');
  stageAI[id]={course:stage.course,kind:stage.kind,originalSkill:baseline,
    nextSkill:newSkill,oldTime:was.timeSec,newTime:now.timeSec,
    improvementPercent,adjusted:configured.adjusted};
}
const report={schemaVersion:1,buildHash:build.buildHash,
  sourceRevision:build.sourceRevision,twoLaps:true,seededNativeAi:true,
  noRubberBand:true,noWeapons:true,noPlayer:true,noCollision:true,
  limitation:'Native AICar.update against real pinned Track centerline; NOT real player handling, opponent rank, natural campaign, or winning evidence',
  stageAI,bossThreeLaps,maps:data};
const out=path.join(run,'artifacts/racing-v3-smoke');
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'ai-pace-v33.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({stageAI,buildHash:report.buildHash,lapCount:2,deltaPercent:Object.fromEntries(
  Object.entries(data).map(([key,entry])=>[key,entry.deltaPercent]))}));
