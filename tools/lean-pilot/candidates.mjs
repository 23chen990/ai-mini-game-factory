// Only concrete, reviewed local candidates. A profile label is NOT an executable template.
const gridChecks=['layout-observatory-390x844','layout-observatory-320x568','layout-observatory-844x390','layout-orchard-390x844','touch-swipe-move-and-merge','reload-restores-exact-state','touch-cancel-is-not-a-move','normal-loss-settlement-and-replay','theme-save-isolation','win-and-continue','storage-denial-preserves-play'];
const clinicChecks=['clinic-layout-844x390','clinic-layout-390x844','clinic-layout-320x568','clinic-dispatch-visible','clinic-investment-cash','clinic-pause-freezes','clinic-save-resume','clinic-natural-settlement-replay','clinic-storage-denial'];
const candidates={
  'grid-merge-v1':{id:'grid-merge-v1',profile:'PUZZLE_CLARITY',themes:['observatory','orchard'],evidenceRoot:'examples/lean-pilot',sourceFiles:['research.json','reference/LICENSE.txt','reference/move-excerpt.txt'],browserScript:'tools/lean-pilot/browser-qa.mjs',checks:gridChecks,screenshots:['screenshots/observatory-390x844.png','screenshots/observatory-320x568.png','screenshots/observatory-844x390.png','screenshots/orchard-390x844.png','screenshots/normal-terminal.png']},
  'clinic-queue-v1':{id:'clinic-queue-v1',profile:'STRATEGIC_SYSTEM',themes:['clinic'],evidenceRoot:'examples/lean-pilot/clinic',sourceFiles:['research.json','reference/LICENSE.txt','reference/queue-excerpt.txt','reference/gp-excerpt.txt'],browserScript:'tools/lean-pilot/clinic-browser-qa.mjs',checks:clinicChecks,screenshots:['screenshots/clinic-844x390.png','screenshots/clinic-390x844.png','screenshots/clinic-320x568.png','screenshots/clinic-settlement.png']},
};
export function candidateSpec(id='grid-merge-v1'){
  if(!Object.hasOwn(candidates,id))throw new Error('Candidate not implemented: '+id);
  const c=candidates[id];return {...c,themes:[...c.themes],sourceFiles:[...c.sourceFiles],checks:[...c.checks],screenshots:[...c.screenshots],status:'CANDIDATE',publishable:false};
}
export function listCandidates(){return Object.keys(candidates).map(candidateSpec);}
