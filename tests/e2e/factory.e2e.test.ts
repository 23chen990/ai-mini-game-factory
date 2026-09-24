import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';

it('runs seed through human gate, build, deterministic Playwright QA, and release', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-e2e-'));
  const factory = createFactory({ root, mode: 'mock', qaMode: 'playwright' });
  const runId = await factory.demo(path.join(process.cwd(), 'examples/seeds/ghost-night-market.yaml'));
  const state = await factory.status(runId);
  expect(state.stage).toBe('COMPLETED');
  expect(state.stages.QA!.evidence.some((item: string) => item.includes('playwright'))).toBe(true);
  await expect(access(path.join(root, 'runs', runId, 'screenshots/gameplay.png'))).resolves.toBeUndefined();
});
