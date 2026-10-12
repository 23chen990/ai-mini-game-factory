/* global process, console, URL */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildClinic } from './build-workflow.mjs';
import { buildHash } from './runner.mjs';
import { prepareCandidate, readDelivery } from './quality-cycle.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));

/** A labelled fault-injection experiment, not a blind model test or a real user's session.
 * The normal reviewer is not told mutation labels. The catalogue knows how to repair only
 * its declared exact regressions; it is not a claim of autonomous general game design.
 */
export async function runRepairChallenge(base,id){
  if(!/^ci-[a-z0-9-]+$/.test(id))throw new Error('Fault experiment requires an explicit ci- test-run identifier');
  const created=await buildClinic(base,id),game=path.resolve(created.workspace);
  const goodHash=await buildHash(game);
  const engine=await readFile(path.join(game,'engine.mjs'),'utf8'),css=await readFile(path.join(game,'style.css'),'utf8');
  assert.ok(engine.includes('upgradedCareMs:5000'));assert.ok(css.includes('--tap-size:44px'));
  await writeFile(path.join(game,'engine.mjs'),engine.replace('upgradedCareMs:5000','upgradedCareMs:8500'));
  await writeFile(path.join(game,'style.css'),css.replace('--tap-size:44px','--tap-size:28px'));
  const faultyHash=await buildHash(game);
  const result=await prepareCandidate(base,id);
  assert.equal(result.status,'INTERNAL_CHECKS_PASSED',JSON.stringify(result));
  assert.equal(result.attempts,2,'Two observed, separate repair rounds required');
  assert.equal(result.modelCalls,0);
  const repairs=result.history.filter(h=>h.kind==='repair');
  assert.equal(repairs.length,2);assert.equal(repairs[0].beforeHash,faultyHash);
  assert.equal(await buildHash(game),goodHash,'Repair must restore tested bytes, not weaken tests');
  assert.ok(result.history.some(h=>h.findings?.includes('upgrade-has-measured-effect')));
  assert.ok(result.history.some(h=>h.findings?.includes('touch-targets')));
  const delivery=await readDelivery(base,id);assert.equal(delivery.previewReady,true);
  const report={schemaVersion:1,kind:'CONTROLLED_FAULT_INJECTION_NOT_REAL_USER',runId:id,passed:true,
    faultyHash,repairedHash:goodHash,detected:['upgrade-has-measured-effect','touch-targets'],repairRounds:2,
    actions:repairs,actualModelCalls:0,human:'NOT_RUN',generalAutonomy:'NOT_PROVEN',
    scope:'Two injected regressions reached the normal runner, were detected, patched and rechecked through real HTTP/browser gates. Not a measurement of unknown-defect recall or player enjoyment.'};
  await mkdir(path.join(base,id,'quality'),{recursive:true});
  await writeFile(path.join(base,id,'quality/challenge.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  runRepairChallenge(path.join(ROOT,'runs'),process.argv[2]??'ci-quality-challenge').then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
