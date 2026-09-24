import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { verifyPerceptualQaReview } from '../../src/core/product-experience-qa.js';
import { sha256Text } from '../../src/core/files.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'product-qa-'));
  roots.push(runRoot);
  const workspace = path.join(runRoot, 'workspace/game');
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
  await mkdir(path.join(runRoot, 'screenshots'), { recursive: true });
  await mkdir(path.join(runRoot, 'logs'), { recursive: true });
  await writeFile(path.join(workspace, 'src/main.ts'), 'runtime entry');
  const sourceBody = JSON.stringify({ contract: 'source' });
  await writeFile(path.join(runRoot, 'artifacts/experience-contract.json'), sourceBody);
  const contract = buildProductExperienceContract({
    targetGame: 'demo', targetRunId: 'run-1', targetWorkspace: workspace, runtime: 'web-lite',
    sourceArtifact: { kind: 'experience-contract', path: 'artifacts/experience-contract.json', sha256: sha256Text(sourceBody) },
    experiencePillars: [{ id: 'combo', name: 'combo object', observable: 'reward stays beside the resolved object' }],
    deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }],
  });
  const feature = contract.features[0]!;
  const buildHash = sha256Text('build');
  const screenshotBody = 'synthetic screenshot bytes';
  const screenshot = { path: 'screenshots/combo.png', sha256: sha256Text(screenshotBody) };
  await writeFile(path.join(runRoot, screenshot.path), screenshotBody);
  const flow = {
    schemaVersion: 1, startedFromReset: true, actions: ['tap object', 'tap replay'],
    transitions: [{ name: feature.id, changed: true, evidence: feature.visibleSignal }], completion: 'settlement' as const,
    replayObserved: true, forbiddenOperations: [] as string[], screenshots: [screenshot.path], passed: true, blockers: [] as string[],
    buildHash, runtime: 'web-lite', device: feature.requiredViewports[0], seed: 1, runner: 'qa-test', observedAt: new Date(0).toISOString(),
  };
  const traceBody = JSON.stringify(flow);
  const trace = { path: 'logs/combo.json', sha256: sha256Text(traceBody) };
  await writeFile(path.join(runRoot, trace.path), traceBody);
  const report = {
    schemaVersion: 2 as const, artifactType: 'perceptual-qa-report' as const, targetGame: 'demo', targetRunId: 'run-1',
    targetWorkspace: workspace, runtimeEntrypoints: contract.runtimeEntrypoints, contractHash: sha256Text(JSON.stringify(contract)),
    buildHash, runtime: 'web-lite', reviewer: 'QAAgent' as 'QAAgent' | 'DeterministicCapture', authorIndependent: true,
    passed: true, blockers: [] as string[], checkedAt: new Date(0).toISOString(), cases: [{
      featureId: feature.id, sourceCheckIds: feature.sourceCheckIds, objectType: feature.objectType, stateBranch: feature.stateBranch,
      viewport: feature.requiredViewports[0]!, playerVisible: true, naturalTriggerVerified: true, eventOrderVerified: true,
      negativeAssertionsPassed: true, perceptualPassed: true, observedSignal: feature.visibleSignal,
      observedEventOrder: feature.expectedEventOrder, screenshots: [screenshot], trace, evidence: ['independent pixel review'], notes: [] as string[],
    }],
  };
  return { runRoot, workspace, contract, buildHash, report, flow };
}

describe('perceptual QA evidence verification', () => {
  it('accepts exact independently reviewed branch evidence bound to files and build', async () => {
    expect((await verifyPerceptualQaReview(await fixture())).passed).toBe(true);
  });

  it.each(['stale-build', 'wrong-branch', 'wrong-viewport', 'self-review', 'changed-image', 'fixture-trace', 'missing-transition'])('blocks %s', async (failure) => {
    const input = await fixture();
    const row = input.report.cases[0]!;
    if (failure === 'stale-build') input.report.buildHash = sha256Text('old');
    if (failure === 'wrong-branch') row.stateBranch = 'sibling branch';
    if (failure === 'wrong-viewport') row.viewport = { width: 1280, height: 900, label: 'desktop' };
    if (failure === 'self-review') { input.report.reviewer = 'DeterministicCapture'; input.report.authorIndependent = false; input.report.passed = false; input.report.blockers = ['perceptual:independent-review-required']; }
    if (failure === 'changed-image') await writeFile(path.join(input.runRoot, row.screenshots[0]!.path), 'changed');
    if (failure === 'fixture-trace' || failure === 'missing-transition') {
      if (failure === 'fixture-trace') input.flow.forbiddenOperations.push('setState');
      if (failure === 'missing-transition') input.flow.transitions = [];
      const body = JSON.stringify(input.flow);
      await writeFile(path.join(input.runRoot, row.trace.path), body);
      row.trace.sha256 = sha256Text(body);
    }
    expect((await verifyPerceptualQaReview(input)).passed).toBe(false);
  });
});
