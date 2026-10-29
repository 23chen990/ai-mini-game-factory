import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { verifyQaObservation } from '../../src/qa/browser-preflight.js';
import { sha256Text } from '../../src/core/files.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))); });
it('binds frozen QA to the complete build, not only index.html, and detects changed assets', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'qa-build-directory-')); roots.push(root);
 await mkdir(path.join(root, 'dist')); await mkdir(path.join(root, 'evidence'));
 await writeFile(path.join(root, 'dist/index.html'), '<canvas></canvas>');
 await writeFile(path.join(root, 'dist/main.js'), 'original');
 await writeFile(path.join(root, 'evidence/frame.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=', 'base64'));
 const buildSha256 = sha256Text(`index.html:${sha256Text('<canvas></canvas>')}\nmain.js:${sha256Text('original')}`);
 const trace = JSON.stringify({ schemaVersion: 1, startedFromReset: true, actions: ['tap at 100ms'], transitions: [], completion: 'none', replayObserved: false, forbiddenOperations: [], screenshots: ['evidence/frame.png'], passed: false, blockers: ['not acceptance'], buildHash: buildSha256, observedAt: new Date().toISOString() });
 await writeFile(path.join(root, 'evidence/trace.json'), trace);
 const input = { buildPath: 'dist', buildSha256, tracePath: 'evidence/trace.json', traceSha256: sha256Text(trace) };
 expect((await verifyQaObservation(root, input)).images).toHaveLength(1);
 await writeFile(path.join(root, 'dist/main.js'), 'changed');
 await expect(verifyQaObservation(root, input)).rejects.toThrow('hash mismatch');
});

it('does not treat arbitrary run-local pictures as verified reference evidence', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'qa-reference-identity-'));roots.push(root);
 await mkdir(path.join(root,'dist'));await mkdir(path.join(root,'evidence'));
 await writeFile(path.join(root,'dist/index.html'),'page');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=','base64');
 await writeFile(path.join(root,'evidence/frame.png'),png);
 const hash=sha256Text('page');
 const trace=JSON.stringify({schemaVersion:1,startedFromReset:true,actions:['tap'],completion:'none',replayObserved:false,forbiddenOperations:[],screenshots:['evidence/frame.png'],passed:false,blockers:[],buildHash:hash,observedAt:new Date().toISOString()});
 await writeFile(path.join(root,'trace.json'),trace);
 const {createHash}=await import('node:crypto');
 await expect(verifyQaObservation(root,{buildPath:'dist/index.html',buildSha256:hash,tracePath:'trace.json',traceSha256:sha256Text(trace),referenceImages:[{path:'evidence/frame.png',sha256:createHash('sha256').update(png).digest('hex')}]})).rejects.toThrow();
});
