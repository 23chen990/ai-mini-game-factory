/* global process, Buffer, console */
// Explicit engineering-only comparison; never installed in a candidate build.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd(),out=root+'/runs/h5-qq-mobile-20261013/artifacts/internal-experience-20261020';
let audit=await readFile('tools/lean-pilot/racing-ai-pace-audit.mjs','utf8');
audit=audit.slice(0,audit.indexOf('if (process.argv[1] &&')).replace(/from '(\.\.?\/[^']+)'/g,(_,ref)=>`from '${pathToFileURL(path.resolve('tools/lean-pilot',ref)).href}'`);
const api=await import('data:text/javascript;base64,'+Buffer.from(audit+'\nexport {loadNative,stageFixture};').toString('base64'));
const native=await api.loadNative(root),{PlayerCar,TUNE}=await import(pathToFileURL(native.src+'/vehicle.js'));
const {STAGES}=await import('../../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs');
const {applyRivalTactics}=await import('../../../templates/web-lite/h5-source-mobile-v1/racing/rival-pressure.mjs');
const source=execFileSync('git',['show','7b9791100346916aaea0ba6b01d828879bb9a222:templates/web-lite/h5-source-mobile-v1/racing/v11-physical-ai.mjs'],{encoding:'utf8'});
assert.equal(source.split('half - 3) * .70').length,2,'Pinned attempt18 main-road planning anchor');
const stages=process.env.RACE_EXPERIMENT_STAGES?.split(',')??['01','02','08','16','24','30'];
for(const scale of process.env.RACE_EXPERIMENT_SCALES?.split(',').map(Number)??[.70,.90,1]) {
 const code=source.replace('half - 3) * .70','half - 3) * '+scale);
 const controller=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 native.AICar=controller.createV11PhysicalAiClass(PlayerCar,TUNE);
 for(const tactics of [false,true]) {
  const results=[];
  for(const stage of STAGES.filter(s=>stages.includes(s.id))) {
   const fixture=api.stageFixture(native,stage);
   if(tactics){fixture.world.player={progress:-1000};const collide=fixture.world.collide;fixture.world.collide=function(){collide.call(this);applyRivalTactics(this,stage)};}
   const result=api.simulateNativeRace(fixture);results.push(result);
   console.log(JSON.stringify({scale,tactics,stage:stage.id,status:result.status,times:result.racers.map(r=>r.finishTimeSec),contacts:result.racers.reduce((n,r)=>n+r.trafficContactFrames,0),wall:result.racers.reduce((n,r)=>n+r.wallCrashEvents,0)}));
  }
  await writeFile(out+`/lane-experiment-${scale}-${tactics}${process.env.RACE_EXPERIMENT_LABEL??''}.json`,JSON.stringify({classification:'ENGINEERING_ONLY_NOT_A_BUILD_OR_NATURAL_PLAY',baselineBuild:native.build.buildHash,scale,tactics,omitted:'Rendered player; tactics subcase has an absent-player progress reference at -1000, no player physical car or input',sourceSha256:createHash('sha256').update(source).digest('hex'),experimentSha256:createHash('sha256').update(code).digest('hex'),results},null,2)+'\n');
 }
}
