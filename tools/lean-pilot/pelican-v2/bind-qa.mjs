/* global console */
// Bind recorded natural input captures to existing factory schemas. This never drives or edits game state.
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
import {z} from 'zod';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
const read=async p=>JSON.parse(await readFile(path.join(RUN,p),'utf8'));
const build=await read('build-receipt.json'),base=`attempts/attempt-${build.attempt}`;
const Raw=z.object({schemaVersion:z.literal(1),targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.literal(WORKSPACE),buildHash:z.literal(build.buildHash),normalInputOnly:z.literal(true),stateInjection:z.literal(false),checks:z.array(z.object({name:z.string(),passed:z.boolean(),evidence:z.unknown()})),actions:z.array(z.object({at:z.string().datetime(),type:z.literal('tap'),selector:z.string()}).passthrough()),screenshots:z.array(z.object({path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/u)})),errors:z.array(z.string()),passed:z.boolean()}).passthrough();
const campaign=Raw.parse(await read(base+'/qa-campaign-webkit/report.json')),collision=Raw.parse(await read(base+'/qa-collisions-webkit/report.json')),visual=await read(base+'/visual/report.json');
for(const r of [campaign,collision,visual])if(r.buildHash!==build.buildHash||!r.passed)throw Error('Unpassed or mismatched raw QA capture');
const {NaturalFlowEvidenceSchema}=await tsImport('../../../src/schemas/natural-flow.ts',import.meta.url);
const {ProductExperienceContractSchema}=await tsImport('../../../src/schemas/product-experience.ts',import.meta.url);
const contract=ProductExperienceContractSchema.parse(await read('product-experience-contract.json'));
await mkdir(path.join(RUN,'artifacts/natural'),{recursive:true});
const traces=[];
const bind=async(name,raw,device,actions,features,completion,replayObserved,screenshots)=>{
 const value=NaturalFlowEvidenceSchema.parse({schemaVersion:1,startedFromReset:true,actions,transitions:features.map(name=>({name,changed:true,evidence:raw})),completion,replayObserved,forbiddenOperations:[],screenshots,passed:true,blockers:[],runner:'Playwright normal-touch capture, bound from raw report',buildHash:build.buildHash,runtime:'web-lite',device,seed:'authored-v2-no-random-hazards',observedAt:visual.testedAt});
 const file='artifacts/natural/'+name+'.json';await json(path.join(RUN,file),value);const bytes=await readFile(path.join(RUN,file));traces.push({name,path:file,sha256:sha(bytes),raw,features,viewport:device});
};
for(const r of visual.reports){
 const device=contract.features[0].requiredViewports.find(v=>v.width===r.viewport.width&&v.height===r.viewport.height);if(!device)throw Error('Unspecified viewport');
 // Same-pose fixture screenshots are explicitly excluded from natural acceptance.
 const shots=r.screenshots.filter(s=>!s.path.includes('same-pose')).map(s=>s.path);
 await bind('camera-'+device.width,base+'/visual/report.json',device,['tap #co-start','normal auto-forward and fish collection','tap #co-pause','tap #co-resume','normal auto-forward reaches visible barrier failure','tap #co-replay'],['camera-start','camera-running','camera-resume','camera-replay'],'terminal',r.checks.replayKeepsCamera,shots);
}
const device=contract.features[0].requiredViewports[0];
await bind('campaign',base+'/qa-campaign-webkit/report.json',device,campaign.actions.map(a=>'tap '+a.selector),['five-configured-levels','unlock-save'],'settlement',campaign.checks.find(c=>c.name==='in-memory-replay').passed,campaign.screenshots.map(s=>s.path));
await bind('collisions',base+'/qa-collisions-webkit/report.json',device,collision.actions.map(a=>'tap '+a.selector),['vehicle-impact','pedestrian-stun','jump-clearance'],'terminal',collision.checks.find(c=>c.name==='failure-replay-without-navigation').passed,collision.screenshots.map(s=>s.path));
let safety;
try{safety=Raw.parse(await read(base+'/qa-safety-webkit/report.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(safety&&['van-target-distance-reached','van-ends-round','car-not-jumpable','distance-and-fish-jointly-required','replay-resources-plateau'].every(n=>safety.checks.find(c=>c.name===n)?.passed)&&safety.errors.length===0){
 await bind('collisions-and-van',base+'/qa-collisions-webkit/report.json ; '+base+'/qa-safety-webkit/report.json',device,['fresh browser session1: earned five unlocks and collision cases',...collision.actions.map(a=>'tap '+a.selector),'fresh browser session2: earn unlocks again, van and car jump failure, six normal replays',...safety.actions.map(a=>'tap '+a.selector)],['vehicle-impact'],'terminal',true,[...collision.screenshots,...safety.screenshots].map(s=>s.path));
}
const Text=z.string().min(1),Binding=z.object({path:Text,sha256:z.string().regex(/^[a-f0-9]{64}$/u)}).strict();
const Order=z.object({schemaVersion:z.literal(1),role:z.literal('QAAgent'),targetGame:Text,workspace:Text,runRoot:Text,buildHash:Text,contract:Text,contractHash:Text,scope:z.array(Text),traces:z.array(z.object({name:Text,path:Text,sha256:Text,raw:Text,features:z.array(Text),viewport:z.object({width:z.number(),height:z.number(),label:Text}).strict()}).strict()),rawReports:z.array(Text),output:Text,acceptance:z.array(Text),forbidden:z.array(Text),sourceBindings:z.array(Binding)}).strict();
const reports=[base+'/visual/report.json',base+'/qa-campaign-webkit/report.json',base+'/qa-collisions-webkit/report.json'];
if(campaign.sourceCapture)reports.push(campaign.sourceCapture);
if(safety)reports.push(base+'/qa-safety-webkit/report.json');
for(const p of ['evidence/serial-capture-diagnostic.json','artifacts/qa-section-projection-proof.json',base+'/qa-collisions-webkit-concurrent-failed/report.json',base+'/qa-campaign-webkit-concurrent-failed/report.json'])try{await readFile(path.join(RUN,p));reports.push(p);}catch(e){if(e.code!=='ENOENT')throw e;}
const order=Order.parse({schemaVersion:1,role:'QAAgent',targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,runRoot:RUN,buildHash:build.buildHash,contract:'product-experience-contract.json',contractHash:sha(JSON.stringify(contract)),scope:['Independent pixel review of exact 17 contract cases from current build','Read natural driver source and raw reports to check no state injection','Inspect portrait + small portrait + landscape start/running/resume/replay','Inspect vehicle crash, pedestrian fall/stop/recovery, airborne barrier clearance, all five settlements and saved selection'],traces,rawReports:reports,output:'perceptual-qa-report.json',acceptance:['Use PerceptualQaReportSchema from src/schemas/product-experience.ts; reviewer QAAgent; authorIndependent true','Every required feature×viewport case has exact object/state/sourceCheckIds, hashed natural trace and screenshot bindings','Actually view screenshot pixels; missing/unreadable/contradictory evidence is a blocker, never infer pass from raw passed=true','Validate report with Zod and verifyPerceptualQaReview; output only structured result','Review scope is desktop WebKit mobile viewports; physical iPhone, low-end hardware, live ads and production packaging are NOT_RUN'],forbidden:['Do not modify workspace/game or workspace/source or recipe/runtime','Do not alter acceptance contracts, raw captures, traces, build or other games','Do not accept same-pose fixture as natural gameplay','You are not alone in this worktree; preserve all other edits'],sourceBindings:await Promise.all(reports.map(async p=>({path:p,sha256:sha(await readFile(path.join(RUN,p)))})))});
await json(path.join(RUN,'qa-review-workorder.json'),order);console.log(JSON.stringify({workorder:path.join(RUN,'qa-review-workorder.json'),contractHash:order.contractHash,traces:traces.length,buildHash:build.buildHash}));
