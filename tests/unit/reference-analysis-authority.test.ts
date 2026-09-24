import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enforceRecordingAnalysisAuthority } from '../../src/core/reference-analysis-authority.js';
import { MockAgentProvider } from '../../src/providers/mock.js';
import { ReferenceBehaviorAnalysisSchema, ReferenceEvidencePackSchema, ReferenceFrameManifestSchema } from '../../src/schemas/index.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function syntheticMockAnalysis() {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-authority-'));
  roots.push(runRoot);
  await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
  const frames = Array.from({ length: 5 }, (_, index) => ({
    id: `frame-${index}`,
    index,
    requestedMs: index * 1_000,
    actualMs: index * 1_000,
    path: `reference-evidence/derived/frame-${index}.png`,
    sha256: String(index + 1).repeat(64),
    width: 1100,
    height: 720,
  }));
  const manifest = ReferenceFrameManifestSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-frame-manifest',
    targetRunId: 'run-authority',
    targetGame: '符刃夜行',
    workspace: path.join(runRoot, 'workspace/game'),
    source: {
      evidenceId: 'recording',
      path: 'reference-evidence/verified/reference.mp4',
      sha256: 'a'.repeat(64),
      mediaType: 'video/mp4',
      durationMs: 5_000,
      width: 1100,
      height: 720,
    },
    extraction: {
      version: 2,
      engine: 'injected-test-extractor',
      samplingFps: 1,
      maxFrames: 5,
      requestedFrameCount: 5,
      extractedFrameCount: 5,
    },
    frames,
    contactSheets: [],
    status: 'READY',
    blockers: [],
    extractedAt: new Date(0).toISOString(),
  });
  await writeFile(path.join(runRoot, 'artifacts/reference-frame-manifest.json'), JSON.stringify(manifest));
  const pack = ReferenceEvidencePackSchema.parse({
    schemaVersion: 1,
    targetRunId: 'run-authority',
    benchmark: { name: 'recording reference', url: 'https://example.com/reference' },
    sourceFiles: [{ path: manifest.source.path, sha256: manifest.source.sha256, observations: ['verified recording'] }],
    observations: ['verified recording'],
    inferences: [],
    unknowns: [],
    mechanicMap: {
      coreLoop: ['ready', 'tap', 'contact', 'settle'],
      playerActions: ['tap'],
      progressionSystems: ['course'],
      unlockRules: ['finish after course'],
      mustPreserveMechanics: ['tap changes flight'],
      feedbackCadence: { immediateSeconds: 0.1, microGoalMinSeconds: 1, microGoalMaxSeconds: 10 },
    },
    behaviorChecks: [],
    failurePressureContract: null,
    expressionBoundary: { allowed: ['mechanics'], forbidden: ['code', 'assets', 'names', 'UI', 'audio', 'tuning'] },
    similarityRedFlags: [],
    evidenceQuality: 'supplemented',
    status: 'READY',
    claims: [],
    researchedAt: new Date(0).toISOString(),
  });
  const result = await new MockAgentProvider().analyzeReferenceEvidence(pack, {
    runRoot,
    outputPath: path.join(runRoot, 'artifacts/reference-behavior-analysis.json'),
    logDir: path.join(runRoot, 'logs'),
    inputPaths: ['artifacts/reference-frame-manifest.json'],
  });
  return { analysis: ReferenceBehaviorAnalysisSchema.parse(result.value), provider: result.metrics.provider };
}

describe('recording research authority gate', () => {
  it('blocks synthetic mock reconstruction from becoming a Builder contract by default', async () => {
    const { analysis, provider } = await syntheticMockAnalysis();
    expect(analysis.status).toBe('READY');
    expect(analysis.levelReconstruction?.status).toBe('READY');

    const enforced = enforceRecordingAnalysisAuthority({ analysis, provider, recordingDeclared: true });

    expect(enforced.status).toBe('BLOCKED');
    expect(enforced.unknowns).toContain('recording-level:non-authoritative-provider:mock');
    expect(enforced.levelReconstruction).toMatchObject({
      status: 'BLOCKED',
      blockers: expect.arrayContaining(['recording-level:non-authoritative-provider:mock']),
    });
  });

  it('permits synthetic reconstruction only through an explicit code-level test override', async () => {
    const { analysis, provider } = await syntheticMockAnalysis();
    const enforced = enforceRecordingAnalysisAuthority({ analysis, provider, recordingDeclared: true, allowSyntheticForTests: true });
    expect(enforced).toEqual(analysis);
  });
});
