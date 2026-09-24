import { describe, expect, it } from 'vitest';
import { applyReferenceBehaviorAnalysis, normalizeReferenceBehaviorAnalysis } from '../../src/core/reference-evidence.js';
import { ReferenceBehaviorAnalysisSchema, ReferenceEvidencePackSchema } from '../../src/schemas/reference-evidence.js';
import { sha256Text } from '../../src/core/files.js';
import { referenceBehaviorChecks, referenceFailurePressureContract } from '../fixtures/reference-behavior.js';

const source = { path: 'reference-evidence/verified/reference.txt', sha256: sha256Text('reference'), observations: ['observed loop'] };
const pack = ReferenceEvidencePackSchema.parse({
  schemaVersion: 1, targetRunId: 'run-1', benchmark: { name: 'Reference', url: 'https://example.com/reference' },
  sourceFiles: [source], observations: ['observed loop'], inferences: [], unknowns: [],
  mechanicMap: { coreLoop: ['observe', 'act', 'resolve', 'replay'], playerActions: ['tap'], progressionSystems: ['levels'], unlockRules: ['finish previous'], mustPreserveMechanics: ['causal resolution'], feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 60 } },
  behaviorChecks: [], expressionBoundary: { allowed: ['generic mechanics'], forbidden: ['code', 'assets', 'names', 'UI', 'audio', 'tuning'] },
  similarityRedFlags: [], evidenceQuality: 'supplemented', status: 'READY', claims: [], researchedAt: new Date(0).toISOString(),
});

