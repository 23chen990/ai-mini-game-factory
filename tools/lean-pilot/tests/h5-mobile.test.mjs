/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateSpec} from '../candidates.mjs';
import {mkdtemp,rm,readFile,writeFile,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRun,loadRun,buildHash,verifyRunInputs,serveRun} from '../runner.mjs';
import {standaloneHtml} from '../standalone.mjs';
import {evaluateScope} from '../scope-check.mjs';
import {auditResearchToBuild} from '../research-to-build.mjs';
import {fileURLToPath,URL} from 'node:url';
async function setup(t) {
 const base=await mkdtemp(path.join(tmpdir(),'owned-h5-fixture-'));t.after(()=>rm(base,{recursive:true,force:true}));
 await createRun(base,'test-mobile','pelican-bike',{templateId:'h5-source-mobile-v1',workflow:{'request.json':{fixture:true},'contract.json':{fixture:true}}});
 return {base,...await loadRun(base,'test-mobile')};
}
test('private source-mobile recipe reuses the factory and keeps three targets explicit',()=>{
 let spec;assert.doesNotThrow(()=>{spec=candidateSpec('h5-source-mobile-v1');});
 assert.deepEqual(spec.themes,['qq-speed','cf-transport-ship','pelican-bike']);
 assert.equal(spec.publishable,false);assert.equal(spec.perThemeEvidence,true);
 assert.deepEqual(spec.runtimeFiles,['platform.json','LICENSE.three.txt','fps-mobile-ux.mjs','cf-player-loop.mjs']);
});
test('all three studies feed PR7 source and runtime evidence without promoting release or semantic truth',async()=>{
 for(const game of candidateSpec('h5-source-mobile-v1').themes){
  const root=fileURLToPath(new URL('../../../examples/lean-pilot/three-h5/'+game+'/',import.meta.url));
  const gate=await auditResearchToBuild(root,'research-to-build.json');
  assert.equal(gate.candidateBuildAllowed,true,gate.blockers.join(','));assert.equal(gate.verifiedEvidenceFiles,2);
  assert.equal(gate.releaseAllowed,false);assert.equal(gate.referenceRuntimeObserved,false);assert.equal(gate.reaExecutedVerified,false);
 }
});
test('platform/attribution bytes affect build identity and extra ad acceptance stays frozen',async t=>{
 const{root,game,run}=await setup(t),before=await buildHash(game);
 await appendFile(path.join(game,'platform.json'),'\n');assert.notEqual(await buildHash(game),before);
 await verifyRunInputs(root,run);await appendFile(path.join(game,'tests/ads.test.mjs'),'\n');
 await assert.rejects(verifyRunInputs(root,run),/extra acceptance/);
});
test('an unbound placeholder cannot be exported as a playable source game',async t=>{
 const{game}=await setup(t);await assert.rejects(standaloneHtml(game,'pelican-bike','test-mobile'),/source.*bound/i);
});
test('private standalone retains full license and pending platform state without network fetches',async t=>{
 const{game}=await setup(t),file=path.join(game,'candidate.json');
 const c=JSON.parse(await readFile(file));c.referenceId='pelican-bike';c.sourceRevision='54adc1fb64155f9dd7c1c90ecae7b8185ac540b8';await writeFile(file,JSON.stringify(c));
 const index=path.join(game,'index.html');await writeFile(index,(await readFile(index,'utf8')).replace('<html','<html data-reference-game="pelican-bike"'));
 await writeFile(path.join(game,'LICENSE.three.txt'),'Owned test attribution fixture. Permission text must be retained in full.');
 const bundle=await standaloneHtml(game,'pelican-bike','test-mobile');
 assert.ok(bundle.html.includes('window.__PLATFORM_META__='));assert.ok(bundle.html.includes('Permission text must be retained in full.'));
 assert.ok(!bundle.html.includes('src="main.mjs"'));
});
test('local phone preview rejects a public bind address before exposing any game data',async t=>{
 const{base}=await setup(t);await assert.rejects(serveRun(base,'test-mobile',0,{bindAddress:'8.8.8.8'}).then(server=>{
   t.after(()=>new Promise(resolve=>server.close(resolve)));return server;
 }),/private|bind/i);
});
test('only private inline source previews permit their bundled data fonts',async t=>{
 const{base}=await setup(t),server=await serveRun(base,'test-mobile',0);t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/');
 assert.ok(response.headers.get('content-security-policy').includes("font-src 'self' data:"));
 await createRun(base,'owned-grid');const grid=await serveRun(base,'owned-grid',0);t.after(()=>new Promise(resolve=>grid.close(resolve)));
 const original=await fetch('http://127.0.0.1:'+grid.address().port+'/');
 assert.ok(!original.headers.get('content-security-policy').includes("script-src 'self' 'unsafe-inline'"));
});
test('the additive recipe and lint exception are in scope, generated third-party source stays excluded',()=>{
 const p={scripts:{test:'vitest run'}};
 assert.equal(evaluateScope(['templates/web-lite/h5-source-mobile-v1/engine.mjs','eslint.config.js'],p,p).passed,true);
 assert.equal(evaluateScope(['runs/h5-pelican-mobile-20261013/workspace/source/pelican-bike/src/main.js'],p,p).passed,false);
});
test('PR10 source cache reuse rejects a wrong game or changed baseline before cloning',async()=>{
 const {assertPr10Baseline}=await import('../h5-mobile-build.mjs');
 const id='h5-pelican-mobile-20261013',hash='5067196c6c7cdbd007be27ec4879d25666e35d05ec2fe3682bd246131ee7be57';
 assert.doesNotThrow(()=>assertPr10Baseline('pelican-bike',id,hash));
 assert.throws(()=>assertPr10Baseline('qq-speed',id,hash),/baseline/i);
 assert.throws(()=>assertPr10Baseline('pelican-bike',id,'0'.repeat(64)),/baseline/i);
});

test('CF mobile default WebGL quality is selected before original Game.init(), preserving platform query',async()=>{
 const {buildSourceMobile}=await import('../h5-mobile-build.mjs');
 assert.equal(typeof buildSourceMobile,'function');
 const src=await readFile(fileURLToPath(new URL('../h5-mobile-build.mjs',import.meta.url)),'utf8');
 assert.match(src,/gameId==='cf-transport-ship'/);
 assert.match(src,/!p\.has\('q'\)\)p\.set\('q','low'\)/);
 assert.match(src,/!p\.has\('touch'\)\)p\.set\('touch','1'\)/);
 assert.match(src,/!p\.has\('nolock'\)\)p\.set\('nolock','1'\)/);
 assert.match(src,/location\.hash/);
});
