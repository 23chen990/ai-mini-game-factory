/* global process, console, Buffer, URL */
import { readFile, lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// One policy implementation: both the portable Skill and the factory CLI use this file.
const PROFILES = JSON.parse(await readFile(new URL('../references/profiles.json', import.meta.url), 'utf8'));
const PROFILE_IDS = Object.freeze(Object.keys(PROFILES));
const COMMON_TAGS = ['first-action-feedback', 'safe-exit-or-recovery'];
const CHANGE_AREAS = ['theme', 'content', 'levels', 'controls', 'core-rules', 'economy', 'progression', 'storage', 'platform'];
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000 && !v.includes('\0');
const num = v => Number.isSafeInteger(v) && v >= 0;
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const unique = a => new Set(a).size === a.length;
const own = (o,k) => Object.hasOwn(o,k);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const policyHash = sha256((await readFile(new URL(import.meta.url), 'utf8')) + JSON.stringify(PROFILES));
export const profileIds = () => [...PROFILE_IDS];
function exact(o, required, optional = []) {
  return obj(o) && required.every(k => own(o,k)) && Object.keys(o).every(k => required.includes(k) || optional.includes(k));
}
export function canonical(value) {
  const encode = (v, depth) => {
    assert(depth < 30, 'json:too-deep');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { assert(Number.isFinite(v), 'json:nonfinite'); return JSON.stringify(v); }
    if (Array.isArray(v)) return '[' + v.map(x => encode(x, depth + 1)).join(',') + ']';
    assert(obj(v), 'json:unsupported');
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + encode(v[k], depth + 1)).join(',') + '}';
  };
  const result = encode(value,0); assert(Buffer.byteLength(result) <= 1024 * 1024, 'json:too-large'); return result;
}
function fileRef(v) { return exact(v,['path','sha256']) && str(v.path) && digest(v.sha256); }
export async function readBounded(root, relative) {
  assert(str(relative) && !path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':') &&
    !relative.split('/').some(p => !p || p === '.' || p === '..'), 'file:unsafe-path');
  const st = await lstat(root); assert(st.isDirectory() && !st.isSymbolicLink(), 'file:unsafe-root');
  let p = await realpath(root);
  const parts = relative.split('/');
  for (let i=0;i<parts.length;i++) {
    p = path.join(p,parts[i]); const s = await lstat(p);
    assert(!s.isSymbolicLink() && (i === parts.length-1 ? s.isFile() : s.isDirectory()), 'file:unsafe-entry');
  }
  const h = await open(p, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    assert((await h.stat()).size <= 1024*1024, 'file:too-large');
    const b = await h.readFile(); assert(b.length <= 1024*1024,'file:too-large'); return b;
  } finally { await h.close(); }
}
async function boundFile(root, ref) {
  assert(fileRef(ref), 'evidence:invalid-reference');
  const bytes = await readBounded(root,ref.path);
  assert(sha256(bytes) === ref.sha256,'evidence:hash-mismatch'); return bytes;
}
function parse(bytes) { const value = JSON.parse(bytes.toString('utf8')); canonical(value); return value; }
export function validateRequest(r) {
  assert(exact(r,['schemaVersion','gameId','profile','secondaryProfile','mode','platform','progression','changedAreas','template','repair','budget']), 'request:schema');
  assert(r.schemaVersion === 1 && typeof r.gameId === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(r.gameId),'request:identity');
  assert((r.profile === null || PROFILE_IDS.includes(r.profile)) && (r.secondaryProfile === null || PROFILE_IDS.includes(r.secondaryProfile)) &&
    (!r.secondaryProfile || r.profile && r.profile !== r.secondaryProfile), 'request:profile');
  assert(['discover','variant','repair'].includes(r.mode) && ['web-lite','wechat','douyin','taptap'].includes(r.platform) &&
    ['session','persistent'].includes(r.progression), 'request:mode');
  assert(Array.isArray(r.changedAreas) && r.changedAreas.length <= CHANGE_AREAS.length && unique(r.changedAreas) && r.changedAreas.every(a=>CHANGE_AREAS.includes(a)), 'request:changes');
  assert(r.template === null || exact(r.template,['id','revision','qualification']) && str(r.template.id) && /^[a-f0-9]{40}$/.test(r.template.revision) && fileRef(r.template.qualification), 'request:template');
  assert(r.repair === null || exact(r.repair,['targetState','actual','expected','evidence']) && ['targetState','actual','expected'].every(k=>str(r.repair[k])) && fileRef(r.repair.evidence), 'request:repair');
  assert(r.mode !== 'repair' || r.repair !== null,'request:repair-required');
  assert(exact(r.budget,['maxCashCents','maxWorkMinutes','maxFixAttempts']) && Object.values(r.budget).every(num) && r.budget.maxWorkMinutes > 0 && r.budget.maxFixAttempts <= 5,'request:budget');
  canonical(r); return r;
}
function activeProfiles(r) { return [r.profile,r.secondaryProfile].filter(Boolean); }
export function requiredCases(r) {
  return [...COMMON_TAGS, ...new Set(activeProfiles(r).flatMap(id=>Object.keys(PROFILES[id].checks))), ...(r.secondaryProfile?['hybrid-link']:[])];
}

