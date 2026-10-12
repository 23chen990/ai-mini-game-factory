import path from 'node:path';
import {mkdir,writeFile,rename,open,rm,readdir,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {safeRead,sha256} from './policy.mjs';
import {loadRun,verifyRunInputs,buildHash,checkRun,reportRun} from './runner.mjs';
import {candidateSpec} from './candidates.mjs';
import {reviewCandidate,RULE_IDS} from './quality-review.mjs';
import {VISIBLE_IDS} from './quality-browser.mjs';
import {standaloneHtml} from './standalone.mjs';
const EDITABLE=['engine.mjs','main.mjs','style.css','index.html','themes.mjs'];
const HERE=path.dirname(fileURLToPath(import.meta.url)),REPO=path.resolve(HERE,'../..');
const isHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),integer=v=>Number.isSafeInteger(v)&&v>=0;
async function json(root,name){return JSON.parse((await safeRead(root,name)).toString());}
async function writeJson(root,name,v){const temporary='.'+name+'.'+randomUUID()+'.tmp';try{await writeFile(path.join(root,temporary),JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});await rename(path.join(root,temporary),path.join(root,name));}finally{await rm(path.join(root,temporary),{force:true});}}
async function optional(root,name){try{return await json(root,name);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function qualityPolicyHash(){const entries=[];for(const name of ['quality-cycle.mjs','quality-review.mjs','quality-probe.mjs','quality-browser.mjs'])entries.push([name,sha256(await safeRead(HERE,name))]);return sha256(JSON.stringify(entries));}
const validLimits=l=>l&&['maxRepairAttempts','maxWallMs'].every(k=>integer(l[k]))&&l.maxRepairAttempts<=2&&l.maxWallMs>=1000&&l.maxWallMs<=600000;
export async function treeHashes(root,prefix=''){
 const out=[];if(prefix.split('/').length>8)throw Error('Workspace nesting exceeds scope');
 for(const name of(await readdir(path.join(root,prefix))).sort()){const rel=prefix?prefix+'/'+name:name,st=await lstat(path.join(root,rel));if(st.isSymbolicLink())throw Error('Symlinks are not permitted in a reviewed workspace');if(st.isDirectory())out.push(...await treeHashes(root,rel));else if(st.isFile())out.push([rel,sha256(await safeRead(root,rel))]);else throw Error('Unsupported workspace entry');if(out.length>200)throw Error('Workspace exceeds bounded review scope');}return out;
}
export async function applyQualityPatch(game,patches,expectedBuild,backupRoot){
 if(await buildHash(game)!==expectedBuild)throw Error('Repair is stale: game changed after review');
 if(!Array.isArray(patches)||!patches.length||patches.length>5||new Set(patches.map(p=>p?.path)).size!==patches.length)throw Error('Invalid repair patch set');
 const backups=[];for(const p of patches){if(!p||!EDITABLE.includes(p.path)||!isHash(p.beforeHash)||typeof p.content!=='string'||p.content.length>150000)throw Error('Repair exceeds authorized game-file scope');const before=await safeRead(game,p.path);if(sha256(before)!==p.beforeHash)throw Error('Repair file preimage changed');if(before.toString()===p.content)throw Error('No-op repair');backups.push({path:p.path,before,after:p.content});}
 await mkdir(backupRoot,{recursive:true});for(const b of backups)await writeFile(path.join(backupRoot,b.path),b.before,{flag:'wx',mode:0o600});
 try{for(const b of backups)await writeFile(path.join(game,b.path),b.after,{flag:'w'});}catch(e){for(const b of backups)await writeFile(path.join(game,b.path),b.before);throw e;}
 return backups.map(b=>({path:b.path,beforeHash:sha256(b.before),afterHash:sha256(b.after)}));
}
/** Exact, previously reviewed regression patches. Not autonomous experience design. */
export async function knownClinicRepair(game,issues){
 const source=(await safeRead(game,'engine.mjs')).toString(),ids=new Set(issues.map(i=>i.id));let changed=source;
 if(ids.has('upgrade-has-measured-effect')&&changed.includes('upgradedCareMs:8500'))changed=changed.replace('upgradedCareMs:8500','upgradedCareMs:5000');
 if(ids.has('room-doctor-dependency')&&changed.includes('careCapacity:s.room2?2:1'))changed=changed.replace('careCapacity:s.room2?2:1','careCapacity:s.doctor2?2:1');
 const patches=[];if(changed!==source)patches.push({path:'engine.mjs',beforeHash:sha256(source),content:changed});
 if(ids.has('touch-targets')){const css=(await safeRead(game,'style.css')).toString();if(css.includes('--tap-size:28px'))patches.push({path:'style.css',beforeHash:sha256(css),content:css.replace('--tap-size:28px','--tap-size:44px')});}
 return{kind:'DETERMINISTIC_REVIEWED_FIX',patches,modelCalls:0,unsupported:issues.filter(i=>!['upgrade-has-measured-effect','room-doctor-dependency','touch-targets'].includes(i.id)).map(i=>i.id)};
}
function validateReview(value){
 if(!value||typeof value.passed!=='boolean'||!Array.isArray(value.checks)||!value.checks.length||!Array.isArray(value.findings)||value.passed!==(value.checks.every(c=>c&&c.passed===true)&&value.findings.length===0)||new Set(value.checks.map(c=>c?.id)).size!==value.checks.length)throw Error('Invalid reviewer output');
 if(value.findings.some(i=>!i||typeof i.id!=='string'||!['IMPLEMENTATION','DESIGN','RESEARCH'].includes(i.route)))throw Error('Invalid finding route');
}
/** No new Agent. Fast negative/visible checks precede the expensive default-speed journey. */
export async function prepareCandidate(base,id,options={}){
 const{root,game,run}=await loadRun(base,id);await verifyRunInputs(root,run);
 if(run.templateId!=='clinic-queue-v1')return{runId:id,status:'PROFILE_REVIEW_NOT_IMPLEMENTED',previewReady:false,publishable:false};
 const directory=path.join(root,'quality');await mkdir(directory,{recursive:true});if((await lstat(directory)).isSymbolicLink())throw Error('Unsafe quality directory');
 const lock=await open(path.join(root,'.quality-lock'),'wx',0o600),now=options.now??Date.now,started=now();let state,owned=false;
 const remaining=()=>state.limits.maxWallMs-state.elapsedMs-(now()-started);
 const finish=async status=>{state.status=status;state.elapsedMs+=Math.max(0,now()-started);state.pending=false;state.updatedAt=new Date().toISOString();state.previewReady=status==='INTERNAL_CHECKS_PASSED';if(!state.previewReady)delete state.previewPath;state.ownerAction=state.previewReady?'ONE_OPTIONAL_PRODUCT_REVIEW':status==='BUDGET_STOP'?'ONE_SCOPE_OR_BUDGET_DECISION':'NONE_FOR_ROUTINE_REPAIR';state.humanValidation='NOT_RUN';state.independentModelReview='NOT_RUN';state.publishable=false;await writeJson(directory,'state.json',state);return state;};
 try{
  const policyHash=await qualityPolicyHash(),existing=await optional(directory,'state.json');
  if(existing){state=existing;if(state.runId!==id||state.policyHash!==policyHash||!integer(state.elapsedMs)||!integer(state.attempts)||!Array.isArray(state.history)||typeof state.pending!=='boolean'||!validLimits(state.limits)||state.limitsHash!==sha256(JSON.stringify(state.limits)))throw Error('Quality policy or identity changed; explicit developer reconciliation required');if(state.pending)throw Error('Interrupted internal review needs developer reconciliation; budget retained');if(options.limits&&JSON.stringify(options.limits)!==JSON.stringify(state.limits))throw Error('Cannot reset limits on resume');}
  else{const limits=options.limits??{maxRepairAttempts:2,maxWallMs:600000};if(!validLimits(limits))throw Error('Invalid quality limits');state={schemaVersion:1,runId:id,policyHash,limits,limitsHash:sha256(JSON.stringify(limits)),elapsedMs:0,attempts:0,pending:false,history:[],buildHash:await buildHash(game),status:'INTERNAL_REVIEW',previewReady:false,modelCalls:0,ownerInterruptionsObserved:null,ownerMinutesSaved:null};}
  if(remaining()<=0)return await finish('BUDGET_STOP');state.pending=true;owned=true;await writeJson(directory,'state.json',state);
  while(true){
   if(remaining()<=0)return await finish('BUDGET_STOP');await verifyRunInputs(root,run);const before=await buildHash(game),protectedBefore=await treeHashes(game);
   const scan=await(options.inspect??reviewCandidate)(game,{timeoutMs:Math.max(1,Math.min(60000,remaining()))});
   if(remaining()<=0)return await finish('BUDGET_STOP');if(scan.buildHash!==before||await buildHash(game)!==before)throw Error('Reviewer did not inspect the current build');validateReview(scan);
   const serial=state.history.length+1;await writeJson(directory,'review-'+serial+'.json',scan);const issues=[...scan.findings];let browser=null,engineering=null,visual=null;
   if(scan.passed){
    if(!options.visible&&remaining()<45000)return await finish('BUDGET_STOP');
    const {reviewBrowser}=await import('./quality-browser.mjs');visual=await(options.visible??reviewBrowser)(base,id,{suffix:'round-'+serial});await writeJson(directory,'visible-'+serial+'.json',visual);
    if(visual.outcome==='ENVIRONMENT_BLOCKED')return await finish('ENVIRONMENT_BLOCKED');validateReview(visual);if(visual.buildHash!==before)throw Error('Visible review build mismatch');if(!visual.passed)issues.push(...visual.findings);
    if(visual.passed){
     if(!options.check&&remaining()<run.budget.maxAttemptMs)return await finish('BUDGET_STOP');engineering=await(options.check??checkRun)(base,id);
     if(!engineering.passed)issues.push({id:'engineering-regression',route:'IMPLEMENTATION',severity:'blocker',summary:'Native regression failed; retain TAP and do not relax tests'});
     if(engineering.passed){
      if(!options.browser&&remaining()<run.budget.maxAttemptMs)return await finish('BUDGET_STOP');
      browser=await(options.browser??(async()=>{const module=await import(pathToFileURL(path.join(REPO,candidateSpec(run.templateId).browserScript)).href);return module.browserQa(id,{base});}))(base,id);
      if(browser.outcome==='ENVIRONMENT_BLOCKED'){state.history.push({buildHash:before,review:'review-'+serial+'.json',outcome:'ENVIRONMENT_BLOCKED'});return await finish('ENVIRONMENT_BLOCKED');}
      if(!browser.passed)issues.push(...(browser.findings?.length?browser.findings:[{id:'browser-regression',route:'IMPLEMENTATION',severity:'blocker',summary:'HTTP browser tests failed'}]));
     }
    }
   }
   state.buildHash=await buildHash(game);if(JSON.stringify(await treeHashes(game))!==JSON.stringify(protectedBefore))throw Error('A reviewer changed workspace files');await verifyRunInputs(root,run);if(state.buildHash!==before)throw Error('Checks modified the candidate');
   state.history.push({buildHash:before,review:'review-'+serial+'.json',reviewHash:sha256(await safeRead(directory,'review-'+serial+'.json')),visible:visual?'visible-'+serial+'.json':null,findings:issues.map(i=>i.id),engineering:engineering?.passed??null,browser:browser?.passed??null});await writeJson(directory,'state.json',state);if(remaining()<=0)return await finish('BUDGET_STOP');
   if(!issues.length){
    const gate=await(options.report??reportRun)(base,id);if(gate.engineering!=='PASS'||gate.browser!=='PASS')return await finish('EVIDENCE_STALE');await verifyRunInputs(root,run);const bundle=await standaloneHtml(game,run.theme,id);if(bundle.buildHash!==before)throw Error('Export build changed');
    const name='review-'+before.slice(0,12)+'.html',previous=await optional(directory,'delivery.json');
    if(!previous||previous.buildHash!==before){await writeFile(path.join(directory,name),bundle.html,{flag:'wx',mode:0o600});}
    else if(sha256(await safeRead(directory,previous.path))!==previous.sha256)throw Error('Previous delivery bytes changed');
    // Always bind the latest actual reviews, including a same-build rerun.
    await writeJson(directory,'delivery.json',{runId:id,buildHash:before,path:name,sha256:sha256(bundle.html),policyHash:state.policyHash,reviewPath:'review-'+serial+'.json',reviewHash:sha256(await safeRead(directory,'review-'+serial+'.json')),visiblePath:'visible-'+serial+'.json',visibleHash:sha256(await safeRead(directory,'visible-'+serial+'.json')),scope:'INTERNALLY_TESTED_PREVIEW_NOT_RELEASE',human:'NOT_RUN',publishable:false});
    state.previewPath=path.join(directory,name);return await finish('INTERNAL_CHECKS_PASSED');
   }
   await writeJson(directory,'developer-action.json',{runId:id,buildHash:before,issues,allowedFiles:EDITABLE,protected:['tests/','input/','evidence/','candidate.json'],ownerQuestionRequired:false,instruction:'Resolve within approved product scope and re-run prepare; preserve failures and budgets. Never use a green engineering report to dismiss a reported experience failure.'});
   if(state.attempts>=state.limits.maxRepairAttempts)return await finish('REPAIR_LIMIT_STOP');const treeBefore=await treeHashes(game);
   const response=await(options.repairer??knownClinicRepair)(game,issues,{runId:id,buildHash:before,remainingMs:remaining()});
   if(JSON.stringify(await treeHashes(game))!==JSON.stringify(treeBefore))throw Error('Repairer mutated the live workspace instead of returning patches');if(!response||!Array.isArray(response.patches))throw Error('Invalid repair response');if(response.modelCalls!==0)throw Error('Unapproved model use: run the explicitly authorized worker path separately');
   if(!response.patches.length)return await finish(issues.some(i=>i.route==='DESIGN')?'DESIGN_REPAIR_REQUIRED':'DEVELOPER_REPAIR_REQUIRED');if(remaining()<=0)return await finish('BUDGET_STOP');
   const next=state.attempts+1;state.attempts=next;await writeJson(directory,'state.json',state);const changed=await applyQualityPatch(game,response.patches,before,path.join(directory,'attempt-'+next)),after=await buildHash(game);if(after===before)throw Error('Repair did not change game bytes');state.history.push({kind:'repair',attempt:next,beforeHash:before,afterHash:after,changed,provider:response.kind,modelCalls:0});await writeJson(directory,'state.json',state);
  }
 }catch(e){if(state&&owned){state.error=String(e?.message??e).slice(0,500);await finish('INTERNAL_ERROR');}throw e;}finally{await lock.close();await rm(path.join(root,'.quality-lock'),{force:true});}
}
function exactPassed(checks,ids){return Array.isArray(checks)&&checks.length===ids.length&&new Set(checks.map(c=>c?.id)).size===ids.length&&ids.every(id=>checks.some(c=>c.id===id&&c.passed===true));}
export async function readDelivery(base,id){
 const{root,game,run}=await loadRun(base,id),directory=path.join(root,'quality'),state=await optional(directory,'state.json');if(!state)return{status:'NOT_RUN',previewReady:false,publishable:false};const blocked=reason=>({status:'STALE_OR_BLOCKED',previewReady:false,publishable:false,reason});
 if(state.pending||state.status!=='INTERNAL_CHECKS_PASSED')return blocked(state.status);
 const hash=await buildHash(game),receipt=await optional(directory,'delivery.json');if(state.buildHash!==hash||state.policyHash!==await qualityPolicyHash()||!receipt||receipt.buildHash!==hash||receipt.policyHash!==state.policyHash)return blocked('candidate-or-policy-changed');
 try{
  await verifyRunInputs(root,run);for(const [p,h]of[[receipt.path,receipt.sha256],[receipt.reviewPath,receipt.reviewHash],[receipt.visiblePath,receipt.visibleHash]])if(sha256(await safeRead(directory,p))!==h)return blocked('delivery-evidence-changed');
  const rule=await json(directory,receipt.reviewPath),visual=await json(directory,receipt.visiblePath),browser=await json(root,'browser.json');
  if(rule.passed!==true||rule.buildHash!==hash||!exactPassed(rule.checks,RULE_IDS))return blocked('rule-evidence-invalid');
  if(visual.passed!==true||visual.scope!=='HTTP_VISIBLE_INTERACTION'||visual.buildHash!==hash||!exactPassed(visual.checks,VISIBLE_IDS)||!Array.isArray(visual.artifacts)||visual.artifacts.length!==6||new Set(visual.artifacts.map(a=>a.path)).size!==6)return blocked('visible-evidence-invalid');
  for(const artifact of visual.artifacts)if(sha256(await safeRead(directory,visual.artifactRoot+'/'+artifact.path))!==artifact.sha256)return blocked('visible-image-changed');
  const journey=browser.checks?.find(c=>c.name==='clinic-natural-settlement-replay');if(browser.defaultSpeed!==1||browser.rulesRevision!==2||journey?.speed!==1||journey?.simulatedSeconds!==180||!Number.isFinite(journey?.elapsedWallMs)||journey.elapsedWallMs<179000||journey?.goalPassed!==true)return blocked('default-speed-evidence-missing');
  const gate=await reportRun(base,id);if(gate.engineering!=='PASS'||gate.browser!=='PASS')return blocked('engineering-or-browser-stale');return{status:'INTERNAL_CHECKS_PASSED',previewReady:true,path:path.join(directory,receipt.path),buildHash:hash,repairAttempts:state.attempts,human:'NOT_RUN',publishable:false};
 }catch{return blocked('missing-or-unreadable-evidence');}
}
