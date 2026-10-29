import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { frozenQaProfile, frozenQaToolArgs } from '../../src/qa/frozen-review.js';
const exec = promisify(execFile);
it('removes every filesystem and external tool from the frozen reviewer', () => {
 const args = frozenQaToolArgs();
 for (const feature of ['shell_tool', 'view_image', 'multi_agent', 'plugins', 'apps']) expect(args).toContain(feature);
 expect(args).toContain('--ignore-rules');
 expect(args).toContain('project_doc_max_bytes=0');
});
it.skipIf(process.platform !== 'darwin')('actually denies absolute, traversal, symlink, source, oracle and history reads while admitting frozen pixels', async () => {
 const root = await mkdtemp(path.join(tmpdir(), 'qa-read-boundary-'));
 const input = path.join(root, 'input'); await mkdir(input);
 await writeFile(path.join(input, 'frame.png'), 'allowed pixels');
 const blocked = ['workspace/game/src/main.ts', 'administrator/oracle.json', 'history/old-review.json', 'other-run/answer.json'];
 for (const file of blocked) { await mkdir(path.dirname(path.join(root, file)), {recursive:true}); await writeFile(path.join(root, file), 'FORBIDDEN'); }
 await symlink(path.join(root, blocked[1]!), path.join(input, 'escape.json'));
 const profile = frozenQaProfile({readRoots:[input], writeRoots:[]});
 expect((await exec('/usr/bin/sandbox-exec', ['-p', profile, '/bin/cat', path.join(input, 'frame.png')])).stdout).toBe('allowed pixels');
 for (const file of [...blocked.map(file=>path.join(root,file)), path.join(input, 'escape.json'), `${input}/../administrator/oracle.json`]) {
  await expect(exec('/usr/bin/sandbox-exec', ['-p', profile, '/bin/cat', file])).rejects.toThrow(/Operation not permitted/);
 }
 await expect(exec('/usr/bin/sandbox-exec', ['-p', profile, '/bin/sh', '-c', `echo changed > '${input}/frame.png'`])).rejects.toThrow(/Operation not permitted/);
 expect(await readFile(path.join(input, 'frame.png'), 'utf8')).toBe('allowed pixels');
});
