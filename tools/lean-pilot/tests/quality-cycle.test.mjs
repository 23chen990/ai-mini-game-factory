import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildClinic } from '../build-workflow.mjs';
import { buildHash } from '../runner.mjs';
import { sha256 } from '../policy.mjs';
import { reviewCandidate, judgeStory } from '../quality-review.mjs';
import { prepareCandidate, applyQualityPatch, readDelivery, qualityPolicyHash } from '../quality-cycle.mjs';
async function fixture(t){const base=await mkdtemp(path.join(tmpdir(),'quality-test-'));t.after(()=>rm(base,{recursive:true,force:true}));await buildClinic(base,'case');return {base,root:path.join(base,'case'),game:path.join(base,'case/workspace/game')};}
async function patch(game,file,from,to){const p=path.join(game,file),s=await readFile(p,'utf8');assert.ok(s.includes(from),from);await writeFile(p,s.replace(from,to));}
const passes=async()=>({passed:true,outcome:'PASSED'});
function fakeHooks(game){return {
  // Explicit orchestration fixtures: these DO NOT generate browser/human proof.
  check:passes,browser:passes,
  visible:async()=>({passed:true,buildHash:await buildHash(game),checks:[{id:'fixture',passed:true}],findings:[],artifacts:[],scope:'TEST_FIXTURE'}),
  report:async()=>({engineering:'PASS',browser:'PASS'}),
};}
async function j(p){return JSON.parse(await readFile(p,'utf8'));}
const story=()=>({start:'wake',nodes:[
  {id:'wake',text:'A stranger calls a name I remember from a novel.',grants:['heard-name'],choices:[{next:'ask'},{next:'wait'}]},
  {id:'ask',text:'I ask why they called me that name.',requires:['heard-name'],choices:[{next:'answer'}]},
  {id:'wait',text:'I remain silent and the room grows suspicious.',requires:['heard-name'],choices:[{next:'suspicion'}]},
  {id:'answer',text:'An ally explains the accusation.',payoff:'I gain an ally and a specific next action.',choices:[]},
  {id:'suspicion',text:'The accusation proceeds without my testimony.',payoff:'My silence leaves a different consequence.',choices:[]},
]});

