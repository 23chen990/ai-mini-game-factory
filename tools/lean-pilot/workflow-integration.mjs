/* global process, console */
// Run after the repository's LOCKED existing dependencies are installed. No models or REA.
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const isolated=await mkdtemp(path.join(tmpdir(),'factory-workflow-cli-'));
try {
  const cases=[['hospital','STRATEGIC_SYSTEM'],['action','ACTION_FEEL'],['story','NARRATIVE_AGENCY'],['puzzle','PUZZLE_CLARITY']];
  for(const [name,profile] of cases){
    const r=spawnSync(process.execPath,['--import','tsx','src/cli/factory.ts','workflow','plan','examples/lean-pilot/workflow',`${name}.json`],
      {encoding:'utf8',timeout:30000,env:{PATH:process.env.PATH??'',FACTORY_ROOT:isolated,LANG:'C.UTF-8'}});
    assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
    assert.equal(out.profiles[0].id,profile);assert.equal(out.status,'WORK_ORDER_READY');assert.equal(out.executionAllowed,false);assert.equal(out.releaseAllowed,false);
    assert.deepEqual(await readdir(isolated),[],'workflow must not initialize the legacy factory or a game run');
    console.log(`PASS real factory CLI: ${name} -> ${profile}`);
  }
  console.log('4/4 CLI entrypoint cases passed; no game, model, provider or paid research executed.');
}finally{await rm(isolated,{recursive:true,force:true});}
