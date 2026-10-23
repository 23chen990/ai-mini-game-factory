import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { QaReportSchema } from '../../../src/schemas/index.ts';
import { NaturalFlowEvidenceSchema } from '../../../src/schemas/natural-flow.ts';
import { ExperienceComplaintTriageSchema, ExperienceReproductionMatrixSchema } from '../../../src/schemas/experience-complaint.ts';
import { PerceptualQaReportSchema } from '../../../src/schemas/product-experience.ts';
import { EvidenceProvenanceManifestSchema } from '../../../src/schemas/evidence-provenance.ts';
const run=path.resolve('runs/h5-qq-mobile-20261013'),raw=run+'/artifacts/replay-20261021';
const docs=path.resolve('docs/lean-pilot/racing-replay-20261021');
const load=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const put=async(file:string,value:unknown)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
const sha=async(file:string)=>createHash('sha256').update(await readFile(file)).digest('hex');
const binding=async(file:string)=>({path:path.relative(process.cwd(),file),sha256:await sha(file)});
const evidence=async(file:string)=>({...await binding(file),kind:'qa-artifact' as const,provenance:'verified-run-artifact' as const});
const build=await load(run+'/artifacts/build-racing.json'),baseline=await load(raw+'/build-racing.json');
assert.equal(build.attempt,24);assert.equal(baseline.attempt,23);
const unchanged=['generatedVehicleSha256','generatedAiSha256','generatedTrackSha256','trackGeometrySha256','itemVisualSourceSha256','userCarManifestSha256'];
for(const key of unchanged)assert.equal(build[key],baseline[key],key+' must remain unchanged');
const labels=['after24-serial-desktop-journey','after24-serial-phone-journey','after24-serial-small-journey','after24-stage06-desktop','after24-stage06-phone'];
const journeys=await Promise.all(labels.map(async label=>{
  const r=await load(raw+'/'+label+'/report.json');assert.equal(r.buildHash,build.buildHash);assert.deepEqual(r.errors,[]);
  const frames=r.frames,terminal=r.terminal;
  const improvements=frames.slice(1).filter((f:any,i:number)=>f.place<frames[i].place).length;
  const losses=frames.slice(1).filter((f:any,i:number)=>f.place>frames[i].place).length;
  const flow=NaturalFlowEvidenceSchema.parse({schemaVersion:1,startedFromReset:r.profile==='fresh',actions:['Normal visible Start','Visible minimap policy with trusted keyboard/touch actions','Normal Replay after actual settlement'],transitions:[{name:'startup-to-core-loop',changed:frames.length>0,evidence:label+'/home.png and report.json'},{name:'native-settlement',changed:!!terminal,evidence:label+'/terminal.png'},{name:'replay',changed:r.replay,evidence:label+'/replay.png'}],completion:terminal?'settlement':'none',replayObserved:r.replay,forbiddenOperations:[],screenshots:r.shots.map((name:string)=>'runs/h5-qq-mobile-20261013/artifacts/replay-20261021/'+label+'/'+name),passed:!!terminal&&r.replay,blockers:terminal&&r.replay?[]:['No terminal/replay observed'],runner:'Playwright normal-input proxy; not a human',buildHash:build.buildHash,runtime:'web-lite',device:{...r.viewport,label:r.device},observedAt:new Date().toISOString()});
  await put(raw+'/'+label+'/natural-flow.json',flow);
  return {label,stage:r.stage,device:r.device,profile:r.profile,finished:terminal?.finished===true,place:terminal?.place??null,finishTime:terminal?.finishTime??null,currentOutcome:terminal?.finished&&terminal.place<=3?'PODIUM':'LOSS_OR_UNFINISHED',replay:r.replay,flowPassed:flow.passed,rankImprovements:improvements,rankLosses:losses,stats:terminal?.stats??null,report:await binding(raw+'/'+label+'/report.json'),naturalFlow:await binding(raw+'/'+label+'/natural-flow.json')};
}));
const desktop=await load(raw+'/after24-serial-desktop-sequence/report.json'),before=await load(raw+'/before-serial-desktop-audio/report.json');
assert.equal(before.last.events.filter((e:any)=>e.type==='smallBoost').length,0);
const end=desktop.last.events.find((e:any)=>e.type==='driftEnd'&&e.clean),spray=desktop.last.events.find((e:any)=>e.type==='smallBoost');
assert.ok(spray.atRaceSec>end.atRaceSec&&spray.atRaceSec-end.atRaceSec<.03);
const timestamped=await load(raw+'/after24-small-timestamped/report.json');
assert.equal(timestamped.buildHash,build.buildHash);assert.deepEqual(timestamped.errors,[]);
const smallInput=timestamped.inputs.find((e:any)=>e.type==='pointerdown'&&e.action==='small');
const smallEnd=timestamped.last.events.find((e:any)=>e.type==='driftEnd'&&e.clean);
const smallSprays=timestamped.last.events.filter((e:any)=>e.type==='smallBoost');
assert.equal(smallSprays.length,1);
const touchPath=run+'/artifacts/internal-experience-20261020/touch-d4b6e32b056a-replay24/report.json';
const regressionFiles=[raw+'/smoke24/smoke.json',touchPath,raw+'/browser24/ads.json',raw+'/browser24/webkit.json'];
const browserRegressions=await Promise.all(regressionFiles.map(async file=>{
  const r=await load(file);assert.equal(r.passed,true);assert.deepEqual(r.errors,[]);
  return {report:await binding(file),passed:r.passed,physicalPhone:false};
}));
const summary={schemaVersion:1,targetGame:'极速飞驰 / qq-speed',workspace:run+'/workspace',route:'formal-fixer',attempt:24,buildHash:build.buildHash,baselineHash:baseline.buildHash,unchanged:Object.fromEntries(unchanged.map(key=>[key,build[key]])),comparison:{keyboardBeforeSprays:0,keyboardAfterSprays:1,afterCleanExitToSprayMs:(spray.atRaceSec-end.atRaceSec)*1000,interpretation:'Same release/countersteer/early-W action class, separate natural runs, not seeded A/B timing or race difficulty proof.',smallPhoneEarlyPress:'One early-touch sequence did not spray; retained. Native260ms expiry unchanged; the cause of that earlier miss remains unknown. A separate timestamped normal-input small-phone sequence did spray; it does not erase the earlier failure.'},smallPhoneTimestamped:{inputToCleanExitMs:(smallEnd.atRaceSec-smallInput.atRaceSec)*1000,cleanExitToSprayMs:(smallSprays[0].atRaceSec-smallEnd.atRaceSec)*1000,sprays:smallSprays.length,report:await binding(raw+'/after24-small-timestamped/report.json'),interpretation:'Game-clock intervals, not end-to-end latency. Same viewport and state branch; separate retest, not proof of the old miss cause.'},browserRegressions,journeys,limitations:['Human enjoyment/voluntary retry not measured.','No physical Android/iPhone, real ads or platform acceptance.','Independent perceptual reviewer not run in this chat; self-inspection is not a passing independent gate.','Only01 and legitimately previously unlocked06 sampled here, not all30 naturally completed.','RC23 remains historical candidate; RC24 is an internal candidate, not formal FIX/release acceptance.']};
await put(docs+'/qa-summary.json',summary);await put(raw+'/qa-summary.json',summary);
const triage=ExperienceComplaintTriageSchema.parse(await load(docs+'/triage.json'));
triage.scope.generatedWorkspaceModified=true;triage.status='BLOCKED';triage.reproduction.observed.push('RC24 keyboard normal-input early-W reproducer triggers exactly one native smallBoost8.7ms after clean exit. Physics, AI, track, item and car asset hashes remain RC23-identical. Full default natural results are in qa-summary.json; all losses preserved.');
await put(docs+'/triage-final.json',ExperienceComplaintTriageSchema.parse(triage));
const matrix=ExperienceReproductionMatrixSchema.parse(await load(docs+'/reproduction-matrix.json'));
for(const cell of matrix.cells){
  const journey=journeys.find(j=>j.device===cell.viewport.label&&j.stage==='1');assert.ok(journey);
  cell.evidence=[await evidence(raw+'/'+journey.label+'/report.json')];
  cell.status='BLOCKED';cell.observed=`RC24 ${journey.label}: native ${journey.currentOutcome}, place${journey.place}, replay${journey.replay}. Normal evidence recorded; independent perceptual acceptance remains unavailable. No sibling branch may clear this cell.`;
}
matrix.confirmedFindings.push('Desktop early-W loss repaired through pending real input, no speed/position grants.','Existing native collision/recovery remains, not an autopilot rewrite.');matrix.remainingGaps=summary.limitations;
await put(docs+'/reproduction-matrix-final.json',ExperienceReproductionMatrixSchema.parse(matrix));
const cases=await Promise.all(['desktop','phone','small-phone'].map(async(device,index)=>{
  const label=['after24-serial-desktop-sequence','after24-serial-phone-sequence','after24-serial-small-sequence'][index];
  const r=await load(raw+'/'+label+'/report.json');
  return {featureId:'drift-release-spray',sourceCheckIds:['replay-keyboard-spray','replay-drift-cue'],objectType:'player-control',stateBranch:'clean-release-spray',viewport:{...r.viewport,label:device},playerVisible:true,naturalTriggerVerified:true,eventOrderVerified:device!=='small-phone',negativeAssertionsPassed:true,perceptualPassed:false,observedSignal:'Original control footprint shows gold armed state; green native window and drain observed on small phone. Existing native flame/acceleration appears after genuine spray; no added particles. Self-inspected pixels, not independent approval.',observedEventOrder:r.last.events.filter((e:any)=>['driftStart','driftEnd','smallBoost','crash'].includes(e.type)).map((e:any)=>e.type),screenshots:[await binding(raw+'/'+label+'/drift.png'),await binding(raw+'/'+label+'/countersteer.png')],trace:await binding(raw+'/'+label+'/report.json'),evidence:[label+'/audio.webm',labels[index]+'/report.json'],notes:['Early-small-phone sequence did not spray; not rewritten as success. Full natural actions separately recorded.','Scripted replay is not voluntary human replay.']};
}));
const perceptual=PerceptualQaReportSchema.parse({schemaVersion:2,artifactType:'perceptual-qa-report',targetGame:triage.targetGame,targetRunId:'h5-qq-mobile-20261013',targetWorkspace:run+'/workspace',runtimeEntrypoints:build.runtimeEntrypoints,contractHash:await sha(docs+'/triage.json'),buildHash:build.buildHash,runtime:'web-lite',reviewer:'DeterministicCapture',authorIndependent:false,passed:false,blockers:['Independent QA/human perceptual review unavailable; current self-inspection cannot close this gate.','An earlier small-phone sequence did not spray. The timestamped small-phone retest sprayed once, but the earlier miss cause remains unresolved; both are retained.'],cases,checkedAt:new Date().toISOString()});
await put(docs+'/perceptual-qa-report.json',perceptual);
const qa=QaReportSchema.parse({schemaVersion:1,passed:false,checks:[{name:'TDD keyboard one-shot/expiry and real presentation state/audio',passed:true,evidence:'tdd-red.log then tdd-green.log; runtime438/438; native12/12'},{name:'Unchanged native30 courses,150 physical opponents and10 forks',passed:true,evidence:'ai-pace.json,geometry.log and byte-identical generated physics/AI/track receipt'},{name:'Default normal journeys reach settlement and replay',passed:journeys.every(j=>j.flowPassed),evidence:'qa-summary.json; phone/small and difficult-course losses remain losses'},{name:'Full Chromium smoke, two-size trusted touch lifecycle, SDK fixture safety and desktop WebKit',passed:true,evidence:'qa-summary.json browserRegressions; browser24/touch.json screenshot timeout retained, followed by the unchanged existing trusted-touch lifecycle harness passing. No real SDK or physical device claim.'},{name:'Independent perceptual acceptance',passed:false,evidence:'perceptual-qa-report.json'},{name:'Physical phones/human/platforms',passed:false,evidence:'Not available; no platform submission or App binding performed'},{name:'Whole-factory lint/tests',passed:false,evidence:'lint.log66 pre-existing errors; factory-tests-bounded.log67 failing files including node:test collection and unrelated cut-stack/waiver cases. Scoped lint/typecheck/native tests pass; no unrelated fixes.'}],issues:[{id:'perceptual-review',severity:'error',message:'Independent perceptual review still required before accepting formal FIX.',evidence:'perceptual-qa-report.json'},{id:'human-platform',severity:'error',message:'Human enjoyment, physical-phone and platform publication not verified.',evidence:'qa-summary.json'}],screenshots:cases.flatMap(c=>c.screenshots.map(s=>s.path)),consoleLog:'Exact Playwright errors arrays retained; first selector/transport errors and performance-confounded runs not rewritten.',testedAt:new Date().toISOString()});
await put(docs+'/qa-final.json',qa);
const entries=[];
for(const entry of await readdir(raw,{withFileTypes:true})){
  if(!entry.isDirectory()||!(/^(after24-|before-)/.test(entry.name)))continue;
  const report=await load(raw+'/'+entry.name+'/report.json');
  assert.equal(report.buildHash,entry.name.startsWith('before-')?baseline.buildHash:build.buildHash);
  for(const name of await readdir(raw+'/'+entry.name))if(/\.(png|webm|json)$/.test(name)){
    const file=raw+'/'+entry.name+'/'+name;
    entries.push({id:entry.name+'-'+name,sourcePath:file,storedPath:path.relative(run,file),purpose:'other' as const,sha256:await sha(file),targetGame:triage.targetGame,workspace:run+'/workspace',identityStatus:'VERIFIED_TARGET' as const,reviewStatus:'VERIFIED' as const,usableAsEvidence:true,notes:'Identity verified from this exact owned preview capture and report build hash, not a reference-game recording. Failed gameplay observations remain usable failure evidence, not PASS.'});
  }
}
await put(docs+'/capture-provenance.json',EvidenceProvenanceManifestSchema.parse({schemaVersion:1,targetGame:triage.targetGame,workspace:run+'/workspace',entries}));
await mkdir(docs+'/evidence',{recursive:true});
// Git-friendly log copies remove trailing whitespace only; raw captures stay byte-exact in the evidence ZIP.
for(const file of ['native-tests.log','tdd-red.log','tdd-green.log','typecheck-final.log','lint-final.log','builder-regressions-canonical-temp.log','car-tests.log','native-player.json','ai-pace.json'])await writeFile(docs+'/evidence/'+file.replace('.log','.txt'),(await readFile(raw+'/'+file,'utf8')).replace(/[ \t]+$/gm,''));
await copyFile(run+'/artifacts/build-racing.json',docs+'/evidence/build24.json');
for(const [file,name] of [[touchPath,'touch-lifecycle24.json'],[raw+'/smoke24/smoke.json','smoke24.json'],[raw+'/browser24/ads.json','ads24.json'],[raw+'/browser24/webkit.json','webkit24.json'],[raw+'/browser24/touch.json','touch24-screenshot-timeout.json']])await copyFile(file,docs+'/evidence/'+name);
const history=await load(run+'/artifacts/repair-history.json');assert.equal(history.repairAttempt,24);
const attempt=history.attempts.find((a:any)=>a.attempt===24);attempt.executorThreadId='01a15c93-1484-7ad2-89bb-3ed1b497d285';attempt.continuity='User explicitly opened this workspace-scoped task; previous replacementThreadId preserved unchanged.';attempt.status='QA_RETESTED_TARGETED_INPUT_REPAIR_OBSERVED_ACCEPTANCE_BLOCKED';attempt.qa={report:path.relative(process.cwd(),docs+'/qa-final.json'),naturalSummary:path.relative(process.cwd(),docs+'/qa-summary.json'),perceptual:'BLOCKED_INDEPENDENT_REVIEW',physicalHuman:'NOT_RUN'};
await put(run+'/artifacts/repair-history.json',history);await put(docs+'/evidence/repair-history24.json',history);
console.log(JSON.stringify({buildHash:build.buildHash,journeys:journeys.map(j=>({stage:j.stage,device:j.device,place:j.place,replay:j.replay})),perceptual:'BLOCKED',publishable:false}));
