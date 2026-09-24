import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { WebLiteRuntimeAdapter } from '../../src/adapters/web-lite.js';

const mockSpawn = vi.mocked(spawn);

/** The spawn call shape the adapter issues: bin, args, and options (cwd + patched env). */
type SpawnCall = { bin: string; args: string[]; options: { cwd: string; env: NodeJS.ProcessEnv } };

/** vitest records calls positionally ([bin, args, options]); normalise to named fields. */
function recordedSpawns(): SpawnCall[] {
  return (mockSpawn.mock.calls as unknown as Array<[string, string[], { cwd: string; env: NodeJS.ProcessEnv }]>)
    .map(([bin, args, options]) => ({ bin, args, options }));
}

type FakeChild = ChildProcess & { stdout: PassThrough; stderr: PassThrough };

function fakeChild(): FakeChild {
  const child = new EventEmitter() as unknown as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

/** Queue the next spawn call to emit 'error' (ENOENT) or exit 0. */
function queueSpawn(failWith?: { code?: string; message?: string }): FakeChild {
  const child = fakeChild();
  mockSpawn.mockImplementationOnce(() => {
    if (failWith) {
      const error = new Error(failWith.message ?? 'spawn failed') as NodeJS.ErrnoException;
      error.code = failWith.code;
      queueMicrotask(() => child.emit('error', error));
    } else {
      queueMicrotask(() => child.emit('exit', 0));
    }
    return child;
  });
  return child;
}

async function makeWorkspace(prefix: string): Promise<{ root: string; workspace: string }> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const workspace = path.join(root, 'game');
  const adapter = new WebLiteRuntimeAdapter(process.cwd());
  await adapter.createProject(workspace, 'idle-shop-v1');
  return { root, workspace };
}

describe('WebLiteRuntimeAdapter verifyProject uses factory-pinned binaries', () => {
  afterEach(() => mockSpawn.mockReset());

  it('invokes factory vitest and tsc instead of pnpm inside the symlinked workspace', async () => {
    const { workspace } = await makeWorkspace('web-lite-factory-bin-');
    queueSpawn();
    queueSpawn();

    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await expect(adapter.verifyProject(workspace, { requireScripts: true })).resolves.toEqual([
      'contract:test-api-7',
      'save:versioned',
      'test:passed',
      'typecheck:passed',
    ]);

    const calls = recordedSpawns();
    expect(calls.map(({ bin, args }) => [bin, args] as const)).toEqual([
      [path.join(process.cwd(), 'node_modules/.bin/vitest'), ['run']],
      [path.join(process.cwd(), 'node_modules/.bin/tsc'), ['--noEmit']],
    ]);
  });

  it('does not enable pnpm verify-deps toggles when spawning factory binaries', async () => {
    const { workspace } = await makeWorkspace('web-lite-env-');
    queueSpawn();
    queueSpawn();

    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.verifyProject(workspace, { requireScripts: true });

    for (const { options } of recordedSpawns()) {
      expect(options.env.pnpm_config_verify_deps_before_run).toBeUndefined();
    }
  });

  it('does not retry with corepack for non-pnpm commands', async () => {
    const { workspace } = await makeWorkspace('web-lite-nofallback-');
    queueSpawn({ code: 'ENOENT' });

    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await expect(adapter.buildWeb(workspace)).rejects.toThrow(/was not found on PATH/);

    const calls = recordedSpawns();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.bin).toContain('node_modules/.bin/vite');
  });
});
