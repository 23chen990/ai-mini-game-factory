import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildProductReadinessReport } from '../../src/core/product-readiness.js';
import { prepareReferenceDemo, runReferenceDemo } from '../../src/demo/reference-demo.js';
import { ReferenceFidelityContractSchema } from '../../src/schemas/reference-fidelity.js';

it('turns bound first-party requirements into a playable H5 while preserving independent acceptance gaps', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-reference-demo-'));
  try {
    const prepared = await prepareReferenceDemo({ root, repositoryRoot: process.cwd() });
    const report = await runReferenceDemo({ root, repositoryRoot: process.cwd(), runId: prepared.runId });
    expect(report).toMatchObject({ kind: 'first-party-engineering-fixture', llmExecuted: false, humanAccepted: false, engineeringPassed: true, stableResume: true, commercialReleaseReady: false });
    expect(report.transitions).toEqual(expect.arrayContaining(['cut', 'drop', 'obstacle-failure', 'retry', 'finish']));
    expect(report.remainingGaps).toEqual(expect.arrayContaining(['real-reference-analysis-unvalidated', 'independent-fidelity-review-required', 'human-experience-playtest-required', 'native-sdk-and-platform-qa-required']));
    const readiness = await buildProductReadinessReport({ runRoot: path.join(root, 'runs', prepared.runId), runId: prepared.runId });
    expect(readiness.dimensions.codeCorrectness.status).toBe('PASS');
    expect(readiness.dimensions.gameplayFidelity.status).toBe('BLOCKED');
    expect(readiness.dimensions.experienceQuality.status).toBe('NEEDS_HUMAN');
    const contract = ReferenceFidelityContractSchema.parse(JSON.parse(await readFile(path.join(root, 'runs', prepared.runId, 'artifacts/reference-fidelity-contract.json'), 'utf8')));
    expect(contract.behaviorChecks.map(check => check.comparison?.evidenceBasis)).toEqual(Array(5).fill('source-derived'));
    await expect(readFile(path.join(root, 'runs', prepared.runId, 'artifacts/reference-fidelity-review.json'))).rejects.toThrow();
    const qa = JSON.parse(await readFile(path.join(root, 'runs', prepared.runId, 'artifacts/qa-report.json'), 'utf8'));
    expect(qa.naturalFlow).toMatchObject({ seed: 1, device: { width: 390, height: 844 } });
    expect(qa.evidence.find((item: { mode: string }) => item.mode === 'STATE_COVERAGE').seed).toBe(42);
    const html = await readFile(path.join(root, 'runs', prepared.runId, report.playable), 'utf8');
    expect(html).toContain('Mooncut Trial');
    expect(report.wiredFiles).toEqual(expect.arrayContaining(['workspace/game/src/main.ts']));
    await expect(readFile(path.join(root, 'runs', prepared.runId, 'human/playtest-acceptance.json'))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
