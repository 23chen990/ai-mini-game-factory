/* global process */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createRun, buildHash, loadRun, verifyRunInputs } from './runner.mjs';
import { safeRead, sha256 } from './policy.mjs';
import { auditResearchToBuild } from './research-to-build.mjs';
import { canonical } from '../../.agents/skills/gameplay-loop-review/scripts/workflow.mjs';
import { SOURCE_COMMIT, TARGETS } from './three-h5-research.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url)), exec = promisify(execFile);

export function assertPr10Baseline(gameId,runId,hash) {
  const baselines = {
    'pelican-bike':['h5-pelican-mobile-20261013','5067196c6c7cdbd007be27ec4879d25666e35d05ec2fe3682bd246131ee7be57'],
    'qq-speed':['h5-qq-mobile-20261013','887691527da597223dabe45a45b0d7d71b87a4a8fb719c64bd4cf6967816c5e0'],
    'cf-transport-ship':['h5-cf-mobile-20261013','d9bb338fc0694e5025dbc95968eb1a647614da456305952290335927b4963c44'],
  };
  if(!baselines[gameId]||baselines[gameId][0]!==runId||baselines[gameId][1]!==hash)throw Error('PR10 baseline game or build hash mismatch');
}

/** Explicit private source fork, checked by PR7. No download, publishing or rights grant is implied. */
export async function buildSourceMobile(base, runId, gameId, { sourceRoot = process.env.H5_PINNED_SOURCE_ROOT, baselineRunId = process.env.H5_PR10_BASELINE_RUN } = {}) {
  if (!Object.hasOwn(TARGETS, gameId) || (!sourceRoot&&!baselineRunId)) throw Error('Select a known game and H5_PINNED_SOURCE_ROOT at the pinned revision');
  if(!baselineRunId) {
    const {stdout} = await exec('git', ['rev-parse', 'HEAD'], {cwd:sourceRoot});
    if (stdout.trim() !== SOURCE_COMMIT) throw Error('Reference revision mismatch');
    await exec('git', ['diff', '--quiet', SOURCE_COMMIT, '--', gameId], {cwd:sourceRoot});
  }
  // Resume a completed exact build; do not reset tests, evidence, cash or revision budgets.
  let previous;
  try { previous=JSON.parse(await safeRead(base,runId+'/source-build.json')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(previous) {
    const {run,root,game}=await loadRun(base,runId);await verifyRunInputs(root,run);
    if(previous.runId!==runId||previous.gameId!==gameId||previous.sourceRevision!==SOURCE_COMMIT||previous.buildHash!==await buildHash(game))throw Error('Completed source build changed; use its recorded QA/repair flow');
    return {runId,templateId:run.templateId,theme:run.theme,buildHash:previous.buildHash,sourceReceipt:path.join(root,'source-build.json'),reused:true,publishable:false};
  }
  const inputRoot = path.join(ROOT, 'examples/lean-pilot/three-h5', gameId);
  const gate = await auditResearchToBuild(inputRoot, 'research-to-build.json');
  if (!gate.candidateBuildAllowed) throw Error('Research gate blocked: '+gate.blockers.join(','));
  const {tsImport} = await import('tsx/esm/api');
  const {OpenSourceResearchArtifactSchema} = await tsImport('../../src/schemas/open-source-research.ts', import.meta.url);
  const {FailurePressureContractSchema} = await tsImport('../../src/schemas/failure-pressure-contract.ts', import.meta.url);
  OpenSourceResearchArtifactSchema.parse(JSON.parse(await safeRead(inputRoot,'open-source-research.json')));
  FailurePressureContractSchema.parse(JSON.parse(await safeRead(inputRoot,'failure-pressure.json')));
  const request = JSON.parse(await safeRead(inputRoot,'request.json')), contract = JSON.parse(await safeRead(inputRoot,'contract.json'));
  if (request.gameId !== runId) throw Error('Use the exact run id declared in the checked mobile contract');
  let baseline,baselineHash;
  if(baselineRunId) {baseline=await loadRun(base,baselineRunId);await verifyRunInputs(baseline.root,baseline.run);baselineHash=await buildHash(baseline.game);assertPr10Baseline(gameId,baselineRunId,baselineHash);}
  const result = await createRun(base, runId, gameId, {templateId:'h5-source-mobile-v1',workflow:{'request.json':request,'contract.json':contract}});
  if(baselineRunId) {
    const {root,game}=await loadRun(base,runId);
    for(const file of ['index.html','LICENSE.three.txt','platform.json'])await writeFile(path.join(game,file),await safeRead(baseline.game,file));
    const candidate=JSON.parse(await safeRead(game,'candidate.json'));candidate.referenceId=gameId;candidate.sourceRevision=SOURCE_COMMIT;candidate.implementationContractHash=sha256(canonical(contract));await writeFile(path.join(game,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');
    const report={schemaVersion:1,runId,gameId,sourceRevision:SOURCE_COMMIT,workspace:path.join(root,'workspace'),baselineRunId,baselineBuildHash:baselineHash,baselineGitRevision:'b3e9e41dbafd9fecff972e0838aec8bed8220afc',sourceHtmlSha256:sha256(await safeRead(game,'index.html')),buildHash:await buildHash(game),reusedPr10Source:true,compiledSourceAgain:false,researchGate:gate,route:'direct-builder',routeReason:'Requested challenge feature on the verified PR10 source build.',codeRights:'GRANTED_USER_CONFIRMED',physicalMobile:'NOT_RUN',liveIAA:'NOT_RUN',publishable:false};
    await writeFile(path.join(root,'source-build.json'),JSON.stringify(report,null,2)+'\n');
    return {...result,buildHash:report.buildHash,sourceReceipt:path.join(root,'source-build.json'),reusedPr10Source:true,publishable:false};
  }
  const {root, game} = await loadRun(base,runId), fork = path.join(root,'workspace/source'); await mkdir(fork,{recursive:true});
  // Read only tracked, regular files from this one project; never share another game's workspace.
  const {stdout:listing} = await exec('git',['ls-files','-z','--',gameId],{cwd:sourceRoot});
  const sourceFiles=[];
  for(const name of listing.split('\0').filter(Boolean)) {
    const bytes=await safeRead(sourceRoot,name);const target=path.join(fork,name);
    await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
    sourceFiles.push({path:name,sha256:sha256(bytes),bytes:bytes.length});
  }
  const project=path.join(fork,gameId), lock=path.join(project,'package-lock.json'), rawLock=await readFile(lock);
  const repairedLock=rawLock.toString().replaceAll('https://bnpm.byted.org/','https://registry.npmjs.org/');await writeFile(lock,repairedLock);
  const changes=[];
  if(gameId==='cf-transport-ship') {
    const entry=path.join(project,'src/main.js'), original=await readFile(entry,'utf8');
    const marker='const game = new Game();';if(original.split(marker).length!==2)throw Error('FPS bridge anchor changed');
    const bridge='\n// Owned private H5 glue; the original engine and combat are preserved.\nwindow.__H5NativeGame = game;\n';
    await writeFile(entry,original.replace(marker,marker+bridge));changes.push({file:'src/main.js',beforeSha256:sha256(original),afterSha256:sha256(await readFile(entry)),purpose:'Expose a small integration surface for actual mobile pause and input release.'});
    const file=path.join(project,'src/game.js'), before=await readFile(file,'utf8');
    if(before.split('this.timeLeft = 600').length!==2)throw Error('FPS match timer anchor changed');
    await writeFile(file,before.replace('this.timeLeft = 600','this.timeLeft = 120'));changes.push({file:'src/game.js',beforeSha256:sha256(before),afterSha256:sha256(await readFile(file)),purpose:'Bound the private test round to two simulated minutes; preserve kills and combat.'});
  }
  await exec('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:project,timeout:120000,maxBuffer:1024*1024});
  const {stdout:buildLog}=await exec(process.execPath,['build.mjs'],{cwd:project,timeout:60000,maxBuffer:1024*1024});
  const originalHtml=await readFile(path.join(project,'dist/index.html'),'utf8');
  let html=originalHtml.replace('<html',`<html data-reference-game="${gameId}"`);
  const query=gameId==='pelican-bike'?'q=low':gameId==='cf-transport-ship'?'touch=1&nolock=1':'q=low';
  const defaults=`<script>if(!location.search)history.replaceState(null,'',location.pathname+'?${query}');</script>`;
  html=html.replace('</head>',defaults+'<link rel="stylesheet" href="style.css"></head>');
  html=html.replace('</body>','<script type="module" src="main.mjs"></script></body>');
  await writeFile(path.join(game,'index.html'),html);
  const license=await readFile(path.join(project,'node_modules/three/LICENSE'));await writeFile(path.join(game,'LICENSE.three.txt'),license);
  const candidate=JSON.parse(await safeRead(game,'candidate.json'));candidate.referenceId=gameId;candidate.sourceRevision=SOURCE_COMMIT;candidate.implementationContractHash=sha256(canonical(contract));await writeFile(path.join(game,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');
  const report={schemaVersion:1,runId,gameId,sourceRevision:SOURCE_COMMIT,workspace:path.join(root,'workspace'),buildHash:await buildHash(game),privateSourceFiles:sourceFiles,sourceChanges:changes,
    registryRepair:{originalLockSha256:sha256(rawLock),buildLockSha256:sha256(repairedLock),reason:'Private copy only; retain package integrity. Original pinned repository unchanged.'},originalBuildHtmlSha256:sha256(originalHtml),buildLog:buildLog.trim(),licenseSha256:sha256(license),researchGate:gate,
    route:'direct-builder',routeReason:'User-authorized mobile feature adaptation in a source fork, not a completed formal FIX stage.',contextIntentionallyOmitted:['unrelated game repositories','full conversation','large REA reports','unrelated factory agents'],codeRights:'GRANTED_USER_CONFIRMED',IPRights:'NO_ISSUES_USER_CONFIRMED',originalGrantDocument:'NOT_ARCHIVED',physicalMobile:'NOT_RUN',liveIAA:'NOT_RUN',commercial:'PLATFORM_QA_PENDING',publishable:false};
  await writeFile(path.join(root,'source-build.json'),JSON.stringify(report,null,2)+'\n');
  return {...result,buildHash:report.buildHash,sourceReceipt:path.join(root,'source-build.json'),publishable:false};
}
