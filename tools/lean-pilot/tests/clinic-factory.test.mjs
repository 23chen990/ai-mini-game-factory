/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildClinic } from '../build-workflow.mjs';
import { candidateSpec, listCandidates } from '../candidates.mjs';
import { createRun, loadRun, checkRun, reportRun, verifyRunInputs, serveRun } from '../runner.mjs';
import { standaloneHtml } from '../standalone.mjs';
import { evaluateClinicPlaytest } from '../clinic-review.mjs';
import { comparePolicies } from '../clinic-balance.mjs';

async function fixture(t){const base=await mkdtemp(path.join(tmpdir(),'clinic-factory-'));t.after(()=>rm(base,{recursive:true,force:true}));await buildClinic(base,'clinic-test');return {base,...await loadRun(base,'clinic-test')};}
test('registry describes actual candidates, never invents an implementation from genre',()=>{
  assert.equal(listCandidates().length,2);assert.equal(candidateSpec('clinic-queue-v1').profile,'STRATEGIC_SYSTEM');
  assert.throws(()=>candidateSpec('NARRATIVE_AGENCY'));assert.throws(()=>candidateSpec('__proto__'));
});
test('checked workflow produces isolated real runtime, source archive and frozen request/contract',async t=>{
  const f=await fixture(t);assert.equal(f.run.templateId,'clinic-queue-v1');assert.equal((await verifyRunInputs(f.root,f.run)).passed,true);
  const request=JSON.parse(await readFile(path.join(f.root,'input/request.json'),'utf8'));assert.equal(request.gameId,'clinic-test');
  assert.ok((await readFile(path.join(f.game,'engine.mjs'),'utf8')).includes('export function tick'));
  assert.equal((await reportRun(f.base,'clinic-test')).publishable,false);
});
test('existing workspaces are never overwritten or silently reset',async t=>{
  const f=await fixture(t);await assert.rejects(buildClinic(f.base,'clinic-test'),/EEXIST/);await assert.rejects(buildClinic(f.base,'../escape'));
});
test('clinic cannot be selected through grid theme fallback or an unbound internal run',async t=>{
  const f=await fixture(t);await assert.rejects(createRun(f.base,'bad','clinic'));
  await assert.rejects(createRun(f.base,'bad2','clinic',{templateId:'clinic-queue-v1'}),/workflow/);
});
test('editing the specification invalidates inputs and does not promote an old report',async t=>{
  const f=await fixture(t);await writeFile(path.join(f.root,'input/contract.json'),'{}');await assert.rejects(verifyRunInputs(f.root,f.run),/workflow input/);
});
test('source corruption fails before engine execution',async t=>{
  const f=await fixture(t);await writeFile(path.join(f.root,'evidence/reference/queue-excerpt.txt'),'invented');await assert.rejects(checkRun(f.base,'clinic-test'),/hash-mismatch/);
});
test('candidate identity cannot drift into another games test suite',async t=>{
  const f=await fixture(t);await writeFile(path.join(f.game,'candidate.json'),'{"templateId":"grid-merge-v1"}');await assert.rejects(verifyRunInputs(f.root,f.run),/identity/);
});
test('copied engine passes its actual tests, while browser, human and release remain separate',async t=>{
  const f=await fixture(t);const result=await checkRun(f.base,'clinic-test');assert.equal(result.passed,true,result.stderr);
  const report=await reportRun(f.base,'clinic-test');assert.equal(report.engineering,'PASS');assert.equal(report.browser,'NOT_RUN');assert.equal(report.human.status,'NOT_RUN');assert.equal(report.publishable,false);
});
test('export bundles reviewed modules, unique namespace and no external game assets',async t=>{
  const f=await fixture(t);const out=await standaloneHtml(f.game,'clinic','clinic-test');assert.ok(out.html.includes('window.__BUILD_META__='));
  assert.ok(out.html.includes('clinic-test'));assert.ok(!out.html.includes('src="main.mjs"'));assert.ok(!out.html.includes('href="style.css"'));
  await assert.rejects(standaloneHtml(f.game,'orchard'));await assert.rejects(standaloneHtml(f.game,'clinic','../../bad'));
});
test('additional unreviewed imports do not silently ship in an export',async t=>{
  const f=await fixture(t);const p=path.join(f.game,'main.mjs');await writeFile(p,"import anything from './extra.mjs';\n"+await readFile(p,'utf8'));await assert.rejects(standaloneHtml(f.game,'clinic'),/Unsupported/);
});
test('comparison executes the actual copied engine with the same seeded arrivals',async t=>{
  const f=await fixture(t);const r=await comparePolicies(f.game);assert.equal(r.human,'NOT_RUN');assert.equal(new Set(r.results.map(v=>v.arrived)).size,1);
  assert.ok(r.results[2].completed>r.results[0].completed);assert.ok(r.results[2].completed>r.results[1].completed);
});
test('same server can serve clinic, but never evidence, request metadata or arbitrary paths',async t=>{
  const f=await fixture(t);const server=await serveRun(f.base,'clinic-test',0);t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/input/contract.json')).status,404);
  assert.equal((await fetch(url+'/evidence/research.json')).status,404);assert.equal((await (await fetch(url+'/build.json')).json()).runId,'clinic-test');
});
test('game-specific human gates do not accept a grid playtest or model-generated record',async()=>{
  const expected={runId:'x',buildHash:'0'.repeat(64)};assert.equal((await evaluateClinicPlaytest('/missing',null,expected)).status,'NOT_RUN');
  assert.equal((await evaluateClinicPlaytest('/missing',{status:'RECORDED',profile:'PUZZLE_CLARITY'},expected)).passed,false);
});
