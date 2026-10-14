/* global console, process, Buffer, setTimeout, clearTimeout, URL */
import { mkdir, writeFile, rename, rm, open, lstat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {networkInterfaces} from 'node:os';
import {isIPv4} from 'node:net';
import { candidateSpec } from './candidates.mjs';
import { evaluateClinicPlaytest } from './clinic-review.mjs';
import { sha256, safeRead, verifyEvidence, evaluateBudget, evaluatePlaytest, DEFAULT_BUDGET } from './policy.mjs';

const ROOT = fileURLToPath(new URL('../../',import.meta.url));
export const GAME_FILES = Object.freeze(['candidate.json','engine.mjs','index.html','main.mjs','style.css','themes.mjs','fps-mobile-ux.mjs']);
const ACCEPTANCE = 'tests/engine.test.mjs';
export const BROWSER_CHECKS = Object.freeze([
  'layout-observatory-390x844', 'layout-observatory-320x568',
  'layout-observatory-844x390', 'layout-orchard-390x844',
  'touch-swipe-move-and-merge', 'reload-restores-exact-state',
  'touch-cancel-is-not-a-move', 'normal-loss-settlement-and-replay',
  'theme-save-isolation', 'win-and-continue', 'storage-denial-preserves-play',
]);
export async function browserSuiteHash(templateId='grid-merge-v1') {
  const spec=candidateSpec(templateId);const scriptHash=sha256(await safeRead(ROOT,spec.browserScript));
  return templateId==='grid-merge-v1'?scriptHash:sha256(JSON.stringify({scriptHash,checks:spec.checks,screenshots:spec.screenshots}));
}
export async function verifyRunInputs(root, run) {
  const game = path.join(root, 'workspace/game');
  const currentCandidate=await json(game,'candidate.json');
  if(currentCandidate.templateId!==run.templateId)throw new Error('Runtime candidate identity changed');
  if (sha256(await safeRead(game, ACCEPTANCE)) !== run.acceptanceHash) throw new Error('Frozen acceptance tests changed');
  for(const [name,hash]of Object.entries(run.extraAcceptanceHashes??{}))if(sha256(await safeRead(game,name))!==hash)throw new Error('Frozen extra acceptance changed');
  if (await browserSuiteHash(run.templateId) !== run.browserSuiteHash) throw new Error('Frozen browser acceptance changed');
  if (run.workflow) {
    for (const [name,hash] of Object.entries(run.workflow)) {
      if (!['request.json','contract.json'].includes(name) || sha256(await safeRead(root,'input/'+name)) !== hash) throw new Error('Frozen workflow input changed');
    }
  }
  const evidenceRoot = path.join(root, 'evidence');
  if (sha256(await safeRead(evidenceRoot, 'research.json')) !== run.researchHash) throw new Error('Frozen research manifest changed');
  const evidence = await verifyEvidence(evidenceRoot, await json(evidenceRoot, 'research.json'));
  if (!evidence.passed) throw new Error(evidence.blockers.join(', '));
  return evidence;
}
async function browserArtifactsCurrent(root, report, run) {
  const spec=candidateSpec(run.templateId); const checks=spec.checks;
  if (!report || report.suiteHash !== run.browserSuiteHash || report.scope !== 'HTTP_BROWSER' ||
    !Array.isArray(report.checks) || !Array.isArray(report.artifacts) ||
    report.checks.length !== checks.length ||
    report.checks.some(c => !c || typeof c.name !== 'string' || c.passed !== true) ||
    new Set(report.checks.map(c => c.name)).size !== checks.length ||
    !checks.every(name => report.checks.some(c => c.name === name && c.passed === true))) return false;
  try {
    for (const name of spec.screenshots) {
      const artifact = report.artifacts.find(a => a.path === name);
      if (!artifact || sha256(await safeRead(root, name)) !== artifact.sha256) return false;
    }
    return true;
  } catch { return false; }
}
const DEFAULT_RUNS = path.join(ROOT,'runs');
const idValid = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
function assertId(id) { if (!idValid(id)) throw new Error('Invalid run id: use lowercase letters, numbers and hyphens'); }
async function json(root, relative) { return JSON.parse((await safeRead(root,relative)).toString('utf8')); }
async function writeJson(root, name, value) {
  const temporary = path.join(root,`.${name}.${randomUUID()}.tmp`);
  try { await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,path.join(root,name)); }
  finally { await rm(temporary,{force:true}); }
}
export async function buildHash(gameRoot) {
  const entries=[];
  const candidate=await json(gameRoot,'candidate.json');
  for (const name of [...GAME_FILES,...(candidateSpec(candidate.templateId).runtimeFiles??[])]) entries.push([name,sha256(await safeRead(gameRoot,name))]);
  return sha256(JSON.stringify(entries));
}
export async function loadRun(base,id) {
  assertId(id); const run = await json(base,`${id}/run.json`);
  const spec=candidateSpec(run.templateId);
  if (['clinic-queue-v1','h5-source-mobile-v1'].includes(run.templateId) && (!run.workflow || !run.workflow['request.json'] || !run.workflow['contract.json'])) throw new Error('Candidate workflow binding missing');
  if (run.schemaVersion !== 1 || run.runId !== id ||
    !spec.themes.includes(run.theme) || run.policyHash !== sha256(JSON.stringify(run.budget))) throw new Error('Invalid run identity or changed budget');
  return {run,root:path.join(base,id),game:path.join(base,id,'workspace/game')};
}

