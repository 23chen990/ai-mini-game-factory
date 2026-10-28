import type { AgentExecutionContext, ReferenceReviewRequest } from '../../src/providers/interfaces.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { SyntheticReferenceProvider } from '../fixtures/reference-comparison.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, {recursive:true,force:true}))); });
it('actually invokes the independent reference reviewer, rather than only writing a review task', async () => {
 const root=await mkdtemp(path.join(tmpdir(),'reference-review-loop-')); roots.push(root);
 const seed=path.join(root,'seed.yaml');
 await writeFile(seed,(await readFile('examples/seeds/relic-revival-workshop.yaml','utf8')).replace('researchFiles: []','researchFiles: [input/reference-report.txt]'));
 let calls=0;
 let comparisonInputs:string[]=[];
 class Reviewer extends SyntheticReferenceProvider {
  async reviewReferenceCandidate(_input:ReferenceReviewRequest,context:AgentExecutionContext) { calls++; comparisonInputs=context.inputPaths; return {value: {},metrics:{provider:'synthetic-orchestration-only',model:'mock',calls:1}}; }
 }
 const factory=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new Reviewer()});
 const runId=await factory.newRun(seed);
 await writeFile(path.join(root,'runs',runId,'input/reference-report.txt'),'Synthetic source for orchestration, not gameplay evidence.');
 await factory.run(runId);
 await factory.approveReference(runId,{decision:'APPROVE',notes:'Synthetic fixture only.'});
 const outcome=await factory.resume(runId).catch(error=>error);
 expect(calls,String(outcome)).toBe(1);
 expect(comparisonInputs).toContain('artifacts/runtime-product-journey.json');
 expect(comparisonInputs).not.toContain('artifacts/qa-report.json');
});

import { vi } from 'vitest';
import { MockCodexProvider } from '../../src/providers/mock.js';
import { MockQAProvider } from '../../src/providers/runtime-qa.js';
async function failedPreview(rootCause: 'implementation'|'design'|'research', throwFirst=false, varyWording=false) {
 const root=await mkdtemp(path.join(tmpdir(),'reference-repair-loop-')); roots.push(root);
 const seed=path.join(root,'seed.yaml');
 await writeFile(seed,(await readFile('examples/seeds/relic-revival-workshop.yaml','utf8')).replace('researchFiles: []','researchFiles: [input/reference-report.txt]'));
 let fixes=0,blueprints=0;
 class Producer extends SyntheticReferenceProvider {
  override async generateBlueprint(...args: Parameters<SyntheticReferenceProvider['generateBlueprint']>) { blueprints++; return super.generateBlueprint(...args); }
 }
 class Fixer extends MockCodexProvider {
  override async fix(input: Parameters<MockCodexProvider['fix']>[0]) {
   fixes++;
   if (throwFirst || fixes>1) throw new Error('Test stop: repeated repair without progress');
   return super.fix(input);
  }
 }
 const playtest=MockQAProvider.prototype.playtest;
 let observations=0;
 const spy=vi.spyOn(MockQAProvider.prototype,'playtest').mockImplementation(async function(input) {
  observations++;
  const report=await playtest(input);
  return {...report,passed:false,issues:[{id:'collision',severity:'error',message:varyWording?`Collision observed again at sample ${observations}`:'Repeated exact collision counterexample',evidence:'logs/collision.json',rootCause,hypothesis:'The collider resolves before contact.'}]};
 });
 const producer=new Producer();
 const factory=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:producer,codexProvider:new Fixer()});
 const runId=await factory.newRun(seed);
 await writeFile(path.join(root,'runs',runId,'input/reference-report.txt'),'Synthetic source for orchestration only.');
 await factory.run(runId);
 await factory.approveReference(runId,{decision:'APPROVE',notes:'Synthetic fixture only.'});
 let error:unknown;
 try { await factory.resume(runId); } catch(caught) {error=caught;} finally {spy.mockRestore();}
 return {fixes,blueprints,researchCalls:producer.researchCalls,error,state:await factory.status(runId),runRoot:path.join(root,'runs',runId)};
}
it('retests one no-op repair, then pauses without repeating the same repair',async()=>{
 const result=await failedPreview('implementation');
 expect(result.error).toBeUndefined();
 expect(result.fixes).toBe(1);
 expect(result.state).toMatchObject({stage:'QA',status:'waiting',fixAttempts:1});
 expect(result.state.stages.QA!.evidence).toContain('blocked:repair-no-progress');
});
it('does not send an explicit upstream design finding to Fixer',async()=>{
 const result=await failedPreview('design');
 expect(result.error).toBeUndefined();
 expect(result.fixes).toBe(0);
 expect(result.blueprints).toBe(2);
 expect(result.state).toMatchObject({stage:'BLUEPRINT',status:'waiting'});
 const report=JSON.parse(await readFile(path.join(result.runRoot,'artifacts/failure-report.json'),'utf8'));
 expect(report).toMatchObject({owner:'ProducerAgent',routeTo:'BLUEPRINT'});
});
it('counts a failed provider repair exactly once and preserves its input evidence',async()=>{
 const result=await failedPreview('implementation',true);
 expect(result.fixes).toBe(1);
 expect(result.state.fixAttempts).toBe(1);
 expect(await readFile(path.join(result.runRoot,'history/reference-repairs/attempt-1/qa-report.json'),'utf8')).toContain('collision');
});

