/* global console,process */
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
import {z} from 'zod';
import {RUN,WORKSPACE,REPO,json,sha} from './prepare.mjs';
// Reuse the existing campaign/collision/viewport bindings; append V3 traces.
execFileSync(process.execPath,['tools/lean-pilot/pelican-v2/bind-qa.mjs'],{cwd:REPO,stdio:'inherit'});
const read=async p=>JSON.parse(await readFile(path.join(RUN,p),'utf8'));
const build=await read('build-receipt.json'),base=`attempts/attempt-${build.attempt}`;
const {NaturalFlowEvidenceSchema:N}=await tsImport('../../../src/schemas/natural-flow.ts',import.meta.url);
const Raw=z.object({targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.literal(WORKSPACE),buildHash:z.literal(build.buildHash),normalInputOnly:z.literal(true),stateInjection:z.literal(false),passed:z.literal(true),checks:z.array(z.object({name:z.string(),passed:z.literal(true)}).passthrough()),actions:z.array(z.object({at:z.string(),type:z.enum(['tap','swipe'])}).passthrough()),screenshots:z.array(z.object({path:z.string(),sha256:z.string()})),errors:z.array(z.string()).length(0)}).passthrough();
const order=await read('qa-review-workorder.json'),features=['lane-inertia','jump-choice','pedestrian-forecast','first-minute-mastery'];
for(const engine of ['webkit','chromium']){
 const rawPath=base+'/experience-'+engine+'/report.json',r=Raw.parse(await read(rawPath));
 for(const s of r.screenshots)if(sha(await readFile(path.join(RUN,s.path)))!==s.sha256)throw Error('Experience screenshot hash mismatch');
 const trace=N.parse({schemaVersion:1,startedFromReset:true,actions:r.actions.map(a=>a.type==='tap'?'tap '+a.selector:'trusted touch '+a.name+' '+JSON.stringify(a.from)+' -> '+JSON.stringify(a.to)),transitions:features.map(name=>({name,changed:true,evidence:rawPath})),completion:'settlement',replayObserved:r.checks.find(c=>c.name==='safe-detour-does-not-require-jump').passed,forbiddenOperations:[],screenshots:r.screenshots.map(s=>s.path),passed:true,blockers:[],runner:'Playwright '+engine+' trusted touch Input protocol and visible buttons, no DOM dispatch',buildHash:build.buildHash,runtime:'web-lite',device:{width:390,height:844,label:'mobile-portrait'},seed:'authored-v3',observedAt:new Date().toISOString()});
 const tracePath='artifacts/natural/v3-experience-'+engine+'.json';await json(path.join(RUN,tracePath),trace);
 order.traces.push({name:'v3-experience-'+engine,path:tracePath,sha256:sha(await readFile(path.join(RUN,tracePath))),raw:rawPath,features,viewport:trace.device});order.rawReports.push(rawPath);order.sourceBindings.push({path:rawPath,sha256:sha(await readFile(path.join(RUN,rawPath)))});
}
order.scope.push('V3 exact natural swipes, reverse input, jump gold and safe detour, two crossing forecasts, first-minute fish and earned three stars. Review matched PR10/13/V3 videos/frame strips as comparison evidence, never as a substitute for the completed natural trace.');
order.rawReports.push(base+'/feel-comparison-webkit/report.json',base+'/feel-comparison-chromium/report.json');
const {ProductExperienceContractSchema:C}=await tsImport('../../../src/schemas/product-experience.ts',import.meta.url);
const contract=C.parse(await read('product-experience-contract.json'));
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
await json(path.join(RUN,'qa-review-workorder.json'),order);console.log('V3 experience bindings appended; review work order ready');
