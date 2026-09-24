import { afterEach, describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { sha256File, sha256Text } from '../../src/core/files.js';
import { hashActionFeelCandidateBuild, verifyActionFeelPlayerEvidence, type ActionFeelCandidateIdentity } from '../../src/core/action-feel-evidence.js';
import type { PerceptualQaReport, ProductExperienceContract } from '../../src/schemas/product-experience.js';

function png(width: number, height: number, pixels: Uint8Array) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Uint8Array) => {
    const typeBytes = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    let crcValue = 0xffffffff;
    for (const byte of Buffer.concat([typeBytes, Buffer.from(data)])) {
      crcValue ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crcValue = (crcValue >>> 1) ^ ((crcValue & 1) ? 0xedb88320 : 0);
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((crcValue ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 4 + 1);
    scanlines[offset] = 0;
    Buffer.from(pixels).copy(scanlines, offset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', new Uint8Array())]);
}

type Fixture = {
  runRoot: string;
  candidate: ActionFeelCandidateIdentity;
  naturalReport: Record<string, unknown>;
  perceptualReport: PerceptualQaReport;
  contract: ProductExperienceContract;
  trace: Record<string, unknown>;
};

async function fixture(): Promise<Fixture> {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'action-feel-evidence-'));
  const runId = path.basename(runRoot);
  const workspace = path.join(runRoot, 'workspace/feel-prototype-a');
  await mkdir(path.join(workspace, 'dist'), { recursive: true });
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
  await mkdir(path.join(runRoot, 'screenshots'), { recursive: true });
  await mkdir(path.join(runRoot, 'logs'), { recursive: true });
  await writeFile(path.join(workspace, 'dist/index.html'), '<!doctype html><title>feel</title>');
  await writeFile(path.join(workspace, 'dist/app.js'), 'document.body.textContent = "feel";');
  await writeFile(path.join(workspace, 'src/main.ts'), 'export const main = true;');
  const sourceBody = JSON.stringify({ kind: 'action-feel-evidence-fixture' });
  await writeFile(path.join(runRoot, 'artifacts/experience-contract.json'), sourceBody);
  const contract = buildProductExperienceContract({
    targetGame: 'demo',
    targetRunId: runId,
    targetWorkspace: workspace,
    runtime: 'web-lite',
    sourceArtifact: { kind: 'experience-contract', path: 'artifacts/experience-contract.json', sha256: sha256Text(sourceBody) },
    experiencePillars: [{ id: 'combo', name: 'combo object', observable: 'combo reward appears beside the resolved object' }],
    deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }],
  });
  const buildHash = await hashActionFeelCandidateBuild(workspace);
  const image = png(2, 2, new Uint8Array([24, 24, 24, 255, 240, 200, 80, 255, 24, 24, 24, 255, 255, 255, 255, 255]));
  const screenshotPaths = ['screenshots/action-A.png', 'screenshots/action-B.png'];
  await writeFile(path.join(runRoot, screenshotPaths[0]!), image);
  await writeFile(path.join(runRoot, screenshotPaths[1]!), image);
  const screenshotBindings = await Promise.all(screenshotPaths.map(async (screenshotPath) => ({ path: screenshotPath, sha256: await sha256File(path.join(runRoot, screenshotPath)) })));
  const feature = contract.features[0]!;
  const trace: Record<string, unknown> = {
    schemaVersion: 1,
    startedFromReset: true,
    actions: ['tap combo object', 'tap replay'],
    transitions: [{ name: feature.id, changed: true, evidence: feature.visibleSignal }],
    completion: 'settlement',
    replayObserved: true,
    forbiddenOperations: [],
    screenshots: screenshotPaths,
    passed: true,
    blockers: [],
    runner: 'QAAgent natural browser',
    buildHash,
    runtime: 'web-lite',
    device: feature.requiredViewports[0],
    seed: 1,
    observedAt: new Date(0).toISOString(),
  };
  const traceBody = `${JSON.stringify(trace)}\n`;
  await writeFile(path.join(runRoot, 'logs/action-feel-natural.json'), traceBody);
  const traceBinding = { path: 'logs/action-feel-natural.json', sha256: sha256Text(traceBody) };
  const candidate: ActionFeelCandidateIdentity = { slot: 'A', workspace, targetRunId: runId, targetGame: 'demo', experimentId: 'experiment-1' };
  const naturalReport = {
    schemaVersion: 1,
    targetRunId: runId,
    targetGame: 'demo',
    targetWorkspace: workspace,
    experimentId: candidate.experimentId,
    slot: candidate.slot,
    buildHash,
    trace: traceBinding,
    screenshots: screenshotBindings,
  };
  const contractHash = sha256Text(JSON.stringify(contract));
  const perceptualReport: PerceptualQaReport = {
    schemaVersion: 2,
    artifactType: 'perceptual-qa-report',
    targetGame: 'demo',
    targetRunId: runId,
    targetWorkspace: workspace,
    runtimeEntrypoints: contract.runtimeEntrypoints,
    contractHash,
    buildHash,
    runtime: 'web-lite',
    reviewer: 'QAAgent',
    authorIndependent: true,
    passed: true,
    blockers: [],
    cases: [{
      featureId: feature.id,
      sourceCheckIds: feature.sourceCheckIds,
      objectType: feature.objectType,
      stateBranch: feature.stateBranch,
      viewport: feature.requiredViewports[0]!,
      playerVisible: true,
      naturalTriggerVerified: true,
      eventOrderVerified: true,
      negativeAssertionsPassed: true,
      perceptualPassed: true,
      observedSignal: feature.visibleSignal,
      observedEventOrder: feature.expectedEventOrder,
      screenshots: screenshotBindings,
      trace: traceBinding,
      evidence: ['independent player-visible branch review'],
      notes: [],
    }],
    checkedAt: new Date(0).toISOString(),
  };
  return { runRoot, candidate, naturalReport, perceptualReport, contract, trace };
}

