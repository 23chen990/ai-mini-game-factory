import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateRegistry } from './validate.mjs';

const registry = JSON.parse(await readFile(new URL('../../release-status/games.json', import.meta.url), 'utf8'));

test('current registry satisfies schema', () => {
  assert.deepEqual(validateRegistry(registry), []);
});

test('cannot mark a game release ready without each evidence axis passing', () => {
  const data = structuredClone(registry);
  data.games[0].publicLaunchReady = true;
  assert.match(validateRegistry(data).join('\n'), /launch-ready requires all five/);
});

test('cannot treat missing real-world evidence as passing', () => {
  const data = structuredClone(registry);
  const game = data.games[0];
  game.publicLaunchReady = true;
  game.ci = 'passed';
  game.realDevice = 'passed';
  game.humanPlaytest = 'passed';
  game.realRewardAds = 'passed';
  game.platformPackage = 'passed';
  assert.deepEqual(validateRegistry(data), []);
  game.realDevice = 'unverified';
  assert.match(validateRegistry(data).join('\n'), /launch-ready requires all five/);
});

test('duplicate game entries are rejected', () => {
  const data = structuredClone(registry);
  data.games.push(structuredClone(data.games[0]));
  assert.match(validateRegistry(data).join('\n'), /duplicate id/);
});
