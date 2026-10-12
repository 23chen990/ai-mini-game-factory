import { safeRead, sha256 } from './policy.mjs';
/** Checks declared clinic playtest evidence; cannot authenticate a human or prove population retention. */
export async function evaluateClinicPlaytest(root,review,expected){
  if(!review||review.status==='NOT_RUN')return {passed:false,status:'NOT_RUN',blockers:['human:not-run'],profile:'STRATEGIC_SYSTEM'};
  const blockers=[];
  if(review.status!=='RECORDED'||review.runId!==expected.runId||review.buildHash!==expected.buildHash||review.profile!=='STRATEGIC_SYSTEM'||typeof review.reviewer!=='string'||!review.reviewer.trim()||!Array.isArray(review.participants)||review.participants.length<5||review.participants.length>30)return {passed:false,status:'BLOCKED',blockers:['human:invalid-or-stale']};
  const ids=new Set();let understood=0,continued=0;
  for(const p of review.participants){
    if(!p||typeof p.id!=='string'||ids.has(p.id)||p.source!=='HUMAN'||p.consent!==true||p.uncoached!==true||typeof p.understoodBottleneck!=='boolean'||typeof p.willinglyContinued!=='boolean'||typeof p.retrospectiveValue!=='string'||!p.retrospectiveValue.trim()){blockers.push('human:invalid-session');continue;}
    ids.add(p.id);
    try{if(sha256(await safeRead(root,p.evidencePath))!==p.evidenceHash)blockers.push('human:evidence-mismatch');}catch{blockers.push('human:evidence-unreadable');}
    understood+=Number(p.understoodBottleneck);continued+=Number(p.willinglyContinued);
  }
  if(understood/review.participants.length<.8)blockers.push('human:bottleneck-not-understood');
  if(continued/review.participants.length<.6)blockers.push('human:continuation-below-screen');
  return {passed:!blockers.length,status:blockers.length?'BLOCKED':'SCREEN_PASSED',blockers:[...new Set(blockers)],sampleSize:review.participants.length,understood,continued,retention:'NOT_MEASURED',limitation:'Small-sample screening with declared human evidence, not proof of representativeness, enjoyment or revenue.'};
}
