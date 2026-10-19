/* global console, process, Buffer, setTimeout, clearTimeout, URL */
import { mkdir, writeFile, rename, rm, open, lstat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sha256, safeRead, verifyEvidence, evaluateBudget, evaluatePlaytest, DEFAULT_BUDGET } from './policy.mjs';

const ROOT = fileURLToPath(new URL('../../',import.meta.url));
export const GAME_FILES = Object.freeze(['candidate.json','engine.mjs','index.html','main.mjs','style.css','themes.mjs']);
const SOURCE_FILES = ['research.json','reference/LICENSE.txt','reference/move-excerpt.txt'];
const ACCEPTANCE = 'tests/engine.test.mjs';
export const BROWSER_CHECKS = Object.freeze([
  'layout-observatory-390x844', 'layout-observatory-320x568',
  'layout-observatory-844x390', 'layout-orchard-390x844',
  'touch-swipe-move-and-merge', 'reload-restores-exact-state',
  'touch-cancel-is-not-a-move', 'normal-loss-settlement-and-replay',
  'theme-save-isolation', 'win-and-continue', 'storage-denial-preserves-play',
]);
const BROWSER_SCREENSHOTS = [
  'screenshots/observatory-390x844.png', 'screenshots/observatory-320x568.png',
  'screenshots/observatory-844x390.png', 'screenshots/orchard-390x844.png',
  'screenshots/normal-terminal.png',
];
export async function browserSuiteHash() {
  return sha256(await safeRead(ROOT, 'tools/lean-pilot/browser-qa.mjs'));
}
export async function verifyRunInputs(root, run) {
  const game = path.join(root, 'workspace/game');
  if (sha256(await safeRead(game, ACCEPTANCE)) !== run.acceptanceHash) throw new Error('Frozen acceptance tests changed');
  if (await browserSuiteHash() !== run.browserSuiteHash) throw new Error('Frozen browser acceptance changed');
  const evidenceRoot = path.join(root, 'evidence');
  if (sha256(await safeRead(evidenceRoot, 'research.json')) !== run.researchHash) throw new Error('Frozen research manifest changed');
  const evidence = await verifyEvidence(evidenceRoot, await json(evidenceRoot, 'research.json'));
  if (!evidence.passed) throw new Error(evidence.blockers.join(', '));
  return evidence;
}
async function browserArtifactsCurrent(root, report, run) {
  if (!report || report.suiteHash !== run.browserSuiteHash || report.scope !== 'HTTP_BROWSER' ||
    !Array.isArray(report.checks) || !Array.isArray(report.artifacts) ||
    report.checks.length !== BROWSER_CHECKS.length ||
    report.checks.some(c => !c || typeof c.name !== 'string' || c.passed !== true) ||
    new Set(report.checks.map(c => c.name)).size !== BROWSER_CHECKS.length ||
    !BROWSER_CHECKS.every(name => report.checks.some(c => c.name === name && c.passed === true))) return false;
  try {
    for (const name of BROWSER_SCREENSHOTS) {
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
  for (const name of GAME_FILES) entries.push([name,sha256(await safeRead(gameRoot,name))]);
  return sha256(JSON.stringify(entries));
}
export async function loadRun(base,id) {
  assertId(id); const run = await json(base,`${id}/run.json`);
  if (run.schemaVersion !== 1 || run.runId !== id || run.templateId !== 'grid-merge-v1' ||
    !['observatory','orchard'].includes(run.theme) || run.policyHash !== sha256(JSON.stringify(run.budget))) throw new Error('Invalid run identity or changed budget');
  return {run,root:path.join(base,id),game:path.join(base,id,'workspace/game')};
}

/** Add only: never overwrite or reuse a previous run, including partial runs. */
export async function createRun(base,id,theme='observatory') {
  assertId(id); if (!['observatory','orchard'].includes(theme)) throw new Error('Unknown theme');
  await mkdir(base,{recursive:true}); const baseStat=await lstat(base);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) throw new Error('Unsafe runs directory');
  const root=path.join(base,id); await mkdir(root); // Deliberately fails if it exists.
  try {
    const game=path.join(root,'workspace/game');await mkdir(path.join(game,'tests'),{recursive:true});
    const evidence=path.join(root,'evidence');await mkdir(path.join(evidence,'reference'),{recursive:true});
    for (const name of [...GAME_FILES,ACCEPTANCE]) await writeFile(path.join(game,name),await safeRead(path.join(ROOT,'templates/web-lite/grid-merge-v1'),name),{flag:'wx'});
    for (const name of SOURCE_FILES) await writeFile(path.join(evidence,name),await safeRead(path.join(ROOT,'examples/lean-pilot'),name),{flag:'wx'});
    const research=await json(evidence,'research.json'); const evidenceResult=await verifyEvidence(evidence,research);
    if (!evidenceResult.passed) throw new Error(evidenceResult.blockers.join(', '));
    const run={schemaVersion:1,runId:id,templateId:'grid-merge-v1',theme,createdAt:new Date().toISOString(),
      budget:{...DEFAULT_BUDGET},policyHash:sha256(JSON.stringify(DEFAULT_BUDGET)),
      browserSuiteHash:await browserSuiteHash(),acceptanceHash:sha256(await safeRead(game,ACCEPTANCE)),researchHash:sha256(await safeRead(evidence,'research.json')),
      note:'Explicit engineering pilot only. Not connected to legacy production routing, Codex, REA, billing, deployment or platform publication.'};
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
    try { result=await runNode(['--test','--experimental-test-isolation=none',ACCEPTANCE],game,request.timeoutMs); }
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
  const human=await evaluatePlaytest(root,await optionalJson(root,'human-review.json'),{runId:id,buildHash:hash});
  const status=(report)=>!report?'NOT_RUN':!inputsCurrent||ledger.pending||report.buildHash!==hash||report.runId!==id?'STALE':
    report.passed!==true?(report.outcome==='ENVIRONMENT_BLOCKED'?'BLOCKED':'FAIL'):
    report===browser&&!browserCurrent?'STALE':'PASS';
  return {runId:id,buildHash:hash,engineering:status(engineering),browser:status(browser),human,
    commercial:'NOT_RUN',platformPackages:'NOT_BUILT',publishable:false,
    status:status(engineering)==='PASS'&&status(browser)==='PASS'&&human.passed?'EXPERIENCE_SCREEN_PASSED_NOT_RELEASED':'EXPERIMENT_INCOMPLETE',
    ledger};
}

/** Local preview only, with an explicit file allowlist and no run data exposure. */
export async function serveRun(base,id,port=4173) {
  const {run,game}=await loadRun(base,id);
  if (!Number.isInteger(port)||port<0||port>65535) throw new Error('Invalid port');
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json'};
  const allowed=new Set(GAME_FILES);
  const server=createServer(async(req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
    const end=(code,body,type='text/plain; charset=utf-8')=>{res.writeHead(code,{...headers,'Content-Type':type});res.end(body);};
    if(req.method!=='GET'&&req.method!=='HEAD') return end(405,'Method not allowed');
    const expectedPort=server.address().port;
    if(![`127.0.0.1:${expectedPort}`,`localhost:${expectedPort}`].includes(req.headers.host??''))return end(403,'Unexpected host');
    try {
      const raw=decodeURIComponent((req.url??'/').split('?')[0]);
      if(raw==='/build.json')return end(200,JSON.stringify({runId:id,buildHash:await buildHash(game),theme:run.theme}),'application/json');
      const name=raw==='/'?'index.html':raw.startsWith('/')?raw.slice(1):'';
      if(!allowed.has(name))return end(404,'Not found');
      const bytes=await safeRead(game,name);return end(200,req.method==='HEAD'?Buffer.alloc(0):bytes,types[path.extname(name)]);
    } catch{return end(400,'Invalid request');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  return server;
}
async function main() {
  const [command,id,arg]=process.argv.slice(2);
  if(command==='init') console.log(JSON.stringify(await createRun(DEFAULT_RUNS,id,arg??'observatory'),null,2));
  else if(command==='check') {const report=await checkRun(DEFAULT_RUNS,id);console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
  else if(command==='report')console.log(JSON.stringify(await reportRun(DEFAULT_RUNS,id),null,2));
  else if(command==='export') {
    const {root,game,run}=await loadRun(DEFAULT_RUNS,id);const {standaloneHtml}=await import('./standalone.mjs');
    const bundle=await standaloneHtml(game,arg??run.theme);const name=`${bundle.theme}-${bundle.buildHash.slice(0,12)}.html`;
    await writeFile(path.join(root,name),bundle.html,{flag:'wx'});console.log(JSON.stringify({path:path.join(root,name),buildHash:bundle.buildHash},null,2));
  }
  else if(command==='serve') {
    const server=await serveRun(DEFAULT_RUNS,id,arg===undefined?4173:Number(arg));const {run}=await loadRun(DEFAULT_RUNS,id);
    console.log(`Local preview: http://127.0.0.1:${server.address().port}/?theme=${run.theme}`);
    const close=()=>server.close();process.once('SIGINT',close);process.once('SIGTERM',close);
  } else throw new Error('Usage: node tools/lean-pilot/runner.mjs init|check|serve|export|report RUN_ID [theme|port]');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