describe('reference behavior analysis', () => {
  it('rejects READY analysis that omits a required behavior dimension', () => {
    expect(() => ReferenceBehaviorAnalysisSchema.parse({
      schemaVersion: 1, targetRunId: 'run-1', behaviorChecks: referenceBehaviorChecks(source).slice(0, 1),
      observations: ['one branch'], inferences: [], unknowns: [], status: 'READY',
    })).toThrow(/dimension/i);
  });

  it('merges source-bound checks while preserving the locked mechanic and expression fields', () => {
    const analysis = ReferenceBehaviorAnalysisSchema.parse({
      schemaVersion: 1, targetRunId: 'run-1', behaviorChecks: referenceBehaviorChecks(source),
      observations: ['exact branch behavior analyzed'], inferences: [], unknowns: [],
      failurePressureContract: referenceFailurePressureContract(source), status: 'READY',
    });
    const merged = applyReferenceBehaviorAnalysis(pack, analysis);
    expect(merged.behaviorChecks).toHaveLength(5);
    expect(merged.mechanicMap).toEqual(pack.mechanicMap);
    expect(merged.expressionBoundary).toEqual(pack.expressionBoundary);
    expect(merged.sourceFiles).toEqual(pack.sourceFiles);
    expect(merged.failurePressureContract?.rules[0]?.recovery).toMatch(/retry/i);
    expect(merged.status).toBe('READY');
  });

  it('retires only control-plane-resolved unknowns when a recovery is repeated', () => {
    const analysis = ReferenceBehaviorAnalysisSchema.parse({
      schemaVersion: 1, targetRunId: 'run-1', behaviorChecks: referenceBehaviorChecks(source),
      observations: ['exact branch behavior analyzed'], inferences: [], unknowns: [],
      failurePressureContract: referenceFailurePressureContract(source), status: 'READY',
    });
    const stalePack = ReferenceEvidencePackSchema.parse({
      ...pack,
      unknowns: ['manifest excerpt was truncated', 'unrelated base evidence gap'],
      status: 'BLOCKED',
    });
    const partiallyRecovered = applyReferenceBehaviorAnalysis(stalePack, analysis, { retiredUnknowns: ['manifest excerpt was truncated'] });
    expect(partiallyRecovered.unknowns).toEqual(['unrelated base evidence gap']);
    expect(partiallyRecovered.status).toBe('BLOCKED');

    const recovered = applyReferenceBehaviorAnalysis(
      ReferenceEvidencePackSchema.parse({ ...stalePack, unknowns: ['manifest excerpt was truncated'] }),
      analysis,
      { retiredUnknowns: ['manifest excerpt was truncated'] },
    );
    expect(recovered.unknowns).toEqual([]);
    expect(recovered.status).toBe('READY');
  });

  it('rejects a pressure contract that cites evidence outside the target run', () => {
    const pressure = referenceFailurePressureContract(source);
    pressure.evidence[0]!.sourceRefs = ['reference-evidence/verified/other-recording.mp4'];
    expect(() => applyReferenceBehaviorAnalysis(pack, {
      schemaVersion: 1, targetRunId: 'run-1', behaviorChecks: referenceBehaviorChecks(source),
      observations: ['analysis'], inferences: [], unknowns: [], failurePressureContract: pressure, status: 'READY',
    })).toThrow(/pressure.*unbound/i);
  });

  it('rejects analysis whose checks cite an unbound source hash', () => {
    const checks = referenceBehaviorChecks(source);
    checks[0]!.sourceRefs[0]!.sha256 = sha256Text('other');
    expect(() => applyReferenceBehaviorAnalysis(pack, {
      schemaVersion: 1, targetRunId: 'run-1', behaviorChecks: checks,
      observations: ['analysis'], inferences: [], unknowns: [], status: 'READY',
    })).toThrow(/unbound/i);
  });

  it('normalizes a terminal-to-replay affordance before the replay return contract is parsed', () => {
    const normalized = normalizeReferenceBehaviorAnalysis({
      schemaVersion: 1,
      targetRunId: 'run-1',
      behaviorChecks: [],
      observations: [],
      inferences: [],
      unknowns: ['replay return is unobserved'],
      status: 'BLOCKED',
      levelReconstruction: {
        schemaVersion: 1,
        artifactType: 'reference-level-reconstruction',
        targetRunId: 'run-1',
        targetGame: 'slice-game',
        workspace: '/tmp/run/workspace/game',
        source: { frameManifestPath: 'artifacts/reference-frame-manifest.json', frameManifestSha256: 'a'.repeat(64), recordingSha256: 'b'.repeat(64), viewport: { width: 1100, height: 720 } },
        checkpoints: [
          { id: 'terminal', phase: 'terminal', atMs: 1, sourceFrameIds: ['frame-terminal'], input: { actionId: null, kind: 'none', targetObjectId: null, gestureDirection: 'none', sourcePointNormalized: null, confidence: 1 }, camera: { mode: 'cut', focusObjectIds: [], motion: 'cut', confidence: 1 }, objects: [], visibleFeedback: [] },
          { id: 'replay', phase: 'replay', atMs: 2, sourceFrameIds: ['frame-terminal'], input: { actionId: 'replay-01', kind: 'tap', targetObjectId: 'replay-control', gestureDirection: 'none', sourcePointNormalized: { x: 0.5, y: 0.5 }, confidence: 0.5 }, camera: { mode: 'unknown', focusObjectIds: [], motion: 'unknown', confidence: 0.2 }, objects: [], visibleFeedback: [] },
          { id: 'ready', phase: 'ready', atMs: 3, sourceFrameIds: ['frame-ready'], input: { actionId: null, kind: 'none', targetObjectId: null, gestureDirection: 'none', sourcePointNormalized: null, confidence: 1 }, camera: { mode: 'static', focusObjectIds: [], motion: 'static', confidence: 1 }, objects: [], visibleFeedback: [] },
        ],
        spatialRelations: [],
        interactionSequence: [{
          order: 1,
          actionId: 'replay-01',
          kind: 'tap',
          targetObjectId: 'replay-control',
          fromCheckpointId: 'terminal',
          toCheckpointId: 'replay',
          responseClass: 'deferred',
          expectedStateChange: 'tap terminal replay control',
        }],
        cameraSequence: [],
        terminal: { checkpointId: 'terminal', result: 'complete', causeVisible: true, settlementVisible: true },
        replay: { checkpointId: 'replay', actionId: 'replay-01', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
        observations: [],
        inferences: [],
        unknowns: ['replay return is unobserved'],
        status: 'BLOCKED',
        blockers: ['replay return is unobserved'],
        analyzedAt: new Date(0).toISOString(),
      },
    }, pack);

    expect((normalized as { levelReconstruction: { interactionSequence: unknown[] } }).levelReconstruction.interactionSequence).toEqual([]);
  });
});
