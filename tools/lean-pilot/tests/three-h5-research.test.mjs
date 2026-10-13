/* global Buffer */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  TARGETS, SOURCE_COMMIT, SOURCE_RULES, extractInlineGameBundle,
  locateAnchors, createReaReceipt, stageHtml, auditPinnedSource,
} from '../three-h5-research.mjs';

test('pins only the three approved H5 targets and fixed upstream commit', () => {
  assert.equal(Object.keys(TARGETS).length, 3);
  assert.match(SOURCE_COMMIT, /^[a-f0-9]{40}$/);
  assert.equal(SOURCE_RULES.length, 16);
  assert.equal(new Set(SOURCE_RULES.map(x => x.id)).size, 16);
});
test('isolates largest inline bundle without accidentally using an external script URL', () => {
  const html = '<script src="https://bad.invalid/code.js"></script>' +
    '<script type="application/json">{"a":1}</script><script>' +
    'var game=1;'.repeat(200) + '</script>';
  const found = extractInlineGameBundle(html);
  assert.equal(found.scriptBlocks, 2);
  assert.ok(found.script.startsWith('var game=1;'));
  assert.equal(found.selectedByteLength, Buffer.byteLength(found.script));
});
test('refuses empty, too small and oversize HTML instead of forging REA input', () => {
  assert.throws(() => extractInlineGameBundle('<script src="missing.js"></script>'), /no-inline-script/);
  assert.throws(() => extractInlineGameBundle('<script>tiny</script>'), /bundle-not-found/);
  assert.throws(() => extractInlineGameBundle('x'.repeat(6 * 1024 * 1024 + 1)), /too-large/);
});
test('mechanism anchors require exact on-disk source statements', () => {
  const rule = SOURCE_RULES[1];
  const anchored = locateAnchors('line one\n  smallWindow: 0.5,\nline three', [rule], rule.file);
  assert.equal(anchored[0].line, 2);
  assert.match(anchored[0].sourceLink, /#L2$/);
  assert.match(anchored[0].lineSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => locateAnchors('smallWindow: 0.45', [rule], rule.file), /SOURCE_ANCHOR_MISSING/);
});
test('REA receipt rejects fabricated or failed tool output', () => {
  const stage = { game: 'qq-speed', bundleSha256: 'f'.repeat(64) };
  const fake = Buffer.from(JSON.stringify({ evidence_id: 'x', normalized_result: {} }));
  assert.equal(createReaReceipt('qq-speed', fake, 1, stage).reaExecutedVerified, false);
  assert.equal(createReaReceipt('qq-speed', Buffer.from('not-json'), 0, stage).reaExecutedVerified, false);
  const validShape = createReaReceipt('qq-speed', fake, 0, stage);
  assert.equal(validShape.status, 'REAL_REA_STATIC_EVIDENCE_RECEIVED');
  assert.equal(validShape.browserPlayed, false);
  assert.equal(validShape.releaseAllowed, false);
});
test('staging persists exact bundle bytes and refuses accidental overwrite', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'three-h5-stage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const html = path.join(root, 'game.html'), staged = path.join(root, 'staged');
  const js = '(()=>{const sample=123;})();'.repeat(90);
  await writeFile(html, '<html><script>' + js + '</script></html>');
  const first = await stageHtml('pelican-bike', html, staged);
  assert.equal(first.bundleBytes, Buffer.byteLength(js));
  assert.equal(await readFile(path.join(staged, 'bundle.js'), 'utf8'), js);
  assert.deepEqual(JSON.parse(await readFile(path.join(staged, 'package.json'), 'utf8')).private, true);
  await assert.rejects(stageHtml('pelican-bike', html, staged), /EEXIST/);
  await assert.rejects(stageHtml('unknown-game', html, path.join(root, 'unknown')), /unknown-target/);
});
test('source audit refuses unpinned repository history', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'three-h5-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Fixture']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'fixture@example.invalid']);
  await writeFile(path.join(root, 'README.md'), 'not upstream');
  execFileSync('git', ['-C', root, 'add', 'README.md']);
  execFileSync('git', ['-C', root, 'commit', '-qm', 'fixture']);
  await assert.rejects(auditPinnedSource(root), /SOURCE_REVISION_MISMATCH/);
});
