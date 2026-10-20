import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ExperienceComplaintTriageSchema, ExperienceReproductionMatrixSchema } from '../../../src/schemas/experience-complaint.ts';

const dir='docs/lean-pilot/racing-product-20261020';
const workspace=path.resolve('runs/h5-qq-mobile-20261013/workspace');
await mkdir(dir,{recursive:true});
const evidence=await Promise.all(['screenshot-driving.png','screenshot-settlement.png','screenshot-garage.png'].map(async name=>{
  const file='docs/lean-pilot/racing-internal-20261020/materials/'+name;
  return {path:file,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),kind:'runtime-capture' as const,provenance:'verified-run-artifact' as const};
}));
const observed=[
  'RC19 phone racing capture: vehicle silhouette is small relative to the bright exhaust; live phone FOV reaches 88 degrees. Desktop uses a separate native camera and must not inherit a phone zoom.',
  'RC19 touch nitro/item buttons repeat their names below the button in 9px labels; current item identity is not the main button icon.',
  'RC19 result shows QA export, fuel rule text, four metric columns and a scrolling leaderboard before the player actions.',
  'Six locked cars can already be previewed; all share native physics. Reward presentation must not imply a paid speed advantage or cross-device ownership.',
  'Desktop input.frame maps both Space and Ctrl to the same nitroPressed flag; the item-race world consumes that flag as item use. Earned nitro has a separate touch-only edge. Split Space nitro / Ctrl item before native edge clearing; retain keyboard acceleration and steering.',
];
const triage=ExperienceComplaintTriageSchema.parse({
  schemaVersion:1,artifactType:'experience-complaint-triage',targetGame:'极速飞驰 / qq-speed',workspace,
  report:'User authorizes visible product polish; phone and desktop need independent camera composition, not a shared zoom. Deliver a playable change rather than test volume.',
  classification:['visual-hierarchy','mobile-readability','core-experience'],
  scope:{route:'formal-fixer',rationale:'Default camera/HUD/results span modules and existing formal player acceptance; preserve the stored repair history and natural retest.',generatedWorkspaceModified:false,contextIntentionallyOmitted:['Other games','Platform credentials','AI pace retuning without reproduced defect','New progression or monetization systems']},
  reproduction:{status:'REPRODUCED',steps:['Review the three exact RC19 captures and their run-bound provenance.','Inspect active native camera patch and live HUD/result entrypoints, not the unused legacy camera preset.'],observed,evidence},
  acceptanceCriteria:[
    'Phone camera improves vehicle readability at 844x390 and 667x375; desktop native camera coefficients remain byte-identical. No simulation, AI, course, rank, fuel or ad grant changes.',
    'Live action identity, resource count and ready state are inside fixed buttons; no duplicate sublabels, no new advice banners, no automatic action consumption.',
    'Desktop item races: Space consumes earned nitro only, Ctrl consumes item only; keyboard help matches the actual native keys.',
    'Normal home/result has no QA export; result primary action is next for podium or replay for loss, details remain accessible and current-run stars never impersonate historical medals.',
    'Use normal UI preview/start/driving/settlement/replay and visible before/after captures on both platforms. Keep any failed runs, no injected wins.',
  ],status:'READY_FOR_REPAIR',createdAt:new Date().toISOString(),
});
await writeFile(dir+'/triage.json',JSON.stringify(triage,null,2)+'\n');
const viewports=[{label:'desktop',width:1366,height:768},{label:'phone',width:844,height:390},{label:'small-phone',width:667,height:375}];
const matrix=ExperienceReproductionMatrixSchema.parse({
  schemaVersion:1,artifactType:'experience-reproduction-matrix',targetGame:triage.targetGame,workspace,
  axes:{objectTypes:['starter-camera','action-buttons','result','garage'],lifecycleStateBranches:['race','finished','ready'],rendererPaths:['native Three.js + DOM'],viewports},
  cells:viewports.flatMap(viewport=>[['starter-camera','race'],['action-buttons','race'],['result','finished'],['garage','ready']].map(([objectType,lifecycleStateBranch])=>({
    id:objectType+'-'+viewport.label,objectType,lifecycleStateBranch,rendererPath:'native Three.js + DOM',viewport,
    status:viewport.label==='phone'?'REPRODUCED':'BLOCKED',
    expected:triage.acceptanceCriteria[objectType==='starter-camera'?0:objectType==='action-buttons'?1:2],
    observed:viewport.label==='phone'?'Exact RC19 capture and corresponding active branch inspected.':'Independent viewport capture required; phone evidence cannot close this cell.',
    evidence:viewport.label==='phone'?evidence:[],
  }))),
  confirmedFindings:observed,remainingGaps:['Final-build visible dual-platform retest','Physical phones and human ad preference remain unverified'],createdAt:new Date().toISOString(),
});
await writeFile(dir+'/reproduction-matrix.json',JSON.stringify(matrix,null,2)+'\n');
