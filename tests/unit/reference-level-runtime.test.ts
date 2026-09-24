import { describe, expect, it } from 'vitest';
import { sha256Text } from '../../src/core/files.js';
import { resolveProductionLine } from '../../src/core/production-line-resolution.js';
import { compileReferenceLevelRuntimeData, referenceLevelRuntimeDataPath, verifyReferenceLevelRuntimeData } from '../../src/core/reference-level-runtime.js';
import { ReferenceLevelImplementationContractSchema } from '../../src/schemas/reference-recording.js';

const expectedIdentity = {
  targetRunId: 'run-runtime-fixture',
  targetGame: 'reference-level-fixture',
  workspace: '/tmp/reference-level-fixture/workspace',
};

const contract = () => ReferenceLevelImplementationContractSchema.parse({
  schemaVersion: 1,
  artifactType: 'reference-level-implementation-contract',
  targetRunId: expectedIdentity.targetRunId,
  targetGame: expectedIdentity.targetGame,
  workspace: expectedIdentity.workspace,
  sourceReconstruction: { path: 'artifacts/reference-level-reconstruction.json', sha256: sha256Text('fixture-reconstruction') },
  requiredObjects: [
    { semanticId: 'hero', role: 'player', spawnOrder: 0, lifecycleOrder: ['ready', 'moving', 'settled'] },
    { semanticId: 'target', role: 'cuttable', spawnOrder: 1, lifecycleOrder: ['ready', 'contact', 'resolved'] },
    { semanticId: 'ground', role: 'support', spawnOrder: 2, lifecycleOrder: ['ready', 'settled'] },
    { semanticId: 'replay-control', role: 'replay-control', spawnOrder: 3, lifecycleOrder: ['hidden', 'ready', 'resolved'] },
  ],
  checkpointSequence: [
    { order: 1, id: 'ready', phase: 'ready', requiredVisibleObjectIds: ['hero', 'target', 'ground'], visibleFeedbackIds: ['feedback-ready'] },
    { order: 2, id: 'contact', phase: 'interaction', requiredVisibleObjectIds: ['hero', 'target', 'ground'], visibleFeedbackIds: ['feedback-contact'] },
    { order: 3, id: 'settled', phase: 'terminal', requiredVisibleObjectIds: ['hero', 'ground'], visibleFeedbackIds: ['feedback-settled'] },
    { order: 4, id: 'replay', phase: 'replay', requiredVisibleObjectIds: ['hero', 'replay-control'], visibleFeedbackIds: ['feedback-replay'] },
  ],
  placementRules: [
    { checkpointId: 'ready', semanticId: 'hero', horizontalBand: 'left', verticalBand: 'middle', widthBand: 'small', heightBand: 'small', orientationBand: 'horizontal' },
    { checkpointId: 'ready', semanticId: 'target', horizontalBand: 'center', verticalBand: 'middle', widthBand: 'medium', heightBand: 'medium', orientationBand: 'horizontal' },
    { checkpointId: 'ready', semanticId: 'ground', horizontalBand: 'center', verticalBand: 'bottom', widthBand: 'span', heightBand: 'large', orientationBand: 'horizontal' },
    { checkpointId: 'contact', semanticId: 'hero', horizontalBand: 'center', verticalBand: 'middle', widthBand: 'small', heightBand: 'small', orientationBand: 'diagonal-down' },
  ],
  spatialRelations: [{ id: 'target-supported', fromObjectId: 'target', relation: 'supported-by', toObjectId: 'ground', checkpointIds: ['ready', 'contact'] }],
  interactionSequence: [{ order: 1, actionId: 'cut', kind: 'tap', targetObjectId: 'hero', fromCheckpointId: 'ready', toCheckpointId: 'contact', responseClass: 'immediate', expectedStateChange: 'hero contacts target' }],
  cameraSequence: [
    { order: 1, checkpointId: 'ready', mode: 'follow', focusObjectRole: 'player' },
    { order: 2, checkpointId: 'settled', mode: 'follow', focusObjectRole: 'player' },
  ],
  terminal: { checkpointId: 'settled', result: 'level-complete', causeVisible: true, settlementVisible: true },
  replay: { checkpointId: 'replay', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
  runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true, methods: ['getSnapshot', 'getNaturalInputTarget'] },
  originalityBoundary: { sourceCoordinatesExposedToBuilder: false, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] },
  status: 'READY',
  blockers: [],
  createdAt: new Date(0).toISOString(),
});

