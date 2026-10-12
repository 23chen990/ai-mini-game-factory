/** Offline arithmetic only. This module never reads photos or calls a provider. */
const integer = n => Number.isSafeInteger(n) && n >= 0;
const text = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 200;
const qualities = ['identity','target','nonTarget','artifactFree','keep'];
function validAttempt(a) {
  return a && text(a.id) && ['succeeded','failed','cancelled','uncertain'].includes(a.status) &&
    integer(a.elapsedMs) && (a.costMicros === null || integer(a.costMicros)) &&
    (a.quality === null || (text(a.reviewer) && qualities.every(k => typeof a.quality[k] === 'boolean')));
}
const usable = a => a.status === 'succeeded' && a.quality !== null && qualities.every(k => a.quality[k] === true);
const sum = values => {
  const total=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(total))throw new Error('Total exceeds safe integer range');return total;
};
/**
 * Each session is one photo x task x provider-profile. Include every attempt,
 * including failed, uncertain and cancelled requests. Do not send car photos.
 * Cost units are one millionth of the explicitly declared currency (not credits).
 */
export function analyzeFormSessions(input) {
  if(!input || input.status!=='RECORDED' || !/^[A-Z]{3}$/.test(input.currency) || !Array.isArray(input.sessions) ||
    input.sessions.length<1 || input.sessions.length>1000)throw new Error('Invalid or unrun benchmark');
  const ids=new Set();const attempts=[];const sessions=[];
  for(const session of input.sessions) {
    if(!session || !text(session.id) || ids.has(session.id) || !text(session.photoId) || !text(session.providerProfile) ||
      !['paint','wheels','style'].includes(session.task) || !Array.isArray(session.attempts) || session.attempts.length<1 || session.attempts.length>100)throw new Error('Invalid session');
    ids.add(session.id);const attemptIds=new Set();
    for(const a of session.attempts) {
      if(!validAttempt(a)||attemptIds.has(a.id))throw new Error('Invalid or duplicate attempt');
      attemptIds.add(a.id);attempts.push(a);
    }
    const first=session.attempts.findIndex(usable);const known=session.attempts.every(a=>a.costMicros!==null);
    sessions.push({id:session.id,photoId:session.photoId,task:session.task,providerProfile:session.providerProfile,
      attempts:session.attempts.length,firstUsableAttempt:first<0?null:first+1,
      timeToFirstUsableMs:first<0?null:sum(session.attempts.slice(0,first+1).map(a=>a.elapsedMs)),
      totalElapsedMs:sum(session.attempts.map(a=>a.elapsedMs)),costMicros:known?sum(session.attempts.map(a=>a.costMicros)):null});
  }
  const knownCostMicros=sum(attempts.filter(a=>a.costMicros!==null).map(a=>a.costMicros));
  const unknownCostAttempts=attempts.filter(a=>a.costMicros===null).length;
  const totalCostMicros=unknownCostAttempts?null:knownCostMicros;
  const successes=sessions.filter(s=>s.firstUsableAttempt!==null);const outputs=attempts.filter(usable).length;
  return {currency:input.currency,sessionCount:sessions.length,attemptCount:attempts.length,
    technicallySucceeded:attempts.filter(a=>a.status==='succeeded').length,
    usableOutputs:outputs,usableSessions:successes.length,failedSessions:sessions.length-successes.length,
    firstAttemptUsableSessions:sessions.filter(s=>s.firstUsableAttempt===1).length,
    firstAttemptUsableRate:sessions.filter(s=>s.firstUsableAttempt===1).length/sessions.length,
    unknownCostAttempts,knownCostMicros,totalCostMicros,
    costPerUsableOutputMicros:totalCostMicros===null||outputs===0?null:totalCostMicros/outputs,
    costPerUsableSessionMicros:totalCostMicros===null||successes.length===0?null:totalCostMicros/successes.length,
    meanAttemptsToFirstUsableAmongSuccessfulSessions:successes.length?sum(successes.map(s=>s.firstUsableAttempt))/successes.length:null,
    meanTimeToFirstUsableAmongSuccessfulSessionsMs:successes.length?sum(successes.map(s=>s.timeToFirstUsableMs))/successes.length:null,
    sessions,origin:'RECORDED_INPUT_NOT_INDEPENDENTLY_VERIFIED',
    limitation:'Conditional averages exclude unsuccessful sessions; failedSessions is always reported. Inputs require independent source and reviewer verification. These are not market-wide quality, revenue or profit estimates.'};
}
