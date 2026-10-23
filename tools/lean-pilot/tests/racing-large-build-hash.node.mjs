import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { request } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm, open, appendFile, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as policy from '../policy.mjs';
import { buildHash, GAME_FILES, serveRun } from '../runner.mjs';
import { candidateSpec } from '../candidates.mjs';

const LARGE_BYTES = 13_284_478;
const ORDER = [...GAME_FILES, ...candidateSpec('h5-source-mobile-v1').runtimeFiles];
async function fixture(t, large = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'qq-speed-build-hash-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ORDER) await writeFile(path.join(root, name), 'fixture ' + name + '\r\n赛车\0');
  await writeFile(path.join(root, 'candidate.json'), JSON.stringify({ templateId: 'h5-source-mobile-v1', gameId: 'qq-speed' }));
  if (large) await writeFile(path.join(root, 'index.html'), Buffer.alloc(LARGE_BYTES, 0x61));
  return root;
}
async function oldExactSchema(root) {
  const entries = [];
  // Independent byte-for-byte oracle: whole reads are intentional test data,
  // not the production method used for large compiled bundles.
  for (const name of ORDER) entries.push([name, policy.sha256(await readFile(path.join(root, name)))]);
  return policy.sha256(JSON.stringify(entries));
}
async function fileHandlePrototype(root) {
  const handle = await open(path.join(root, 'index.html'), 'r');
  const prototype = Object.getPrototypeOf(handle); await handle.close(); return prototype;
}
async function previewFixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'qq-speed-large-preview-')), id = 'large-racing';
  const game = path.join(base, id, 'workspace/game'); await mkdir(game, { recursive: true });
  for (const name of ORDER) await writeFile(path.join(game, name), 'fixture ' + name);
  await writeFile(path.join(game, 'candidate.json'), JSON.stringify({ templateId: 'h5-source-mobile-v1', gameId: 'qq-speed' }));
  await writeFile(path.join(game, 'index.html'), Buffer.alloc(LARGE_BYTES, 0x61));
  const budget = { ...policy.DEFAULT_BUDGET };
  await writeFile(path.join(base, id, 'run.json'), JSON.stringify({ schemaVersion: 1, runId: id, templateId: 'h5-source-mobile-v1',
    theme: 'qq-speed', budget, policyHash: policy.sha256(JSON.stringify(budget)), workflow: { 'request.json': 'fixture', 'contract.json': 'fixture' } }));
  const server = await serveRun(base, id, 0);
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(base, { recursive: true, force: true }); });
  return { game, server };
}
function previewRequest(server, { method = 'GET', url = '/', host } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path: url, method, headers: host ? { Host: host } : {} }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.once('error', reject); req.end();
  });
}

test('small QQ-speed build keeps the exact old ordered filename/fileSHA JSON fingerprint', async t => {
  const root = await fixture(t);
  assert.deepEqual(ORDER, ['candidate.json', 'engine.mjs', 'index.html', 'main.mjs', 'style.css', 'themes.mjs', 'platform.json', 'LICENSE.three.txt']);
  assert.equal(await buildHash(root), await oldExactSchema(root));
});

test('13,284,478-byte compiled index hashes every byte with the identical build schema', async t => {
  const root = await fixture(t, true);
  assert.equal(await buildHash(root), await oldExactSchema(root));
});

test('a same-size byte mutation beyond the old 4 MiB boundary changes the build hash', async t => {
  const root = await fixture(t, true), before = await buildHash(root);
  const file = await open(path.join(root, 'index.html'), 'r+');
  try { await file.write(Buffer.from([0x62]), 0, 1, 4 * 1024 * 1024 + 123456); } finally { await file.close(); }
  const after = await buildHash(root);
  assert.notEqual(after, before); assert.equal(after, await oldExactSchema(root));
});

test('large build hashing uses bounded chunk reads and never a large FileHandle.readFile allocation', async t => {
  const root = await fixture(t, true), expected = await oldExactSchema(root), prototype = await fileHandlePrototype(root);
  const originalRead = prototype.read, originalReadFile = prototype.readFile;
  let largestBuffer = 0, bytesRead = 0;
  t.mock.method(prototype, 'read', async function (...args) {
    const buffer = args[0]?.buffer && !Buffer.isBuffer(args[0]) ? args[0].buffer : args[0];
    if (buffer?.byteLength) largestBuffer = Math.max(largestBuffer, buffer.byteLength);
    const result = await originalRead.apply(this, args); bytesRead += result.bytesRead; return result;
  });
  t.mock.method(prototype, 'readFile', async function (...args) {
    assert.ok((await this.stat()).size <= 4 * 1024 * 1024, 'large fingerprint file was fully buffered');
    return originalReadFile.apply(this, args);
  });
  assert.equal(await buildHash(root), expected);
  assert.ok(bytesRead >= LARGE_BYTES, 'stream did not consume the entire compiled file');
  assert.ok(largestBuffer > 0 && largestBuffer <= 64 * 1024, 'hashing allocation must stay within one 64 KiB chunk');
});

test('safeRead retains its 4 MiB configuration/evidence budget and explicit smaller limit', async t => {
  const root = await fixture(t, true);
  await assert.rejects(policy.safeRead(root, 'index.html'), /file-size-limit/u);
  await assert.rejects(policy.safeRead(root, 'style.css', 2), /file-size-limit/u);
  assert.deepEqual(await policy.safeRead(root, 'style.css'), await readFile(path.join(root, 'style.css')));
});

