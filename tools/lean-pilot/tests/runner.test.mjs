/* global fetch */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, appendFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRun, checkRun, reportRun, serveRun, buildHash } from '../runner.mjs';

async function setup(t) { const base=await mkdtemp(path.join(tmpdir(),'lean-run-'));t.after(()=>rm(base,{recursive:true,force:true}));return base; }
test('initialization is isolated, refuses overwrite and invalid ids', async t => {
  const base=await setup(t); await createRun(base,'sample','observatory');
  await assert.rejects(createRun(base,'sample','observatory'));
  for (const id of ['../escape','UPPER','a/b','','.']) await assert.rejects(createRun(base,id,'observatory'));
  await assert.rejects(createRun(base,'other','bad-theme'));
});
test('engineering verification cannot promote unrun browser or human gates', async t => {
  const base=await setup(t); await createRun(base,'sample','observatory');
  const result=await checkRun(base,'sample'); assert.equal(result.passed,true);
  const report=await reportRun(base,'sample'); assert.equal(report.engineering,'PASS');
  assert.equal(report.browser,'NOT_RUN'); assert.equal(report.human.status,'NOT_RUN'); assert.equal(report.publishable,false);
});
test('edited acceptance tests and changed research manifest cannot pass', async t => {
  const base=await setup(t); await createRun(base,'sample','observatory');
  await appendFile(path.join(base,'sample/workspace/game/tests/engine.test.mjs'),'\n// changed acceptance\n');
  await assert.rejects(checkRun(base,'sample'),/acceptance/);
});
test('new build invalidates old engineering and browser results', async t => {
  const base=await setup(t); await createRun(base,'sample','observatory'); await checkRun(base,'sample');
  await appendFile(path.join(base,'sample/workspace/game/style.css'),'\n/* new build */\n');
  const report=await reportRun(base,'sample'); assert.equal(report.engineering,'STALE'); assert.equal(report.publishable,false);
});
test('first candidate plus two changed candidates exhausts the revision budget', async t => {
  const base=await setup(t); await createRun(base,'sample','observatory');
  for(let i=0;i<3;i++) { await appendFile(path.join(base,'sample/workspace/game/style.css'),`\n/* revision ${i} */\n`); assert.equal((await checkRun(base,'sample')).passed,true); }
  await appendFile(path.join(base,'sample/workspace/game/style.css'),'\n/* fourth */\n');
  await assert.rejects(checkRun(base,'sample'),/revision-cap/);
});
test('loopback server exposes only approved game files, not run data', async t => {
  const base=await setup(t); await createRun(base,'sample','orchard');const server=await serveRun(base,'sample',0);
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url+'/')).status,200);
  for(const p of ['/run.json','/../../run.json','/tests/engine.test.mjs','/reference/LICENSE.txt','/%ZZ']) assert.notEqual((await fetch(url+p)).status,200);
  assert.equal((await fetch(url+'/',{method:'POST'})).status,405);
  const identity=await (await fetch(url+'/build.json')).json();assert.equal(identity.runId,'sample');assert.equal(identity.buildHash,await buildHash(path.join(base,'sample/workspace/game')));
});
test('run-directory symlinks and held locks are rejected', async t => {
  const base=await setup(t); await createRun(base,'sample','observatory');
  await symlink(path.join(base,'sample'),path.join(base,'alias'));await assert.rejects(reportRun(base,'alias'));
  await writeFile(path.join(base,'sample/.check-lock'),'held'); await assert.rejects(checkRun(base,'sample'),/lock|EEXIST/);
});

test('tampered source bytes invalidate a previously passing engineering result', async t => {
  const base=await setup(t);await createRun(base,'sample');await checkRun(base,'sample');
  await appendFile(path.join(base,'sample/evidence/reference/move-excerpt.txt'),'\nchanged\n');
  assert.equal((await reportRun(base,'sample')).engineering,'STALE');
});
test('standalone export is self-contained and bound to the exact game build', async t => {
  const {standaloneHtml}=await import('../standalone.mjs');const {Script}=await import('node:vm');
  const base=await setup(t);await createRun(base,'sample');const game=path.join(base,'sample/workspace/game');
  const result=await standaloneHtml(game,'orchard');assert.equal(result.buildHash,await buildHash(game));
  assert.ok(result.html.includes('data-initial-theme="orchard"'));assert.ok(!result.html.includes('src="main.mjs"'));
  const source=result.html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Script(source));
  await assert.rejects(standaloneHtml(game,'unknown'));
});

