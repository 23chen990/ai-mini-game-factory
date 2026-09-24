import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { BuilderAgent } from '../../src/agents/index.js';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import type { CodexProvider } from '../../src/providers/interfaces.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function idea(id: string) {
  return { id, name: id, coreAction: 'distinct action', decisionIntervalSeconds: 12, decision: 'safe or risky', choiceDrivers: ['state'], pressure: 'failure pressure', firstDelight: 'first reveal', secondRunVariation: 'new rule', growthMechanic: 'cosmetic only', randomVariation: 'seeded rule', majorSystems: ['action', 'decision'], realDecision: true as const };
}

it('reuses valid partial prototype builds and accepts non-button interaction contracts', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'prototype-builder-'));
  roots.push(runRoot);
  const custom = (control: string, marker: string) => `<!doctype html><main ${control}>${marker}</main><script>window.__PROTOTYPE_TEST__={resetGame(){},getState(){},act(){}}</script>`;
  for (const [slot, html] of [['a', custom('data-action="move"', 'KEEP-A')], ['b', custom('data-lantern="L1"', 'KEEP-B')]] as const) {
    await mkdir(path.join(runRoot, 'workspace', `prototype-${slot}`, 'dist'), { recursive: true });
    await writeFile(path.join(runRoot, 'workspace', `prototype-${slot}`, 'dist/index.html'), html);
  }
  const calls: string[] = [];
  const provider: CodexProvider = {
    async prototype({ slot }) { calls.push(slot); return { verificationMode: 'contract', metrics: { provider: 'test', model: 'test', calls: 1 } }; },
    async build() { throw new Error('not used'); },
    async fix() { throw new Error('not used'); },
  };
  const runtime = {} as RuntimeAdapter;
  const builder = new BuilderAgent(provider, runtime);
  const ideas = { schemaVersion: 1 as const, batch: 1, theme: 'yokai market', ideas: ['idea_a', 'idea_b', 'idea_c', 'idea_d', 'idea_e', 'idea_f'].map(idea) };
  const selection = { schemaVersion: 1 as const, batch: 1, decision: 'BUILD_3' as const, selectedIdeaIds: ['idea_a', 'idea_b', 'idea_c'], rationale: 'three distinct mechanics', constraints: ['placeholder art'] };

  const result = await builder.buildPrototypes(runRoot, ideas, selection);

  expect(calls).toEqual(['c']);
  expect(await readFile(path.join(runRoot, 'workspace/prototype-a/dist/index.html'), 'utf8')).toContain('KEEP-A');
  expect(await readFile(path.join(runRoot, 'workspace/prototype-b/dist/index.html'), 'utf8')).toContain('KEEP-B');
  expect(result.report.prototypes).toHaveLength(3);
});

it('rebuilds a partial prototype whose only QA controls are disabled', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'prototype-builder-'));
  roots.push(runRoot);
  const api = '<script>window.__PROTOTYPE_TEST__={resetGame(){},getState(){},act(){}}</script>';
  const partials = {
    a: `<!doctype html><button data-action="comfort" disabled>Comfort</button>${api}`,
    b: `<!doctype html><button data-action="focus">Focus</button>${api}`,
    c: `<!doctype html><button data-action="heat">Heat</button>${api}`,
  } as const;
  for (const [slot, html] of Object.entries(partials)) {
    await mkdir(path.join(runRoot, 'workspace', `prototype-${slot}`, 'dist'), { recursive: true });
    await writeFile(path.join(runRoot, 'workspace', `prototype-${slot}`, 'dist/index.html'), html);
  }
  const calls: string[] = [];
  const provider: CodexProvider = {
    async prototype({ workspace, slot }) {
      calls.push(slot);
      await writeFile(path.join(workspace, 'dist/index.html'), `<!doctype html><button data-action="work">Work</button>${api}`);
      return { verificationMode: 'contract', metrics: { provider: 'test', model: 'test', calls: 1 } };
    },
    async build() { throw new Error('not used'); },
    async fix() { throw new Error('not used'); },
  };
  const builder = new BuilderAgent(provider, {} as RuntimeAdapter);
  const ideas = { schemaVersion: 1 as const, batch: 1, theme: 'repair shop', ideas: ['idea_a', 'idea_b', 'idea_c', 'idea_d', 'idea_e', 'idea_f'].map(idea) };
  const selection = { schemaVersion: 1 as const, batch: 1, decision: 'BUILD_3' as const, selectedIdeaIds: ['idea_a', 'idea_b', 'idea_c'], rationale: 'three distinct mechanics', constraints: ['placeholder art'] };

  await builder.buildPrototypes(runRoot, ideas, selection);

  expect(calls).toEqual(['a']);
});
