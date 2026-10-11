/* global process, URL */
/* All Evidence and reviewer values below are synthetic test fixtures, not REA sessions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../policy.mjs';
import { canonicalJson, evidenceId, supportedReaNode, planResearch, inspectExport, reviewExport, anchorExport } from '../rea-bridge.mjs';

const digest = 'a'.repeat(64);
const evidence = () => ({
  evidence_id: '',
  subject: { name: 'SYNTHETIC', digest: { sha256: digest }, format: 'directory', architecture: null, local_path: '/synthetic/not-a-real-app' },
  provider: { id: 'synthetic-parser', name: 'Synthetic fixture', version: null },
  analysis_profile: null, predicate_type: 'rea.javascript-application-analysis', operation: 'analyze_javascript_application',
  parameters: { format: 'directory', integrity_policy: 'fail' }, raw_result: null,
  normalized_result: { input_path: '/synthetic/not-a-real-app', root_artifact_sha256: digest, format: 'directory',
    graph: { nodes: [{ id: 'preview', role: 'local-preview' }, { id: 'submit', role: 'explicit-submit' }] }, limitations: ['Static fixture; not runtime observation.'] },
  confidence: 'derived', authority: 'shipped-artifact', environment: null,
  limitations: ['Static fixture; not runtime observation.'], locations: [{ kind: 'artifact-path', path: 'artifact-root' }], evidence_links: [],
});
function encode(value = evidence()) { value.evidence_id = evidenceId(value); return JSON.stringify(value); }
const makeJob = () => ({ schemaVersion: 1, id: 'synthetic-trial', product: 'game',
  target: { id: 'fixture-app', version: 'fixture-1', kind: 'javascript-artifact', readableSource: false, subjectSha256: digest },
  permission: { basis: 'owned', reference: 'Synthetic ownership fixture; not a real approval.' },
  questions: [{ id: 'preview-boundary', kind: 'client-structure', question: 'Where is the preview/submit boundary?', decision: 'Separate a local preview from an explicit submit.' }],
  baseline: { status: 'RECORDED', minutes: 10, cashCents: 0, evidence: [{ path: 'baseline.txt', sha256: sha256('SYNTHETIC BASELINE') }], resolvedIds: [] },
  limits: { maxAdditionalMinutes: 30, maxAdditionalCashCents: 0, maxAttempts: 2 }, allowedFiles: ['templates/web-lite/grid-merge-v1/main.mjs'],
});
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'rea-bridge-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'baseline.txt'), 'SYNTHETIC BASELINE');
  return { root, job: makeJob(), raw: encode() };
}
function review(job, raw) {
  return { schemaVersion: 1, status: 'RECORDED', jobHash: sha256(canonicalJson(job)), reportSha256: sha256(raw),
    reviewer: 'SYNTHETIC REVIEWER', publicSafe: true, targetScopeVerified: true, executedPackageVersion: '6.4.0',
    measured: { setupMinutes: 2, analysisMinutes: 3, reviewMinutes: 4, failedAttemptMinutes: 1, cashCents: 0, attempts: 2 },
    findings: [{ questionId: 'preview-boundary', pointer: '/normalized_result/graph/nodes/0/role', valueSha256: sha256(canonicalJson('local-preview')),
      summary: 'A local-preview component exists in the synthetic graph.', proposedChange: 'Consider a distinct local preview before explicit submit.',
      files: ['templates/web-lite/grid-merge-v1/main.mjs'],
      state: { before: 'Draft exists', action: 'Change an option', after: 'Draft preview updated', feedback: 'Preview label remains visible', recovery: 'Cancel keeps the previous draft' },
      acceptance: { given: 'An editable draft', when: 'A local preview changes', then: 'No final submission is sent until confirmed' } }],
  };
}

test('Node compatibility mirrors REA requirements without upgrading the host', () => {
  for (const v of ['22.19.0', 'v22.20.1', '24.11.0', '26.0.0', '27.1.0']) assert.equal(supportedReaNode(v), true, v);
  for (const v of ['22.16.0','24.10.9','23.9.0','25.1.0','26.0.0-rc.1','banana','26','26.0.0.1']) assert.equal(supportedReaNode(v), false, v);
});
test('baseline first and direct-readable source avoid unnecessary REA', () => {
  const job = makeJob(); job.baseline.status = 'NOT_RUN';
  assert.equal(planResearch(job).route, 'BASELINE_FIRST');
  job.baseline.status = 'RECORDED'; job.target.readableSource = true;
  assert.equal(planResearch(job).route, 'DIRECT_SOURCE_FIRST');
  job.baseline.resolvedIds = ['preview-boundary'];
  assert.equal(planResearch(job).route, 'SKIP_REA');
});
test('visible play, image quality, commercial and secret questions never route to static REA', () => {
  for (const kind of ['visible-behavior', 'image-quality', 'commercial', 'server-secret']) {
    const job = makeJob(); job.questions[0].kind = kind;
    assert.equal(planResearch(job).eligibleQuestionIds.length, 0);
    assert.notEqual(planResearch(job).route, 'REA_STATIC_ON_DEMAND');
  }
});
test('native mobile targets need a separate study, not a guessed JavaScript command', () => {
  for (const kind of ['ios', 'android']) {
    const job = makeJob(); job.target.kind = kind;
    assert.equal(planResearch(job).route, 'SEPARATE_NATIVE_REVIEW');
    assert.equal(planResearch(job).commandTemplate, null);
  }
});
test('permission is scoped: public observation is not permission for static code analysis', () => {
  for (const basis of ['unknown','public-observation']) {
    const job = makeJob(); job.permission.basis = basis;
    assert.equal(planResearch(job).route, 'PERMISSION_REQUIRED');
  }
});
test('only unresolved client structure gets the explicit nonexecuting CLI plan', () => {
  const p = planResearch(makeJob());
  assert.equal(p.route, 'REA_STATIC_ON_DEMAND');
  assert.equal(p.executed, false); assert.equal(p.installationRequested, false);
  assert.deepEqual(p.eligibleQuestionIds, ['preview-boundary']);
  assert.equal(p.commandTemplate[0], 'rea');
  assert.equal(p.commandTemplate.includes('--integrity-policy'), true);
});
test('malformed jobs, unknown resolved IDs and unsafe file allowances are rejected', () => {
  assert.throws(() => planResearch({}), /job:/);
  for (const mutate of [j => { j.baseline.resolvedIds = ['not-a-question']; }, j => { j.questions.push(j.questions[0]); },
    j => { j.allowedFiles = ['../server.ts']; }, j => { j.limits.maxAttempts = -1; }, j => { j.target.readableSource = 'no'; },
    j => { j.permission.reference = ''; }, j => { j.product = 'other'; }, j => { j.baseline.minutes = NaN; }]) {
    const job = makeJob(); mutate(job); assert.throws(() => planResearch(job), /job:/);
  }
});
test('canonical digest is independent of object insertion order but not array order', () => {
  assert.equal(canonicalJson({ b: 1, a: { z: null, x: 2 } }), '{"a":{"x":2,"z":null},"b":1}');
  assert.notEqual(canonicalJson([1,2]), canonicalJson([2,1]));
  for (const bad of [Infinity, NaN, undefined, { value: undefined }]) assert.throws(() => canonicalJson(bad), /json:/);
});
test('semantic ID excludes only display subject name/path as upstream specifies', () => {
  const e = evidence(); const first = evidenceId(e);
  e.subject.name = 'another display'; e.subject.local_path = '/another/display'; assert.equal(evidenceId(e), first);
  e.normalized_result.graph.nodes[0].role = 'changed'; assert.notEqual(evidenceId(e), first);
});
test('valid static export preserves limitations, confidence and the lack of origin attestation', async t => {
  const {root,job,raw} = await fixture(t); const r = await inspectExport(root,job,raw);
  assert.equal(r.status, 'INTEGRITY_CHECKED'); assert.equal(r.packageExecutionVerified, false);
  assert.equal(r.confidence, 'derived'); assert.equal(r.gameplayObserved, false); assert.equal(r.autoApply, false);
  assert.equal(r.limitations.length, 1); assert.equal(r.reportSha256, sha256(raw));
  assert.equal(JSON.stringify(r).includes('/synthetic/not-a-real-app'), false);
});
test('edited normalized results cannot keep a previously valid ev checksum', async t => {
  const {root,job,raw} = await fixture(t); const e = JSON.parse(raw); e.normalized_result.graph.nodes[0].role = 'forged';
  await assert.rejects(inspectExport(root,job,JSON.stringify(e)), /rea:semantic-id-mismatch/);
});
test('wrong subject and wrong inner identity are rejected even with a recomputed checksum', async t => {
  const {root,job} = await fixture(t);
  const e = evidence(); e.subject.digest.sha256 = 'b'.repeat(64);
  await assert.rejects(inspectExport(root,job,encode(e)), /rea:subject-mismatch/);
  const f = evidence(); f.normalized_result.root_artifact_sha256 = 'b'.repeat(64);
  await assert.rejects(inspectExport(root,job,encode(f)), /rea:inner-subject-mismatch/);
});
test('missing baseline bytes and changed baseline bytes cannot be replaced by self-reported counts', async t => {
  const {root,job,raw} = await fixture(t); await writeFile(path.join(root,'baseline.txt'), 'different');
  await assert.rejects(inspectExport(root,job,raw), /baseline:hash-mismatch/);
  job.baseline.evidence[0].path = 'missing.txt'; await assert.rejects(inspectExport(root,job,raw), /baseline:unreadable/);
});
test('unbound target identity or zero baseline attachments block inspection', async t => {
  const {root,job,raw} = await fixture(t); job.target.subjectSha256 = null;
  await assert.rejects(inspectExport(root,job,raw), /rea:subject-not-bound/);
  job.target.subjectSha256 = digest; job.baseline.evidence = [];
  await assert.rejects(inspectExport(root,job,raw), /baseline:missing/);
});
test('error, partial output, wrappers, prose and different operations are not successful static exports', async t => {
  const {root,job,raw} = await fixture(t);
  for (const bad of ['not JSON', '{"error":"timeout"}', JSON.stringify({ result: JSON.parse(raw) }), '```json\n'+raw+'\n```']) {
    await assert.rejects(inspectExport(root,job,bad), /rea:/);
  }
  const e = evidence(); e.operation = 'capture_electron_scenario'; await assert.rejects(inspectExport(root,job,encode(e)), /rea:unsupported-operation/);
});
test('wrong confidence, profile mismatch, unknown envelope keys and oversized exports fail closed', async t => {
  const {root,job} = await fixture(t);
  for (const change of [e=>{e.confidence='observed';},e=>{e.extra='future-version';},e=>{e.analysis_profile={provider:{id:'different',name:'wrong',version:null}};}]) {
    const e=evidence(); change(e); await assert.rejects(inspectExport(root,job,encode(e)), /rea:/);
  }
  await assert.rejects(inspectExport(root,job,' '.repeat(2*1024*1024+1)), /rea:export-size/);
});
test('nested payload depth is bounded; prototype-named own keys stay inert data', async t => {
  const {root,job} = await fixture(t); let obj={}; for(let n=0;n<40;n++)obj={nested:obj};
  assert.throws(()=>canonicalJson(obj), /json:depth/);
  const e=evidence(); e.normalized_result.graph=JSON.parse('{"__proto__":{"polluted":true},"constructor":"static data"}');
  const result=await inspectExport(root,job,encode(e));
  assert.equal(result.status,'INTEGRITY_CHECKED'); assert.equal(Object.prototype.polluted,undefined);
  assert.equal(canonicalJson(e.normalized_result.graph),'{"__proto__":{"polluted":true},"constructor":"static data"}');
});
test('a missing reviewer never becomes an automatic actionable result', async t => {
  const {root,job,raw}=await fixture(t); const r=await reviewExport(root,job,raw,{schemaVersion:1,status:'NOT_RUN'});
  assert.equal(r.status,'REVIEW_REQUIRED'); assert.equal(r.autoApply,false);
});
test('a reviewed observation creates a bounded proposal, never a developer authorization', async t => {
  const {root,job,raw}=await fixture(t); const r=await reviewExport(root,job,raw,review(job,raw));
  assert.equal(r.status,'ONE_TRIAL_USEFUL_NOT_PROVEN'); assert.equal(r.newActionableDecisions,1);
  assert.equal(r.additionalMinutes,10); assert.equal(r.minutesPerDecision,10);
  assert.equal(r.speedupClaim,null); assert.equal(r.autoApply,false); assert.equal(r.proposals[0].approval,'RESEARCH_PROPOSAL_ONLY');
  assert.equal(JSON.stringify(r).includes('local_path'),false);
});
test('FORM proposals cannot mutate the frozen development scope', async t => {
  const {root,job,raw}=await fixture(t); job.product='form';
  const r=await reviewExport(root,job,raw,review(job,raw));
  assert.equal(r.destination,'FORM_NEXT_VERSION_REVIEW_ONLY'); assert.equal(r.proposals[0].approval,'RESEARCH_PROPOSAL_ONLY');
});
test('job and report content changes invalidate previous reviews', async t => {
  const {root,job,raw}=await fixture(t); const r=review(job,raw); r.jobHash='0'.repeat(64);
  await assert.rejects(reviewExport(root,job,raw,r), /review:stale/);
  r.jobHash=sha256(canonicalJson(job)); r.reportSha256='0'.repeat(64);
  await assert.rejects(reviewExport(root,job,raw,r), /review:stale/);
});
test('wrong pointers, forged values, duplicate answers and out-of-scope changes fail', async t => {
  const {root,job,raw}=await fixture(t);
  for(const mutate of [r=>{r.findings[0].pointer='/normalized_result/missing';},r=>{r.findings[0].valueSha256='0'.repeat(64);},
    r=>{r.findings.push(r.findings[0]);},r=>{r.findings[0].files=['server/secret.ts'];},r=>{r.findings[0].pointer='/subject/local_path';},
    r=>{r.findings[0].state.feedback='';},r=>{r.findings[0].acceptance.then='';}]){
    const r=review(job,raw);mutate(r);await assert.rejects(reviewExport(root,job,raw,r), /review:/);
  }
});
test('baseline-resolved answers and nonstatic questions cannot count as REA benefit', async t=>{
  const {root,job,raw}=await fixture(t);
  job.questions.push({id:'already-known',kind:'client-structure',question:'Known thing',decision:'Known decision'});
  job.baseline.resolvedIds=['already-known'];const r=review(job,raw);r.findings[0].questionId='already-known';
  await assert.rejects(reviewExport(root,job,raw,r),/review:ineligible-question/);
});
test('all setup, review and failed attempt time count against the incremental cap', async t=>{
  const {root,job,raw}=await fixture(t);const r=review(job,raw);r.measured.failedAttemptMinutes=25;
  assert.equal((await reviewExport(root,job,raw,r)).status,'OVER_BUDGET_STOP');
  r.measured.failedAttemptMinutes=1;r.measured.attempts=3;
  assert.equal((await reviewExport(root,job,raw,r)).status,'OVER_BUDGET_STOP');
});
test('unknown cost and nonzero unauthorized cost never look free', async t=>{
  const {root,job,raw}=await fixture(t);const r=review(job,raw);r.measured.cashCents=null;
  assert.equal((await reviewExport(root,job,raw,r)).status,'COST_UNKNOWN_STOP');
  r.measured.cashCents=1;assert.equal((await reviewExport(root,job,raw,r)).status,'OVER_BUDGET_STOP');
});
test('zero useful findings is a valid negative result rather than fabricated success', async t=>{
  const {root,job,raw}=await fixture(t);const r=review(job,raw);r.findings=[];
  const out=await reviewExport(root,job,raw,r);assert.equal(out.status,'NO_INCREMENTAL_VALUE');assert.equal(out.minutesPerDecision,null);
});
test('review needs privacy and scope attestation; package version is declared, not discovered', async t=>{
  const {root,job,raw}=await fixture(t);
  for(const change of [r=>{r.publicSafe=false;},r=>{r.targetScopeVerified=false;},r=>{r.executedPackageVersion='latest';},r=>{r.measured.analysisMinutes=-1;}]){
    const r=review(job,raw);change(r);await assert.rejects(reviewExport(root,job,raw,r),/review:/);
  }
});
test('CLI produces a plan without running REA, network, or changing files', async t=>{
  const {root,job}=await fixture(t);await writeFile(path.join(root,'job.json'),JSON.stringify(job));
  const cli=fileURLToPath(new URL('../rea-cli.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'plan',root,'job.json'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).executed,false);
});
test('CLI rejects path escape and unsupported execution mode; does not echo private payloads', async t=>{
  const {root}=await fixture(t);const cli=fileURLToPath(new URL('../rea-cli.mjs',import.meta.url));
  for(const args of [['plan',root,'../private.json'],['execute',root,'job.json']]){
    const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(r.stderr.includes(root),false);
  }
});

// Computed separately using Python sorted canonical ASCII JSON, NOT evidence of live REA.
test('fixed independent checksum vector catches projection drift', () => {
  assert.equal(evidenceId(evidence()), 'ev_585a4216143e59ee30e75ac9a72f9227787a893480d047559a26a9d4d0974bc9');
});

test('anchor command handles escaped JSON pointers without exposing the selected value', async t => {
  const {root,job}=await fixture(t); const e=evidence();
  e.normalized_result.graph={'a/b':{'x~y':'private-source-line'}};
  const raw=encode(e);const out=await anchorExport(root,job,raw,'/normalized_result/graph/a~1b/x~0y');
  assert.equal(out.valueSha256,sha256(canonicalJson('private-source-line')));
  assert.equal(out.rawValueIncluded,false);assert.equal(JSON.stringify(out).includes('private-source-line'),false);
  await assert.rejects(anchorExport(root,job,raw,'/normalized_result/graph/~bad'),/review:pointer/);
});
test('a null location is a typed rejected export rather than an accidental exception', async t => {
  const {root,job}=await fixture(t);const e=evidence();e.locations=[null];
  await assert.rejects(inspectExport(root,job,encode(e)),/rea:locations/);
});
test('CLI inspect, anchor and review operate on files with exact binding and no export mutation', async t => {
  const {root,job,raw}=await fixture(t);const cli=fileURLToPath(new URL('../rea-cli.mjs',import.meta.url));
  await writeFile(path.join(root,'job.json'),JSON.stringify(job));
  await writeFile(path.join(root,'export.json'),raw);
  await writeFile(path.join(root,'review.json'),JSON.stringify(review(job,raw)));
  for(const [mode,arg] of [['inspect',null],['anchor','/normalized_result/graph/nodes/0/role'],['review','review.json']]) {
    const args=[cli,mode,root,'job.json','export.json']; if(arg)args.push(arg);
    const result=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);const out=JSON.parse(result.stdout);
    assert.equal(out.autoApply,false);assert.equal(out.reportSha256,sha256(raw));
  }
});