/** Add only: never overwrite or reuse a previous run, including partial runs. */
export async function createRun(base,id,theme='observatory',options={}) {
  const spec=candidateSpec(options.templateId??'grid-merge-v1');
  assertId(id); if (!spec.themes.includes(theme)) throw new Error('Unknown theme');
  if(['clinic-queue-v1','h5-source-mobile-v1'].includes(spec.id)&&!options.workflow)throw new Error('Use the checked workflow build entry for this candidate');
  await mkdir(base,{recursive:true}); const baseStat=await lstat(base);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) throw new Error('Unsafe runs directory');
  const root=path.join(base,id); await mkdir(root); // Deliberately fails if it exists.
  try {
    const game=path.join(root,'workspace/game');await mkdir(path.join(game,'tests'),{recursive:true});
    const evidence=path.join(root,'evidence');await mkdir(path.join(evidence,'reference'),{recursive:true});
    for (const name of [...GAME_FILES,...(spec.runtimeFiles??[]),ACCEPTANCE,...(spec.acceptanceFiles??[])]) await writeFile(path.join(game,name),await safeRead(path.join(ROOT,'templates/web-lite',spec.id),name),{flag:'wx'});
    for (const name of spec.sourceFiles) await writeFile(path.join(evidence,name),await safeRead(path.join(ROOT,spec.evidenceRoot,spec.perThemeEvidence?theme:''),name),{flag:'wx'});
    const research=await json(evidence,'research.json'); const evidenceResult=await verifyEvidence(evidence,research);
    if (!evidenceResult.passed) throw new Error(evidenceResult.blockers.join(', '));
    const budget={...DEFAULT_BUDGET,...(spec.checkBudget??{})};
    const run={schemaVersion:1,runId:id,templateId:spec.id,theme,createdAt:new Date().toISOString(),
      budget,policyHash:sha256(JSON.stringify(budget)),
      browserSuiteHash:await browserSuiteHash(spec.id),acceptanceHash:sha256(await safeRead(game,ACCEPTANCE)),researchHash:sha256(await safeRead(evidence,'research.json')),
      note:'Explicit engineering pilot only. Not connected to legacy production routing, Codex, REA, billing, deployment or platform publication.'};
    if(spec.acceptanceFiles){run.extraAcceptanceHashes={};for(const name of spec.acceptanceFiles)run.extraAcceptanceHashes[name]=sha256(await safeRead(game,name));}
    if(options.workflow) {
      await mkdir(path.join(root,'input'));run.workflow={};
      for(const [name,value] of Object.entries(options.workflow)) {
        if(!['request.json','contract.json'].includes(name))throw new Error('Unexpected workflow input');
        const bytes=JSON.stringify(value,null,2)+'\n';
        await writeFile(path.join(root,'input',name),bytes,{flag:'wx',mode:0o600});run.workflow[name]=sha256(bytes);
      }
    }
    await writeJson(root,'run.json',run);
    await writeJson(root,'ledger.json',{buildHashes:[],cashCents:0,elapsedMs:0,pending:false,attempts:[]});
    await writeJson(root,'human-review.json',{status:'NOT_RUN',runId:id,buildHash:await buildHash(game),reviewer:'',participants:[]});
    return {runId:id,workspace:game,buildHash:await buildHash(game),status:'READY_FOR_ENGINEERING_CHECK'};
  } catch (error) {
    // Preserve failure evidence; do not recursively delete a user's workspace.
    await writeFile(path.join(root,'INIT_FAILED.txt'),String(error)+'\n',{flag:'wx'});throw error;
  }
}
function runNode(args,cwd,timeoutMs) {
  return new Promise((resolve,reject)=>{
    // Fixed Node command, no shell, no provider credentials or arbitrary inherited hooks.
    const child=spawn(process.execPath,args,{cwd,shell:false,env:{PATH:process.env.PATH ?? '',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timedOut=false; const cap=2*1024*1024;
    const append=(old,chunk)=>old.length<cap?(old+chunk.toString()).slice(0,cap):old;
    child.stdout.on('data',data=>{stdout=append(stdout,data);});child.stderr.on('data',data=>{stderr=append(stderr,data);});
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(timer);resolve({passed:code===0&&!timedOut,exitCode:code,signal,timedOut,stdout,stderr});});
  });
}

/** Verify the actual copied game. A changed build consumes one of three candidate slots. */
export async function checkRun(base,id) {
  const {run,root,game}=await loadRun(base,id);const lockPath=path.join(root,'.check-lock');
  const lock=await open(lockPath,'wx',0o600);
  try {
    const evidence=await verifyRunInputs(root,run);
    const hash=await buildHash(game);const ledger=await json(root,'ledger.json');
    const request={buildHash:hash,cashCents:0,timeoutMs:run.budget.maxAttemptMs};
    const budget=evaluateBudget(run.budget,ledger,request);if(!budget.passed) throw new Error(budget.blockers.join(', '));
    if (!ledger.buildHashes.includes(hash)) ledger.buildHashes.push(hash);
    ledger.pending=true;await writeJson(root,'ledger.json',ledger);const started=Date.now();
    let result;
    try { result=await runNode(['--test','--experimental-test-isolation=none',ACCEPTANCE,...Object.keys(run.extraAcceptanceHashes??{})],game,request.timeoutMs); }
    catch(error) { result={passed:false,exitCode:null,signal:null,timedOut:false,stdout:'',stderr:String(error)}; }
    const elapsedMs=Math.max(0,Date.now()-started);const afterHash=await buildHash(game);
    if(sha256(await safeRead(game,ACCEPTANCE))!==run.acceptanceHash){result.passed=false;result.stderr+='\nAcceptance changed during checks';}
    if (afterHash!==hash) { result.passed=false; result.stderr+='\nBuild changed while checks were running'; }
    ledger.pending=false;ledger.elapsedMs+=elapsedMs;ledger.attempts.push({buildHash:hash,passed:result.passed,elapsedMs,at:new Date().toISOString()});
    await writeJson(root,'ledger.json',ledger);await writeFile(path.join(root,'engineering.tap'),result.stdout);
    const report={schemaVersion:1,runId:id,buildHash:hash,passed:result.passed,exitCode:result.exitCode,
      timedOut:result.timedOut,stderr:result.stderr,logHash:sha256(result.stdout),elapsedMs,evidence,budget,checkedAt:new Date().toISOString(),
      scope:'Native unit and property tests on copied engine. Browser, human and commercial gates are separate.'};
    await writeJson(root,'engineering.json',report);return report;
  } finally { await lock.close();await rm(lockPath,{force:true}); }
}
async function optionalJson(root,name) {
  try { return await json(root,name); } catch(error) { if (error.code==='ENOENT') return null; return {invalid:true}; }
}
export async function reportRun(base,id) {
  const {root,game}=await loadRun(base,id);const hash=await buildHash(game);
  const engineering=await optionalJson(root,'engineering.json');const browser=await optionalJson(root,'browser.json');
  const {run}=await loadRun(base,id);const ledger=await json(root,'ledger.json');
  let inputsCurrent=false;
  try {
    await verifyRunInputs(root,run);
    inputsCurrent=!engineering || sha256(await safeRead(root,'engineering.tap'))===engineering.logHash;
  } catch { inputsCurrent=false; }
  const browserCurrent=await browserArtifactsCurrent(root,browser,run);
  const human=await (run.templateId==='clinic-queue-v1'?evaluateClinicPlaytest:evaluatePlaytest)(root,await optionalJson(root,'human-review.json'),{runId:id,buildHash:hash});
  const status=(report)=>!report?'NOT_RUN':!inputsCurrent||ledger.pending||report.buildHash!==hash||report.runId!==id?'STALE':
    report.passed!==true?(report.outcome==='ENVIRONMENT_BLOCKED'?'BLOCKED':'FAIL'):
    report===browser&&!browserCurrent?'STALE':'PASS';
  return {runId:id,buildHash:hash,engineering:status(engineering),browser:status(browser),human,
    commercial:'NOT_RUN',platformPackages:'NOT_BUILT',publishable:false,
    status:status(engineering)==='PASS'&&status(browser)==='PASS'&&human.passed?'EXPERIENCE_SCREEN_PASSED_NOT_RELEASED':'EXPERIMENT_INCOMPLETE',
    ledger};
}

/** Local preview only, with an explicit file allowlist and no run data exposure. */
export async function serveRun(base,id,port=4173,{bindAddress='127.0.0.1'}={}) {
  const {run,game}=await loadRun(base,id);
  if(bindAddress!=='127.0.0.1') {
    const local=Object.values(networkInterfaces()).flat().some(n=>n?.address===bindAddress&&!n.internal);
    const privateAddress=isIPv4(bindAddress)&&(/^(10\.|192\.168\.)/.test(bindAddress)||/^172\.(1[6-9]|2\d|3[01])\./.test(bindAddress));
    if(!local||!privateAddress)throw Error('Phone preview must bind an assigned private LAN address');
  }
  if (!Number.isInteger(port)||port<0||port>65535) throw new Error('Invalid port');
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8'};
  const spec=candidateSpec(run.templateId);const allowed=new Set([...GAME_FILES,...(spec.runtimeFiles??[])]);
  const server=createServer(async(req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'"+(spec.inlineReference?" 'unsafe-inline'; font-src 'self' data:":"")+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
    const end=(code,body,type='text/plain; charset=utf-8')=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(body);};
    if(req.method!=='GET'&&req.method!=='HEAD') return end(405,'Method not allowed');
    const expectedPort=server.address().port;
    if(![`${bindAddress}:${expectedPort}`,`localhost:${expectedPort}`].includes(req.headers.host??''))return end(403,'Unexpected host');
    try {
      const raw=decodeURIComponent((req.url??'/').split('?')[0]);
      if(raw==='/build.json')return end(200,JSON.stringify({runId:id,buildHash:await buildHash(game),theme:run.theme}),'application/json');
      const name=raw==='/'?'index.html':raw.startsWith('/')?raw.slice(1):'';
      if(!allowed.has(name))return end(404,'Not found');
      const bytes=await safeRead(game,name);return end(200,req.method==='HEAD'?Buffer.alloc(0):bytes,types[path.extname(name)]);
    } catch{return end(400,'Invalid request');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,bindAddress,()=>{server.off('error',reject);resolve();});});
  return server;
}
async function main() {
  const [command,id,arg,bindAddress]=process.argv.slice(2);
  if(command==='prepare') {
    if(arg)throw new Error('prepare takes one run id; model execution is not implicitly authorized');
    const {prepareCandidate}=await import('./quality-cycle.mjs');
    const result=await prepareCandidate(DEFAULT_RUNS,id);console.log(JSON.stringify(result,null,2));if(!result.previewReady)process.exitCode=2;
  }
  else if(command==='delivery') {
    const {readDelivery}=await import('./quality-cycle.mjs');
    const result=await readDelivery(DEFAULT_RUNS,id);console.log(JSON.stringify(result,null,2));if(!result.previewReady)process.exitCode=2;
  }
  else if(command==='build') {
    if(arg&&['qq-speed','cf-transport-ship','pelican-bike'].includes(arg)) {
      const {buildSourceMobile}=await import('./h5-mobile-build.mjs');console.log(JSON.stringify(await buildSourceMobile(DEFAULT_RUNS,id,arg),null,2));return;
    }
    if(arg&&arg!=='clinic-queue-v1')throw new Error('No implementation for this recipe; do not substitute another genre');
    const {buildClinic}=await import('./build-workflow.mjs');
    console.log(JSON.stringify(await buildClinic(DEFAULT_RUNS,id),null,2));
  }
  else if(command==='browser') {
    const {run}=await loadRun(DEFAULT_RUNS,id);
    const module=await import(pathToFileURL(path.join(ROOT,candidateSpec(run.templateId).browserScript)).href);
    const result=await module.browserQa(id);console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
  }
  else if(command==='handoff') {
    const {root,game,run}=await loadRun(DEFAULT_RUNS,id);await verifyRunInputs(root,run);
    console.log(JSON.stringify({runId:id,templateId:run.templateId,workspace:game,buildHash:await buildHash(game),status:await reportRun(DEFAULT_RUNS,id),
      allowedFiles:GAME_FILES.map(name=>'workspace/game/'+name),frozen:['workspace/game/tests/engine.test.mjs','input/','evidence/'],
      next:'Run pilot prepare first. Read quality/developer-action.json only when an uncovered issue remains. The developer, not the owner, investigates routine defects. Rerun prepare after repairs; use delivery for a current verified preview. Never edit frozen tests or reset budgets.',paidModelStarted:false,releaseAllowed:false},null,2));
  }
  else if(command==='init') console.log(JSON.stringify(await createRun(DEFAULT_RUNS,id,arg??'observatory'),null,2));
  else if(command==='check') {const report=await checkRun(DEFAULT_RUNS,id);console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
  else if(command==='report')console.log(JSON.stringify(await reportRun(DEFAULT_RUNS,id),null,2));
  else if(command==='export') {
    const {root,game,run}=await loadRun(DEFAULT_RUNS,id);const {standaloneHtml}=await import('./standalone.mjs');
    const bundle=await standaloneHtml(game,arg??run.theme,id);const name=`${bundle.theme}-${bundle.buildHash.slice(0,12)}.html`;
    await writeFile(path.join(root,name),bundle.html,{flag:'wx'});console.log(JSON.stringify({path:path.join(root,name),buildHash:bundle.buildHash},null,2));
  }
  else if(command==='serve') {
    const server=await serveRun(DEFAULT_RUNS,id,arg===undefined?4173:Number(arg),{bindAddress});const {run}=await loadRun(DEFAULT_RUNS,id);
    console.log(`Local preview: http://${bindAddress??'127.0.0.1'}:${server.address().port}/?theme=${run.theme}`);
    const close=()=>server.close();process.once('SIGINT',close);process.once('SIGTERM',close);
  } else throw new Error('Usage: node tools/lean-pilot/runner.mjs build|init|prepare|delivery|check|browser|serve|export|report|handoff RUN_ID [theme|port]');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