test('a browser pass without frozen suite and artifact evidence cannot pass', async t => {
  const base=await setup(t);await createRun(base,'sample');await checkRun(base,'sample');
  const game=path.join(base,'sample/workspace/game');
  await writeFile(path.join(base,'sample/browser.json'),JSON.stringify({runId:'sample',buildHash:await buildHash(game),passed:true}));
  assert.notEqual((await reportRun(base,'sample')).browser,'PASS');
});
test('changed browser acceptance identity stops engineering verification', async t => {
  const {readFile}=await import('node:fs/promises');const base=await setup(t);await createRun(base,'sample');
  const file=path.join(base,'sample/run.json');const run=JSON.parse(await readFile(file,'utf8'));
  run.browserSuiteHash='0'.repeat(64);await writeFile(file,JSON.stringify(run));
  await assert.rejects(checkRun(base,'sample'),/browser acceptance/i);
});
test('editing the frozen research manifest blocks a check', async t => {
  const base=await setup(t);await createRun(base,'sample');
  await appendFile(path.join(base,'sample/evidence/research.json'),'\n');
  await assert.rejects(checkRun(base,'sample'),/research/);
});
test('unfinished reservations make previous engineering evidence stale', async t => {
  const {readFile}=await import('node:fs/promises');const base=await setup(t);await createRun(base,'sample');await checkRun(base,'sample');
  const file=path.join(base,'sample/ledger.json');const ledger=JSON.parse(await readFile(file,'utf8'));
  ledger.pending=true;await writeFile(file,JSON.stringify(ledger));
  assert.equal((await reportRun(base,'sample')).engineering,'STALE');
});

test('browser artifact corruption invalidates browser evidence, not engine evidence', async t => {
  const {readFile,mkdir}=await import('node:fs/promises');
  const {BROWSER_CHECKS}=await import('../runner.mjs');const {sha256}=await import('../policy.mjs');
  const base=await setup(t);await createRun(base,'sample');await checkRun(base,'sample');
  const root=path.join(base,'sample');const run=JSON.parse(await readFile(path.join(root,'run.json'),'utf8'));
  await mkdir(path.join(root,'screenshots'));
  const names=['observatory-390x844','observatory-320x568','observatory-844x390','orchard-390x844','normal-terminal'];
  const artifacts=[];
  // Synthetic report fixture validates integrity logic; it is not a browser run.
  for(const name of names){const relative=`screenshots/${name}.png`;await writeFile(path.join(root,relative),'synthetic fixture');artifacts.push({path:relative,sha256:sha256('synthetic fixture')});}
  const report={scope:'HTTP_BROWSER',runId:'sample',buildHash:await buildHash(path.join(root,'workspace/game')),
    suiteHash:run.browserSuiteHash,passed:true,checks:BROWSER_CHECKS.map(name=>({name,passed:true})),artifacts};
  await writeFile(path.join(root,'browser.json'),JSON.stringify(report));
  assert.equal((await reportRun(base,'sample')).browser,'PASS');
  await appendFile(path.join(root,artifacts[0].path),'tamper');
  const after=await reportRun(base,'sample');assert.equal(after.browser,'STALE');assert.equal(after.engineering,'PASS');
});
test('browser environment blocker is not reported as a successful or product-failing test', async t => {
  const base=await setup(t);await createRun(base,'sample');await checkRun(base,'sample');
  const root=path.join(base,'sample');await writeFile(path.join(root,'browser.json'),JSON.stringify({
    runId:'sample',buildHash:await buildHash(path.join(root,'workspace/game')),passed:false,outcome:'ENVIRONMENT_BLOCKED'}));
  const report=await reportRun(base,'sample');assert.equal(report.browser,'BLOCKED');assert.equal(report.publishable,false);
});


test('malformed and contradictory browser checks never pass or crash reporting', async t => {
  const {readFile}=await import('node:fs/promises');
  const {BROWSER_CHECKS}=await import('../runner.mjs');
  const base=await setup(t);await createRun(base,'sample');await checkRun(base,'sample');
  const root=path.join(base,'sample');const run=JSON.parse(await readFile(path.join(root,'run.json'),'utf8'));
  for(const checks of [[null], [...BROWSER_CHECKS.map(name=>({name,passed:true})), {name:BROWSER_CHECKS[0],passed:false}]]) {
    await writeFile(path.join(root,'browser.json'),JSON.stringify({scope:'HTTP_BROWSER',runId:'sample',
      buildHash:await buildHash(path.join(root,'workspace/game')),suiteHash:run.browserSuiteHash,passed:true,checks,artifacts:[]}));
    assert.notEqual((await reportRun(base,'sample')).browser,'PASS');
  }
});

test('standalone export rejects changed HTML entry markers instead of silently producing a broken game', async t => {
  const {readFile}=await import('node:fs/promises');const {standaloneHtml}=await import('../standalone.mjs');
  const base=await setup(t);await createRun(base,'sample');const game=path.join(base,'sample/workspace/game');
  const file=path.join(game,'index.html');const html=await readFile(file,'utf8');
  await writeFile(file,html.replace('src="main.mjs"','src="another.mjs"'));
  await assert.rejects(standaloneHtml(game),/entry|marker/i);
});

test('standalone export refuses unreviewed additional imports', async t => {
  const {standaloneHtml}=await import('../standalone.mjs');
  const base=await setup(t);await createRun(base,'sample');const game=path.join(base,'sample/workspace/game');
  await appendFile(path.join(game,'main.mjs'),"\nimport { extra } from './extra.mjs';\n");
  await assert.rejects(standaloneHtml(game),/import|module/i);
});