// Receipt files come from an independent review, not from a model's requested mode.
// Byte binding catches mismatches; it cannot authenticate a deliberately fabricated human review.
async function qualification(root, r) {
  assert(r.template,'reuse:no-template');
  const q = parse(await boundFile(root,r.template.qualification));
  assert(exact(q,['schemaVersion','templateId','revision','profile','secondaryProfile','platform','progression','buildHash','runId','decision','reviewer','allowedChanges','reports','policyHash']), 'reuse:schema');
  assert(q.policyHash===policyHash && q.schemaVersion===1 && q.templateId===r.template.id && q.revision===r.template.revision && q.profile===r.profile && q.secondaryProfile===r.secondaryProfile &&
    q.platform===r.platform && q.progression===r.progression && digest(q.buildHash) && str(q.runId) && str(q.reviewer) && q.decision==='APPROVE_BOUNDED_VARIANTS', 'reuse:binding-or-review');
  assert(Array.isArray(q.allowedChanges) && unique(q.allowedChanges) && q.allowedChanges.every(a=>['theme','content','levels'].includes(a)) &&
    r.changedAreas.every(a=>q.allowedChanges.includes(a)), 'reuse:outside-reviewed-envelope');
  assert(exact(q.reports,['engineering','browser','human']), 'reuse:reports');
  for (const type of ['engineering','browser','human']) {
    const report = parse(await boundFile(root,q.reports[type]));
    assert(report.runId===q.runId && report.buildHash===q.buildHash && report.passed===true,'reuse:stale-or-failed-report');
    if(type==='browser') {
      assert(report.scope==='HTTP_BROWSER' && Array.isArray(report.checks) && report.checks.length>0 && report.checks.every(c=>obj(c)&&c.passed===true) &&
        Array.isArray(report.artifacts) && report.artifacts.length>0,'reuse:browser-evidence');
      for(const a of report.artifacts) await boundFile(root,a);
    }
    if(type==='human') {
      assert(report.profile===r.profile && report.source==='HUMAN' && str(report.reviewer) &&
        report.decision==='APPROVE_BOUNDED_VARIANTS' && Array.isArray(report.sessions) && report.sessions.length>=3 && unique(report.sessions.map(s=>s.id)), 'reuse:human-review');
      for(const session of report.sessions) {
        assert(obj(session)&&str(session.id)&&session.consent===true&&session.uncoached===true&&str(session.finding), 'reuse:human-session');
        await boundFile(root,session.evidence);
      }
    }
  }
  return { revision:q.revision, reviewSha256:r.template.qualification.sha256, reviewer:q.reviewer,
    limitation:'Reviewed declarations and bound bytes; not proof of enjoyment, commercial success or truthful human origin.' };
}
export async function planWorkflow(request, root) {
  const r = validateRequest(request); const blockers=[]; const reasons=[];
  let mode=r.mode, receipt=null;
  if(!r.profile) blockers.push('CLASSIFY_PRIMARY_EXPERIENCE');
  if(r.mode==='variant') {
    try { receipt=await qualification(root,r); }
    catch { mode='discover'; reasons.push('NO_MATCHING_VERIFIED_TEMPLATE_OR_CHANGE_OUTSIDE_ENVELOPE'); }
  }
  if(r.mode==='repair') {
    try { await boundFile(root,r.repair.evidence); }
    catch { blockers.push('REPRODUCTION_EVIDENCE_MISSING_OR_CHANGED'); }
  }
  const profiles=activeProfiles(r).map(id=>({id,...PROFILES[id]}));
  const phases = mode==='repair' ? [
    {id:'reproduce',legacyStages:['QA'],task:'Confirm the exact object/state and smallest reproducible failure; do not redesign unrelated systems.'},
    {id:'repair',legacyStages:['FIX'],task:'Change only evidence-linked files within the declared repair budget.'},
    {id:'retest',legacyStages:['QA','WAITING_FOR_HUMAN_PLAYTEST'],task:'Repeat the same failing case and affected profile checks; subjective issues still need human review.'}
  ] : [
    {id:'scope',legacyStages:['BUSINESS_PREFLIGHT'],task:'One primary audience, one platform, rights, budget, and a plausible first-user source.'},
    {id:'research',legacyStages:['REFERENCE_DEEP_RESEARCH'],task:mode==='variant'?'Study only changed content and reuse-boundary risks; preserve prior reference evidence.':'Study one reference deeply: visible play plus source/authorized REA for uncertain rules. Do not require a good template before research.'},
    {id:'contract',legacyStages:['PRODUCT_EXPERIENCE_CONTRACT','CORE_SPEC_FROZEN'],task:'Bind a small actionable loop, first-session value, disconfirming cases and profile-specific acceptance.'},
    {id:'slice',legacyStages:['FULL_BUILD','QA'],task:'Build a small core experience, not all progression content; run engineering and visible normal-input checks.'},
    {id:'experience',legacyStages:['WAITING_FOR_HUMAN_PLAYTEST'],task:'Separate enjoyment, voluntary continuation, later return and retrospective value. Preserve failures; no AI-generated human sessions.'},
    {id:'expand-or-stop',legacyStages:['CONTENT_EXPANSION','TARGET_PLATFORM_QA','RELEASE'],task:'Expand or stop based on evidence; perform platform/advertising/privacy checks before any launch.'}
  ];
  return {schemaVersion:1,gameId:r.gameId,policyHash,requestHash:sha256(canonical(r)),requestedMode:r.mode,effectiveMode:mode,
    status:blockers.length?'BLOCKED':'WORK_ORDER_READY',blockers,reasons,profiles,requiredCaseTags:requiredCases(r),phases,
    platform:r.platform,progression:r.progression,budget:r.budget,templateReview:receipt,
    humanDecisions:['SCOPE_AND_BUDGET','CORE_EXPERIENCE','LAUNCH_OR_STOP'],
    skill:'gameplay-loop-review',executionAllowed:false,releaseAllowed:false,
    note:'This is a preflight/work-order artifact, not a replacement state machine or evidence that any listed phase executed. External model spend is not automatically controlled.'};
}

