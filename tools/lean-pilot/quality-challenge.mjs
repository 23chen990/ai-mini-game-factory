/* global process, console */
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildClinic} from './build-workflow.mjs';
import {buildHash} from './runner.mjs';
import {prepareCandidate,readDelivery} from './quality-cycle.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
/** Known, labelled regression injections; not unknown-defect recall or a human study. */
export async function runRepairChallenge(base,id){
 if(!/^ci-[a-z0-9-]+$/.test(id))throw Error('Fault experiment requires an explicit ci- test-run identifier');
 const created=await buildClinic(base,id),game=created.workspace,goodHash=await buildHash(game);
 const engine=await readFile(path.join(game,'engine.mjs'),'utf8'),css=await readFile(path.join(game,'style.css'),'utf8');assert.ok(engine.includes('upgradedCareMs:5000'));assert.ok(css.includes('--tap-size:44px'));
 await writeFile(path.join(game,'engine.mjs'),engine.replace('upgradedCareMs:5000','upgradedCareMs:8500'));await writeFile(path.join(game,'style.css'),css.replace('--tap-size:44px','--tap-size:28px'));const faultyHash=await buildHash(game);
 const r=await prepareCandidate(base,id);assert.equal(r.status,'INTERNAL_CHECKS_PASSED',JSON.stringify(r));assert.equal(r.attempts,2);assert.equal(r.modelCalls,0);
 const repairs=r.history.filter(h=>h.kind==='repair');assert.equal(repairs.length,2);assert.equal(repairs[0].beforeHash,faultyHash);assert.equal(await buildHash(game),goodHash);assert.ok(r.history.some(h=>h.findings?.includes('upgrade-has-measured-effect')));assert.ok(r.history.some(h=>h.findings?.includes('touch-targets')));assert.equal((await readDelivery(base,id)).previewReady,true);
 const report={schemaVersion:1,kind:'CONTROLLED_FAULT_INJECTION_NOT_REAL_USER',runId:id,passed:true,faultyHash,repairedHash:goodHash,detected:['upgrade-has-measured-effect','touch-targets'],repairRounds:2,actions:repairs,actualModelCalls:0,human:'NOT_RUN',generalAutonomy:'NOT_PROVEN',scope:'Cheap actual engine and visible UI checks find two declared regressions before the final default-speed 180-second HTTP journey. Frozen tests were not edited.'};
 await mkdir(path.join(base,id,'quality'),{recursive:true});await writeFile(path.join(base,id,'quality/challenge.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)runRepairChallenge(path.join(ROOT,'runs'),process.argv[2]??'ci-quality-challenge').then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
