/* global process, console */
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadRun} from './runner.mjs';
import {probeClinic} from './quality-probe.mjs';
/** Same actual engine and demand. Combined investment/dispatch is not a pure single-factor effect. */
export async function comparePolicies(game){const e=await probeClinic(game),p=e.profiles.find(x=>x.seed===2026)??e.profiles[0];return{schemaVersion:1,scope:'ACTUAL_CANDIDATE_ENGINE_SIMULATION',human:'NOT_RUN',seed:p.seed,results:[p.none,p.intake,p.adaptive],singleActionSweep:e.active,allProfiles:e.profiles,note:'All pre-registered one-action timings are included, not only successful policies. Numerical simulation does not establish enjoyment.'};}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');loadRun(path.join(root,'runs'),process.argv[2]).then(({game})=>comparePolicies(game)).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
