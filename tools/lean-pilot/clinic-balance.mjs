/* global process, console */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadRun, verifyRunInputs, buildHash } from './runner.mjs';

/** Candidate-only deterministic counterfactuals, not observed behavior of the reference or humans. */
export async function comparePolicies(game,seed=2026){
  const {createInitial,act,tick,inspect,CONFIG}=await import(pathToFileURL(path.join(game,'engine.mjs')).href);
  const results=[];
  for(const policy of ['no-intervention','front-desk-only','adaptive-investment']){
    let s=act(createInitial(seed),{type:'start'});
    while(s.status==='running'){
      if(s.timeMs%2000===0){
        if(policy==='front-desk-only')s=act(s,{type:'assign',station:'intake'});
        if(policy==='adaptive-investment'){
          if(!s.equipment&&s.cash>=CONFIG.equipmentCost)s=act(s,{type:'buy',item:'equipment'});
          else if(!s.room2&&s.cash>=CONFIG.roomCost+CONFIG.doctorCost)s=act(s,{type:'buy',item:'room'});
          else if(s.room2&&!s.doctor2&&s.cash>=CONFIG.doctorCost)s=act(s,{type:'buy',item:'doctor'});
          const q=inspect(s);const target=q.intakeQueue*CONFIG.intakeMs>(q.careQueue+1)*q.careMs/(s.doctor2?2:1)?'intake':'care';
          s=act(s,{type:'assign',station:target});
        }
      }
      s=tick(s);
    }
    results.push({policy,arrived:s.arrived,completed:s.completed,lost:s.lost,unfinished:inspect(s).unfinished,intakeLoss:s.lossReasons.intake,careLoss:s.lossReasons.care,peakQueue:s.peakQueue,totalQueueWaitSeconds:s.totalWaitMs/1000,cash:s.cash,income:s.income,investment:s.spent,wages:s.wages,equipment:s.equipment,room2:s.room2,doctor2:s.doctor2});
  }
  return {seed,simulatedSeconds:180,kind:'CANDIDATE_DETERMINISTIC_COUNTERFACTUAL',buildHash:await buildHash(game),results,human:'NOT_RUN',competitorRuntime:'NOT_OBSERVED',claim:'These policies demonstrate an implemented consequence difference, not optimality or enjoyment.'};
}
export async function compareRun(base,id){const {run,root,game}=await loadRun(base,id);if(run.templateId!=='clinic-queue-v1')throw new Error('No comparison for this candidate');await verifyRunInputs(root,run);return comparePolicies(game);}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const base=path.resolve('runs');compareRun(base,process.argv[2]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