test('streaming SHA preserves traversal, root/leaf/directory symlink and regular-file protections', async t => {
  assert.equal(typeof policy.safeFileHash, 'function');
  const root = await fixture(t);
  await mkdir(path.join(root, 'sub'));
  await symlink(path.join(root, 'index.html'), path.join(root, 'leaf-link'));
  await symlink(root, path.join(root, 'directory-link'));
  for (const relative of ['../index.html', '/etc/passwd', 'sub/../index.html', 'sub', 'leaf-link', 'directory-link/index.html', 'index.html\0', 'sub\\index.html', './index.html', 'sub//index.html'])
    await assert.rejects(policy.safeFileHash(root, relative), /unsafe-/u, relative);
  await assert.rejects(policy.safeFileHash(path.join(root, 'directory-link'), 'index.html'), /unsafe-root/u);
  assert.equal(await policy.safeFileHash(root, 'index.html'), policy.sha256(await readFile(path.join(root, 'index.html'))));
});

test('buildHash still rejects a symlinked actual runtime file', async t => {
  const root = await fixture(t);
  await rm(path.join(root, 'index.html')); await symlink(path.join(root, 'main.mjs'), path.join(root, 'index.html'));
  await assert.rejects(buildHash(root), /unsafe-file/u);
});

for (const change of ['append', 'truncate']) test('a file that changes size during streaming is rejected: ' + change, async t => {
  assert.equal(typeof policy.safeFileHash, 'function');
  const root = await fixture(t, true), prototype = await fileHandlePrototype(root), originalRead = prototype.read;
  let changed = false;
  t.mock.method(prototype, 'read', async function (...args) {
    const result = await originalRead.apply(this, args);
    if (!changed) {
      changed = true;
      if (change === 'append') await appendFile(path.join(root, 'index.html'), 'changed');
      else await truncate(path.join(root, 'index.html'), 1024);
    }
    return result;
  });
  await assert.rejects(policy.safeFileHash(root, 'index.html'), /file-changed/u);
});

test('allowlisted large HTML preview GET returns every byte with the existing security headers', async t => {
  const { game, server } = await previewFixture(t), prototype = await fileHandlePrototype(game);
  const originalReadFile = prototype.readFile, originalCreateReadStream = prototype.createReadStream;
  let streamedBytes = 0, largestChunk = 0;
  t.mock.method(prototype, 'readFile', async function (...args) {
    assert.ok((await this.stat()).size <= 4 * 1024 * 1024, 'GET buffered the large runtime file');
    return originalReadFile.apply(this, args);
  });
  t.mock.method(prototype, 'createReadStream', function (...args) {
    const stream = originalCreateReadStream.apply(this, args);
    stream.on('data', chunk => { streamedBytes += chunk.byteLength; largestChunk = Math.max(largestChunk, chunk.byteLength); });
    return stream;
  });
  const result = await previewRequest(server);
  assert.equal(result.status, 200); assert.equal(result.body.byteLength, LARGE_BYTES);
  assert.equal(streamedBytes, LARGE_BYTES); assert.ok(largestChunk > 0 && largestChunk <= 64 * 1024);
  assert.equal(policy.sha256(result.body), policy.sha256(await readFile(path.join(game, 'index.html'))));
  assert.equal(result.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(result.headers['x-content-type-options'], 'nosniff'); assert.equal(result.headers['x-frame-options'], 'DENY');
  assert.equal(result.headers['referrer-policy'], 'no-referrer'); assert.equal(result.headers['cache-control'], 'no-store');
  assert.match(result.headers['content-security-policy'], /object-src 'none'; base-uri 'none'; frame-ancestors 'none'/u);
});

test('allowlisted large HTML preview HEAD succeeds without reading or returning the body', async t => {
  const { game, server } = await previewFixture(t), prototype = await fileHandlePrototype(game), originalReadFile = prototype.readFile;
  t.mock.method(prototype, 'readFile', async function (...args) {
    assert.ok((await this.stat()).size <= 4 * 1024 * 1024, 'HEAD buffered the large runtime file');
    return originalReadFile.apply(this, args);
  });
  t.mock.method(prototype, 'read', async function () { assert.fail('HEAD read the large runtime body'); });
  const result = await previewRequest(server, { method: 'HEAD', url: '/index.html' });
  assert.equal(result.status, 200); assert.equal(result.body.byteLength, 0);
  assert.equal(Number(result.headers['content-length']), LARGE_BYTES);
});

test('large preview retains method, Host, allowlist, traversal and symlink rejection', async t => {
  const { game, server } = await previewFixture(t);
  assert.equal((await previewRequest(server, { method: 'POST' })).status, 405);
  assert.equal((await previewRequest(server, { host: 'outside.example' })).status, 403);
  for (const url of ['/run.json', '/tests/engine.test.mjs', '/%2e%2e/run.json', '/%2findex.html', '/%5cindex.html', '/index.html%00', '/%ZZ'])
    assert.notEqual((await previewRequest(server, { url })).status, 200, url);
  await rm(path.join(game, 'index.html')); await symlink(path.join(game, 'main.mjs'), path.join(game, 'index.html'));
  assert.equal((await previewRequest(server)).status, 400);
  assert.equal((await previewRequest(server, { method: 'HEAD' })).status, 400);
});
