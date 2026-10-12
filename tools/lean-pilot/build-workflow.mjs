/* global URL */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createRun } from './runner.mjs';
import { safeRead } from './policy.mjs';
import { planWorkflow, auditContract, canonical, sha256 } from '../../.agents/skills/gameplay-loop-review/scripts/workflow.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
/** Explicit local build of a code-backed hypothesis, never a generic natural-language compiler. */
export async function buildClinic(base,runId){
  if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runId))throw new Error('Invalid run id');
  const inputRoot=path.join(ROOT,'examples/lean-pilot/clinic');
  const request=JSON.parse((await safeRead(inputRoot,'request.json')).toString('utf8'));
  const contract=JSON.parse((await safeRead(inputRoot,'contract.json')).toString('utf8'));
  const candidate=JSON.parse((await safeRead(ROOT,'templates/web-lite/clinic-queue-v1/candidate.json')).toString('utf8'));
  if(candidate.implementationContractHash!==sha256(canonical(contract)))throw new Error('Recipe specification changed: review implementation and tests before rebinding');
  if(request.profile!=='STRATEGIC_SYSTEM'||request.platform!=='web-lite'||request.progression!=='session'||request.mode!=='discover')throw new Error('This candidate does not implement the requested experience');
  request.gameId=runId;contract.gameId=runId;contract.requestHash=sha256(canonical(request));
  const plan=await planWorkflow(request,inputRoot);const review=await auditContract(request,contract,inputRoot);
  if(plan.status!=='WORK_ORDER_READY'||review.status!=='SPEC_READY_FOR_PROTOTYPE_REVIEW')throw new Error('Workflow is blocked: '+[...plan.blockers,...review.blockers].join(','));
  const result=await createRun(base,runId,'clinic',{templateId:'clinic-queue-v1',workflow:{'request.json':request,'contract.json':contract}});
  await writeFile(path.join(base,runId,'work-order.json'),JSON.stringify({plan,review,execution:{kind:'EXPLICIT_LOCAL_CANDIDATE_BUILD',providerCalls:0,reaExecuted:false,source:'CURATED_CODE_RECIPE',scope:'One source-informed original hypothesis. No other spec/profile is automatically implemented.'}},null,2)+'\n',{flag:'wx',mode:0o600});
  return {...result,templateId:'clinic-queue-v1',profile:request.profile,sourceEvidence:'CODE_READ_NOT_COMPETITOR_PLAY',researchUnknowns:['REA_NOT_RUN','REFERENCE_RUNTIME_NOT_OBSERVED','HUMANS_NOT_RUN'],nextCommands:[`npm run pilot -- check ${runId}`,`npm run pilot -- browser ${runId}`,`npm run pilot -- serve ${runId}`,`npm run pilot -- export ${runId}`,`npm run pilot -- handoff ${runId}`],paidModelCalls:0,publishable:false};
}
