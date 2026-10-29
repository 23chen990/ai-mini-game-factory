/** Bounded, real subscription experiment. Capture is host-owned; judgment and repair are model-owned. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureTemporalObservations } from '../src/qa/temporal-observations.js';
import { executionPolicyForStage } from '../src/core/model-policy.js';
import { createServer } from 'node:http';
import { readFile, mkdir, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { z } from 'zod';
import { exists, listFiles, sha256File, sha256Text, writeJsonAtomic } from '../src/core/files.js';
import { NaturalFlowEvidenceSchema } from '../src/schemas/natural-flow.js';
import { ReferenceFidelityContractSchema, ReferenceFidelityReviewSchema } from '../src/schemas/reference-fidelity.js';
import { ReferenceComparisonCaptureSchema } from '../src/schemas/reference-comparison.js';
import { ReferenceFrameManifestSchema } from '../src/schemas/reference-recording.js';
import { EvidenceProvenanceManifestSchema } from '../src/schemas/evidence-provenance.js';
import { CodexCliProvider } from '../src/providers/codex-cli.js';
import { CodexAccountProvider } from '../src/providers/codex-account.js';
import { FixerAgent } from '../src/agents/index.js';
import { WebLiteRuntimeAdapter } from '../src/adapters/web-lite.js';
import { QaReportSchema } from '../src/schemas/index.js';
import { verifyImplementationDiscoveries, verifyReferenceRepairReview } from '../src/core/reference-evidence.js';
import { completedCodexExecutionMs, readCodexUsageReceipts } from '../src/core/codex-budget.js';

const phase = z.enum(['capture-first','qa-first','fix','capture-retest','qa-retest']).parse(process.argv[2]);
const runRoot = path.resolve(z.string().min(1).parse(process.argv[3]));
const runId = path.basename(runRoot);
const workspace = path.join(runRoot,'workspace/game');
const pass = phase.endsWith('retest') ? 'retest' : 'first';
const file = (relative: string) => path.join(runRoot, relative);
const readJson = async (relative: string): Promise<unknown> => JSON.parse(await readFile(file(relative),'utf8'));
const ref = async (relative: string) => ({path:relative,sha256:await sha256File(file(relative))});
const buildHash = async () => sha256Text((await Promise.all((await listFiles(file('workspace/game/dist'))).map(async name=>`${name}:${await sha256File(file(`workspace/game/dist/${name}`))}`))).join('\n'));
const inputDir = `qa-input/${pass}`;
await mkdir(file(inputDir),{recursive:true});

async function prepareContinuousPacket() {
 if(await exists(file(`${inputDir}/packet-continuous.json`))) {console.log(JSON.stringify({phase,reusedFrozenContinuousPacket:true}));return;}
 const packet=z.object({qaObservation:z.object({tracePath:z.string(),traceSha256:z.string(),screenshots:z.array(z.object({path:z.string(),sha256:z.string()}))}).passthrough(),buildHash:z.string()}).passthrough().parse(await readJson(`${inputDir}/packet.json`));
 const videos=(await listFiles(file(`${inputDir}/video`))).filter(name=>name.endsWith('.webm'));
 if(videos.length!==1) throw new Error('Expected exactly the recorded natural-input video, never a nearby recording');
 const temporal=await captureTemporalObservations({runRoot,videoPath:`${inputDir}/video/${videos[0]!}`,outputDir:`${inputDir}/temporal`,buildHash:packet.buildHash,tracePath:packet.qaObservation.tracePath});
 const trace=NaturalFlowEvidenceSchema.parse(await readJson(packet.qaObservation.tracePath));
 const tracePath=`${inputDir}/trace-continuous.json`;
 const screenshots=[...packet.qaObservation.screenshots,...temporal.sheets.map(({path,sha256})=>({path,sha256}))];
 await writeJsonAtomic(file(tracePath),NaturalFlowEvidenceSchema.parse({...trace,screenshots:screenshots.map(item=>item.path)}));
 await writeJsonAtomic(file(`${inputDir}/packet-continuous.json`),{...packet,qaObservation:{...packet.qaObservation,tracePath,traceSha256:await sha256File(file(tracePath)),screenshots}});
 console.log(JSON.stringify({phase,derivedFromFrozenVideo:true,temporalSheets:temporal.sheets.length,limitations:temporal.limitations}));
}


if (phase.startsWith('capture') && await exists(file(`${inputDir}/packet.json`))) {
 await prepareContinuousPacket();
} else if (phase.startsWith('capture')) {
 const hash = await buildHash();
 const provenance = EvidenceProvenanceManifestSchema.parse(await readJson('reference-evidence/manifest.json'));
 const source = provenance.entries.find(entry=>entry.id==='slice-reference')!;
 if (!source.usableAsEvidence || source.workspace!==workspace || source.sha256!==await sha256File(file(source.storedPath!))) throw new Error('Reference identity/hash binding is not verified');
 const contract = ReferenceFidelityContractSchema.parse({schemaVersion:1,targetRunId:runId,referenceName:'Verified historical Slice Master behavioral reference',provenance:[{path:source.storedPath,sha256:source.sha256}],coreLoopOrder:['fresh ready','normal action','visible result','terminal','replay'],inputStateTransitions:[],failureRecoveryRules:[],behaviorChecks:[],feedbackTimingBands:null,status:'BLOCKED',blockers:['Historical recording does not establish hidden input timing or every causal/failure/replay branch. Do not infer those.']});
 await writeJsonAtomic(file('qa-input/contract.json'),contract);
 const contractHash = sha256Text(JSON.stringify(contract));
 // Reuse only the exact manifest bound to this known source hash, not a nearby video.
 const origin = '/Users/kker/.codex/worktrees/factory-agent-eval-v4/妖怪夜市/runs/20261026104326-reference-9094c978';
 const manifest = ReferenceFrameManifestSchema.parse(JSON.parse(await readFile(path.join(origin,'artifacts/reference-frame-manifest.json'),'utf8')));
 if (manifest.source.sha256!==source.sha256) throw new Error('Historical frame provenance mismatch');
 const sheets = [manifest.contactSheets[0]!,manifest.contactSheets[Math.floor(manifest.contactSheets.length/2)]!,manifest.contactSheets.at(-1)!];
 for (const sheet of sheets) {
  if (await sha256File(path.join(origin,sheet.path))!==sheet.sha256) throw new Error('Historical frame bytes changed');
  await mkdir(path.dirname(file(sheet.path)),{recursive:true}); await cp(path.join(origin,sheet.path),file(sheet.path));
 }
 await writeJsonAtomic(file('artifacts/reference-frame-manifest.json'),{...manifest,targetRunId:runId,targetGame:provenance.targetGame,workspace,source:{...manifest.source,evidenceId:source.id,path:source.storedPath}});
 const browser = await chromium.launch({headless:true});
 const html = await readFile(file('workspace/game/dist/index.html'));
 const server = createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end(html);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address = server.address(); if (address===null || typeof address==='string') throw new Error('No local preview address');
 const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,recordVideo:{dir:file(`${inputDir}/video`),size:{width:390,height:844}}});
 const page = await context.newPage(); const start = Date.now();
 const actions: string[]=[]; const screenshots: string[]=[]; const consoleEvents: string[]=[];
 page.on('pageerror',error=>consoleEvents.push(String(error))); page.on('console',message=>{if(message.type()==='error')consoleEvents.push(message.text());});
 const shot = async (name:string) => {const relative=`${inputDir}/${name}.png`;await page.screenshot({path:file(relative)});screenshots.push(relative);};
 try {
  await page.goto(`http://127.0.0.1:${address.port}/`); await page.waitForTimeout(1200); await shot('01-ready');
  for(let index=0;index<90 && !await page.locator('#terminal-actions').isVisible();index++) {
   await page.touchscreen.tap(195,400);actions.push(`${Date.now()-start}ms touchscreen.tap(195,400)`);
   await page.waitForTimeout(400);
   if(index===5) await shot('02-action');
  }
  const terminal = await page.locator('#terminal-actions').isVisible();
  await shot('03-outcome');
  let replayObserved=false;
  if(terminal) {
   await page.locator('#replay-button').tap();actions.push(`${Date.now()-start}ms tap visible #replay-button`);
   await page.waitForTimeout(1200); await shot('04-after-control');
   replayObserved=!await page.locator('#terminal-actions').isVisible();
   if(!replayObserved) {await page.locator('#replay-button').tap();actions.push(`${Date.now()-start}ms tap visible #replay-button again`);await page.waitForTimeout(1800);await shot('05-after-second-control');}
   else {await page.touchscreen.tap(195,400);actions.push(`${Date.now()-start}ms touchscreen.tap(195,400) in fresh attempt`);await page.waitForTimeout(1600);await shot('05-new-action');}
  }
  const trace=NaturalFlowEvidenceSchema.parse({schemaVersion:1,startedFromReset:true,actions,transitions:[{name:'startup',changed:true,evidence:'Fresh context and ready pixels.'},{name:'core-action',changed:actions.length>0,evidence:'Normal touchscreen actions; consult chronological PNGs/video, not a state oracle.'},{name:'terminal',changed:terminal,evidence:terminal?await page.locator('#terminal-text').innerText():'No terminal observed in bounded capture.'},{name:'replay',changed:replayObserved,evidence:`Visible terminal actions after ordinary replay taps: ${await page.locator('#terminal-actions').isVisible()}. The recorder does not assign root cause.`}],completion:terminal?'terminal':'none',replayObserved,forbiddenOperations:[],screenshots,passed:false,blockers:['Capture only, not independent player-experience acceptance.'],buildHash:hash,runtime:'web-lite',device:{width:390,height:844,label:'mobile'},runner:'trusted-host-playwright-normal-input',observedAt:new Date().toISOString()});
  await writeJsonAtomic(file(`${inputDir}/trace.json`),trace);
  await writeJsonAtomic(file(`${inputDir}/console.json`),consoleEvents);
  const captures=[];
  for(const target of ['reference','candidate'] as const) {
   // Missing source inputs remain absent, never invented normal-input proof.
   const capture=ReferenceComparisonCaptureSchema.parse({schemaVersion:1,targetRunId:runId,contractHash,target,artifactHash:target==='reference'?source.sha256:hash,authority:target==='candidate'?'normal-input':'recording-observation',startedFromReset:target==='candidate',actions:target==='candidate'?actions:[],forbiddenOperations:[],observedAt:new Date().toISOString(),durationMs:target==='candidate'?Date.now()-start:manifest.source.durationMs,observations:[]});
   await writeJsonAtomic(file(`${inputDir}/${target}-capture.json`),capture);captures.push(await ref(`${inputDir}/${target}-capture.json`));
  }
  await writeJsonAtomic(file(`${inputDir}/packet.json`),{workspace,buildHash:hash,contractHash,requiredRetests:[],comparison:{reference:captures[0],candidate:captures[1]},qaObservation:{buildPath:'workspace/game/dist',buildSha256:hash,tracePath:`${inputDir}/trace.json`,traceSha256:await sha256File(file(`${inputDir}/trace.json`)),screenshots:await Promise.all(screenshots.map(ref)),referenceImages:sheets.map(sheet=>({path:sheet.path,sha256:sheet.sha256}))},limitations:['Source recording has pixels, but no logged input timings. Exact causal source comparisons remain UNKNOWN.','Only candidate has fresh normal-input capture.','Screenshots and video are observations, not expected outcomes.']});
 } finally {await context.close();await browser.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 await prepareContinuousPacket();
 console.log(JSON.stringify({phase,buildHash:hash,packet:`${inputDir}/packet-continuous.json`}));
} else {
 const receipts = await readCodexUsageReceipts(runRoot);
 const authorization=z.object({schemaVersion:z.literal(1),round:z.literal('20261029'),basis:z.literal('explicit-user-reply'),baselineExecutionIds:z.array(z.string().uuid()).length(2),qaFirstCalls:z.literal(1),fixCalls:z.literal(1),qaRetestCalls:z.literal(1)}).parse(await readJson('human/pilot-authorization-20261029.json'));
 if(receipts.some(receipt=>receipt.status!=='complete')) throw new Error('Pilot unresolved usage must be audited, not reset or bypassed');
 const current=receipts.filter(receipt=>!authorization.baselineExecutionIds.includes(receipt.executionId));
 const fixSequence=current.find(receipt=>receipt.stage==='FIX')?.sequence;
 if(current.length>=3 || receipts.reduce((sum,r)=>sum+r.usage.totalTokens,0)>=200000) throw new Error('Pilot model-call/token ceiling reached');
 if(phase==='qa-first' && current.some(receipt=>receipt.stage==='QA')) throw new Error('Current-round initial QA already consumed');
 if(phase==='fix' && (fixSequence!==undefined || !await exists(file('artifacts/pilot-validated-issues.json')))) throw new Error('Fixer needs independent validated discovery and an unused authorized call');
 if(phase==='qa-retest' && (fixSequence===undefined || current.some(receipt=>receipt.stage==='QA' && receipt.sequence>fixSequence))) throw new Error('Retest needs a real repair and an unused authorized call');
 const usedMs=completedCodexExecutionMs(receipts);
 if(usedMs>=1800000) throw new Error('Pilot cumulative 30-minute wall-clock ceiling reached');
 const client=new CodexCliProvider({timeoutMs:Math.min(600000,1800000-usedMs),maxRetries:0});
 await client.assertChatGptLogin();
 const provider=new CodexAccountProvider(client,{fixTimeoutMs:Math.min(600000,1800000-usedMs)});
 if(phase==='fix') {
  const report=QaReportSchema.parse(await readJson('artifacts/pilot-validated-issues.json'));
  if(report.issues.length===0 || report.issues.some(issue=>issue.rootCause!=='implementation'))throw new Error('Only causally validated implementation issues may reach Fixer');
  if(await exists(file('artifacts/reference-level-implementation-contract.json')) || await exists(file('artifacts/reference-level-runtime-data.json'))) throw new Error('Declared-script prototype repair cannot bypass a recording-level production contract');
  const beforeBuildHash=await buildHash();
  const attemptDir='history/pilot-repair/attempt-1';
  const snapshot=async (name:string)=>{const target=file(`${attemptDir}/${name}`);await cp(workspace,target,{recursive:true,filter:source=>!['node_modules','dist','.DS_Store'].includes(path.relative(workspace,source).split(path.sep)[0]!)});return target;};
  const before=await snapshot('before');
  if(!await exists(file(`${attemptDir}/attempt.json`))) await writeJsonAtomic(file(`${attemptDir}/attempt.json`),{attempt:1,route:'formal-fixer',beforeBuildHash,qaReport:await ref('artifacts/pilot-validated-issues.json'),startedAt:new Date().toISOString()});
  const result=await new FixerAgent(provider,new WebLiteRuntimeAdapter(process.cwd(),{useDeclaredProjectScripts:true})).runFormal(workspace,undefined,report,{runRoot,outputPath:file('logs/codex/FIX.last-message.txt'),logDir:file('logs/codex'),inputPaths:['artifacts/pilot-validated-issues.json'],stage:'FIX',model:executionPolicyForStage('FIX').model,sandbox:'workspace-write',contextPacket:{schemaVersion:1,stage:'FIX',summary:'Route formal-fixer. Repair only the validated issues; preserve gameplay and contracts. Test first. The host builds once. No injected-answer/oracle context is supplied.',inputs:[],omitted:['conversation','administrator oracle','reference speculation'],totalChars:0}}).finally(async()=>{
  const after=await snapshot('after');
  const diff=await promisify(execFile)('git',['diff','--no-index','--no-ext-diff',before,after],{maxBuffer:4*1024*1024}).then(result=>result.stdout,error=>{if(error.code===1)return String(error.stdout);throw error;});
  await writeFile(file(`${attemptDir}/fix.diff`),diff);
  });
  await writeJsonAtomic(file('artifacts/pilot-fix-result.json'),{...result,beforeBuildHash,afterBuildHash:await buildHash(),diff:await ref(`${attemptDir}/fix.diff`),route:'formal-fixer',attempt:1,threadContinuity:'No Builder model thread exists for this local clone; replacement workspace thread recorded.',status:'AWAITING_INDEPENDENT_QA'});
 } else {
  const Packet=z.object({workspace:z.string(),buildHash:z.string(),contractHash:z.string(),qaObservation:z.object({buildPath:z.string(),buildSha256:z.string(),tracePath:z.string(),traceSha256:z.string(),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),referenceImages:z.array(z.object({path:z.string(),sha256:z.string()}))}),comparison:z.object({reference:z.object({path:z.string(),sha256:z.string()}),candidate:z.object({path:z.string(),sha256:z.string()})}),limitations:z.array(z.string())});
  const packet=Packet.parse(await readJson(`${inputDir}/packet-continuous.json`));
  const first=phase==='qa-retest'?ReferenceFidelityReviewSchema.parse(await readJson('artifacts/pilot-qa-first.json')):undefined;
  const requiredRetests=first===undefined?[]:first.discoveries.filter(issue=>issue.severity==='error').map(({id,objectType,stateBranch,viewport})=>({id,objectType,stateBranch,viewport}));
  const paths=['qa-input/contract.json',`${inputDir}/reference-capture.json`,`${inputDir}/candidate-capture.json`,`${inputDir}/temporal/manifest.json`];
  const neutralInputs=await Promise.all(paths.map(async relative=>({path:relative,excerpt:JSON.stringify({file:await ref(relative),content:JSON.parse(await readFile(file(relative),'utf8'))}),priority:'required' as const})));
  const result=await provider.reviewReferenceCandidate({workspace,buildHash:packet.buildHash,contractHash:packet.contractHash,requiredRetests},{runRoot,outputPath:file(`artifacts/pilot-qa-${pass}.json`),logDir:file('logs/codex'),inputPaths:paths,stage:'QA',model:executionPolicyForStage('QA').model,sandbox:'read-only',qaObservation:packet.qaObservation,contextPacket:{schemaVersion:1,stage:'QA',summary:`Neutral player-experience inspection. Read ONLY these frozen files: ${paths.join(', ')}. Candidate PNGs are attached first in chronological order, followed by reference contact sheets. Compare player intent, action, visible outcome and feedback; report important out-of-contract issues if actually observed. No defect answer is supplied. Do not inspect workspace source, other runs, history, scripts, administrator material or earlier reports. Use only the cited frozen trace and screenshots. If discovering an issue, use the cited trace transition name as discovery id (startup/core-action/terminal/replay) so its evidence can be mechanically joined; those are observation categories, not claims of defects. Source limits remain UNKNOWN; do not claim source input timings or completed dual-input acceptance. Supplied independent capture pointers: ${JSON.stringify(packet.comparison)}. Cases may remain empty where no contract check exists. ${first?'This is a fresh independent review after one repair; cover requiredRetests, without trusting Fixer conclusions.':''}`,inputs:neutralInputs,omitted:['game source','prior defect answers','Builder/Fixer conclusions','administrator oracle'],totalChars:0}});
  const review=ReferenceFidelityReviewSchema.parse(result.value);await writeJsonAtomic(file(`artifacts/pilot-qa-${pass}.json`),review);
  const validated=await verifyReferenceRepairReview({runRoot,targetRunId:runId,workspace,buildHash:packet.buildHash,contract:await readJson('qa-input/contract.json'),review,requiredRetests});
  await writeJsonAtomic(file(`artifacts/pilot-qa-${pass}-validation.json`),validated);
  const implementation=await verifyImplementationDiscoveries({runRoot,targetRunId:runId,workspace,buildHash:packet.buildHash,contract:await readJson('qa-input/contract.json'),review,requiredRetests});
  await writeJsonAtomic(file(`artifacts/pilot-qa-${pass}-implementation-validation.json`),implementation);
  if(phase==='qa-first' && implementation.blockers.length===0 && implementation.report.issues.length>0) await writeJsonAtomic(file('artifacts/pilot-validated-issues.json'),implementation.report);
  console.log(JSON.stringify({phase,metrics:result.metrics,discoveries:review.discoveries.length,validation:validated.blockers}));
 }
}
