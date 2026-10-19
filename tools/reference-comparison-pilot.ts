/** QA-only runner. It never edits either game or injects game state/RNG. */
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { z } from 'zod';
import { listFiles, sha256File, sha256Text } from '../src/core/files.js';
import { ReferenceFidelityContractSchema } from '../src/schemas/reference-fidelity.js';
import { ReferenceComparisonCaptureSchema, type ReferenceComparisonCapture } from '../src/schemas/reference-comparison.js';
import { compareReferenceCaptures } from '../src/core/reference-comparison.js';
import { safeRunFile } from '../src/core/reference-evidence.js';
import { hasGridMove, measureGridMove, readGridDom, waitForGridTerminal, type GridDirection } from '../src/qa/grid-comparison-adapter.js';

const [runPath, candidateRelative = 'workspace/game', session = 'baseline'] = process.argv.slice(2);
// CLI paths are external input; this experiment may only read its two declared candidate variants.
z.enum(['workspace/game', 'workspace/negative-control']).parse(candidateRelative);
z.string().regex(/^[a-z0-9-]+$/u).parse(session);
const runRoot = path.resolve(z.string().min(1).parse(runPath));
const targetRunId = path.basename(runRoot);
const targetGame = 'factory-comparison-2048';
const workspace = path.join(runRoot, candidateRelative);
const referenceRoot = path.join(runRoot, 'reference-evidence/incoming/upstream');
const evidencePath = `logs/reference-comparison/${session}`;
await mkdir(path.join(runRoot, evidencePath), { recursive: true });
const referenceArtifact = {path:'reference-evidence/reference-build.json',sha256:await sha256File(path.join(runRoot,'reference-evidence/reference-build.json'))};
const manifest = z.object({files:z.array(z.object({path:z.string(),sha256:z.string()}))}).parse(JSON.parse(await readFile(path.join(runRoot,referenceArtifact.path),'utf8')));
for (const file of manifest.files) {
  const actual = await sha256File(await safeRunFile(referenceRoot,file.path));
  if (actual !== file.sha256) throw new Error(`reference source changed: ${file.path}`);
}
const buildFiles=await listFiles(workspace);
const buildHash=sha256Text((await Promise.all(buildFiles.map(async(file)=>`${file}:${await sha256File(path.join(workspace,file))}`))).join('\n'));
const viewport={width:390,height:844};
const protocol='fresh session; shared direction schedule at >=320ms; natural terminal retry; no state or RNG injection';
const definitions = [
  {id:'move-spawn',dimension:'input_state',branch:'direction-input',description:'Accepted directional movement spawns exactly one tile; a no-op spawns none.'},
  {id:'single-merge',dimension:'spatial_relation',branch:'row-resolution',description:'Equal adjacent values merge once per action, preserving directional ordering.'},
  {id:'score-feedback',dimension:'feedback_sequence',branch:'visible-score',description:'Visible score increases by the sum of newly merged values.'},
  {id:'loss-pressure',dimension:'failure_recovery',branch:'no-valid-moves',description:'Visible failure has a full board with no adjacent equal pair.'},
  {id:'retry-reset',dimension:'terminal_replay',branch:'normal-retry',description:'A normal retry visibly restores two tiles and a zero score.'},
];
const contract=ReferenceFidelityContractSchema.parse({
  schemaVersion:1,targetRunId,referenceName:'Pinned MIT 2048 mechanics research',provenance:[referenceArtifact],
  coreLoopOrder:['direction input','slide and merge','spawn and pressure','terminal and retry'],inputStateTransitions:['direction -> resolved board'],failureRecoveryRules:['no valid moves -> loss -> normal retry'],
  mustPreserveMechanics:definitions.map((row)=>row.description),progressionSystems:['board occupation and tile growth'],unlockRules:['not part of this measured slice'],
  feedbackTimingBands:null,status:'BLOCKED',blockers:['pilot:timing-and-difficulty-not-measured'],
  behaviorChecks:definitions.map((row)=>({id:row.id,dimension:row.dimension,objectType:'number-grid',stateBranch:row.branch,
    playerInput:protocol,expectedStateChange:row.description,spatialRelationship:'4 by 4 adjacency; no reference UI coordinates reused',
    visibleFeedback:{anchor:row.id==='score-feedback'?'score':'board and terminal overlay',eventOrder:['normal input','visible consequence']},viewport,
    sourceRefs:[{...referenceArtifact,locator:'files: js/game_manager.js move/setup/restart/movesAvailable; js/html_actuator.js actuate/updateScore'}],
    comparison:{evidenceBasis:'source-derived',referenceArtifact,condition:row.description,protocol,metric:`${row.id}-rule-error`,unit:'violations',referenceRange:{min:0,max:0},maxDelta:0,minimumSamples:1},
  })),
});
const contractHash=sha256Text(JSON.stringify(contract));
await writeFile(path.join(runRoot,'artifacts/reference-fidelity-contract.json'),JSON.stringify(contract,null,2));
await writeFile(path.join(runRoot,'artifacts/pilot-scope.json'),JSON.stringify({targetRunId,targetGame,workspace,sourceRevision:'478b6ec346e3787f589e4af751378d06ded4cbbc',candidateRevision:'2ffcd5bda398373d94bbaa264ccf81e1ee6e8ed6',durationSeconds:180,method:'direct-readable-source plus independent normal-input DOM observation',reaExecuted:false,llmBuilderExecuted:false,candidate:'existing original PR2 template, not a newly reconstructed game',coverage:definitions.map((row)=>row.id),notProven:['timing/animation fidelity','spawn distribution','difficulty curve','touch controls','human enjoyment','platform packages','autonomous research/build/repair'],inputScheduleOnlySeeded:true,gameRngModified:false},null,2));

