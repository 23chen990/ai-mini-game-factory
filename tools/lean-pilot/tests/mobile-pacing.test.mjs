/* global URL, structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {policyHash,canonical,sha256,requiredCases,validateRequest,auditContract} from '../../../.agents/skills/gameplay-loop-review/scripts/workflow.mjs';
import {buildClinic} from '../build-workflow.mjs';
import {buildHash} from '../runner.mjs';
import {probeClinic} from '../quality-probe.mjs';
import {judgeClinic,reviewCandidate} from '../quality-review.mjs';
import {prepareCandidate,readDelivery} from '../quality-cycle.mjs';
import {VISIBLE_IDS} from '../quality-browser.mjs';
const R=path.resolve(new URL('../../../',import.meta.url).pathname);
const input=path.join(R,'examples/lean-pilot/clinic');
const parse=async p=>JSON.parse(await readFile(p,'utf8'));
async function fixture(t){const base=await mkdtemp(path.join(tmpdir(),'mobile-pacing-'));t.after(()=>rm(base,{recursive:true,force:true}));const r=await buildClinic(base,'case');return {base,game:r.workspace,root:path.join(base,'case')};}
let evidence;
test('real active recipe rejects 120 delayed single-action strategies and remains recoverable',async t=>{
 const {game}=await fixture(t);evidence=await probeClinic(game);
 assert.equal(evidence.active.singleAction.length,120);assert.equal(new Set(evidence.active.singleAction.map(x=>[x.seed,x.policy,x.at].join(':'))).size,120);
 assert.ok(evidence.active.singleAction.every(x=>x.actions<=1&&!x.passed));assert.equal(evidence.active.passingAdaptive,3);assert.ok(judgeClinic(evidence).every(x=>x.passed));
 for(const x of evidence.active.openingQueues){assert.ok(x.firstQueueMs<=10000);assert.ok(x.firstWarningMs<=30000);assert.ok(x.firstLossMs-x.firstWarningMs>=5000);}
});
test('old throughput-only evidence cannot certify an active-dispatch candidate',()=>{
 assert.ok(evidence);const e=structuredClone(evidence);delete e.active;
 assert.ok(judgeClinic(e).some(x=>x.id==='unassisted-backlog-and-attributable-loss'&&!x.passed));
});
test('copied scenarios or one winning passive policy invalidate the negative baseline',()=>{
 const e=structuredClone(evidence);e.active.singleAction[1]=e.active.singleAction[0];assert.ok(judgeClinic(e).some(x=>x.id==='unassisted-backlog-and-attributable-loss'&&!x.passed));
 const f=structuredClone(evidence);f.active.singleAction[0].passed=true;assert.ok(judgeClinic(f).some(x=>x.id==='unassisted-backlog-and-attributable-loss'&&!x.passed));
});
test('no false urgency: late warning and unobservable early queues fail the actual evidence gate',()=>{
 const e=structuredClone(evidence);e.active.openingQueues[0].firstWarningMs=33000;assert.ok(judgeClinic(e).some(x=>!x.passed));
 const f=structuredClone(evidence);f.active.openingQueues[0].firstQueueMs=45000;assert.ok(judgeClinic(f).some(x=>!x.passed));
});
test('new recipe freezes a declared mobile active mode, not all management as high pressure',async()=>{
 const r=await parse(path.join(input,'request.json'));assert.equal(r.experience.mode,'active-dispatch');assert.equal(r.experience.defaultSpeed,1);assert.equal(r.experience.primaryInput,'scene-tap');
 assert.ok(requiredCases(r).includes('single-action-baseline'));const idle=structuredClone(r);idle.experience.mode='idle';assert.ok(!requiredCases(idle).includes('single-action-baseline'));assert.doesNotThrow(()=>validateRequest(idle));
});
test('a mobile spec needs ordered observable checkpoints, not just four nonempty intentions',async()=>{
 const r=await parse(path.join(input,'request.json')),c=await parse(path.join(input,'contract.json'));assert.equal(c.policyHash,policyHash);assert.equal(c.requestHash,sha256(canonical(r)));assert.equal((await auditContract(r,c,input)).status,'SPEC_READY_FOR_PROTOTYPE_REVIEW');
 const missing=structuredClone(c);delete missing.firstSession.checkpoints;assert.ok((await auditContract(r,missing,input)).blockers.includes('EXPERIENCE_CHECKPOINTS_INCOMPLETE'));
 const late=structuredClone(c);late.firstSession.checkpoints[0].withinMs=20000;assert.ok((await auditContract(r,late,input)).blockers.includes('EXPERIENCE_CHECKPOINT_ORDER'));
});
test('missing pressure, default-speed or scene-interaction cases cannot pass prototype review',async()=>{
 const r=await parse(path.join(input,'request.json')),c=await parse(path.join(input,'contract.json'));
 for(const tag of ['single-action-baseline','mobile-scene-action','default-speed-opening','signaled-pressure-recovery','next-decision-after-relief']){const bad=structuredClone(c);bad.cases=bad.cases.filter(x=>x.tag!==tag);assert.ok((await auditContract(r,bad,input)).blockers.includes('CASE_TAG_MISSING:'+tag));}
});
test('speed-up and incompatible profile are rejected instead of weakening the experience request',async()=>{
 const r=await parse(path.join(input,'request.json'));r.experience.defaultSpeed=3;assert.throws(()=>validateRequest(r));r.experience.defaultSpeed=1;r.profile='NARRATIVE_AGENCY';assert.throws(()=>validateRequest(r),/active-profile/);
});
test('rule and visible suites have stable unique identities',()=>{assert.equal(VISIBLE_IDS.length,27);assert.equal(new Set(VISIBLE_IDS).size,27);assert.ok(VISIBLE_IDS.includes('opening-cue-and-real-queue'));assert.ok(VISIBLE_IDS.includes('scene-tap-dispatch@390'));});
test('check budgets allow a real 180-second session but remain zero-cash bounded',async t=>{
 const {root}=await fixture(t);const r=await parse(path.join(root,'run.json'));assert.ok(r.budget.maxAttemptMs>=220000);assert.equal(r.budget.maxCashCents,0);assert.equal(r.budget.maxCandidateBuilds,3);
});
test('a faulty upgrade is repaired and re-executed; simulated hooks cannot forge a real delivery',async t=>{
 const {base,root,game}=await fixture(t);const p=path.join(game,'engine.mjs'),source=await readFile(p,'utf8');assert.ok(source.includes('upgradedCareMs:5000'));await writeFile(p,source.replace('upgradedCareMs:5000','upgradedCareMs:8500'));
 const broken=await buildHash(game),r=await prepareCandidate(base,'case',{check:async()=>({passed:true}),browser:async()=>({passed:true}),visible:async()=>({passed:true,buildHash:await buildHash(game),checks:[{id:'EXPLICIT_TEST_FIXTURE',passed:true}],findings:[],artifacts:[],scope:'TEST_FIXTURE'}),report:async()=>({engineering:'PASS',browser:'PASS'})});
 assert.equal(r.status,'INTERNAL_CHECKS_PASSED');assert.equal(r.attempts,1);assert.notEqual(r.buildHash,broken);assert.ok((await parse(path.join(root,'quality/review-1.json'))).findings.some(x=>x.id==='upgrade-has-measured-effect'));assert.equal((await readDelivery(base,'case')).previewReady,false);
});
test('live-candidate review still detects an incorrect free room capacity',async t=>{
 const {game}=await fixture(t),p=path.join(game,'engine.mjs'),source=await readFile(p,'utf8');assert.ok(source.includes('careCapacity:s.doctor2?2:1'));await writeFile(p,source.replace('careCapacity:s.doctor2?2:1','careCapacity:s.room2?2:1'));
 const r=await reviewCandidate(game);assert.ok(r.findings.some(x=>x.id==='room-doctor-dependency'));
});
