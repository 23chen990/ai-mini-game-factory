import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { sha256File, sha256Text } from '../../src/core/files.js';
import { hashActionFeelCandidateBuild } from '../../src/core/action-feel-evidence.js';
import type { PerceptualQaReport } from '../../src/schemas/product-experience.js';
import { createFactory } from '../../src/factory.js';

const roots: string[] = [];

async function hashTree(root: string): Promise<string> {
  const entries: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else entries.push(`${path.relative(root, file)}:${createHash('sha256').update(await readFile(file)).digest('hex')}`);
    }
  };
  await walk(root);
  return createHash('sha256').update(entries.sort().join('\n')).digest('hex');
}

async function refreshArtifactLedgerHash(runRoot: string, artifactPath: string) {
  const ledgerPath = path.join(runRoot, 'artifacts/artifact-ledger.json');
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) as { entries: Array<{ path: string; sha256: string }> };
  const entry = ledger.entries.find((item) => item.path === artifactPath);
  if (!entry) throw new Error(`missing artifact-ledger entry for ${artifactPath}`);
  entry.sha256 = await sha256File(path.join(runRoot, artifactPath));
  await writeFile(ledgerPath, `${JSON.stringify(ledger)}\n`);
}

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

async function writeCandidateEvidence(runRoot: string, runId: string, targetGame: string, includePerceptual: boolean) {
  const workspace = path.join(runRoot, 'workspace/feel-prototype-b');
  const sourcePath = path.join(runRoot, 'artifacts/experience-contract.json');
  const sourceBody = await readFile(sourcePath, 'utf8');
  const contract = buildProductExperienceContract({
    targetGame,
    targetRunId: runId,
    targetWorkspace: workspace,
    runtime: 'web-lite',
    sourceArtifact: { kind: 'experience-contract', path: 'artifacts/experience-contract.json', sha256: sha256Text(sourceBody) },
    experiencePillars: [{ id: 'action-feel-primary', name: 'action-feel primary object', observable: 'the resolved object and its consequence remain visible' }],
    deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }],
  });
  const buildHash = await hashActionFeelCandidateBuild(workspace);
  await mkdir(path.join(runRoot, 'screenshots'), { recursive: true });
  await mkdir(path.join(runRoot, 'logs'), { recursive: true });
  const image = png(2, 2, new Uint8Array([24, 24, 24, 255, 240, 200, 80, 255, 24, 24, 24, 255, 255, 255, 255]));
  const screenshotPaths = ['screenshots/action-A.png', 'screenshots/action-B.png'];
  await Promise.all(screenshotPaths.map((screenshotPath) => writeFile(path.join(runRoot, screenshotPath), image)));
  const screenshotBindings = await Promise.all(screenshotPaths.map(async (screenshotPath) => ({ path: screenshotPath, sha256: await sha256File(path.join(runRoot, screenshotPath)) })));
  const feature = contract.features[0]!;
  const trace = {
    schemaVersion: 1,
    startedFromReset: true,
    actions: ['tap primary object', 'tap replay'],
    transitions: [{ name: feature.id, changed: true, evidence: feature.visibleSignal }],
    completion: 'settlement' as const,
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
  await writeFile(path.join(runRoot, 'artifacts/action-feel-natural-flow.json'), `${JSON.stringify({
    schemaVersion: 1,
    targetRunId: runId,
    targetGame,
    targetWorkspace: workspace,
    experimentId: 'feel-' + runId,
    slot: 'B',
    buildHash,
    trace: traceBinding,
    screenshots: screenshotBindings,
  })}\n`);
  if (!includePerceptual) return { buildHash };
  const contractHash = sha256Text(JSON.stringify(contract));
  const perceptualReport: PerceptualQaReport = {
    schemaVersion: 2,
    artifactType: 'perceptual-qa-report',
    targetGame,
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
  await writeFile(path.join(runRoot, 'artifacts/action-feel-product-experience-contract.json'), `${JSON.stringify(contract)}\n`);
  await writeFile(path.join(runRoot, 'artifacts/action-feel-perceptual-qa.json'), `${JSON.stringify({ contract, report: perceptualReport })}\n`);
  return { buildHash };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('action-feel independent evidence pause', () => {
  it('keeps an unchanged missing-evidence wait idempotent across repeated resume', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-action-feel-evidence-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, `title: 独立回归样本
theme: 原创单指切割平台训练
template: cut-stack-dodge-v1
designMode: reference_reskin
referenceMechanics:
  schemaVersion: 1
  lockedBy: human
  source: { name: Synthetic test source, url: https://example.com/reference, researchFiles: [input/reference-report.txt] }
  coreLoop: [ready, tap, contact, terminal]
  playerActions: [tap]
  progressionSystems: [checkpoints]
  unlockRules: [finish prior checkpoint]
  feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 2, microGoalMaxSeconds: 20 }
  mustPreserveMechanics: [tap to flip]
  adaptableMechanics: [original expression]
  expressionIsolation:
    originalCode: true
    originalAssets: true
    originalNamesAndText: true
    originalUiLayout: true
    originalAudio: true
    originalTuningValues: true
`);
    const factory = createFactory({
      root,
      mode: 'mock',
      qaMode: 'stub',
      validationMode: 'fast',
      operatingProfile: { pipelineMode: 'full-validation' },
      enforceOperatingGates: false,
      enforceStageContracts: false,
      enforceExplicitStageContracts: false,
      allowSyntheticReferenceAnalysisForTests: true,
    });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    await writeFile(path.join(runRoot, 'input/reference-report.txt'), 'Observed loop: ready, tap, contact, terminal, replay.\n');
    expect(await factory.run(runId)).toMatchObject({ stage: 'WAITING_FOR_REFERENCE_APPROVAL', status: 'waiting' });
    await factory.approveReference(runId, { decision: 'APPROVE', notes: 'Synthetic evidence lock.' });

    const first = await factory.resume(runId);
    expect(first).toMatchObject({ stage: 'NATURAL_PLAY_QA', status: 'waiting' });
    expect(first.stages.NATURAL_PLAY_QA?.attempts).toBe(1);
    expect(first.stages.FULL_BUILD).toBeUndefined();
    expect(first.stages.ART_DIRECTIONS).toBeUndefined();
    expect(first.stages.FIX).toBeUndefined();
    const initialFixAttempts = first.fixAttempts;
    const initialBuildHashes = await Promise.all(['a', 'b', 'c'].map((slot) => hashTree(path.join(runRoot, `workspace/feel-prototype-${slot}/dist`))));
    const naturalEvidencePath = path.join(runRoot, 'artifacts/natural-play-qa.json');
    const initialNaturalEvidenceHash = createHash('sha256').update(await readFile(naturalEvidencePath)).digest('hex');

    for (let index = 0; index < 3; index += 1) {
      const resumed = await factory.resume(runId);
      expect(resumed).toMatchObject({ stage: 'NATURAL_PLAY_QA', status: 'waiting' });
      expect(resumed.stages.NATURAL_PLAY_QA?.attempts).toBe(1);
      expect(resumed.fixAttempts).toBe(initialFixAttempts);
      expect(resumed.stages.FULL_BUILD).toBeUndefined();
      expect(resumed.stages.ART_DIRECTIONS).toBeUndefined();
      expect(resumed.stages.FIX).toBeUndefined();
      expect(await Promise.all(['a', 'b', 'c'].map((slot) => hashTree(path.join(runRoot, `workspace/feel-prototype-${slot}/dist`))))).toEqual(initialBuildHashes);
      expect(createHash('sha256').update(await readFile(naturalEvidencePath)).digest('hex')).toBe(initialNaturalEvidenceHash);
    }
  }, 30_000);

  it('recovers a missing-perceptual FEEL_REPAIR pause after valid candidate evidence arrives', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-action-feel-recovery-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, `title: FEEL evidence recovery sample
theme: original action feedback recovery
template: cut-stack-dodge-v1
designMode: reference_reskin
referenceMechanics:
  schemaVersion: 1
  lockedBy: human
  source: { name: Synthetic test source, url: https://example.com/reference, researchFiles: [input/reference-report.txt] }
  coreLoop: [ready, tap, contact, terminal]
  playerActions: [tap]
  progressionSystems: [checkpoints]
  unlockRules: [finish prior checkpoint]
  feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 2, microGoalMaxSeconds: 20 }
  mustPreserveMechanics: [tap to flip]
  adaptableMechanics: [original expression]
  expressionIsolation:
    originalCode: true
    originalAssets: true
    originalNamesAndText: true
    originalUiLayout: true
    originalAudio: true
    originalTuningValues: true
`);
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', validationMode: 'fast', operatingProfile: { pipelineMode: 'full-validation' }, enforceOperatingGates: false, enforceStageContracts: false, enforceExplicitStageContracts: false, allowSyntheticReferenceAnalysisForTests: true });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    await writeFile(path.join(runRoot, 'input/reference-report.txt'), 'Observed loop: ready, tap, contact, terminal, replay.\n');
    await factory.run(runId);
    await factory.approveReference(runId, { decision: 'APPROVE', notes: 'Synthetic evidence lock.' });
    const first = await factory.resume(runId);
    expect(first.stage).toBe('NATURAL_PLAY_QA');
    const engineeringBindingPath = path.join(runRoot, 'artifacts/action-feel-engineering-build-hashes.json');
    const engineeringReportPath = path.join(runRoot, 'artifacts/action-feel-natural-play-qa.json');
    const engineeringBinding = JSON.parse(await readFile(engineeringBindingPath, 'utf8')) as { engineeringReport?: { path?: string; sha256?: string } };
    expect(engineeringBinding.engineeringReport?.path).toBe('artifacts/action-feel-natural-play-qa.json');
    expect(engineeringBinding.engineeringReport?.sha256).toBe(await sha256File(engineeringReportPath));
    const targetGame = 'FEEL evidence recovery sample';
    await writeCandidateEvidence(runRoot, runId, targetGame, false);
    const repairPause = await factory.resume(runId);
    expect(repairPause.stage).toBe('FEEL_REPAIR');
    expect(repairPause.status).toBe('waiting');
    expect(repairPause.stages.FEEL_REPAIR?.attempts).toBe(0);
    expect(repairPause.fixAttempts).toBe(0);
    const priorReview = JSON.parse(await readFile(path.join(runRoot, 'artifacts/experience-review.json'), 'utf8')) as { decision?: string };
    expect(priorReview.decision).toBe('FEEL_REPAIR_REQUIRED');
    const candidateHashes = await Promise.all(['a', 'b', 'c'].map((slot) => hashTree(path.join(runRoot, `workspace/feel-prototype-${slot}/dist`))));

    await writeCandidateEvidence(runRoot, runId, targetGame, true);
    const recovered = await factory.resume(runId);
    expect(recovered.stage).toBe('WAITING_FOR_ART_APPROVAL');
    expect(recovered.status).toBe('waiting');
    expect(recovered.stages.NATURAL_PLAY_QA?.attempts).toBe(1);
    expect(recovered.stages.FEEL_REPAIR?.attempts).toBe(0);
    expect(recovered.fixAttempts).toBe(0);
    const currentReview = JSON.parse(await readFile(path.join(runRoot, 'artifacts/experience-review.json'), 'utf8')) as { decision?: string };
    expect(currentReview.decision).toBe('APPROVED');
    const preservedReview = JSON.parse(await readFile(path.join(runRoot, 'artifacts/experience-review.prior-failed.json'), 'utf8')) as { decision?: string };
    expect(preservedReview.decision).toBe('FEEL_REPAIR_REQUIRED');
    expect(await Promise.all(['a', 'b', 'c'].map((slot) => hashTree(path.join(runRoot, `workspace/feel-prototype-${slot}/dist`))))).toEqual(candidateHashes);

    // Revalidate the completed profile twice through the human gate. Removing
    // the art approval before FEEL_REPAIR recovery keeps each cycle at the
    // approval pause while the perceptual report is restored.
    const perceptualPath = path.join(runRoot, 'artifacts/action-feel-perceptual-qa.json');
    const perceptualBody = await readFile(perceptualPath, 'utf8');
    const artApprovalPath = path.join(runRoot, 'human/art-approval.yaml');
    const artApprovalExamplePath = path.join(runRoot, 'human/art-approval.example.yaml');
    const reviewAttemptsBeforeCycles = recovered.stages.EXPERIENCE_REVIEW?.attempts;
    const naturalAttemptsBeforeCycles = recovered.stages.NATURAL_PLAY_QA?.attempts;
    const feelRepairAttemptsBeforeCycles = recovered.stages.FEEL_REPAIR?.attempts;
    const fixAttemptsBeforeCycles = recovered.fixAttempts;

    await rm(perceptualPath);
    await writeFile(artApprovalPath, await readFile(artApprovalExamplePath));
    const firstMissingPerceptual = await factory.resume(runId);
    expect(firstMissingPerceptual.stage).toBe('FEEL_REPAIR');
    expect(firstMissingPerceptual.status).toBe('waiting');
    expect(firstMissingPerceptual.stages.FEEL_REPAIR?.evidence).toContain('blocked:action-feel-perceptual-evidence');
    expect(firstMissingPerceptual.stages.EXPERIENCE_REVIEW?.attempts).toBe(reviewAttemptsBeforeCycles);
    expect(firstMissingPerceptual.stages.NATURAL_PLAY_QA?.attempts).toBe(naturalAttemptsBeforeCycles);
    expect(firstMissingPerceptual.stages.FEEL_REPAIR?.attempts).toBe(feelRepairAttemptsBeforeCycles);
    expect(firstMissingPerceptual.fixAttempts).toBe(fixAttemptsBeforeCycles);

    await rm(artApprovalPath);
    await writeFile(perceptualPath, perceptualBody);
    const firstRestoredPerceptual = await factory.resume(runId);
    expect(firstRestoredPerceptual.stage).toBe('WAITING_FOR_ART_APPROVAL');
    expect(firstRestoredPerceptual.status).toBe('waiting');
    expect(firstRestoredPerceptual.stages.EXPERIENCE_REVIEW?.attempts).toBe(reviewAttemptsBeforeCycles);
    expect(firstRestoredPerceptual.stages.NATURAL_PLAY_QA?.attempts).toBe(naturalAttemptsBeforeCycles);
    expect(firstRestoredPerceptual.stages.FEEL_REPAIR?.attempts).toBe(feelRepairAttemptsBeforeCycles);
    expect(firstRestoredPerceptual.fixAttempts).toBe(fixAttemptsBeforeCycles);

    await rm(perceptualPath);
    await writeFile(artApprovalPath, await readFile(artApprovalExamplePath));
    const secondMissingPerceptual = await factory.resume(runId);
    expect(secondMissingPerceptual.stage).toBe('FEEL_REPAIR');
    expect(secondMissingPerceptual.status).toBe('waiting');
    expect(secondMissingPerceptual.stages.FEEL_REPAIR?.evidence).toContain('blocked:action-feel-perceptual-evidence');
    expect(secondMissingPerceptual.stages.EXPERIENCE_REVIEW?.attempts).toBe(reviewAttemptsBeforeCycles);
    expect(secondMissingPerceptual.stages.NATURAL_PLAY_QA?.attempts).toBe(naturalAttemptsBeforeCycles);
    expect(secondMissingPerceptual.stages.FEEL_REPAIR?.attempts).toBe(feelRepairAttemptsBeforeCycles);
    expect(secondMissingPerceptual.fixAttempts).toBe(fixAttemptsBeforeCycles);

    await rm(artApprovalPath);
    await writeFile(perceptualPath, perceptualBody);
    const secondRestoredPerceptual = await factory.resume(runId);
    expect(secondRestoredPerceptual.stage).toBe('WAITING_FOR_ART_APPROVAL');
    expect(secondRestoredPerceptual.status).toBe('waiting');
    expect(secondRestoredPerceptual.stages.EXPERIENCE_REVIEW?.attempts).toBe(reviewAttemptsBeforeCycles);
    expect(secondRestoredPerceptual.stages.NATURAL_PLAY_QA?.attempts).toBe(naturalAttemptsBeforeCycles);
    expect(secondRestoredPerceptual.stages.FEEL_REPAIR?.attempts).toBe(feelRepairAttemptsBeforeCycles);
    expect(secondRestoredPerceptual.fixAttempts).toBe(fixAttemptsBeforeCycles);

    const staleCandidateEntrypoint = path.join(runRoot, 'workspace/feel-prototype-b/dist/index.html');
    const originalCandidateEntrypoint = await readFile(staleCandidateEntrypoint, 'utf8');
    await writeFile(staleCandidateEntrypoint, `${originalCandidateEntrypoint}stale-engineering-build`);
    await writeCandidateEvidence(runRoot, runId, targetGame, true);
    await writeFile(path.join(runRoot, 'human/art-approval.yaml'), await readFile(path.join(runRoot, 'human/art-approval.example.yaml')));
    const staleEngineering = await factory.resume(runId);
    expect(staleEngineering.stage).toBe('NATURAL_PLAY_QA');
    expect(staleEngineering.status).toBe('waiting');
    expect(staleEngineering.stages.ART_DIRECTIONS?.status).toBe('completed');
    expect(staleEngineering.stages.FULL_BUILD).toBeUndefined();
    expect(staleEngineering.stages.NATURAL_PLAY_QA?.evidence).toContain('blocked:action-feel-engineering-build-hash-mismatch');

    // Restore the candidate before the following stale-report checks so that
    // each assertion isolates the evidence it intends to invalidate.
    await writeFile(staleCandidateEntrypoint, originalCandidateEntrypoint);
    await writeCandidateEvidence(runRoot, runId, targetGame, true);
    const originalEngineeringReport = await readFile(engineeringReportPath, 'utf8');
    await writeFile(engineeringReportPath, `${originalEngineeringReport} `);
    await refreshArtifactLedgerHash(runRoot, 'artifacts/action-feel-natural-play-qa.json');
    const staleEngineeringReport = await factory.resume(runId);
    expect(staleEngineeringReport.stage).toBe('NATURAL_PLAY_QA');
    expect(staleEngineeringReport.status).toBe('waiting');
    expect(staleEngineeringReport.stages.NATURAL_PLAY_QA?.evidence).toContain('blocked:action-feel-engineering-build-hash-mismatch');

    await writeFile(engineeringReportPath, originalEngineeringReport);
    await refreshArtifactLedgerHash(runRoot, 'artifacts/action-feel-natural-play-qa.json');
    await writeCandidateEvidence(runRoot, runId, targetGame, true);

    const naturalTracePath = path.join(runRoot, 'logs/action-feel-natural.json');
    await writeFile(naturalTracePath, `${await readFile(naturalTracePath, 'utf8')}stale-byte`);
    await writeFile(path.join(runRoot, 'human/art-approval.yaml'), await readFile(path.join(runRoot, 'human/art-approval.example.yaml')));
    const invalidated = await factory.resume(runId);
    expect(invalidated.stage).toBe('NATURAL_PLAY_QA');
    expect(invalidated.status).toBe('waiting');
    expect(invalidated.stages.ART_DIRECTIONS?.status).toBe('completed');
    expect(invalidated.stages.FULL_BUILD).toBeUndefined();
    expect(invalidated.fixAttempts).toBe(0);
    expect(invalidated.stages.NATURAL_PLAY_QA?.evidence).toContain('blocked:natural:trace-hash-mismatch');
  }, 30_000);

  it('keeps an unchanged threshold failure repair-required without a generic rebuild attempt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-action-feel-threshold-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, `title: FEEL threshold recovery sample
theme: original action threshold recovery
template: cut-stack-dodge-v1
designMode: reference_reskin
referenceMechanics:
  schemaVersion: 1
  lockedBy: human
  source: { name: Synthetic test source, url: https://example.com/reference, researchFiles: [input/reference-report.txt] }
  coreLoop: [ready, tap, contact, terminal]
  playerActions: [tap]
  progressionSystems: [checkpoints]
  unlockRules: [finish prior checkpoint]
  feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 2, microGoalMaxSeconds: 20 }
  mustPreserveMechanics: [tap to flip]
  adaptableMechanics: [original expression]
  expressionIsolation:
    originalCode: true
    originalAssets: true
    originalNamesAndText: true
    originalUiLayout: true
    originalAudio: true
    originalTuningValues: true
`);
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', validationMode: 'fast', operatingProfile: { pipelineMode: 'full-validation' }, enforceOperatingGates: false, enforceStageContracts: false, enforceExplicitStageContracts: false, allowSyntheticReferenceAnalysisForTests: true });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    await writeFile(path.join(runRoot, 'input/reference-report.txt'), 'Observed loop: ready, tap, contact, terminal, replay.\n');
    await factory.run(runId);
    await factory.approveReference(runId, { decision: 'APPROVE', notes: 'Synthetic evidence lock.' });
    await factory.resume(runId);
    const targetGame = 'FEEL threshold recovery sample';
    await writeCandidateEvidence(runRoot, runId, targetGame, false);
    const initialRepairPause = await factory.resume(runId);
    expect(initialRepairPause.stage).toBe('FEEL_REPAIR');
    const playtestPath = path.join(runRoot, 'artifacts/action-feel-natural-play-qa.json');
    const playtest = JSON.parse(await readFile(playtestPath, 'utf8')) as { results: Array<{ inputResponseMs: { passed: boolean } }> };
    playtest.results[0]!.inputResponseMs.passed = false;
    await writeFile(playtestPath, `${JSON.stringify(playtest)}\n`);
    const engineeringBindingPath = path.join(runRoot, 'artifacts/action-feel-engineering-build-hashes.json');
    const engineeringBinding = JSON.parse(await readFile(engineeringBindingPath, 'utf8')) as { engineeringReport: { sha256: string } };
    engineeringBinding.engineeringReport.sha256 = await sha256File(playtestPath);
    await writeFile(engineeringBindingPath, `${JSON.stringify(engineeringBinding)}\n`);
    await refreshArtifactLedgerHash(runRoot, 'artifacts/action-feel-natural-play-qa.json');
    await refreshArtifactLedgerHash(runRoot, 'artifacts/action-feel-engineering-build-hashes.json');
    await writeCandidateEvidence(runRoot, runId, targetGame, true);
    const thresholdPause = await factory.resume(runId);
    expect(thresholdPause.stage).toBe('FEEL_REPAIR');
    expect(thresholdPause.status).toBe('waiting');
    expect(thresholdPause.stages.FEEL_REPAIR?.attempts).toBe(0);
    expect(thresholdPause.fixAttempts).toBe(0);
    const triagePath = path.join(runRoot, 'artifacts/profile-repair-triage.json');
    const triage = JSON.parse(await readFile(triagePath, 'utf8')) as { repairHypothesis?: string };
    expect(triage.repairHypothesis).toMatch(/deterministic|changed candidate|natural-input/i);
    const triageHash = createHash('sha256').update(await readFile(triagePath)).digest('hex');
    const candidateHashes = await Promise.all(['a', 'b', 'c'].map((slot) => hashTree(path.join(runRoot, `workspace/feel-prototype-${slot}/dist`))));
    const repeated = await factory.resume(runId);
    expect(repeated.stage).toBe('FEEL_REPAIR');
    expect(repeated.stages.FEEL_REPAIR?.attempts).toBe(0);
    expect(repeated.fixAttempts).toBe(0);
    expect(createHash('sha256').update(await readFile(triagePath)).digest('hex')).toBe(triageHash);
    expect(await Promise.all(['a', 'b', 'c'].map((slot) => hashTree(path.join(runRoot, `workspace/feel-prototype-${slot}/dist`))))).toEqual(candidateHashes);
    expect(repeated.stages.ART_DIRECTIONS).toBeUndefined();
    expect(repeated.stages.FULL_BUILD).toBeUndefined();
  }, 30_000);
});