import { mergeOperatingProfile } from '../../src/core/operating-profile.js';
it('reserves a model comparison before dispatch rather than treating it as free deterministic QA',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'reference-review-cost-'));roots.push(root);
 const seed=path.join(root,'seed.yaml');
 await writeFile(seed,(await readFile('examples/seeds/relic-revival-workshop.yaml','utf8')).replace('researchFiles: []','researchFiles: [input/reference-report.txt]'));
 const first=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new SyntheticReferenceProvider()});
 const runId=await first.newRun(seed);
 await writeFile(path.join(root,'runs',runId,'input/reference-report.txt'),'Synthetic evidence only.');
 await first.run(runId);await first.approveReference(runId,{decision:'APPROVE',notes:'Synthetic fixture only.'});
 const paused=await first.resume(runId);
 const profile=mergeOperatingProfile({autoAbandonOnCostCap:false});
 profile.budget.maxAgentTokens=Object.values(paused.stages).reduce((sum,stage)=>sum+stage.tokenUsage.totalTokens,0)+1;
 let calls=0;
 class Reviewer extends SyntheticReferenceProvider {async reviewReferenceCandidate(){calls++;return {value:{},metrics:{provider:'synthetic',model:'mock',calls:1}};}}
 const limited=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new Reviewer(),operatingProfile:profile});
 const result=await limited.resume(runId).catch(error=>error);
 expect(calls).toBe(0);
 expect(result).toMatchObject({stage:'QA',status:'waiting'});
});
it('runs the mandatory third QA cycle after two distinct changed-build repairs',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'reference-multiple-repairs-'));roots.push(root);
 const seed=path.join(root,'seed.yaml');
 await writeFile(seed,(await readFile('examples/seeds/relic-revival-workshop.yaml','utf8')).replace('researchFiles: []','researchFiles: [input/reference-report.txt]'));
 let fixes=0,qaCalls=0,workspace='';
 class Fixer extends MockCodexProvider {override async fix(input:Parameters<MockCodexProvider['fix']>[0]){fixes++;const file=path.join(workspace,'index.html');await writeFile(file,(await readFile(file,'utf8')).replace('</head>',`<meta name="synthetic-repair" content="${fixes}"></head>`));return super.fix(input);}}
 const playtest=MockQAProvider.prototype.playtest;
 const spy=vi.spyOn(MockQAProvider.prototype,'playtest').mockImplementation(async(input)=>{qaCalls++;const report=await playtest(input);return qaCalls>2?report:{...report,passed:false,issues:[{id:`case-${qaCalls}`,severity:'error',message:`Distinct synthetic case ${qaCalls}`,evidence:`logs/case-${qaCalls}.json`,rootCause:'implementation',hypothesis:`Different evidence-backed hypothesis ${qaCalls}`}]};});
 try {
  const factory=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new SyntheticReferenceProvider(),codexProvider:new Fixer(),enforceStageContracts:true});
  const runId=await factory.newRun(seed);workspace=path.join(root,'runs',runId,'workspace/game');
  await writeFile(path.join(root,'runs',runId,'input/reference-report.txt'),'Synthetic orchestration evidence only.');
  await factory.run(runId);await factory.approveReference(runId,{decision:'APPROVE',notes:'Synthetic only.'});
  const result=await factory.resume(runId).catch(error=>error);
  expect(result).not.toBeInstanceOf(Error);
  expect(fixes).toBe(2);expect(qaCalls).toBe(3);
 }finally{spy.mockRestore();}
});
it('does not reuse a legacy matching-hash review as evidence of the new independent discovery protocol',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'reference-review-legacy-'));roots.push(root);
 const seed=path.join(root,'seed.yaml');await writeFile(seed,(await readFile('examples/seeds/relic-revival-workshop.yaml','utf8')).replace('researchFiles: []','researchFiles: [input/reference-report.txt]'));
 const initial=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new SyntheticReferenceProvider()});const runId=await initial.newRun(seed);const runRoot=path.join(root,'runs',runId);
 await writeFile(path.join(runRoot,'input/reference-report.txt'),'Synthetic evidence only.');await initial.run(runId);await initial.approveReference(runId,{decision:'APPROVE',notes:'Synthetic only.'});await initial.resume(runId);
 const gate=JSON.parse(await readFile(path.join(runRoot,'artifacts/reference-fidelity-gate.json'),'utf8'));
 await writeFile(path.join(runRoot,'artifacts/reference-fidelity-review.json'),JSON.stringify({schemaVersion:1,targetRunId:runId,workspace:path.join(runRoot,'workspace/game'),buildHash:gate.buildHash,contractHash:gate.contractHash,reviewer:'QAAgent',authorIndependent:true,cases:[]}));
 let calls=0;class Reviewer extends SyntheticReferenceProvider{async reviewReferenceCandidate(){calls++;return {value:{},metrics:{provider:'synthetic',model:'mock',calls:1}};}}
 await createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new Reviewer()}).resume(runId).catch(()=>undefined);
 expect(calls).toBe(1);
});
it('does not copy outside bytes from stale model-authored symlink evidence into repair history',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'reference-symlink-'));roots.push(root);
 const seed=path.join(root,'seed.yaml');await writeFile(seed,(await readFile('examples/seeds/relic-revival-workshop.yaml','utf8')).replace('researchFiles: []','researchFiles: [input/reference-report.txt]'));
 let fixes=0;class Fixer extends MockCodexProvider{override async fix(input:Parameters<MockCodexProvider['fix']>[0]):Promise<never>{fixes++;throw new Error(`Outside evidence reached Fixer ${JSON.stringify(input)}`);}}
 const playtest=MockQAProvider.prototype.playtest;
 const spy=vi.spyOn(MockQAProvider.prototype,'playtest').mockImplementation(async(input)=>({...await playtest(input),passed:false,issues:[{id:'collision',severity:'error',message:'Synthetic counterexample',evidence:'logs/counterexample.json'}]}));
 try {
  const factory=createFactory({root,mode:'mock',qaMode:'stub',agentProvider:new SyntheticReferenceProvider(),codexProvider:new Fixer()});const runId=await factory.newRun(seed);const runRoot=path.join(root,'runs',runId);
  await writeFile(path.join(runRoot,'input/reference-report.txt'),'Synthetic source only.');await factory.run(runId);await factory.approveReference(runId,{decision:'APPROVE',notes:'Synthetic only.'});
  await writeFile(path.join(root,'outside-sentinel.txt'),'must-not-be-copied');
  await (await import('node:fs/promises')).symlink(path.join(root,'outside-sentinel.txt'),path.join(runRoot,'screenshots/symlink.png'));
  const trace='{}';await writeFile(path.join(runRoot,'logs/stale.json'),trace);
  const {sha256Text}=await import('../../src/core/files.js');
  await writeFile(path.join(runRoot,'artifacts/reference-fidelity-review.json'),JSON.stringify({schemaVersion:1,targetRunId:runId,workspace:path.join(runRoot,'workspace/game'),buildHash:'a'.repeat(64),contractHash:'b'.repeat(64),reviewer:'QAAgent',authorIndependent:true,cases:[{checkId:'stale',objectType:'target',stateBranch:'intact',viewport:{width:390,height:844},passed:false,perceptualPassed:false,observedStateChange:'stale',observedFeedback:'stale',screenshots:[{path:'screenshots/symlink.png',sha256:sha256Text('must-not-be-copied')}],trace:{path:'logs/stale.json',sha256:sha256Text(trace)}}]}));
  await factory.resume(runId).catch(()=>undefined);
  expect(fixes).toBe(0);
  await expect(readFile(path.join(runRoot,'history/reference-repairs/attempt-1/screenshots/symlink.png'),'utf8')).rejects.toThrow();
 }finally{spy.mockRestore();}
});

it('does not restart an unchanged-build repair merely because QA rewords the same issue',async()=>{
 const result=await failedPreview('implementation',false,true);
 expect(result.error).toBeUndefined();expect(result.fixes).toBe(1);
 expect(result.state.stages.QA!.evidence).toContain('blocked:repair-no-progress');
});

it('executes one targeted Research correction for an explicit Research finding', async () => {
 const result=await failedPreview('research');
 expect(result.fixes).toBe(0);expect(result.researchCalls).toBe(2);
 expect(result.state).toMatchObject({stage:'REFERENCE_DEEP_RESEARCH',status:'waiting'});
 expect(result.state.stages.REFERENCE_DEEP_RESEARCH!.evidence).toContain('blocked:upstream-rework-no-progress');
});