const browser=await chromium.launch({headless:true});
const servers=[];
const sessions=[];
try {
  for (const target of ['reference','candidate'] as const) {
    const root=target==='reference'?referenceRoot:workspace;
    const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
    servers.push(server); await server.listen();
    const url=z.string().url().parse(server.resolvedUrls!.local[0]);
    const context=await browser.newContext({viewport});
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
    const page=await context.newPage();
    await page.goto(url); await page.waitForTimeout(350);
    const first=await readGridDom(page,target);
    const capture:ReferenceComparisonCapture={schemaVersion:1,targetRunId,contractHash,target,artifactHash:target==='reference'?referenceArtifact.sha256:buildHash,
      authority:'normal-input',startedFromReset:first.score===0 && !first.lost && first.cells.filter(value=>value!==0).length===2,forbiddenOperations:[],actions:['fresh browser context; load actual entrypoint'],observedAt:new Date().toISOString(),durationMs:1,
      observations:contract.behaviorChecks.map((check)=>({checkId:check.id,objectType:check.objectType,stateBranch:check.stateBranch,viewport,
        condition:check.comparison!.condition,protocol,metric:check.comparison!.metric,unit:'violations',samples:[],screenshots:[]}))};
    await page.screenshot({path:path.join(runRoot,evidencePath,`${target}-startup.png`)});
    sessions.push({target,page,capture,before:first});
  }
  const started=Date.now();
  let step=0;
  const directions:GridDirection[]=['left','up','right','down'];
  let inputSeed=1447;
  while(Date.now()-started<180_000) {
    inputSeed=(Math.imul(inputSeed,1664525)+1013904223)>>>0;
    const direction=step<10?'left':directions[inputSeed>>>30]!;
    await Promise.all(sessions.map(async(state)=>{
      const {page,capture}=state;
      await page.keyboard.press(`Arrow${direction[0]!.toUpperCase()}${direction.slice(1)}`);
      capture.actions.push(`${Date.now()-started}ms: key ${direction}`);
    }));
    await new Promise(resolve=>setTimeout(resolve,320));
    for (const state of sessions) {
      const {page,target,capture}=state;
      let after=await readGridDom(page,target);
      const measured=measureGridMove(state.before,after,direction);
      const record=async(id:string,value:number)=>{
        const observation=capture.observations.find(row=>row.checkId===id)!;
        observation.samples.push(value);
        if(observation.screenshots.length===0) {
          const file=`${evidencePath}/${target}-${id}.png`;
          await page.screenshot({path:path.join(runRoot,file)});
          observation.screenshots.push({path:file,sha256:await sha256File(path.join(runRoot,file))});
        }
      };
      await record('move-spawn',measured.movementError);
      if (measured.expectedScoreDelta > 0) {
        await record('single-merge',measured.movementError);
        await record('score-feedback',measured.scoreError);
      }
      if(after.lost) {
        await waitForGridTerminal(page,target);
        await record('loss-pressure',Number(hasGridMove(after.cells)));
        await page.locator(target==='reference'?'.retry-button':'#dialog-primary').click();
        capture.actions.push(`${Date.now()-started}ms: normal terminal retry click`);
        await page.waitForTimeout(350);
        after=await readGridDom(page,target);
        await record('retry-reset',Math.abs(after.cells.filter(value=>value!==0).length-2)+after.score+Number(after.lost));
      }
      state.before=after;
    }
    step++;
  }
  for(const state of sessions) {
    state.capture.durationMs=Date.now()-started;
    // Unreached branches stay absent and therefore block comparison; never invent samples/screenshots.
    const capture=ReferenceComparisonCaptureSchema.parse({...state.capture,observations:state.capture.observations.filter(row=>row.screenshots.length>0)});
    state.capture=capture;
    await writeFile(path.join(runRoot,evidencePath,`${state.target}.json`),JSON.stringify(capture,null,2));
  }
  const reference=sessions.find(item=>item.target==='reference')!.capture;
  const candidate=sessions.find(item=>item.target==='candidate')!.capture;
  const differences=compareReferenceCaptures({contract,contractHash,buildHash,reference,candidate});
  const report={schemaVersion:1,targetRunId,contractHash,buildHash,contractStatus:contract.status,contractBlockers:contract.blockers,steps:step,measuredBehaviorPassed:differences.length===0,differences,
    samples:Object.fromEntries(sessions.map(({target,capture})=>[target,Object.fromEntries(capture.observations.map(row=>[row.checkId,{count:row.samples.length,maxError:Math.max(...row.samples)}]))])),
    perceptualPassed:false,humanAccepted:false,commercialReleaseReady:false,evidencePath};
  await writeFile(path.join(runRoot,'artifacts',`${session}-comparison.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser.close();
  for(const server of servers) await server.close();
}