export function draftContract(request) {
  const r=validateRequest(request);
  return {schemaVersion:1,gameId:r.gameId,policyHash,requestHash:sha256(canonical(r)),status:'DRAFT',
    firstSession:{firstAction:'',firstResult:'',nextIntention:'',safeStop:''},
    loops:[{id:'core',scale:'core',decision:'',action:'',visibleChange:'',nextIntention:'',variation:'',claim:'hypothesis',evidenceRefs:[]}],
    links:[],progression:r.progression==='persistent'?{savedState:'',effectOnNextCore:'',safeExit:''}:null,
    endingValue:'',cases:requiredCases(r).map(tag=>({id:tag,tag,given:'',when:'',thenState:'',thenVisible:'',contrastAction:'',contrastExpected:'',evidenceRefs:[]})),
    evidence:[],openQuestions:['Research and player evidence have not been collected.'],
    measurements:{enjoyment:'NOT_RUN',voluntaryContinuation:'NOT_RUN',nextDayReturn:'NOT_RUN',retrospectiveValue:'NOT_RUN'}};
}
const rewardOnly=v=>typeof v==='string'&& /^(为了奖励|为了金币|领奖励|领金币|升级|继续升级|for rewards?|more coins?|level up)[。.!！\s]*$/i.test(v.trim());
export async function auditContract(request, contract, root) {
  const r=validateRequest(request); const c=contract; const blockers=[]; const warnings=[];
  const fail=m=>blockers.push(m);
  if(!exact(c,['schemaVersion','gameId','policyHash','requestHash','status','firstSession','loops','links','progression','endingValue','cases','evidence','openQuestions','measurements'])) {
    return {status:'BLOCKED',blockers:['CONTRACT_SCHEMA'],executionAllowed:false,releaseAllowed:false};
  }
  if(c.policyHash!==policyHash || c.schemaVersion!==1 || c.gameId!==r.gameId || c.requestHash!==sha256(canonical(r))) fail('CONTRACT_STALE_OR_WRONG_GAME');
  if(!r.profile) fail('CLASSIFY_PRIMARY_EXPERIENCE');
  if(!['DRAFT','PROPOSED'].includes(c.status)) fail('INVALID_SPEC_STATUS');
  if(c.status==='DRAFT') fail('DRAFT_NOT_READY');
  const firstKeys=['firstAction','firstResult','nextIntention','safeStop'];
  if(!exact(c.firstSession,firstKeys)||!firstKeys.every(k=>str(c.firstSession[k]))) fail('FIRST_SESSION_INCOMPLETE');
  if(rewardOnly(c.firstSession?.nextIntention)) fail('REWARD_WITHOUT_PLAYER_INTENTION');
  if(!Array.isArray(c.loops)||!c.loops.length||c.loops.length>3||!unique(c.loops.map(l=>l?.id))) fail('LOOP_SCHEMA');
  const loops=Array.isArray(c.loops)?c.loops:[];
  if(loops.filter(l=>l?.scale==='core').length!==1) fail('ONE_CORE_LOOP_REQUIRED');
  const loopKeys=['id','scale','decision','action','visibleChange','nextIntention','variation','claim','evidenceRefs'];
  for(const l of loops) {
    if(!exact(l,loopKeys)||!['core','goal','meta'].includes(l.scale)||!['hypothesis','observed','source-derived'].includes(l.claim)||
      !['id','decision','action','visibleChange','nextIntention','variation'].every(k=>str(l[k]))||!Array.isArray(l.evidenceRefs)||!unique(l.evidenceRefs)) {fail('LOOP_INCOMPLETE');continue;}
    if(rewardOnly(l.nextIntention)) fail('REWARD_WITHOUT_PLAYER_INTENTION');
    if(l.claim!=='hypothesis'&&!l.evidenceRefs.length) fail('FACT_WITHOUT_EVIDENCE');
    if(l.claim==='hypothesis') warnings.push('HYPOTHESIS_REQUIRES_RUNTIME_TEST:'+l.id);
  }
  const links=Array.isArray(c.links)?c.links:[];
  if(!Array.isArray(c.links)||links.length>6) fail('LINK_SCHEMA');
  for(const e of links) if(!exact(e,['from','to','kind','effect'])||!loops.some(l=>l?.id===e.from)||!loops.some(l=>l?.id===e.to)||e.from===e.to||!['feeds','changes-action'].includes(e.kind)||!str(e.effect)) fail('LINK_INVALID');
  const core=loops.find(l=>l?.scale==='core')?.id;
  const reachable=(from,to,kind)=>{
    const seen=new Set([from]);const queue=[from];
    while(queue.length){const at=queue.shift();for(const e of links){if(obj(e)&&e.from===at&&e.kind===kind&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}}}
    return seen.has(to);
  };
  for(const l of loops) if(l?.id!==core && (!reachable(core,l?.id,'feeds')||!reachable(l?.id,core,'changes-action'))) fail('DISCONNECTED_GROWTH:'+l?.id);
  if(r.progression==='persistent') {
    const keys=['savedState','effectOnNextCore','safeExit'];
    if(!exact(c.progression,keys)||!keys.every(k=>str(c.progression[k]))) fail('PERSISTENCE_WITHOUT_PLAYER_VALUE');
  } else if(c.progression!==null||!str(c.endingValue)) fail('SESSION_END_VALUE_REQUIRED');
  const evidence=new Map();
  if(!Array.isArray(c.evidence)||c.evidence.length>30) fail('EVIDENCE_SCHEMA');
  for(const e of Array.isArray(c.evidence)?c.evidence:[]) {
    if(!exact(e,['id','targetId','version','kind','file','locator'])||!['id','targetId','version','locator'].every(k=>str(e[k]))||
      !['observation','source','creator-post'].includes(e.kind)||!fileRef(e.file)||evidence.has(e.id)) {fail('EVIDENCE_INVALID');continue;}
    try {await boundFile(root,e.file);evidence.set(e.id,e);} catch {fail('EVIDENCE_UNREADABLE_OR_CHANGED:'+e.id);}
  }
  for(const l of loops) for(const id of Array.isArray(l?.evidenceRefs)?l.evidenceRefs:[]) {
    const e=evidence.get(id);
    if(!e) fail('EVIDENCE_REF_UNKNOWN');
    else if(l.claim==='observed'&&e.kind!=='observation'||l.claim==='source-derived'&&e.kind!=='source') fail('EVIDENCE_KIND_MISMATCH');
  }
  const cases=Array.isArray(c.cases)?c.cases:[];
  if(!Array.isArray(c.cases)||cases.length>20||!unique(cases.map(t=>t?.id))) fail('CASE_SCHEMA');
  const caseKeys=['id','tag','given','when','thenState','thenVisible','contrastAction','contrastExpected','evidenceRefs'];
  for(const t of cases) {
    if(!exact(t,caseKeys)||!caseKeys.filter(k=>k!=='evidenceRefs').every(k=>str(t[k]))||!Array.isArray(t.evidenceRefs)) {fail('CASE_INCOMPLETE');continue;}
    if(t.when.trim()===t.contrastAction.trim()||t.thenState.trim()===t.contrastExpected.trim()) fail('CASE_WITHOUT_CONTRAST');
    for(const id of t.evidenceRefs) if(!evidence.has(id)) fail('EVIDENCE_REF_UNKNOWN');
  }
  for(const tag of requiredCases(r)) if(!cases.some(t=>t?.tag===tag)) fail('CASE_TAG_MISSING:'+tag);
  if(!Array.isArray(c.openQuestions)||!c.openQuestions.every(str)) fail('OPEN_QUESTIONS_SCHEMA');
  const measureKeys=['enjoyment','voluntaryContinuation','nextDayReturn','retrospectiveValue'];
  if(!exact(c.measurements,measureKeys)||!measureKeys.every(k=>c.measurements[k]==='NOT_RUN')) fail('SPEC_CANNOT_CERTIFY_HUMANS');
  return {schemaVersion:1,gameId:r.gameId,policyHash,requestHash:sha256(canonical(r)),contractHash:sha256(canonical(c)),
    status:blockers.length?'BLOCKED':'SPEC_READY_FOR_PROTOTYPE_REVIEW',blockers:[...new Set(blockers)],warnings:[...new Set(warnings)],
    requiredCaseTags:requiredCases(r),verifiedEvidenceFiles:evidence.size,semanticTruth:'NOT_AUTOMATICALLY_VERIFIED',
    fun:'NOT_MEASURED',executionAllowed:false,releaseAllowed:false,
    note:'Checks structure, data references and required contrasts; a human must judge meaning. Hypotheses may guide a bounded prototype, never certify a template or revenue.'};
}
export async function main(args) {
  const [mode,root,requestFile,extra]=args;
  assert(['plan','draft','check'].includes(mode)&&args.length===(mode==='check'?4:3),'cli:usage');
  const request=validateRequest(parse(await readBounded(root,requestFile)));
  if(mode==='plan') return planWorkflow(request,root);
  if(mode==='draft') return draftContract(request);
  return auditContract(request,parse(await readBounded(root,extra)),root);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try {const result=await main(process.argv.slice(2));console.log(JSON.stringify(result,null,2));if(result.status==='BLOCKED')process.exitCode=2;}
  catch {console.error('workflow: invalid, unreadable or incompatible input; inspect private inputs locally.');process.exitCode=1;}
}
