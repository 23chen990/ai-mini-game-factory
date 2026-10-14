/* global console */
// Close only observed desktop branches; physical-mobile gaps stay explicit blockers.
import {readFile,cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
const read=async p=>JSON.parse(await readFile(path.join(RUN,p),'utf8'));
const build=await read('build-receipt.json'),base=`attempts/attempt-${build.attempt}`;
const campaign=await read(base+'/qa-campaign-webkit/report.json'),collision=await read(base+'/qa-collisions-webkit/report.json'),visual=await read(base+'/visual/report.json'),safety=await read(base+'/qa-safety-webkit/report.json'),lifecycle=await read(base+'/lifecycle/report.json');
for(const r of [campaign,collision,visual])if(!r.passed||r.buildHash!==build.buildHash)throw Error('Current-build core QA missing or failing');
for(const r of [safety,lifecycle])if(r.buildHash!==build.buildHash||r.errors.length)throw Error('Missing current lifecycle/safety diagnostics');
for(const name of ['van-target-distance-reached','van-ends-round','car-not-jumpable','distance-and-fish-jointly-required','replay-resources-plateau'])if(!safety.checks.find(c=>c.name===name)?.passed)throw Error('Safety branch blocked: '+name);
for(const name of ['portrait-to-landscape-live-resize','all-quality-presets-keep-composer-size','offline-single-html-normal-touch-catch'])if(!lifecycle.checks.find(c=>c.name===name)?.passed)throw Error('Lifecycle product check blocked: '+name);
const {PerceptualQaReportSchema}=await tsImport('../../../src/schemas/product-experience.ts',import.meta.url);
const {verifyPerceptualQaReview}=await tsImport('../../../src/core/product-experience-qa.ts',import.meta.url);
const review=PerceptualQaReportSchema.parse(await read('perceptual-qa-report.json'));
for(const c of review.cases){const required=c.featureId==='vehicle-impact'?['vehicle-accident.png','van-impact.png']:c.featureId==='pedestrian-stun'?['pedestrian-wait.png','pedestrian-rising.png','pedestrian-recovery.png']:c.featureId==='jump-clearance'?['barrier-jump.png','barrier-cleared.png']:c.featureId==='camera-start'?[`${c.viewport.width}-menu.png`,`${c.viewport.width}-first-fish.png`]:c.featureId==='camera-replay'?[`${c.viewport.width}-replay.png`]:[];for(const name of required)if(!c.screenshots.some(s=>s.path.endsWith('/'+name)))throw Error('Exact perceptual screenshot missing: '+c.featureId+'/'+name);}
const perceptual=await verifyPerceptualQaReview({runRoot:RUN,workspace:WORKSPACE,contract:await read('product-experience-contract.json'),buildHash:build.buildHash,report:review});
await json(path.join(RUN,'artifacts/perceptual-qa-gate.json'),perceptual);if(!perceptual.passed)throw Error('Independent perceptual QA blocked');
const {deriveRuntimeProductGate,verifyRuntimeWiredFiles}=await tsImport('../../../src/core/runtime-product-gates.ts',import.meta.url);
const files=['workspace/game/index.html',...['main.js','coast-ui.mjs','adventure.mjs','levels.mjs','reward-engine.mjs','reward-adapter.mjs'].map(f=>'workspace/source/pelican-bike/src/'+f)];
const wired=await verifyRuntimeWiredFiles({runRoot:RUN,files});if(!wired.passed)throw Error('Runtime wiring missing: '+wired.blockers.join(','));
const runtime=deriveRuntimeProductGate({naturalFlow:await read('artifacts/natural/campaign.json'),runtimeWiredFiles:files,browserEvidence:[base+'/qa-campaign-webkit/report.json',base+'/qa-collisions-webkit/report.json'],entrypoint:'workspace/game/index.html',defaultMode:'five-level coast adventure',legacyBehavior:{status:'COMPATIBILITY_ONLY',evidence:['build.mjs replaces native updateRide, fish update, cameraUpdate and adaptQuality default calls with the adventure hooks; original mesh/IK/animation remain.','Original start/orbit, held steering and random fish definitions are uncalled by the default coast UI; writable __pelican debug entry is removed.','Natural campaign completes and replays with the exact delivered HTML hash.']}});
await json(path.join(RUN,'artifacts/runtime-product-gates.json'),runtime);await json(path.join(RUN,'artifacts/runtime-wiring-verification.json'),wired);
const {ExperienceComplaintTriageSchema:T,ExperienceReproductionMatrixSchema:M}=await tsImport('../../../src/schemas/experience-complaint.ts',import.meta.url);
const evidence=async(p,kind='qa-artifact')=>({path:p,sha256:sha(await readFile(path.join(RUN,p))),kind,provenance:'verified-run-artifact'});
const reviewed=await evidence('perceptual-qa-report.json');
const backup='evidence/triage-pre-final';await mkdir(path.join(RUN,backup),{recursive:true});
for(const [triage,matrix] of [['triage.json','reproduction-matrix.json'],['artifacts/presentation-triage.json','artifacts/presentation-reproduction-matrix.json'],['artifacts/independent-ui-triage.json','artifacts/independent-ui-matrix.json'],['artifacts/landscape-menu-triage.json','artifacts/landscape-menu-matrix.json'],['artifacts/qa-transition-triage.json','artifacts/qa-transition-matrix.json'],['artifacts/lifecycle-measurement-triage.json','artifacts/lifecycle-reproduction-matrix.json']]){
 for(const p of [triage,matrix]){try{await cp(path.join(RUN,p),path.join(RUN,backup,path.basename(p)),{errorOnExist:true,force:false});}catch(e){if(e.code!=='ERR_FS_CP_EEXIST')throw e;}}
 const t=T.parse(await read(triage)),m=M.parse(await read(matrix));
 t.scope.generatedWorkspaceModified=!triage.includes('qa-transition')&&!triage.includes('lifecycle-measurement');t.reproduction.evidence.push(reviewed);
 if(triage.includes('lifecycle')){
  t.status='BLOCKED';t.reproduction.observed.push('Actual WebGL viewport agrees in all presets. Neither normal tab switch nor real headed-window minimization sends a visibility/blur event in this host; physical background pause is unobserved.');
  const raw=await evidence(base+'/lifecycle/report.json');t.reproduction.evidence.push(raw);
  for(const c of m.cells){const q=c.objectType==='physical-render-resolution'&&c.rendererPath==='webkit-headless';c.status=q?'PASS':'BLOCKED';c.observed=q?'Actual WebGL viewport dimensions match the output canvas at every quality preset.':c.objectType==='physical-render-resolution'?'All quality presets were measured in WebKit; this renderer/preset sibling is unobserved.':'Physical background pause cannot be closed without an actual lifecycle signal; no synthetic event is accepted.';c.evidence.push(raw);}
  m.remainingGaps=['Physical iPhone background, lock screen and return require normal-input acceptance.'];
 }else if(triage==='triage.json'){
  t.status='BLOCKED';t.reproduction.observed.push('All desktop v2 start/running/resume/replay branches pass natural and independent pixel review. Physical iPhone image quality/performance remains NOT_RUN.');
  const names={'default-start':'first-fish','running':'running','pause-resume':'resumed','replay':'replay'};
  for(const c of m.cells){if(c.rendererPath==='v2-balanced-composer'){c.status='PASS';c.observed='Exact current-build natural branch captured and independently reviewed on this viewport.';c.evidence.push(reviewed,await evidence(`${base}/visual/${c.viewport.width}-${names[c.lifecycleStateBranch]}.png`,'runtime-capture'));}else if(c.viewport.width===390&&c.lifecycleStateBranch==='default-start'){c.status='REPRODUCED';c.observed='PR10 default composition and undersampled composer reproduced in desktop WebKit; not a physical-iPhone reproduction.';c.evidence.push(await evidence('evidence/before-default.png','runtime-capture'));}}
  m.remainingGaps=['Physical iPhone/low-end hardware image quality, performance and thermal behavior NOT_RUN.','Uncaptured baseline sibling cells are historical diagnostics, not passing v2 evidence.'];
 }else if(triage.includes('qa-transition')){
  t.status='CLOSED';const raw=await evidence(base+'/qa-safety-webkit/report.json');t.reproduction.evidence.push(raw,await evidence('artifacts/qa-section-projection-proof.json'));
  t.reproduction.observed.push('Corrected normal-input retest reaches at least185m before intentional van contact; all targeted safety branches pass. Earlier campaign/collision sections match complete raw action prefixes; original downstream failure remains preserved.');
  for(const c of m.cells){c.status='PASS';c.observed='Targeted safety retest and transparent section-scope proof pass without gameplay changes.';c.evidence.push(raw);}
  m.remainingGaps=[];
 }else{
  t.status='CLOSED';t.reproduction.observed.push('Exact current-build natural branch and independent pixel review pass. Closure applies to the recorded desktop mobile viewports.');
  for(const c of m.cells){c.status='PASS';c.observed='Exact object/state/viewport branch passed current-build natural-input capture and independent pixel review.';c.evidence.push(reviewed);}
  m.remainingGaps=[];
 }
 await json(path.join(RUN,triage),T.parse(t));await json(path.join(RUN,matrix),M.parse(m));
}
const {QaReportSchema,BuildReportSchema}=await tsImport('../../../src/schemas/index.ts',import.meta.url);
await json(path.join(RUN,'build-report.json'),BuildReportSchema.parse({schemaVersion:1,success:true,runtime:'web-lite',template:'PR10 authorized pelican Three.js source adaptation',codexThreadId:build.threadId,workspace:WORKSPACE,webBuild:path.join(WORKSPACE,'game/index.html'),files:files.map(f=>path.join(RUN,f)),verification:['Exact delivered HTML SHA-256 '+build.buildHash,'Current-build normal input campaign, collision and viewport reports pass','Independent perceptual and runtime-product gates pass; physical-mobile acceptance remains blocked'],builtAt:build.at,completion:{status:'RELEASE_BLOCKED',blockers:['humanPlaytest']}}));
const checks=[];for(const [name,r,file] of [['campaign',campaign,'qa-campaign-webkit'],['collision',collision,'qa-collisions-webkit'],['safety',safety,'qa-safety-webkit'],['lifecycle',lifecycle,'lifecycle']])for(const c of r.checks)checks.push({name:name+':'+c.name,passed:c.passed,evidence:base+'/'+file+'/report.json'});
for(const r of visual.reports)for(const [name,passed]of Object.entries(r.checks))checks.push({name:r.viewport.width+':'+name,passed,evidence:base+'/visual/report.json'});
checks.push({name:'independent-perceptual-gate',passed:true,evidence:'artifacts/perceptual-qa-gate.json'},{name:'default-runtime-product-journey',passed:runtime.passed,evidence:'artifacts/runtime-product-gates.json'},{name:'physical-mobile-acceptance',passed:false,evidence:'Physical iPhone and low/mid-end device testing NOT_RUN; background lifecycle BLOCKED.'});
const qa=QaReportSchema.parse({schemaVersion:1,passed:false,checks,issues:[{id:'PHYSICAL-MOBILE-LIFECYCLE',severity:'error',message:'Physical background/resume and hardware quality/performance acceptance remain blocked; this is an H5 device-playtest candidate, not production release clearance.',evidence:base+'/lifecycle/report.json'},{id:'INHERITED-REPOSITORY-TESTS',severity:'warning',message:'Unrelated inherited Vitest/node:test collection and expired waiver fixture failures preserved; cut-stack timeout passes isolated.',evidence:'evidence/pr10-baseline-targeted-tests.log'}],screenshots:[...new Set([...campaign.screenshots,...collision.screenshots,...visual.reports.flatMap(r=>r.screenshots)].map(s=>s.path))],consoleLog:`evidence/attempt${build.attempt}-${collision.sourceCapture?'all':'collisions-serial'}.log`,testedAt:new Date().toISOString()});
await json(path.join(RUN,'qa-report.json'),qa);
const state=await read('repair-state.json');for(const h of state.history){h.qa=h.attempt===build.attempt?'CORE_AND_PERCEPTUAL_PASS_PHYSICAL_BLOCKED':({1:'FAILED_VISUAL',2:'FAILED_INDEPENDENT_PERCEPTUAL',3:'FAILED_UI_RETEST',4:'FAILED_LANDSCAPE_INITIAL_CTA'}[h.attempt]??h.qa);}
await json(path.join(RUN,'repair-state.json'),state);build.qa='CORE_AND_PERCEPTUAL_PASS_PHYSICAL_BLOCKED';await json(path.join(RUN,'build-receipt.json'),build);
console.log(JSON.stringify({runtimeProduct:runtime.passed,perceptual:perceptual.passed,core:true,physicalMobile:'BLOCKED',overallQaPassed:qa.passed,attempt:build.attempt}));
