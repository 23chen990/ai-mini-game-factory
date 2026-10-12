/* global process, URL */
// Synthetic structural fixtures only. These are not REA sessions or human playtests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { profileIds, policyHash, validateRequest, planWorkflow, draftContract, auditContract, canonical, sha256, main } from '../../../.agents/skills/gameplay-loop-review/scripts/workflow.mjs';

const script=fileURLToPath(new URL('../../../.agents/skills/gameplay-loop-review/scripts/workflow.mjs',import.meta.url));
const request=(profile='STRATEGIC_SYSTEM')=>({schemaVersion:1,gameId:'test-game',profile,secondaryProfile:null,mode:'discover',platform:'web-lite',progression:'persistent',changedAreas:['core-rules'],template:null,repair:null,budget:{maxCashCents:0,maxWorkMinutes:240,maxFixAttempts:2}});
async function root(t){const dir=await mkdtemp(path.join(tmpdir(),'workflow-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function put(root,name,value){const raw=typeof value==='string'?value:JSON.stringify(value);await writeFile(path.join(root,name),raw);return {path:name,sha256:sha256(raw)};}
function proposed(r){
  const c=draftContract(r);c.status='PROPOSED';
  c.firstSession={firstAction:'Assign one worker',firstResult:'Worker walks to the service point',nextIntention:'Try a different placement to clear the visible queue',safeStop:'Save the current assignment and stop'};
  c.loops[0]={id:'core',scale:'core',decision:'Choose between two service points',action:'Assign a worker',visibleChange:'A queue starts moving',nextIntention:'Try a better allocation to reduce waiting',variation:'Different visible arrivals with the same control rule',claim:'hypothesis',evidenceRefs:[]};
  if(r.progression==='persistent')c.progression={savedState:'Staff and room placement',effectOnNextCore:'A second service point becomes available',safeExit:'Pause and save without loss while away'};
  else c.endingValue='The completed level or chapter has a satisfying outcome.';
  c.cases=c.cases.map(t=>({...t,given:'The same initial state and input stream',when:'Choose placement A',thenState:'Queue length decreases',thenVisible:'One waiting character enters service',contrastAction:'Leave both service points empty',contrastExpected:'Queue length increases'}));
  return c;
}
async function approvedTemplate(root,r){
  const hash='b'.repeat(64),revision='a'.repeat(40),runId='reviewed-fixture';
  const screenshot=await put(root,'screen.txt','SYNTHETIC screen');
  const engineering=await put(root,'eng.json',{runId,buildHash:hash,passed:true});
  const browser=await put(root,'browser.json',{runId,buildHash:hash,passed:true,scope:'HTTP_BROWSER',checks:[{name:'synthetic',passed:true}],artifacts:[screenshot]});
  const sessions=[];
  for(let i=0;i<3;i++)sessions.push({id:'fixture-'+i,consent:true,uncoached:true,finding:'SYNTHETIC fixture, not a human observation',evidence:await put(root,`session-${i}.txt`,'SYNTHETIC only')});
  const human=await put(root,'human.json',{runId,buildHash:hash,passed:true,profile:r.profile,source:'HUMAN',reviewer:'SYNTHETIC reviewer',decision:'APPROVE_BOUNDED_VARIANTS',sessions});
  const q={schemaVersion:1,policyHash,templateId:'fixture-template',revision,profile:r.profile,secondaryProfile:r.secondaryProfile,platform:r.platform,progression:r.progression,buildHash:hash,runId,decision:'APPROVE_BOUNDED_VARIANTS',reviewer:'SYNTHETIC review',allowedChanges:['theme','content','levels'],reports:{engineering,browser,human}};
  r.template={id:q.templateId,revision,qualification:await put(root,'qualification.json',q)};return q;
}

test('four profiles keep one phase order but different acceptance',async t=>{
 const dir=await root(t);const plans=await Promise.all(profileIds().map(p=>planWorkflow(request(p),dir)));
 for(const p of plans){assert.deepEqual(p.phases.map(x=>x.id),plans[0].phases.map(x=>x.id));assert.equal(p.releaseAllowed,false);assert.equal(p.executionAllowed,false);}
 assert.equal(new Set(plans.map(p=>p.requiredCaseTags.join('|'))).size,4);
 assert.equal(plans[2].profiles.length,1);
});
test('unclassified work never silently turns into an idle game',async t=>{
 const p=await planWorkflow(request(null),await root(t));assert.equal(p.status,'BLOCKED');assert.deepEqual(p.profiles,[]);assert.ok(p.blockers.includes('CLASSIFY_PRIMARY_EXPERIENCE'));
});
test('unknown profile, extra fields, unsafe identifiers and invalid budgets are rejected',()=>{
 for(const change of [r=>r.profile='ANYTHING',r=>r.gameId='../form',r=>r.foo=true,r=>r.budget.maxCashCents=null,r=>r.budget.maxWorkMinutes=0,r=>r.budget.maxFixAttempts=6,r=>r.changedAreas=['theme','theme']]){
  const r=request();change(r);assert.throws(()=>validateRequest(r),/request:/);
 }
});
test('mixed gameplay uses one secondary profile and a cross-loop case, not another pipeline',async t=>{
 const r=request();r.secondaryProfile='NARRATIVE_AGENCY';const p=await planWorkflow(r,await root(t));
 assert.equal(p.phases.length,6);assert.equal(p.profiles.length,2);assert.ok(p.requiredCaseTags.includes('hybrid-link'));assert.ok(p.requiredCaseTags.includes('choice-consequence'));
 r.secondaryProfile=r.profile;assert.throws(()=>validateRequest(r),/request:profile/);
});
test('session-only action and narrative do not require meta progression or next-day return',async t=>{
 const dir=await root(t);
 for(const p of ['ACTION_FEEL','NARRATIVE_AGENCY']){const r=request(p);r.progression='session';const c=proposed(r);assert.equal(c.progression,null);const a=await auditContract(r,c,dir);assert.equal(a.status,'SPEC_READY_FOR_PROTOTYPE_REVIEW',JSON.stringify(a));assert.equal(a.fun,'NOT_MEASURED');}
});
test('generated draft is blocked rather than called a completed experience review',async t=>{
 const r=request();const a=await auditContract(r,draftContract(r),await root(t));assert.equal(a.status,'BLOCKED');assert.ok(a.blockers.includes('DRAFT_NOT_READY'));assert.ok(a.blockers.includes('FIRST_SESSION_INCOMPLETE'));
});
test('a clear hypothesis may guide a prototype without pretending to be observed evidence',async t=>{
 const r=request();const a=await auditContract(r,proposed(r),await root(t));assert.equal(a.status,'SPEC_READY_FOR_PROTOTYPE_REVIEW');assert.ok(a.warnings[0].startsWith('HYPOTHESIS'));assert.equal(a.verifiedEvidenceFiles,0);assert.equal(a.executionAllowed,false);
});
test('candidate without a reuse receipt goes back to research, never auto certifies',async t=>{
 const r=request();r.mode='variant';r.changedAreas=['theme'];const a=await planWorkflow(r,await root(t));assert.equal(a.effectiveMode,'discover');assert.equal(a.templateReview,null);assert.equal(a.executionAllowed,false);
});
test('bounded matching reuse needs real bound report files and keeps delta QA',async t=>{
 const dir=await root(t),r=request('PUZZLE_CLARITY');r.mode='variant';r.changedAreas=['levels'];await approvedTemplate(dir,r);
 const a=await planWorkflow(r,dir);assert.equal(a.effectiveMode,'variant');assert.equal(a.templateReview.revision,r.template.revision);assert.ok(a.requiredCaseTags.includes('solvability'));assert.equal(a.releaseAllowed,false);
});
test('core, economy, controls, progression, storage or platform change cannot masquerade as reskin',async t=>{
 const dir=await root(t),r=request();r.mode='variant';await approvedTemplate(dir,r);
 for(const area of ['core-rules','economy','controls','progression','storage','platform']){r.changedAreas=[area];assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover',area);}
});
test('template proof binds exact code revision, profile, platform, progression and secondary profile',async t=>{
 const dir=await root(t),base=request();base.mode='variant';base.changedAreas=['theme'];await approvedTemplate(dir,base);
 for(const mutate of [r=>r.template.revision='c'.repeat(40),r=>r.profile='ACTION_FEEL',r=>r.platform='wechat',r=>r.progression='session',r=>r.secondaryProfile='NARRATIVE_AGENCY']){
  const r=structuredClone(base);mutate(r);assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover');
 }
});
test('changed screenshots or human notes invalidate earlier qualification',async t=>{
 const dir=await root(t),r=request();r.mode='variant';r.changedAreas=['content'];await approvedTemplate(dir,r);
 await writeFile(path.join(dir,'screen.txt'),'changed');assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover');
 await approvedTemplate(dir,r);await writeFile(path.join(dir,'session-0.txt'),'changed');assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover');
});
test('failed browser or synthetic-source human receipt is not reusable even with fresh checksums',async t=>{
 const dir=await root(t),r=request();r.mode='variant';r.changedAreas=['theme'];const q=await approvedTemplate(dir,r);
 const human=JSON.parse(await readFile(path.join(dir,'human.json'),'utf8'));human.source='AI';q.reports.human=await put(dir,'human.json',human);r.template.qualification=await put(dir,'qualification.json',q);
 assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover');
 const q2=await approvedTemplate(dir,r);const b=JSON.parse(await readFile(path.join(dir,'browser.json'),'utf8'));b.checks[0].passed=false;q2.reports.browser=await put(dir,'browser.json',b);r.template.qualification=await put(dir,'qualification.json',q2);assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover');
});
test('repair is a shared short subpath only after reproducible evidence is bound',async t=>{
 const dir=await root(t),r=request();r.mode='repair';r.repair={targetState:'waiting',actual:'queue stalls',expected:'queue moves',evidence:await put(dir,'repro.txt','synthetic reproduction')};
 let a=await planWorkflow(r,dir);assert.equal(a.status,'WORK_ORDER_READY');assert.deepEqual(a.phases.map(p=>p.id),['reproduce','repair','retest']);
 await writeFile(path.join(dir,'repro.txt'),'changed');a=await planWorkflow(r,dir);assert.equal(a.status,'BLOCKED');
});
test('spec cannot claim ready against a changed request',async t=>{
 const r=request(),c=proposed(r);r.budget.maxWorkMinutes=60;assert.ok((await auditContract(r,c,await root(t))).blockers.includes('CONTRACT_STALE_OR_WRONG_GAME'));
});
test('reward-only intent is rejected but useful rewards and efficiency growth are not banned',async t=>{
 const r=request(),c=proposed(r),dir=await root(t);c.loops[0].nextIntention='为了奖励';assert.ok((await auditContract(r,c,dir)).blockers.includes('REWARD_WITHOUT_PLAYER_INTENTION'));
 c.loops[0].nextIntention='Earn coins to hire a worker and test a second service point';assert.equal((await auditContract(r,c,dir)).status,'SPEC_READY_FOR_PROTOTYPE_REVIEW');
});
test('one-way meta rewards are insufficient; upper layers must change core actions',async t=>{
 const r=request(),c=proposed(r),dir=await root(t);c.loops.push({...c.loops[0],id:'goal',scale:'goal'});c.links=[{from:'core',to:'goal',kind:'feeds',effect:'Earn building resources'}];
 assert.ok((await auditContract(r,c,dir)).blockers.includes('DISCONNECTED_GROWTH:goal'));
 c.links.push({from:'goal',to:'core',kind:'changes-action',effect:'Unlock a second worker assignment'});assert.equal((await auditContract(r,c,dir)).status,'SPEC_READY_FOR_PROTOTYPE_REVIEW');
});
test('disconnected islands and invalid cross-links are not valid growth',async t=>{
 const r=request(),c=proposed(r);c.loops.push({...c.loops[0],id:'island',scale:'meta'});c.links=[{from:'island',to:'island',kind:'feeds',effect:'unused'}];
 const a=await auditContract(r,c,await root(t));assert.ok(a.blockers.includes('LINK_INVALID'));assert.ok(a.blockers.includes('DISCONNECTED_GROWTH:island'));
});
test('missing type-specific cases and copied positive/negative outcomes fail',async t=>{
 const r=request('NARRATIVE_AGENCY'),c=proposed(r),dir=await root(t);c.cases=c.cases.filter(x=>x.tag!=='choice-consequence');assert.ok((await auditContract(r,c,dir)).blockers.includes('CASE_TAG_MISSING:choice-consequence'));
 const d=proposed(r);d.cases[0].contrastExpected=d.cases[0].thenState;assert.ok((await auditContract(r,d,dir)).blockers.includes('CASE_WITHOUT_CONTRAST'));
});
test('a blank player-visible result cannot be hidden behind internal state changes',async t=>{
 const r=request(),c=proposed(r);c.cases[0].thenVisible='';assert.ok((await auditContract(r,c,await root(t))).blockers.includes('CASE_INCOMPLETE'));
});
test('persistent progress needs a next-core effect and safe exit; finite games need end value',async t=>{
 const dir=await root(t),r=request(),c=proposed(r);c.progression.effectOnNextCore='';assert.ok((await auditContract(r,c,dir)).blockers.includes('PERSISTENCE_WITHOUT_PLAYER_VALUE'));
 r.progression='session';const d=proposed(r);d.endingValue='';assert.ok((await auditContract(r,d,dir)).blockers.includes('SESSION_END_VALUE_REQUIRED'));
});
test('spec fields cannot promote model-written values into human enjoyment results',async t=>{
 const r=request(),c=proposed(r);c.measurements.enjoyment='PASS';assert.ok((await auditContract(r,c,await root(t))).blockers.includes('SPEC_CANNOT_CERTIFY_HUMANS'));
});
test('observed and source-derived claims require matching source files and classes',async t=>{
 const dir=await root(t),r=request(),c=proposed(r);const ref=await put(dir,'source.txt','synthetic source');
 c.loops[0].claim='observed';c.loops[0].evidenceRefs=['s'];c.evidence=[{id:'s',targetId:'fixture',version:'1',kind:'creator-post',file:ref,locator:'line 1'}];
 assert.ok((await auditContract(r,c,dir)).blockers.includes('EVIDENCE_KIND_MISMATCH'));
 c.evidence[0].kind='source';c.loops[0].claim='source-derived';assert.equal((await auditContract(r,c,dir)).verifiedEvidenceFiles,1);
 await writeFile(path.join(dir,'source.txt'),'different');assert.equal((await auditContract(r,c,dir)).status,'BLOCKED');
});
test('claims without evidence are not allowed, but explicit assumptions stay assumptions',async t=>{
 const r=request(),c=proposed(r);c.loops[0].claim='observed';assert.ok((await auditContract(r,c,await root(t))).blockers.includes('FACT_WITHOUT_EVIDENCE'));
});
test('malformed cases, links and loops return blockers rather than false pass',async t=>{
 const r=request(),dir=await root(t);
 for(const edit of [c=>c.cases=[null],c=>c.links=[null],c=>c.loops=[null],c=>c.firstSession=null,c=>c.evidence=[null],c=>c.progression={},c=>c.measurements=null]){
   const c=proposed(r);edit(c);assert.equal((await auditContract(r,c,dir)).status,'BLOCKED');
 }
});
test('structural checker must not crash on simultaneously malformed core and links',async t=>{
 const r=request(),c=proposed(r);c.loops=[null];c.links=[null];assert.equal((await auditContract(r,c,await root(t))).status,'BLOCKED');
});
test('CLI rejects path escapes, symlinks and oversized inputs',async t=>{
 const dir=await root(t);await put(dir,'r.json',request());await symlink(path.join(dir,'r.json'),path.join(dir,'link.json'));
 for(const input of ['../r.json','link.json'])await assert.rejects(main(['plan',dir,input]));
 await writeFile(path.join(dir,'huge.json'),' '.repeat(1024*1024+1));await assert.rejects(main(['plan',dir,'huge.json']));
});
test('portable CLI works without factory dependencies, models or persistent writes',async t=>{
 const dir=await root(t);await put(dir,'r.json',request());const before=await readdir(dir);
 const p=spawnSync(process.execPath,[script,'plan',dir,'r.json'],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).executionAllowed,false);assert.deepEqual(await readdir(dir),before);
 const d=spawnSync(process.execPath,[script,'draft',dir,'r.json'],{encoding:'utf8'});assert.equal(JSON.parse(d.stdout).status,'DRAFT');
 await put(dir,'c.json',draftContract(request()));const bad=spawnSync(process.execPath,[script,'check',dir,'r.json','c.json'],{encoding:'utf8'});assert.equal(bad.status,2);
});
test('invalid CLI inputs use nonzero exit and do not echo raw private file paths',async t=>{
 const dir=await root(t);const p=spawnSync(process.execPath,[script,'execute',dir,'secret.json'],{encoding:'utf8'});assert.equal(p.status,1);assert.equal(p.stderr.includes(dir),false);
});
test('JSON canonical ordering makes request binding stable without hiding semantic changes',()=>{
 assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));assert.notEqual(sha256(canonical({a:1})),sha256(canonical({a:2})));assert.throws(()=>canonical(Infinity));
});

test('policy/code revisions invalidate stale contracts and template receipts',async t=>{
 const dir=await root(t),r=request(),c=proposed(r);c.policyHash='0'.repeat(64);
 assert.ok((await auditContract(r,c,dir)).blockers.includes('CONTRACT_STALE_OR_WRONG_GAME'));
 r.mode='variant';r.changedAreas=['theme'];const q=await approvedTemplate(dir,r);q.policyHash='0'.repeat(64);r.template.qualification=await put(dir,'qualification.json',q);
 assert.equal((await planWorkflow(r,dir)).effectiveMode,'discover');
});
test('scope allows only the agreed Skill and CLI extension, not arbitrary factory or skills',async()=>{
 const {evaluateScope}=await import('../scope-check.mjs');const pkg={scripts:{}};
 assert.equal(evaluateScope(['src/cli/factory.ts','.agents/skills/gameplay-loop-review/scripts/workflow.mjs'],pkg,pkg).passed,true);
 for(const file of ['src/factory.ts','.agents/skills/unrelated/SKILL.md','.agents/skills/game-playtest/execute.mjs'])assert.equal(evaluateScope([file],pkg,pkg).passed,false);
});

test('shipped hospital and story examples are type-specific, bound hypotheses, not research results',async()=>{
 const dir=fileURLToPath(new URL('../../../examples/lean-pilot/workflow/',import.meta.url));
 for(const name of ['hospital','story']){
  const r=JSON.parse(await readFile(path.join(dir,name+'.json'),'utf8'));
  const c=JSON.parse(await readFile(path.join(dir,name+'.contract.json'),'utf8'));
  const result=await auditContract(r,c,dir);
  assert.equal(result.status,'SPEC_READY_FOR_PROTOTYPE_REVIEW',JSON.stringify(result));
  assert.equal(result.verifiedEvidenceFiles,0);assert.equal(result.fun,'NOT_MEASURED');
 }
});
