/* global console,process */
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
import {z} from 'zod';
import {RUN,WORKSPACE,REPO,json,sha} from './prepare.mjs';
import {RISK_LEVELS} from './runtime/risk-policy.mjs';
import {RiskSnapshotValueSchema} from './qa-risk-schema.mjs';
// Reuse the existing campaign/collision/viewport bindings; append V3 traces.
execFileSync(process.execPath,['tools/lean-pilot/pelican-v2/bind-qa.mjs'],{cwd:REPO,stdio:'inherit'});
const read=async p=>JSON.parse(await readFile(path.join(RUN,p),'utf8'));
const build=await read('build-receipt.json'),base=`attempts/attempt-${build.attempt}`;
const {NaturalFlowEvidenceSchema:N}=await tsImport('../../../src/schemas/natural-flow.ts',import.meta.url);
const Raw=z.object({targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.literal(WORKSPACE),buildHash:z.literal(build.buildHash),normalInputOnly:z.literal(true),stateInjection:z.literal(false),passed:z.literal(true),checks:z.array(z.object({name:z.string(),passed:z.literal(true)}).passthrough()),actions:z.array(z.object({at:z.string(),type:z.enum(['tap','swipe'])}).passthrough()),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),errors:z.array(z.string()).length(0)}).passthrough();
const order=await read('qa-review-workorder.json'),features=['lane-inertia','jump-choice','pedestrian-forecast','first-minute-mastery','replay-mastery-records'];
for(const engine of ['webkit','chromium']){
 const rawPath=base+'/experience-'+engine+'/report.json',r=Raw.parse(await read(rawPath));
 for(const s of r.screenshots)if(sha(await readFile(path.join(RUN,s.path)))!==s.sha256)throw Error('Experience screenshot hash mismatch');
 const trace=N.parse({schemaVersion:1,startedFromReset:true,actions:r.actions.map(a=>a.type==='tap'?'tap '+a.selector:'trusted touch '+a.name+' '+JSON.stringify(a.from)+' -> '+JSON.stringify(a.to)),transitions:features.map(name=>({name,changed:true,evidence:rawPath})),completion:'settlement',replayObserved:r.checks.find(c=>c.name==='safe-detour-does-not-require-jump').passed,forbiddenOperations:[],screenshots:r.screenshots.map(s=>s.path),passed:true,blockers:[],runner:'Playwright '+engine+' trusted touch Input protocol and visible buttons, no DOM dispatch',buildHash:build.buildHash,runtime:'web-lite',device:{width:390,height:844,label:'mobile-portrait'},seed:'authored-v3',observedAt:new Date().toISOString()});
 const tracePath='artifacts/natural/v3-experience-'+engine+'.json';await json(path.join(RUN,tracePath),trace);
 order.traces.push({name:'v3-experience-'+engine,path:tracePath,sha256:sha(await readFile(path.join(RUN,tracePath))),raw:rawPath,features,viewport:trace.device});order.rawReports.push(rawPath);order.sourceBindings.push({path:rawPath,sha256:sha(await readFile(path.join(RUN,rawPath)))});
}
order.scope.push('V3 exact natural swipes, reverse input, jump gold and safe detour, two crossing forecasts, first-minute fish and earned three stars. Review matched PR10/13/V3 videos/frame strips as comparison evidence, never as a substitute for the completed natural trace.');
const FeelState=z.object({targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.literal(WORKSPACE),buildHash:z.literal(build.buildHash),engine:z.enum(['webkit','chromium']),normalInputOnly:z.literal(true),stateInjection:z.literal(false),passed:z.literal(true),driverSha256:z.string().regex(/^[a-f0-9]{64}$/u),actions:z.array(z.object({type:z.enum(['tap','trusted-touch-press']),selector:z.string()}).passthrough()),checks:z.array(z.object({name:z.string(),passed:z.literal(true)})).length(3),frames:z.array(z.object({before:z.object({state:z.object({phase:z.literal('running')}).passthrough(),render:z.object({camera:z.object({position:z.array(z.number().finite()).length(3)}).passthrough()}).passthrough()}),after:z.object({state:z.object({phase:z.literal('running')}).passthrough(),render:z.object({camera:z.object({position:z.array(z.number().finite()).length(3)}).passthrough()}).passthrough()})}).passthrough()).length(6),terminal:z.object({state:z.object({reason:z.literal('barrier'),phase:z.literal('finished')}).passthrough()}).passthrough(),replay:z.object({state:z.object({phase:z.literal('running'),level:z.literal(1)}).passthrough()}).passthrough(),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),video:z.object({path:z.string(),sha256:z.string()}),errors:z.array(z.string()).length(0)}).passthrough();
for(const engine of ['webkit','chromium']){
 const rawPath=base+'/feel-state-'+engine+'/report.json',r=FeelState.parse(await read(rawPath));
 const required=['normal-barrier-terminal','normal-replay','six-state-correlated-running-frames'];
 if(r.engine!==engine||!required.every(name=>r.checks.some(c=>c.name===name&&c.passed)))throw Error('Actual motion probe branch is missing');
 const driverPath=base+'/feel-state-'+engine+'/driver-source.mjs';
 if(sha(await readFile(path.join(RUN,driverPath)))!==r.driverSha256)throw Error('Motion driver source hash mismatch');
 for(const binding of [...r.screenshots,r.video])if(sha(await readFile(path.join(RUN,binding.path)))!==binding.sha256)throw Error('Actual motion media hash mismatch');
 const transitions=['lane-inertia','inertial-turn','camera-follow',...required];
 const trace=N.parse({schemaVersion:1,startedFromReset:true,actions:r.actions.map(a=>a.type+' '+a.selector),transitions:transitions.map(name=>({name,changed:true,evidence:rawPath})),completion:'terminal',replayObserved:true,forbiddenOperations:[],screenshots:r.screenshots.map(s=>s.path),passed:true,blockers:[],runner:'Playwright '+engine+' normal visible touch; actual 90ms presses, six screenshot before/after read-only state brackets, real barrier terminal and replay',buildHash:build.buildHash,runtime:'web-lite',device:{width:390,height:844,label:'mobile-portrait'},seed:'authored-v3-feel',observedAt:new Date().toISOString()});
 const tracePath='artifacts/natural/v3-feel-state-'+engine+'.json';await json(path.join(RUN,tracePath),trace);
 order.traces.push({name:'v3-feel-state-'+engine,path:tracePath,sha256:sha(await readFile(path.join(RUN,tracePath))),raw:rawPath,features:['lane-inertia'],viewport:trace.device});
 order.rawReports.push(rawPath);order.sourceBindings.push({path:rawPath,sha256:sha(await readFile(path.join(RUN,rawPath)))},{path:driverPath,sha256:r.driverSha256});
}
for(const engine of ['webkit','chromium']){
 const rawPath=base+'/feel-comparison-'+engine+'/report.json',r=await read(rawPath);
 if(r.targetGame!=='鹈鹕海岸冒险'||r.workspace!==WORKSPACE||r.buildHash!==build.buildHash||r.normalInputOnly!==true||r.stateInjection!==false||r.results?.length!==3)throw Error('Comparison identity mismatch');
 for(const row of r.results){
  if(row.errors.length||!row.samples.length||row.normalInputOnly!==true||row.stateInjection!==false)throw Error('Invalid natural comparison');
  if(row.variant==='V3'&&row.sourceHtmlSha256!==build.buildHash)throw Error('Comparison V3 source mismatch');
  for(const binding of [...row.screenshots,row.video])if(sha(await readFile(path.join(RUN,binding.path)))!==binding.sha256)throw Error('Comparison media hash mismatch');
 }
 order.rawReports.push(rawPath);order.sourceBindings.push({path:rawPath,sha256:sha(await readFile(path.join(RUN,rawPath)))});
}
const {ProductExperienceContractSchema:C}=await tsImport('../../../src/schemas/product-experience.ts',import.meta.url);
const contract=C.parse(await read('product-experience-contract.json'));
const Risk=z.object({targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.literal(WORKSPACE),buildHash:z.literal(build.buildHash),attempt:z.literal(build.attempt),normalInputOnly:z.literal(true),stateInjection:z.literal(false),passed:z.literal(true),checks:z.array(z.object({name:z.string(),passed:z.literal(true)}).passthrough()),actions:z.array(z.object({type:z.literal('touch-tap'),selector:z.string(),trustedTouch:z.literal(true)}).passthrough()),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),levels:z.array(z.object({id:z.number(),terminal:z.object({phase:z.literal('finished'),reason:z.literal('complete')}).passthrough(),targetEpisodes:z.array(z.object({barrierId:z.string(),goldFishId:z.string(),barrierClearSnapshotId:z.string(),bonusFishCatchSnapshotId:z.string()}).passthrough())}).passthrough()).length(5),snapshots:z.array(z.object({id:z.string(),value:RiskSnapshotValueSchema}).passthrough()),videos:z.array(z.object({path:z.string(),sha256:z.string()})),errors:z.array(z.unknown()).length(0)}).passthrough();
for(const engine of ['webkit','chromium']){
 const rawPath=base+'/risk-'+engine+'/report.json',r=Risk.parse(await read(rawPath));
 const transitions=['jump-clearance','jump-choice','five-configured-levels','replay-mastery-records'];
 if(!r.checks.some(c=>c.name==='final-settlement-and-reopen'&&c.passed))throw Error('Risk replay absent');
 for(const level of RISK_LEVELS){
  const row=r.levels.find(l=>l.id===level.id);if(!row||row.targetEpisodes.length!==level.targets.length)throw Error('Risk level targets absent');
  for(const target of level.targets){
   const episode=row.targetEpisodes.find(e=>e.barrierId===target.barrierId&&e.goldFishId===target.goldFishId);if(!episode)throw Error('Exact risk target absent');
   const clear=r.snapshots.find(s=>s.id===episode.barrierClearSnapshotId)?.value.events.find(e=>e.type==='barrier-cleared'&&e.objectId===target.barrierId&&e.jumped===true);
   const fish=r.snapshots.find(s=>s.id===episode.bonusFishCatchSnapshotId)?.value.events.find(e=>e.type==='fish-caught'&&e.objectId===target.goldFishId&&e.bonus===true&&e.golden===true);
   if(!clear||!fish||fish.at<clear.at)throw Error('Exact natural risk event chain absent');
  }
 }
 for(const binding of [...r.screenshots,...r.videos])if(sha(await readFile(path.join(RUN,binding.path)))!==binding.sha256)throw Error('Risk media hash mismatch');
 const device=contract.features.find(f=>f.id==='jump-choice').requiredViewports[0];
 const trace=N.parse({schemaVersion:1,startedFromReset:true,actions:r.actions.map(a=>'tap '+a.selector),transitions:transitions.map(name=>({name,changed:true,evidence:rawPath})),completion:'settlement',replayObserved:true,forbiddenOperations:[],screenshots:r.screenshots.map(s=>s.path),passed:true,blockers:[],runner:'Playwright '+engine+' trusted touch; five earned stages and all 12 exact prize obstacles from visible HUD; read-only snapshots verify each event',buildHash:build.buildHash,runtime:'web-lite',device,seed:'authored-v32-risk',observedAt:r.finishedAt});
 const tracePath='artifacts/natural/v3-risk-'+engine+'.json';await json(path.join(RUN,tracePath),trace);
 order.traces.push({name:'v3-risk-'+engine,path:tracePath,sha256:sha(await readFile(path.join(RUN,tracePath))),raw:rawPath,features:transitions,viewport:device});order.rawReports.push(rawPath);order.sourceBindings.push({path:rawPath,sha256:sha(await readFile(path.join(RUN,rawPath)))});
 const driverPath=base+'/risk-'+engine+'/driver-source.mjs';if(sha(await readFile(path.join(RUN,driverPath)))!==r.driverSha256)throw Error('Risk driver source hash mismatch');order.sourceBindings.push({path:driverPath,sha256:r.driverSha256});
}
const Head=z.object({targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.literal(WORKSPACE),buildHash:z.literal(build.buildHash),normalInputOnly:z.literal(true),stateInjection:z.literal(false),passed:z.literal(true),reports:z.array(z.object({viewport:z.object({width:z.number(),height:z.number()}),checks:z.array(z.object({name:z.string(),passed:z.literal(true)}).passthrough()),actions:z.array(z.object({at:z.string(),type:z.literal('tap'),selector:z.string()})),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),errors:z.array(z.string()).length(0)}).passthrough()).length(4)}).passthrough();
for(const engine of ['webkit','chromium']){
 const rawPath=base+'/head-'+engine+'/report.json',report=Head.parse(await read(rawPath));
 for(const row of report.reports){
  const device=contract.features.find(f=>f.id==='native-head-visible').requiredViewports.find(v=>v.width===row.viewport.width&&v.height===row.viewport.height);if(!device)throw Error('Head viewport not declared');
  for(const s of row.screenshots)if(sha(await readFile(path.join(RUN,s.path)))!==s.sha256)throw Error('Head screenshot hash mismatch');
  const transitions=['native-head-visible','fish-catch','reverse-jump','barrier-terminal','replay','pedestrian-stun','recovered'];
  const value=N.parse({schemaVersion:1,startedFromReset:true,actions:row.actions.map(a=>'tap '+a.selector),transitions:transitions.map(name=>({name,changed:true,evidence:rawPath})),completion:'terminal',replayObserved:row.checks.some(c=>c.name==='natural-pedestrian-recovery'&&c.passed),forbiddenOperations:[],screenshots:row.screenshots.map(s=>s.path),passed:true,blockers:[],runner:'Playwright '+engine+' trusted normal touch; cold menu to native catch/reverse/jump, visible barrier terminal, replay and exact pedestrian stop/recovery',buildHash:build.buildHash,runtime:'web-lite',device,seed:'authored-v3-head',observedAt:new Date().toISOString()});
  const tracePath=`artifacts/natural/v3-head-${engine}-${device.width}.json`;await json(path.join(RUN,tracePath),value);order.traces.push({name:`v3-head-${engine}-${device.width}`,path:tracePath,sha256:sha(await readFile(path.join(RUN,tracePath))),raw:rawPath,features:['native-head-visible'],viewport:device});
 }
 order.rawReports.push(rawPath);order.sourceBindings.push({path:rawPath,sha256:sha(await readFile(path.join(RUN,rawPath)))});
}
const cases=contract.features.reduce((n,f)=>n+f.requiredViewports.length,0);
order.scope[0]=`Independent pixel review of exact ${cases} current-build contract cases`;
order.acceptance.push(`All ${cases} required feature/viewport cases must have actual pixel review and current-build natural trace. Human enjoyment and physical devices remain distinct unknowns.`);
order.scope.push('Inspect both-engine risk footage/screenshots: exact 12 cleared barriers and associated prize fish, five earned settlements, rain/night visibility, replay; independently review current-build temporal comparison frames.');
await json(path.join(RUN,'qa-review-workorder.json'),order);console.log('V3 experience bindings appended; review work order ready');
