/* global process,console,URL */
#!/usr/bin/env node
/** Re-run original normal-input r4 witness commands on a separate text candidate.
 * Not browser, human, independent editorial or platform verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const [rootArg, candidateArg, reportArg] = process.argv.slice(2);
if (!rootArg || !candidateArg || !reportArg) {
  console.error('Usage: node replay_pilot.mjs R4_ROOT CANDIDATE_STORY_JSON NEW_REPORT_JSON');
  process.exit(2);
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const tests = [];
try {
  const root = fs.realpathSync(rootArg);
  const candidateFile = fs.realpathSync(candidateArg);
  const reportFile = path.resolve(reportArg);
  assert.ok(!fs.existsSync(reportFile), 'Report already exists; refusing overwrite');
  assert.ok(!fs.lstatSync(path.dirname(reportFile)).isSymbolicLink(), 'No symlink report directory');
  const baselineFile = path.join(root, 'data/STORY.json');
  assert.notEqual(candidateFile, fs.realpathSync(baselineFile), 'Candidate must be different file');
  const read = name => fs.readFileSync(path.join(root, name));
  const baselineRaw = read('data/STORY.json'), candidateRaw = fs.readFileSync(candidateFile);
  const engineRaw = read('tools/engine.mjs');
  const original = JSON.parse(baselineRaw), candidate = JSON.parse(candidateRaw);
  const E = await import(pathToFileURL(path.join(root, 'tools/engine.mjs')).href);
  const choiceWitnesses = JSON.parse(read('qa/current/choice-witness-prefixes.json'));
  const routeWitnesses = JSON.parse(read('qa/current/witnesses.json'));
  for (const witnesses of [choiceWitnesses, routeWitnesses]) {
    assert.equal(witnesses.hashes.story, hash(baselineRaw), 'Stale witnesses: baseline source SHA');
    assert.equal(witnesses.hashes.engine, hash(engineRaw), 'Stale witnesses: interpreter SHA');
  }
  assert.equal(original.entry, candidate.entry, 'Entry changed');
  let commandsExecuted = 0;
  const visible = new Map();
  const expected = new Map();
  function trackedLine(row) {
    if (row && typeof row.text === 'string' && typeof row.id === 'string') return row.id;
    return null;
  }
  function listChanges(scenesA, scenesB) {
    function visit(a, b) {
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return;
      if (trackedLine(a) && a.text !== b.text) {
        assert.equal(a.id, b.id, 'Line id changed');
        expected.set(a.id, {kind: 'line', before: a.text, after: b.text});
      }
      for (const key of Object.keys(a)) visit(a[key], b[key]);
    }
    visit(scenesA, scenesB);
    for (const [sceneId, a] of Object.entries(scenesA)) {
      const b = scenesB[sceneId];
      assert.ok(b, `Scene disappeared: ${sceneId}`);
      if (a.title !== b.title) expected.set(`title:${sceneId}`, {kind: 'title', before:a.title, after:b.title});
      for (const choice of a.choices) {
        const newChoice = b.choices.find(x => x.id === choice.id);
        assert.ok(newChoice, `Choice disappeared: ${sceneId}/${choice.id}`);
        if (choice.label !== newChoice.label) {
          expected.set(`choice:${sceneId}/${choice.id}`, {kind:'choice-label', before:choice.label, after:newChoice.label});
        }
      }
    }
  }
  listChanges(original.scenes, candidate.scenes);
  function compareRows(aRows, bRows, tag, command) {
    assert.deepEqual(aRows.map(x=>[x.id, x.speaker]), bRows.map(x=>[x.id, x.speaker]), `${tag}: row identities changed`);
    for (let i=0; i<aRows.length; i++) {
      const a=aRows[i], b=bRows[i];
      if (a.text !== b.text && !visible.has(a.id)) visible.set(a.id, {...expected.get(a.id), command});
    }
  }
  function comparePage(a, b, from, command) {
    assert.equal(a.id, b.id, 'Scene render id changed');
    if (a.title !== b.title) visible.set(`title:${from}`, {...expected.get(`title:${from}`), command});
    assert.deepEqual(a.choices.map(c=>[c.id,c.enabled]), b.choices.map(c=>[c.id,c.enabled]),
                     `${from}: enabled choices changed`);
    for (let i=0; i<a.choices.length; i++) {
      const old=a.choices[i], neu=b.choices[i];
      if (old.label !== neu.label) visible.set(`choice:${from}/${old.id}`, {...expected.get(`choice:${from}/${old.id}`), command});
    }
    compareRows(a.body, b.body, from+':body', command);
  }
  function replayCase(name, commands, expectedEnding) {
    let a = E.createState(), b = E.createState();
    for (const command of commands) {
      assert.equal(a.current, command.from, `${name}: original input source`);
      assert.equal(b.current, command.from, `${name}: candidate input source`);
      const visibleA=E.renderScene(a, original), visibleB=E.renderScene(b, candidate);
      comparePage(visibleA, visibleB, a.current, {case:name, from:command.from, id:command.id});
      assert.ok(visibleB.choices.some(x=>x.id===command.id&&x.enabled), `${name}: action not enabled`);
      const ra = E.choose(a, original, command.id, command.revision);
      const rb = E.choose(b, candidate, command.id, command.revision);
      assert.deepEqual(ra.state, rb.state, `${name}: state changed`);
      compareRows(ra.reply, rb.reply, `${name}:reply`, {case:name, from:command.from, id:command.id});
      a=ra.state; b=rb.state; commandsExecuted++;
    }
    if (expectedEnding) {
      assert.equal(b.ending, expectedEnding, `${name}: changed ending`);
      assert.ok(b.complete, `${name}: expected terminal state`);
    }
    tests.push({name,status:'PASS',commands:commands.length,ending:b.ending||null});
  }
  const allChoices = Object.values(original.scenes).flatMap(sc=>sc.choices.map(c=>`${sc.id}/${c.id}`));
  assert.deepEqual(new Set(Object.keys(choiceWitnesses.choices)), new Set(allChoices), 'Choice catalogue changed');
  for (const [choice, witness] of Object.entries(choiceWitnesses.choices)) {
    replayCase(`choice:${choice}`, witness.prefix);
  }
  for (const witness of routeWitnesses.witnesses) {
    replayCase(`route:${witness.name}`, witness.commands, witness.ending);
  }
  assert.deepEqual(new Set(visible.keys()), new Set(expected.keys()),
                   'At least one changed text slot was not observed in an ordinary-input witness');
  assert.equal(hash(read('data/STORY.json')), hash(baselineRaw), 'Source mutated during replay');
  const result = {status:'PASS', scope:'r4 current ordinary interpreter commands; NOT browser/human/platform',
                  hashes:{baseline:hash(baselineRaw),candidate:hash(candidateRaw),engine:hash(engineRaw),
                          replayRunner:hash(fs.readFileSync(new URL(import.meta.url)))},
                  choiceWitnessCount:allChoices.length, fullRouteWitnessCount:routeWitnesses.witnesses.length,
                  commandsExecuted, changedTextCount:expected.size, witnessedChanges:Object.fromEntries(visible),
                  testRuns:tests.length,
                  gates:{structural:'REQUIRES story_guard.py check independently',editorial:'NOT_RUN',
                         browser:'NOT_RUN', human:'NOT_RUN', platform:'NOT_RUN'}};
  fs.writeFileSync(reportFile, JSON.stringify(result,null,2)+'\n', {flag:'wx'});
  console.log(JSON.stringify({status:result.status,choiceWitnessCount:result.choiceWitnessCount,
    fullRouteWitnessCount:result.fullRouteWitnessCount,commandsExecuted,
    changedTextCount:result.changedTextCount,report:reportFile},null,2));
} catch (error) {
  console.error(JSON.stringify({status:'FAIL', completedCases:tests.length,
    message:String(error?.stack||error)},null,2));
  process.exitCode=2;
}