test('real candidate counterfactual review passes without certifying fun or humans',async t=>{
  const {game}=await fixture(t),r=await reviewCandidate(game);assert.equal(r.passed,true);assert.equal(r.checks.length,9);assert.equal(r.human,'NOT_RUN');assert.equal(r.fun,'NOT_CERTIFIED');
});
test('inert upgrade is discovered by measured throughput, not a success flag',async t=>{
  const {game}=await fixture(t);await patch(game,'engine.mjs','upgradedCareMs:5000','upgradedCareMs:8500');
  const r=await reviewCandidate(game);assert.ok(r.findings.some(f=>f.id==='upgrade-has-measured-effect'));
});
test('free investment and false room capacity are discovered in actual engine execution',async t=>{
  const {game}=await fixture(t);await patch(game,'engine.mjs','s.cash-=cost;s.spent+=cost','s.cash-=0;s.spent+=0');
  await patch(game,'engine.mjs','careCapacity:s.doctor2?2:1','careCapacity:s.room2?2:1');
  const r=await reviewCandidate(game);assert.ok(r.findings.some(f=>f.id==='investment-is-paid'));assert.ok(r.findings.some(f=>f.id==='room-doctor-dependency'));
});
test('known engine regressions are found, repaired, re-executed before candidate delivery',async t=>{
  const {base,root,game}=await fixture(t);await patch(game,'engine.mjs','upgradedCareMs:5000','upgradedCareMs:8500');
  const broken=await buildHash(game),r=await prepareCandidate(base,'case',fakeHooks(game));
  assert.equal(r.status,'INTERNAL_CHECKS_PASSED');assert.equal(r.attempts,1);assert.equal(r.modelCalls,0);assert.notEqual(r.buildHash,broken);
  assert.equal(r.history.filter(h=>h.kind==='repair').length,1);assert.equal(r.history[0].findings.includes('upgrade-has-measured-effect'),true);
  assert.equal((await j(path.join(root,'quality/review-3.json'))).passed,true);
  // Orchestration fixtures cannot pass the actual exported delivery read gate.
  assert.equal((await readDelivery(base,'case')).previewReady,false);
});
test('unknown design failure routes to developer once without pretending it is resolved',async t=>{
  const {base,root,game}=await fixture(t);
  const inspect=async()=>({buildHash:await buildHash(game),passed:false,checks:[{id:'arbitrary-loop',passed:false}],findings:[{id:'arbitrary-loop',route:'DESIGN',severity:'blocker'}]});
  const r=await prepareCandidate(base,'case',{...fakeHooks(game),inspect});assert.equal(r.status,'DESIGN_REPAIR_REQUIRED');assert.equal(r.previewReady,false);assert.equal(r.ownerMinutesSaved,null);
  const packet=await j(path.join(root,'quality/developer-action.json'));assert.equal(packet.ownerQuestionRequired,false);await assert.rejects(access(path.join(root,'quality/delivery.json')));
});
test('maximum repair count persists, including a failed proposal attempt',async t=>{
  const {base,game}=await fixture(t);const inspect=async()=>({buildHash:await buildHash(game),passed:false,checks:[{id:'not-fixed',passed:false}],findings:[{id:'not-fixed',route:'IMPLEMENTATION',severity:'blocker'}]});
  const repairer=async()=>{const s=await readFile(path.join(game,'main.mjs'),'utf8');return {kind:'TEST_ONLY_PATCH',modelCalls:0,patches:[{path:'main.mjs',beforeHash:sha256(s),content:s+'\n// test non-fixing change\n'}]};};
  const r=await prepareCandidate(base,'case',{...fakeHooks(game),inspect,repairer,limits:{maxRepairAttempts:1,maxWallMs:300000}});
  assert.equal(r.status,'REPAIR_LIMIT_STOP');assert.equal(r.attempts,1);
  const again=await prepareCandidate(base,'case',{...fakeHooks(game),inspect,repairer});assert.equal(again.attempts,1);assert.equal(again.status,'REPAIR_LIMIT_STOP');
});
test('protected acceptance and candidate metadata cannot be patched',async t=>{
  const {game,root}=await fixture(t);for(const name of ['tests/engine.test.mjs','candidate.json','../ledger.json','/tmp/x']){
    await assert.rejects(applyQualityPatch(game,[{path:name,beforeHash:'0'.repeat(64),content:'bad'}],await buildHash(game),path.join(root,'backup')),/scope/);
  }
});
test('stale preimage, no-op and duplicate file patches fail before writes',async t=>{
  const {game,root}=await fixture(t),s=await readFile(path.join(game,'main.mjs'),'utf8'),hash=await buildHash(game);
  const p={path:'main.mjs',beforeHash:sha256(s),content:s+'\n// changed\n'};
  await assert.rejects(applyQualityPatch(game,[p], '0'.repeat(64),path.join(root,'b')),/stale/);
  await assert.rejects(applyQualityPatch(game,[{...p,beforeHash:'0'.repeat(64)}],hash,path.join(root,'b')),/preimage/);
  await assert.rejects(applyQualityPatch(game,[{...p,content:s}],hash,path.join(root,'b')),/No-op/);
  await assert.rejects(applyQualityPatch(game,[p,p],hash,path.join(root,'b')),/patch set/);
  assert.equal(await buildHash(game),hash);
});
test('interrupted pending state is never silently cleared on resume',async t=>{
  const {base,root,game}=await fixture(t);await prepareCandidate(base,'case',{...fakeHooks(game)});
  const p=path.join(root,'quality/state.json'),s=await j(p);s.pending=true;await writeFile(p,JSON.stringify(s));
  await assert.rejects(prepareCandidate(base,'case',fakeHooks(game)),/Interrupted/);assert.equal((await j(p)).pending,true);
});
test('a resume cannot alter limits or policy to reset a budget',async t=>{
  const {base,game}=await fixture(t);await prepareCandidate(base,'case',fakeHooks(game));
  await assert.rejects(prepareCandidate(base,'case',{...fakeHooks(game),limits:{maxRepairAttempts:0,maxWallMs:300000}}),/reset limits/);
});
test('changed work after inspection invalidates a review; nothing is delivered',async t=>{
  const {base,game}=await fixture(t);const inspect=async()=>{const hash=await buildHash(game);await writeFile(path.join(game,'main.mjs'),'changed');return {buildHash:hash,passed:true,checks:[{id:'x',passed:true}],findings:[]};};
  await assert.rejects(prepareCandidate(base,'case',{...fakeHooks(game),inspect}),/current build/);
});
test('review passed flag cannot contradict its failed checks or findings',async t=>{
  const {base,game}=await fixture(t);const inspect=async()=>({buildHash:await buildHash(game),passed:true,checks:[{id:'x',passed:false}],findings:[]});
  await assert.rejects(prepareCandidate(base,'case',{...fakeHooks(game),inspect}),/Invalid reviewer/);
});
test('environment failure is not fixed by changing the game or declared passed',async t=>{
  const {base,game}=await fixture(t),r=await prepareCandidate(base,'case',{...fakeHooks(game),browser:async()=>({passed:false,outcome:'ENVIRONMENT_BLOCKED'})});
  assert.equal(r.status,'ENVIRONMENT_BLOCKED');assert.equal(r.attempts,0);assert.equal(r.previewReady,false);
});
test('time cap stops before an expensive native/browser stage starts',async t=>{
  const {base,game}=await fixture(t);let now=0,calls=0;
  const inspect=async()=>{now=1500;return {buildHash:await buildHash(game),passed:true,checks:[{id:'x',passed:true}],findings:[]};};
  const r=await prepareCandidate(base,'case',{...fakeHooks(game),inspect,check:async()=>{calls++;return {passed:true};},now:()=>now,limits:{maxRepairAttempts:2,maxWallMs:1000}});
  assert.equal(r.status,'BUDGET_STOP');assert.equal(calls,0);
});
test('mutating live game from a repairer is rejected instead of self-certification',async t=>{
  const {base,game}=await fixture(t);await patch(game,'engine.mjs','upgradedCareMs:5000','upgradedCareMs:8500');
  await assert.rejects(prepareCandidate(base,'case',{...fakeHooks(game),repairer:async()=>{await writeFile(path.join(game,'main.mjs'),'bad');return {modelCalls:0,patches:[]};}}),/mutated the live/);
});
test('an attempted unapproved model call cannot get a passing receipt',async t=>{
  const {base,game}=await fixture(t);await patch(game,'engine.mjs','upgradedCareMs:5000','upgradedCareMs:8500');
  await assert.rejects(prepareCandidate(base,'case',{...fakeHooks(game),repairer:async()=>({kind:'TEST',modelCalls:1,patches:[]})}),/Unapproved model/);
});
test('quality policy is content-bound and saved evidence is not a fun score',async()=>{assert.match(await qualityPolicyHash(),/^[a-f0-9]{64}$/);});
test('a finite narrative passes without money, upgrades, combat or mandatory next-day return',()=>{assert.ok(judgeStory(story()).every(x=>x.passed));});
test('cosmetic choices and missing endings are caught rather than scored as fun',()=>{const s=story();s.nodes[2].text=s.nodes[1].text;assert.ok(judgeStory(s).some(x=>x.id==='choice-has-visible-consequence'&&!x.passed));const q=story();q.nodes[3].payoff='';assert.ok(judgeStory(q).some(x=>x.id==='finite-story-has-payoff'&&!x.passed));});
test('a fact learned on only one branch cannot leak to the other branch',()=>{
  const s=story();s.nodes[0].grants=[];s.nodes[1].requires=[];s.nodes[2].requires=[];s.nodes[1].grants=['secret'];s.nodes[1].choices=[{next:'answer'}];s.nodes[2].choices=[{next:'answer'}];s.nodes[3].requires=['secret'];
  assert.ok(judgeStory(s).some(x=>x.id==='knowledge-has-a-source'&&!x.passed));
});
test('malformed links and choices are rejected without reviewer crashes',()=>{const s=story();s.nodes[0].choices=[null];assert.equal(judgeStory(s)[0].passed,false);});
test('unreachable lore is not allowed to justify a known fact',()=>{const s=story();s.nodes[3].requires=['secret'];s.nodes.push({id:'unreachable',text:'Secret source',grants:['secret'],payoff:'end',choices:[]});assert.ok(judgeStory(s).some(x=>x.id==='knowledge-has-a-source'&&!x.passed));});

test('a syntax-broken engine becomes an actionable developer defect, not a passing handoff',async t=>{
  const {base,game,root}=await fixture(t);await writeFile(path.join(game,'engine.mjs'),'export const = broken;');
  const r=await prepareCandidate(base,'case',fakeHooks(game));assert.equal(r.status,'DEVELOPER_REPAIR_REQUIRED');
  assert.equal((await j(path.join(root,'quality/developer-action.json'))).issues[0].id,'candidate-execution-error');
});
