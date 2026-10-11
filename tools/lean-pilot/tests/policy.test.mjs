/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sha256, safeRead, verifyEvidence, evaluateBudget, evaluatePlaytest, DEFAULT_BUDGET } from '../policy.mjs';

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(),'lean-policy-')); t.after(() => rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'source.txt'),'A valid move spawns one tile.\nA merge cannot chain.\n');
  const text = 'A valid move spawns one tile.\nA merge cannot chain.\n';
  return { root, manifest: { schemaVersion:1, targetId:'reference-1', requiredClaimIds:['spawn'],
    sources:[{id:'s1',path:'source.txt',sha256:sha256(text),url:'https://example.com/rules',collectedAt:'2026-01-01T00:00:00Z',method:'CODE_READ',version:'v1'}],
    claims:[{id:'spawn',kind:'SOURCE_CODE',text:'Valid moves spawn a tile',evidence:[{sourceId:'s1',quote:'A valid move spawns one tile.'}]}],
    unknowns:[{id:'revenue',blocking:false,reason:'No financial access'}] } };
}

test('actual source bytes and quote anchors are checked; unknown revenue does not block', async t => {
  const {root,manifest}=await setup(t); const result=await verifyEvidence(root,manifest);
  assert.equal(result.passed,true); assert.equal(result.integrityVerifiedSources,1);
  assert.equal(result.gameplayObserved,false); assert.equal(result.warnings.length,1);
});

test('a fabricated hash is not counted as independently verified', async t => {
  const {root,manifest}=await setup(t); manifest.sources[0].sha256='a'.repeat(64);
  const result=await verifyEvidence(root,manifest); assert.equal(result.passed,false); assert.equal(result.integrityVerifiedSources,0);
});

test('unmatched quote, unknown reference, duplicate identity and empty source list fail closed', async t => {
  const {root,manifest}=await setup(t);
  for (const mutate of [m=>{m.claims[0].evidence[0].quote='fabricated'},m=>{m.claims[0].evidence[0].sourceId='other'},
    m=>{m.sources.push(m.sources[0])},m=>{m.sources=[]},m=>{m.requiredClaimIds=['missing']}]) {
    const candidate=structuredClone(manifest); mutate(candidate); assert.equal((await verifyEvidence(root,candidate)).passed,false);
  }
});

test('critical unknown blocks; absence of evidence is not inferred into a fact', async t => {
  const {root,manifest}=await setup(t); manifest.unknowns.push({id:'failure',blocking:true,reason:'Cannot see terminal rule'});
  assert.equal((await verifyEvidence(root,manifest)).passed,false);
  manifest.unknowns=[]; manifest.claims[0].kind='UNKNOWN'; manifest.claims[0].evidence=[];
  assert.equal((await verifyEvidence(root,manifest)).passed,false);
});

test('source code cannot silently become an observed gameplay claim', async t => {
  const {root,manifest}=await setup(t); manifest.claims[0].kind='OBSERVATION';
  assert.equal((await verifyEvidence(root,manifest)).passed,false);
});

test('unsafe URLs, future timestamps, missing versions and malformed manifests fail', async t => {
  const {root,manifest}=await setup(t);
  for (const url of ['http://example.com','https://localhost/x','https://127.0.0.1/x','https://u:p@example.com','https://[::1]/','https://example.com:8443/']) {
    const m=structuredClone(manifest); m.sources[0].url=url; assert.equal((await verifyEvidence(root,m)).passed,false);
  }
  for (const candidate of [null,{}, {...manifest,sources:[{...manifest.sources[0],collectedAt:'2999-01-01T00:00:00Z'}]},
    {...manifest,sources:[{...manifest.sources[0],version:''}]}]) assert.equal((await verifyEvidence(root,candidate)).passed,false);
});

test('traversal, symlinks, directories and oversized files are not evidence', async t => {
  const {root}=await setup(t); await mkdir(path.join(root,'sub')); await symlink(path.join(root,'source.txt'),path.join(root,'link'));
  await symlink(root,path.join(root,'alias'));
  for (const p of ['../source.txt','/etc/passwd','sub/../source.txt','link','alias/source.txt','sub','source.txt\u0000']) await assert.rejects(safeRead(root,p));
  await assert.rejects(safeRead(root,'source.txt',2));
});

const request={buildHash:'b'.repeat(64),cashCents:0,timeoutMs:20000};
const ledger={buildHashes:[],cashCents:0,elapsedMs:0,pending:false};
test('default lane has zero spend and at most initial build plus two revisions', () => {
  assert.equal(evaluateBudget(DEFAULT_BUDGET,ledger,request).passed,true);
  assert.equal(evaluateBudget(DEFAULT_BUDGET,ledger,{...request,cashCents:1}).passed,false);
  assert.equal(evaluateBudget(DEFAULT_BUDGET,{...ledger,buildHashes:['1','2','3']},request).passed,false);
  assert.equal(evaluateBudget(DEFAULT_BUDGET,{...ledger,buildHashes:[request.buildHash,'2','3']},request).passed,true);
});

test('unknown pricing, negative values, exhausted time and interrupted attempts block', () => {
  for (const r of [{...request,cashCents:null},{...request,cashCents:-1},{...request,timeoutMs:Infinity},{...request,timeoutMs:0}])
    assert.equal(evaluateBudget(DEFAULT_BUDGET,ledger,r).passed,false);
  assert.equal(evaluateBudget(DEFAULT_BUDGET,{...ledger,elapsedMs:DEFAULT_BUDGET.maxElapsedMs},request).passed,false);
  assert.equal(evaluateBudget(DEFAULT_BUDGET,{...ledger,pending:true},request).passed,false);
  assert.equal(evaluateBudget({...DEFAULT_BUDGET,maxCashCents:-1},ledger,request).passed,false);
});

test('no playtest is always NOT_RUN, never an automatic pass', async t => {
  const {root}=await setup(t); const result=await evaluatePlaytest(root,{status:'NOT_RUN'},{runId:'demo',buildHash:request.buildHash});
  assert.equal(result.status,'NOT_RUN'); assert.equal(result.passed,false);
});

test('human records must bind build, identity, consent and real evidence files', async t => {
  const {root}=await setup(t); await writeFile(path.join(root,'record.txt'),'Observed session notes');
  const review={status:'RECORDED',runId:'demo',buildHash:request.buildHash,reviewer:'independent-reviewer',
    participants:Array.from({length:5},(_,i)=>({id:`anon-${i}`,source:'HUMAN',uncoached:true,consent:true,priorExperience:false,
      firstMergeMs:5000,durationMs:180000,willinglyContinued:i<3,evidencePath:'record.txt',evidenceHash:sha256('Observed session notes')}))};
  // One evidence file can contain several explicitly identified sessions; ids remain unique.
  assert.equal((await evaluatePlaytest(root,review,{runId:'demo',buildHash:request.buildHash})).passed,true);
  for (const mutate of [r=>{r.buildHash='c'.repeat(64)},r=>{r.participants[0].source='AUTOMATION'},
    r=>{r.participants[0].id=r.participants[1].id},r=>{r.participants[0].consent=false},r=>{r.participants[0].evidenceHash='0'.repeat(64)}]) {
    const candidate=structuredClone(review);mutate(candidate);
    assert.equal((await evaluatePlaytest(root,candidate,{runId:'demo',buildHash:request.buildHash})).passed,false);
  }
});
