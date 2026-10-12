import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScope } from '../scope-check.mjs';
const base = { name: 'factory', dependencies: { zod: '4' }, scripts: { test: 'vitest run' } };
test('scope permits only the isolated pilot and additive pilot scripts', () => {
  const after = { ...base, scripts: { ...base.scripts, pilot: 'node runner.mjs', 'pilot:test': 'node --test' } };
  assert.equal(evaluateScope(['PILOT_START.md', 'tools/lean-pilot/runner.mjs'], base, after).passed, true);
});
test('scope rejects unrelated factory files, publication data and changed dependencies', () => {
  for (const file of ['src/factory.ts', '.env', 'runs/user/photo.png', 'tools/lean-pilot/../secret', 'AGENTS.md']) {
    assert.equal(evaluateScope([file], base, base).passed, false);
  }
  assert.equal(evaluateScope([], base, { ...base, dependencies: {} }).passed, false);
});
test('scope cannot replace legacy scripts or add an unapproved script', () => {
  assert.equal(evaluateScope([], base, { ...base, scripts: { test: 'true' } }).passed, false);
  assert.equal(evaluateScope([], base, { ...base, scripts: { ...base.scripts, deploy: 'deploy' } }).passed, false);
});
