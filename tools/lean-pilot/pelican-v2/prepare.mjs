/* global process, console */
// A bounded, reproducible source adaptation of PR10's pelican only.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const RUN_ID = 'pelican-coast-v2-20261014';
export const RUN = path.join(REPO, 'runs', RUN_ID);
export const WORKSPACE = path.join(RUN, 'workspace');
export const SOURCE = path.join(WORKSPACE, 'source/pelican-bike');
export const BASE = 'b3e9e41dbafd9fecff972e0838aec8bed8220afc';
export const SOURCE_REV = '54adc1fb64155f9dd7c1c90ecae7b8185ac540b8';
export const sha = data => createHash('sha256').update(data).digest('hex');
export const json = async (file, data) => { await mkdir(path.dirname(file), {recursive:true}); await writeFile(file, JSON.stringify(data,null,2)+'\n'); };

export async function prepare() {
  await mkdir(path.join(RUN,'evidence'), {recursive:true});
  const marker = path.join(RUN, 'baseline-receipt.json');
  try { return JSON.parse(await readFile(marker,'utf8')); } catch (e) { if(e.code!=='ENOENT') throw e; }
  const upstream = process.env.H5_PINNED_SOURCE_ROOT;
  if (!upstream || execFileSync('git',['rev-parse','HEAD'],{cwd:upstream,encoding:'utf8'}).trim()!==SOURCE_REV) throw Error('Set H5_PINNED_SOURCE_ROOT to the fixed authorized revision');
  execFileSync('git',['diff','--exit-code',SOURCE_REV,'--','pelican-bike'],{cwd:upstream});
  const names=execFileSync('git',['ls-files','-z','--','pelican-bike'],{cwd:upstream,encoding:'utf8'}).split('\0').filter(Boolean), files=[];
  for(const name of names){ const bytes=await readFile(path.join(upstream,name));const to=path.join(WORKSPACE,'source',name);await mkdir(path.dirname(to),{recursive:true});await writeFile(to,bytes);files.push({path:name,sha256:sha(bytes)}); }
  const lock=path.join(SOURCE,'package-lock.json');await writeFile(lock,(await readFile(lock,'utf8')).replaceAll('https://bnpm.byted.org/','https://registry.npmjs.org/'));
  execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:SOURCE});
  execFileSync(process.execPath,['build.mjs'],{cwd:SOURCE});
  const baseline=path.join(WORKSPACE,'baseline');await mkdir(baseline,{recursive:true});
  let html=await readFile(path.join(SOURCE,'dist/index.html'),'utf8');
  html=html.replace('<html','<html data-reference-game="pelican-bike"').replace('</head>','<script>if(!location.search)history.replaceState(null,"",location.pathname+"?q=low");</script><link rel="stylesheet" href="style.css"></head>').replace('</body>','<script type="module" src="main.mjs"></script></body>');
  await writeFile(path.join(baseline,'index.html'),html);
  for(const f of ['main.mjs','engine.mjs','themes.mjs','style.css','platform.json','LICENSE.three.txt']) await cp(path.join(REPO,'templates/web-lite/h5-source-mobile-v1',f),path.join(baseline,f));
  await json(path.join(baseline,'build.json'),{runId:RUN_ID,baseline:BASE});
  const research=JSON.parse(await readFile(path.join(REPO,'examples/lean-pilot/three-h5/pelican-bike/open-source-research.json'),'utf8'));
  research.researchId=RUN_ID+'-infrastructure';research.targetGame='鹈鹕海岸冒险';research.targetWorkspace=WORKSPACE;research.researchedAt=new Date().toISOString();
  research.conclusion.architectureDecision='Reuse PR10 authorized pelican source, Three.js and existing ad/reward functions. Add bounded per-game configs/obstacles, no new engine. H5 only; native packages and actual ads unverified.';
  const {OpenSourceResearchArtifactSchema}=await tsImport('../../../src/schemas/open-source-research.ts',import.meta.url);
  await json(path.join(RUN,'open-source-research.json'),OpenSourceResearchArtifactSchema.parse(research));
  const report='用户在 iPhone 观察到画质模糊、主角过大和前方道路不可读。核对 PR10 renderer/composer、start/camera、shadow 和自适应路径；未提供录屏，不能声称已复现实体 iPhone。';
  await writeFile(path.join(RUN,'user-report.txt'),report);
  const evidence=[{path:'user-report.txt',sha256:sha(report),kind:'user-report',provenance:'verified-run-artifact'}];
  const {ExperienceComplaintTriageSchema,ExperienceReproductionMatrixSchema}=await tsImport('../../../src/schemas/experience-complaint.ts',import.meta.url);
  const triage=ExperienceComplaintTriageSchema.parse({schemaVersion:1,artifactType:'experience-complaint-triage',targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,report,classification:['mobile-readability','visual-hierarchy','core-experience'],scope:{route:'formal-fixer',rationale:'Default camera startup and multi-path render-resolution defect; cross-module product journey, not a localized two-file direct repair.',generatedWorkspaceModified:false,contextIntentionallyOmitted:['赛车与射击源码','PR9非必需设计','历史REA日志','无来源录屏']},reproduction:{status:'PARTIALLY_REPRODUCED',steps:['Open PR10 baseline 390×844 DPR3','Tap start; inspect default composition','Measure canvas, composer viewports and real RAF deltas','Capture same pose before/after without using pose injection as gameplay evidence'],observed:['PR10 sets renderer PR=1 without composer update; original low composer PR=.8','start() sets orbit unless URL has cam; shadow disabled by PR10'],evidence},acceptanceCriteria:['Default start/replay keeps a stable follow camera with rider below center','Renderer and actual postprocess viewport agree at >=1.25 DPR for sharp/balanced modes','No automatic orbit; >=3 sec visible vehicle warning','Player-visible natural runtime evidence on portrait/landscape; physical iPhone marked pending'],status:'OPEN',createdAt:new Date().toISOString()});
  await json(path.join(RUN,'triage.json'),triage);
  const viewports=[{label:'mobile-portrait',width:390,height:844},{label:'small-mobile',width:360,height:740},{label:'mobile-landscape',width:844,height:390}];
  const cells=[];for(const objectType of ['rider-and-bicycle','forward-road-and-hazards'])for(const lifecycleStateBranch of ['default-start','running','pause-resume','replay'])for(const rendererPath of ['PR10-low-composer','v2-balanced-composer'])for(const viewport of viewports)cells.push({id:`${objectType}:${lifecycleStateBranch}:${rendererPath}:${viewport.label}`,objectType,lifecycleStateBranch,rendererPath,viewport,status:'BLOCKED',expected:'Clear player and road, stable follow composition, correct render resolution',observed:'Await exact branch runtime capture',evidence:[]});
  await json(path.join(RUN,'reproduction-matrix.json'),ExperienceReproductionMatrixSchema.parse({schemaVersion:1,artifactType:'experience-reproduction-matrix',targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,axes:{objectTypes:['rider-and-bicycle','forward-road-and-hazards'],lifecycleStateBranches:['default-start','running','pause-resume','replay'],rendererPaths:['PR10-low-composer','v2-balanced-composer'],viewports},cells,confirmedFindings:[],remainingGaps:['Physical iPhone not available'],createdAt:new Date().toISOString()}));
  const receipt={schemaVersion:1,targetGame:'鹈鹕海岸冒险',runId:RUN_ID,workspace:WORKSPACE,baselineCommit:BASE,sourceRevision:SOURCE_REV,files,baselineHtmlSha256:sha(html),sourceRights:'USER_CONFIRMED_MODIFICATION_COMMERCIAL_IAA',physicalIPhone:'NOT_RUN'};
  await json(marker,receipt);return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepare()));