describe('action-feel candidate-bound evidence', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('accepts a fully bound natural and independent perceptual fixture', async () => {
    const input = await fixture();
    roots.push(input.runRoot);
    const result = await verifyActionFeelPlayerEvidence(input);
    expect(result.naturalPlay.passed).toBe(true);
    expect(result.perceptual.passed).toBe(true);
    expect(result.naturalPlay.targetRunId).toBe(input.candidate.targetRunId);
    expect(result.naturalPlay.targetWorkspace).toBe(input.candidate.workspace);
    expect(result.naturalPlay.experimentId).toBe(input.candidate.experimentId);
    expect(result.perceptual.authorIndependent).toBe(true);
  });

  it('fails closed for missing reports, forged identity and stale build bytes', async () => {
    const input = await fixture();
    roots.push(input.runRoot);
    const missing = await verifyActionFeelPlayerEvidence({ runRoot: input.runRoot, candidate: input.candidate });
    expect(missing.naturalPlay.passed).toBe(false);
    expect(missing.perceptual.passed).toBe(false);
    expect(missing.naturalPlay.blockers).toContain('natural:report-missing');
    expect(missing.perceptual.blockers).toContain('perceptual:contract-missing');

    const forged = structuredClone(input.naturalReport);
    forged.targetRunId = 'other-run';
    const forgedResult = await verifyActionFeelPlayerEvidence({ ...input, naturalReport: forged });
    expect(forgedResult.naturalPlay.passed).toBe(false);
    expect(forgedResult.naturalPlay.blockers).toContain('natural:run-mismatch');

    await writeFile(path.join(input.candidate.workspace, 'dist/app.js'), 'stale bytes changed after capture');
    const stale = await verifyActionFeelPlayerEvidence(input);
    expect(stale.naturalPlay.passed).toBe(false);
    expect(stale.perceptual.passed).toBe(false);
    expect(stale.naturalPlay.blockers).toContain('natural:build-hash-mismatch');
    expect(stale.perceptual.blockers).toContain('perceptual:build-hash-mismatch');
  });

  it('rejects missing captures, fixture traces, path escapes and wrong candidate workspaces', async () => {
    const input = await fixture();
    roots.push(input.runRoot);
    await rm(path.join(input.runRoot, 'screenshots/action-B.png'));
    const missingScreenshot = await verifyActionFeelPlayerEvidence(input);
    expect(missingScreenshot.naturalPlay.passed).toBe(false);
    expect(missingScreenshot.naturalPlay.blockers.some((blocker) => blocker.includes('screenshot'))).toBe(true);

    const fixtureInput = await fixture();
    roots.push(fixtureInput.runRoot);
    fixtureInput.trace.runner = 'deterministic fixture runner';
    const fixtureBody = `${JSON.stringify(fixtureInput.trace)}\n`;
    await writeFile(path.join(fixtureInput.runRoot, 'logs/action-feel-natural.json'), fixtureBody);
    (fixtureInput.naturalReport.trace as { sha256: string }).sha256 = sha256Text(fixtureBody);
    const fixtureResult = await verifyActionFeelPlayerEvidence(fixtureInput);
    expect(fixtureResult.naturalPlay.passed).toBe(false);
    expect(fixtureResult.naturalPlay.blockers).toContain('natural:fixture-runner');

    const escaped = await fixture();
    roots.push(escaped.runRoot);
    const escapedReport = structuredClone(escaped.naturalReport);
    escapedReport.screenshots = [{ path: '../outside.png', sha256: 'a'.repeat(64) }, ...(escapedReport.screenshots as Array<{ path: string; sha256: string }>).slice(1)];
    const escapedResult = await verifyActionFeelPlayerEvidence({ ...escaped, naturalReport: escapedReport });
    expect(escapedResult.naturalPlay.passed).toBe(false);
    expect(escapedResult.naturalPlay.blockers.some((blocker) => blocker.includes('path'))).toBe(true);

    const wrongWorkspace = await fixture();
    roots.push(wrongWorkspace.runRoot);
    const wrongCandidate = { ...wrongWorkspace.candidate, workspace: path.join(wrongWorkspace.runRoot, 'workspace/feel-prototype-b') };
    const wrongResult = await verifyActionFeelPlayerEvidence({ ...wrongWorkspace, candidate: wrongCandidate });
    expect(wrongResult.naturalPlay.passed).toBe(false);
    expect(wrongResult.perceptual.passed).toBe(false);
    expect(wrongResult.naturalPlay.blockers.some((blocker) => blocker.includes('workspace'))).toBe(true);
  });

  it('rejects a changed trace or screenshot byte even when the report hash is stale', async () => {
    const input = await fixture();
    roots.push(input.runRoot);
    await writeFile(path.join(input.runRoot, 'screenshots/action-A.png'), await readFile(path.join(input.runRoot, 'screenshots/action-A.png')).then((bytes) => Buffer.concat([bytes, Buffer.from('changed')])));
    const changedScreenshot = await verifyActionFeelPlayerEvidence(input);
    expect(changedScreenshot.naturalPlay.passed).toBe(false);
    expect(changedScreenshot.perceptual.passed).toBe(false);
    expect(changedScreenshot.naturalPlay.blockers).toContain('natural:screenshot-hash-mismatch');
    expect(changedScreenshot.perceptual.blockers.some((blocker) => blocker.includes('evidence'))).toBe(true);

    const changedTrace = await fixture();
    roots.push(changedTrace.runRoot);
    await writeFile(path.join(changedTrace.runRoot, 'logs/action-feel-natural.json'), `${JSON.stringify({ ...changedTrace.trace, actions: ['changed'] })}\n`);
    const changedTraceResult = await verifyActionFeelPlayerEvidence(changedTrace);
    expect(changedTraceResult.naturalPlay.passed).toBe(false);
    expect(changedTraceResult.naturalPlay.blockers).toContain('natural:trace-hash-mismatch');
  });
});
