/* global process, setTimeout, clearTimeout */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeRead, sha256 } from './policy.mjs';
import { buildHash } from './runner.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const result=(id,passed,route,evidence)=>({id,passed:passed===true,route,evidence});
export const RULE_IDS=['upgrade-has-measured-effect','unassisted-backlog-and-attributable-loss','same-arrivals-not-scripted-success','intervention-can-recover','room-doctor-dependency','investment-is-paid','travel-is-not-instant','pause-and-saves-are-honest','accounting-and-settlement'];
/** Nine categories remain compatible; active-dispatch now has real negative baselines. */
export function judgeClinic(e){
 if(!e||e.kind!=='ENGINE_SIMULATION'||!Array.isArray(e.profiles)||e.profiles.length<3||!e.facts||!e.parameters)throw new Error('Invalid probe evidence');
 const p=e.parameters,f=e.facts,rows=e.profiles,a=e.active;
 const activeCovered=a?.rulesVersion===2&&a.goal===26&&a.maxLost===5&&Array.isArray(a.singleAction)&&a.singleAction.length===120&&new Set(a.singleAction.map(x=>[x.seed,x.policy,x.at].join(':'))).size===120&&a.singleAction.every(x=>x.actions<=1&&!x.passed);
 const pressure=a?.openingQueues?.length===rows.length&&a.openingQueues.every(x=>x.firstQueueMs>0&&x.firstQueueMs<=10000&&x.firstWarningMs>0&&x.firstWarningMs<=30000&&x.firstLossMs-x.firstWarningMs>=5000);
 return [
 result('upgrade-has-measured-effect',rows.every(r=>r.upgraded.firstIncomeMs<r.none.firstIncomeMs&&r.upgraded.completed>r.none.completed),'IMPLEMENTATION',rows.map(r=>({seed:r.seed,base:r.none.completed,upgrade:r.upgraded.completed,firstBase:r.none.firstIncomeMs,firstUpgrade:r.upgraded.firstIncomeMs}))),
 result('unassisted-backlog-and-attributable-loss',activeCovered&&pressure&&rows.every(r=>r.none.lost>0&&r.intake.lossReasons.care>0),'DESIGN',{activeMode:'active-dispatch',singleActionScenarios:a?.singleAction??[],opening:a?.openingQueues??[],reason:'Actual early queue, warned recovery window, and no one-action success across delayed timings; not a forced action-count goal.'}),
 result('same-arrivals-not-scripted-success',rows.every(r=>[r.intake,r.care,r.upgraded,r.adaptive].every(x=>x.arrived===r.none.arrived)),'IMPLEMENTATION',rows.map(r=>({seed:r.seed,arrivals:[r.none,r.intake,r.care,r.upgraded,r.adaptive].map(v=>v.arrived)}))),
 result('intervention-can-recover',a?.passingAdaptive===rows.length&&rows.every(r=>r.adaptive.completed>r.none.completed&&r.adaptive.lost<r.none.lost&&r.adaptive.objectivePassed),'DESIGN',rows.map(r=>({seed:r.seed,default:r.none.completed,adaptive:r.adaptive.completed,loss:r.adaptive.lost,objective:r.adaptive.objectivePassed}))),
 result('room-doctor-dependency',f.roomBought&&f.roomAloneCapacity===1&&f.doctorWithoutRoom===false,'IMPLEMENTATION',{roomAloneCapacity:f.roomAloneCapacity,doctorWithoutRoom:f.doctorWithoutRoom}),
 result('investment-is-paid',f.roomCashDelta===p.roomCost&&f.equipmentCashDelta===p.equipmentCost,'IMPLEMENTATION',{room:f.roomCashDelta,equipment:f.equipmentCashDelta}),
 result('travel-is-not-instant',f.beforeArrivalTravel>0&&f.afterArrivalTravel===0&&f.arrivalStation==='care','IMPLEMENTATION',{before:f.beforeArrivalTravel,after:f.afterArrivalTravel,station:f.arrivalStation}),
 result('pause-and-saves-are-honest',f.pausedFrozen&&f.saveRoundTrip&&f.foreignSaveRejected&&f.invalidSaveRejected,'IMPLEMENTATION',f),
 result('accounting-and-settlement',rows.every(r=>[r.none,r.intake,r.care,r.upgraded,r.adaptive].every(x=>x.status==='finished'&&x.timeMs===180000&&x.cash===p.startCash+x.income-x.spent-x.wages&&x.income===x.completed*p.fee&&x.arrived===x.completed+x.lost+x.unfinished)),'IMPLEMENTATION',rows.map(r=>r.adaptive)),
 ];
}
// Finite narrative graph checks remain a different profile, not active-dispatch requirements.
export function judgeStory(story){
 if(!story||!Array.isArray(story.nodes)||!story.nodes.length||story.nodes.length>100||typeof story.start!=='string')throw new Error('Invalid narrative fixture');
 const nodes=story.nodes,ids=new Set(nodes.map(n=>n?.id));
 const valid=ids.size===nodes.length&&ids.has(story.start)&&nodes.every(n=>n&&typeof n.id==='string'&&typeof n.text==='string'&&n.text.trim()&&Array.isArray(n.choices)&&n.choices.every(c=>c&&ids.has(c.next))&&['requires','grants'].every(k=>n[k]===undefined||Array.isArray(n[k])&&n[k].every(v=>typeof v==='string')));
 if(!valid)return[result('story-links-resolve',false,'IMPLEMENTATION',{reason:'Missing/duplicate nodes or malformed choices/knowledge'})];
 const byId=new Map(nodes.map(n=>[n.id,n])),reached=new Set(),visited=new Set(),queue=[{id:story.start,known:[...(story.initialKnowledge??[])]}];let epistemic=true,overflow=false;
 while(queue.length){const{id,known}=queue.shift(),signature=id+':'+JSON.stringify([...new Set(known)].sort());if(visited.has(signature))continue;visited.add(signature);reached.add(id);if(visited.size>1000){overflow=true;break;}const n=byId.get(id);if(!(n.requires??[]).every(k=>known.includes(k)))epistemic=false;const nextKnown=[...new Set([...known,...(n.grants??[])])];for(const c of n.choices)queue.push({id:c.next,known:nextKnown});}
 const choices=nodes.filter(n=>reached.has(n.id)&&n.choices.length>1),meaningful=choices.length>0&&choices.every(n=>new Set(n.choices.map(c=>c.next)).size>1&&new Set(n.choices.map(c=>byId.get(c.next).text.trim())).size>1);
 const endings=nodes.filter(n=>reached.has(n.id)&&n.choices.length===0),canEnd=new Set(endings.map(n=>n.id));let changed=true;
 while(changed){changed=false;for(const n of nodes)if(!canEnd.has(n.id)&&n.choices.some(c=>canEnd.has(c.next))){canEnd.add(n.id);changed=true;}}
 return[result('story-links-resolve',true,'IMPLEMENTATION',{reached:[...reached],nodes:nodes.length}),result('choice-has-visible-consequence',meaningful,'DESIGN',{branchNodes:choices.map(n=>n.id)}),result('finite-story-has-payoff',!overflow&&endings.length>0&&endings.every(n=>typeof n.payoff==='string'&&n.payoff.trim())&&[...reached].every(id=>canEnd.has(id)),'DESIGN',{endings:endings.map(n=>n.id),overflow}),result('knowledge-has-a-source',epistemic&&!overflow,'DESIGN',{statesChecked:visited.size,scope:'Declared graph only; prose quality is unverified'})];
}
function executeProbe(game,timeoutMs){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[path.join(HERE,'quality-probe.mjs'),game],{cwd:HERE,shell:false,env:{PATH:process.env.PATH??'',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
 let out='',err='',exceeded=false;const cap=1024*1024;
 const append=(which,chunk)=>{if(which==='out')out+=chunk;else err+=chunk;if(out.length+err.length>cap){exceeded=true;child.kill('SIGKILL');}};
 child.stdout.on('data',x=>append('out',x));child.stderr.on('data',x=>append('err',x));
 const timer=setTimeout(()=>{exceeded=true;child.kill('SIGKILL');},timeoutMs);
 child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);if(code!==0||exceeded)return reject(new Error(exceeded?'QA probe budget exceeded':'QA probe could not execute: '+err.slice(0,400)));try{resolve(JSON.parse(out));}catch{reject(new Error('QA probe returned invalid evidence'));}});
});}
export async function reviewCandidate(game,{timeoutMs=60000}={}){
 game=path.resolve(game);const before=await buildHash(game),candidate=JSON.parse((await safeRead(game,'candidate.json')).toString());
 if(candidate.templateId!=='clinic-queue-v1')return{schemaVersion:1,buildHash:before,status:'UNSUPPORTED',passed:false,checks:[],findings:[],human:'NOT_RUN',note:'Use the declared profile adapter, not clinic substitution.'};
 let evidence;try{evidence=await executeProbe(game,timeoutMs);}catch(error){
  if(await buildHash(game)!==before)throw new Error('Candidate changed during failed rule review');
  return{schemaVersion:1,buildHash:before,status:'CHANGES_REQUIRED',passed:false,reviewer:'DETERMINISTIC_EXECUTION_REVIEW',checks:[{id:'candidate-execution-error',passed:false,route:'IMPLEMENTATION',evidence:String(error.message).slice(0,500)}],findings:[{id:'candidate-execution-error',severity:'blocker',route:'IMPLEMENTATION',summary:'Candidate could not complete the isolated rule probe',evidence:String(error.message).slice(0,500)}],human:'NOT_RUN',fun:'NOT_CERTIFIED'};
 }
 if(await buildHash(game)!==before)throw new Error('Candidate changed during independent rule review');
 const checks=judgeClinic(evidence),findings=checks.filter(c=>!c.passed).map(c=>({id:c.id,severity:'blocker',route:c.route,summary:'Observed candidate violates '+c.id,evidence:c.evidence,acceptance:'Repeat these actual counterfactual scenarios; never edit the check to force a pass.'}));
 return{schemaVersion:1,buildHash:before,status:findings.length?'CHANGES_REQUIRED':'RULE_CHECKS_PASSED',passed:!findings.length,reviewer:'DETERMINISTIC_COUNTERFACTUAL_REVIEW',checks,findings,evidenceHash:sha256(JSON.stringify(evidence)),evidence,human:'NOT_RUN',fun:'NOT_CERTIFIED',note:'Delayed one-action sweeps and three seeded schedules; not optimal play or human preference.'};
}