const resolutionFor = (template: 'cut-stack-dodge-v1' | 'idle-shop-v1', runtime: 'web-lite') => resolveProductionLine({
  title: template === 'cut-stack-dodge-v1' ? 'A precise cutting challenge' : 'A small night market',
  theme: template === 'cut-stack-dodge-v1' ? 'Timing, contact and falling objects' : 'Orders and upgrades in a shop',
  template,
  runtime,
});

describe('reference level runtime compiler', () => {
  it('compiles a deterministic artifact while preserving every contract field', () => {
    const sourceContract = contract();
    const resolution = resolutionFor('cut-stack-dodge-v1', 'web-lite');
    const first = compileReferenceLevelRuntimeData(sourceContract, resolution, expectedIdentity);
    const second = compileReferenceLevelRuntimeData(sourceContract, resolution, expectedIdentity);
    const resumedResolution = { ...resolution, resolvedAt: new Date('2026-09-16T00:00:00.000Z').toISOString() };
    const resumed = compileReferenceLevelRuntimeData(sourceContract, resumedResolution, expectedIdentity);

    expect(first).toEqual(second);
    expect(resumed).toEqual(first);
    expect(first).toMatchObject({
      schemaVersion: 1,
      artifactType: 'reference-level-runtime-data',
      targetRunId: expectedIdentity.targetRunId,
      targetGame: expectedIdentity.targetGame,
      workspace: expectedIdentity.workspace,
      production: { line: 'cut-stack-dodge', template: 'cut-stack-dodge-v1', runtime: 'web-lite', resolutionHash: resolution.resolutionHash },
      sourceContract: { path: 'artifacts/reference-level-implementation-contract.json', sha256: sha256Text(JSON.stringify(sourceContract)) },
    });
    expect(first.level.objects).toEqual(sourceContract.requiredObjects);
    expect(first.level.checkpoints).toEqual(sourceContract.checkpointSequence);
    expect(first.level.placements).toEqual(sourceContract.placementRules);
    expect(first.level.relations).toEqual(sourceContract.spatialRelations);
    expect(first.level.actions).toEqual(sourceContract.interactionSequence);
    expect(first.level.camera).toEqual(sourceContract.cameraSequence);
    expect(first.level.terminal).toEqual(sourceContract.terminal);
    expect(first.level.replay).toEqual(sourceContract.replay);
    const { runtimeDataHash, ...payload } = first;
    expect(runtimeDataHash).toBe(sha256Text(JSON.stringify(payload)));
    expect(verifyReferenceLevelRuntimeData(first, sourceContract, resolution, expectedIdentity)).toEqual({ passed: true, blockers: [] });
  });

  it('supports distinct production line resolutions and runtime output paths', () => {
    const sourceContract = contract();
    const cut = compileReferenceLevelRuntimeData(sourceContract, resolutionFor('cut-stack-dodge-v1', 'web-lite'), expectedIdentity);
    const idle = compileReferenceLevelRuntimeData(sourceContract, resolutionFor('idle-shop-v1', 'web-lite'), expectedIdentity);

    expect(cut.production.line).toBe('cut-stack-dodge');
    expect(idle.production.line).toBe('idle-management');
    expect(cut.production.template).not.toBe(idle.production.template);
    expect(referenceLevelRuntimeDataPath('web-lite')).toBe('src/generated/reference-level.json');
    expect(referenceLevelRuntimeDataPath('cocos-3d')).toBe('assets/resources/generated/reference-level.json');
  });

  it('rejects blocked or foreign inputs and a tampered resolution hash', () => {
    const sourceContract = contract();
    const resolution = resolutionFor('cut-stack-dodge-v1', 'web-lite');
    expect(() => compileReferenceLevelRuntimeData({ ...sourceContract, status: 'BLOCKED', blockers: ['missing evidence'] }, resolution, expectedIdentity)).toThrow(/READY/u);
    expect(() => compileReferenceLevelRuntimeData(sourceContract, resolution, { ...expectedIdentity, targetGame: 'foreign-game' })).toThrow(/identity/u);
    expect(() => compileReferenceLevelRuntimeData(sourceContract, { ...resolution, supportDecision: 'UNSUPPORTED' }, expectedIdentity)).toThrow(/resolution hash/u);
  });

  it('rejects duplicate IDs and dangling semantic references', () => {
    const sourceContract = contract();
    const resolution = resolutionFor('cut-stack-dodge-v1', 'web-lite');
    expect(() => compileReferenceLevelRuntimeData({ ...sourceContract, requiredObjects: [...sourceContract.requiredObjects, sourceContract.requiredObjects[0]! ] }, resolution, expectedIdentity)).toThrow(/duplicate object/u);
    expect(() => compileReferenceLevelRuntimeData({ ...sourceContract, checkpointSequence: sourceContract.checkpointSequence.map((checkpoint, index) => index === 1 ? { ...checkpoint, id: 'ready' } : checkpoint) }, resolution, expectedIdentity)).toThrow(/duplicate checkpoint|checkpoint ids must be unique/u);
    expect(() => compileReferenceLevelRuntimeData({ ...sourceContract, placementRules: sourceContract.placementRules.map((placement, index) => index === 0 ? { ...placement, semanticId: 'missing-object' } : placement) }, resolution, expectedIdentity)).toThrow(/unknown object|placement rules must bind known/u);
    expect(() => compileReferenceLevelRuntimeData({ ...sourceContract, spatialRelations: sourceContract.spatialRelations.map((relation) => ({ ...relation, checkpointIds: ['missing-checkpoint'] })) }, resolution, expectedIdentity)).toThrow(/unknown checkpoint|spatial relation references unknown/u);
  });

  it('returns blockers for malformed, stale, and edited artifacts instead of throwing', () => {
    const sourceContract = contract();
    const resolution = resolutionFor('cut-stack-dodge-v1', 'web-lite');
    const data = compileReferenceLevelRuntimeData(sourceContract, resolution, expectedIdentity);
    const editedPayload = { ...data, level: { ...data.level, actions: data.level.actions.map((action) => ({ ...action, expectedStateChange: 'edited' })) } };
    const { runtimeDataHash, ...editedWithoutHash } = editedPayload;
    const edited = { ...editedWithoutHash, runtimeDataHash: sha256Text(JSON.stringify(editedWithoutHash)) };

    expect(verifyReferenceLevelRuntimeData({}, sourceContract, resolution, expectedIdentity)).toMatchObject({ passed: false, blockers: expect.arrayContaining([expect.stringMatching(/data/u)]) });
    expect(runtimeDataHash).toBe(data.runtimeDataHash);
    expect(verifyReferenceLevelRuntimeData(edited, sourceContract, resolution, expectedIdentity)).toMatchObject({ passed: false, blockers: expect.arrayContaining([expect.stringMatching(/complete artifact mismatch/u)]) });
    expect(verifyReferenceLevelRuntimeData(data, { ...sourceContract, targetGame: 'foreign-game' }, resolution, expectedIdentity)).toMatchObject({ passed: false, blockers: expect.arrayContaining([expect.stringMatching(/identity/u)]) });
  });
});
