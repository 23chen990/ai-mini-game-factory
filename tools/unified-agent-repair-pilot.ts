/** Bounded, real subscription experiment. Capture is host-owned; judgment and repair are model-owned. */
import { createServer } from 'node:http';
import { readFile, mkdir, cp } from 'node:fs/promises';
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
import { verifyReferenceRepairReview } from '../src/core/reference-evidence.js';
import { completedCodexExecutionMs, readCodexUsageReceipts } from '../src/core/codex-budget.js';

const phase = z.enum(['capture-first','qa-first','fix','capture-retest','qa-retest']).parse(process.argv[2]);
const runRoot = path.resolve(process.argv[3]);
const runId = path.basename(runRoot);
const workspace = path.join(runRoot,'workspace/game');
const pass = phase.endsWith('retest') ? 'retest' : 'first';
const file = (relative: string) => path.join(runRoot, relative);
const readJson = async (relative: string): Promise<unknown> => JSON.parse(await readFile(file(relative),'utf8'));
const ref = async (relative: string) => ({path:relative,sha256:await sha256File(file(relative))});
const buildHash = async () => sha256Text((await Promise.all((await listFiles(file('workspace/game/dist'))).map(async name=>`${name}:${await sha256File(file(`workspace/game/dist/${name}`))}`))).join('\n'));
const inputDir = `qa-input/${pass}`;
await mkdir(file(inputDir),{recursive:true});

if (phase.startsWith('capture')) {
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
 console.log(JSON.stringify({phase,buildHash:hash,packet:`${inputDir}/packet.json`}));
} else {
 const receipts = await readCodexUsageReceipts(runRoot);
 const replacement=await exists(file('artifacts/pilot-authorization.json')) ? z.object({replacementQaCalls:z.literal(1)}).parse(await readJson('artifacts/pilot-authorization.json')).replacementQaCalls : 0;
 if(receipts.length>=3+replacement || receipts.reduce((sum,r)=>sum+r.usage.totalTokens,0)>=200000) throw new Error('Pilot model-call/token ceiling reached');
 const usedMs=completedCodexExecutionMs(receipts);
 if(usedMs>=1800000) throw new Error('Pilot cumulative 30-minute wall-clock ceiling reached');
 const client=new CodexCliProvider({timeoutMs:Math.min(600000,1800000-usedMs),maxRetries:0,model:'gpt-6.1-sol'});
 await client.assertChatGptLogin();
 const provider=new CodexAccountProvider(client,{fixTimeoutMs:Math.min(600000,1800000-usedMs)});
 if(phase==='fix') {
  const report=QaReportSchema.parse(await readJson('artifacts/pilot-validated-issues.json'));
  if(report.issues.some(issue=>issue.rootCause!=='implementation'))throw new Error('Only causally validated implementation issues may reach Fixer');
  const result=await new FixerAgent(provider,new WebLiteRuntimeAdapter(process.cwd())).run(workspace,undefined,report,{runRoot,outputPath:file('logs/codex/FIX.last-message.txt'),logDir:file('logs/codex'),inputPaths:['artifacts/pilot-validated-issues.json'],stage:'FIX',sandbox:'workspace-write',contextPacket:{schemaVersion:1,stage:'FIX',summary:'Route formal-fixer. Repair only the validated issues; preserve gameplay and contracts. Test first. The host builds once. No injected-answer/oracle context is supplied.',inputs:[],omitted:['conversation','administrator oracle','reference speculation'],totalChars:0}});
  await writeJsonAtomic(file('artifacts/pilot-fix-result.json'),{...result,route:'formal-fixer',attempt:1,threadContinuity:'No Builder model thread exists for this local clone; replacement workspace thread recorded.',status:'AWAITING_INDEPENDENT_QA'});
 } else {
  const Packet=z.object({workspace:z.string(),buildHash:z.string(),contractHash:z.string(),qaObservation:z.object({buildPath:z.string(),buildSha256:z.string(),tracePath:z.string(),traceSha256:z.string(),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),referenceImages:z.array(z.object({path:z.string(),sha256:z.string()}))}),comparison:z.object({reference:z.object({path:z.string(),sha256:z.string()}),candidate:z.object({path:z.string(),sha256:z.string()})}),limitations:z.array(z.string())});
  const packet=Packet.parse(await readJson(`${inputDir}/packet.json`));
  const first=phase==='qa-retest'?ReferenceFidelityReviewSchema.parse(await readJson('artifacts/pilot-qa-first.json')):undefined;
  const requiredRetests=first===undefined?[]:first.discoveries.filter(issue=>issue.severity==='error').map(({id,objectType,stateBranch,viewport})=>({id,objectType,stateBranch,viewport}));
  const paths=['qa-input/contract.json',`${inputDir}/packet.json`,`${inputDir}/trace.json`,`${inputDir}/reference-capture.json`,`${inputDir}/candidate-capture.json`];
  const result=await provider.reviewReferenceCandidate({workspace,buildHash:packet.buildHash,contractHash:packet.contractHash,requiredRetests},{runRoot,outputPath:file(`artifacts/pilot-qa-${pass}.json`),logDir:file('logs/codex'),inputPaths:paths,stage:'QA',sandbox:'read-only',qaObservation:packet.qaObservation,contextPacket:{schemaVersion:1,stage:'QA',summary:`Neutral player-experience inspection. Read ONLY these frozen files: ${paths.join(', ')}. Candidate PNGs are attached first in chronological order, followed by reference contact sheets. Compare player intent, action, visible outcome and feedback; report important out-of-contract issues if actually observed. No defect answer is supplied. Do not inspect workspace source, other runs, history, scripts, administrator material or earlier reports. Use only the cited frozen trace and screenshots. If discovering an issue, use the cited trace transition name as discovery id (startup/core-action/terminal/replay) so its evidence can be mechanically joined; those are observation categories, not claims of defects. Source limits remain UNKNOWN; do not claim source input timings or completed dual-input acceptance. Supplied independent capture pointers: ${JSON.stringify(packet.comparison)}. Cases may remain empty where no contract check exists. ${first?'This is a fresh independent review after one repair; cover requiredRetests, without trusting Fixer conclusions.':''}`,inputs:[],omitted:['game source','prior defect answers','Builder/Fixer conclusions','administrator oracle'],totalChars:0}});
  const review=ReferenceFidelityReviewSchema.parse(result.value);await writeJsonAtomic(file(`artifacts/pilot-qa-${pass}.json`),review);
  const validated=await verifyReferenceRepairReview({runRoot,targetRunId:runId,workspace,buildHash:packet.buildHash,contract:await readJson('qa-input/contract.json'),review,requiredRetests});
  await writeJsonAtomic(file(`artifacts/pilot-qa-${pass}-validation.json`),validated);
  console.log(JSON.stringify({phase,metrics:result.metrics,discoveries:review.discoveries.length,validation:validated.blockers}));
 }
}
