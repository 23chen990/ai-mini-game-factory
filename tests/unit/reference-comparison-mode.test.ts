import { describe, expect, it } from 'vitest';
import { compareReferenceCaptures, referenceComparisonContractDifferences } from '../../src/core/reference-comparison.js';
import { ReferenceComparisonCaptureSchema, ReferenceComparisonSpecSchema } from '../../src/schemas/reference-comparison.js';
import { ReferenceFidelityContractSchema } from '../../src/schemas/reference-fidelity.js';

/** Q's ordinal counterexample, not actual player/input evidence. */
function fixture(mode: 'ordered' | 'mean' | undefined) {
  const source = { path: 'reference-evidence/verified/source.mp4', sha256: 'a'.repeat(64) };
  const spec = {
    evidenceBasis: 'runtime-observed' as const, referenceArtifact: source,
    condition: 'observed route', protocol: 'Encode each encountered group identity using a fixed ordinal dictionary, in encounter order.',
    metric: 'group sequence', unit: 'ordinal', referenceRange: { min: 1, max: 7 }, maxDelta: 0, minimumSamples: 7,
    ...(mode === undefined ? {} : { comparisonMode: mode }),
  };
  const check = {
    id: 'spatial-route-order-01', dimension: 'spatial_relation' as const,
    sourceRefs: [{ ...source, locator: 'synthetic Q counterexample' }],
    objectType: 'encounter groups', stateBranch: 'route', playerInput: 'synthetic test only',
    expectedStateChange: 'encounter groups in observed order', spatialRelationship: 'ordered route',
    visibleFeedback: { anchor: 'encounter group', eventOrder: ['approach', 'pass'] },
    viewport: { width: 1100, height: 720 }, comparison: spec,
  };
  const contract = {
    ...ReferenceFidelityContractSchema.parse({
      schemaVersion: 1, targetRunId: 'synthetic-q-counterexample', referenceName: 'synthetic',
      provenance: [source], coreLoopOrder: ['observe', 'act', 'resolve', 'replay'],
      inputStateTransitions: [], failureRecoveryRules: [], behaviorChecks: [],
      feedbackTimingBands: null, status: 'BLOCKED', blockers: ['synthetic test; not player acceptance'],
    }),
    behaviorChecks: [check],
  };
  const capture = (target: 'reference' | 'candidate') => ReferenceComparisonCaptureSchema.parse({
    schemaVersion: 1, targetRunId: contract.targetRunId, contractHash: 'b'.repeat(64), target,
    artifactHash: target === 'reference' ? source.sha256 : 'c'.repeat(64),
    authority: 'normal-input', startedFromReset: true, actions: ['synthetic test action'], forbiddenOperations: [],
    observedAt: new Date(0).toISOString(), durationMs: 1,
    observations: [{
      checkId: check.id, objectType: check.objectType, stateBranch: check.stateBranch, viewport: check.viewport,
      condition: spec.condition, protocol: spec.protocol, metric: spec.metric, unit: spec.unit,
      samples: [1, 2, 3, 4, 5, 6, 7], screenshots: [{ path: 'synthetic.png', sha256: 'd'.repeat(64) }],
    }],
  });
  return { contract, contractHash: 'b'.repeat(64), buildHash: 'c'.repeat(64), reference: capture('reference'), candidate: capture('candidate') };
}

describe('explicit reference comparison semantics', () => {
  it('rejects Q ordinal permutations with equal counts, means and ranges', () => {
    const input = fixture('ordered');
    for (const observation of input.candidate.observations) observation.samples = [2, 1, 3, 4, 5, 6, 7];
    expect(compareReferenceCaptures(input)).toContainEqual({
      checkId: 'spatial-route-order-01', route: 'BUILDER', reason: 'candidate-behavior-diverges',
    });
  });

  it('accepts unchanged ordered samples', () => {
    expect(compareReferenceCaptures(fixture('ordered'))).toEqual([]);
  });

  it.each([
    [1, 2, 3, 4, 5, 6, 7, 4],
    [1, 2, 3, 4, 5, 6],
  ])('rejects a different ordered sequence length: %j', (...samples) => {
    const input = fixture('ordered');
    input.contract.behaviorChecks[0]!.comparison.minimumSamples = 1;
    input.candidate.observations[0]!.samples = samples;
    expect(compareReferenceCaptures(input)).toContainEqual({
      checkId: 'spatial-route-order-01', route: 'BUILDER', reason: 'candidate-behavior-diverges',
    });
  });

  it('applies ordered maxDelta to each corresponding sample, not the mean', () => {
    const input = fixture('ordered');
    input.contract.behaviorChecks[0]!.comparison.maxDelta = 0.25;
    input.candidate.observations[0]!.samples = [1.25, 1.75, 3, 4, 5, 6, 7];
    expect(compareReferenceCaptures(input)).toEqual([]);
    input.candidate.observations[0]!.samples = [1.5, 1.5, 3, 4, 5, 6, 7];
    expect(compareReferenceCaptures(input)).toContainEqual({
      checkId: 'spatial-route-order-01', route: 'BUILDER', reason: 'candidate-behavior-diverges',
    });
  });

  it('preserves declared mean semantics for independent repeated measurements', () => {
    const input = fixture('mean');
    const protocol = 'Independently repeat the scalar observation from reset, without assigning sequence identities.';
    input.contract.behaviorChecks[0]!.comparison.protocol = protocol;
    input.contract.behaviorChecks[0]!.comparison.metric = 'independent duration';
    input.contract.behaviorChecks[0]!.comparison.unit = 'seconds';
    for (const capture of [input.reference, input.candidate]) {
      capture.observations[0]!.protocol = protocol;
      capture.observations[0]!.metric = 'independent duration';
      capture.observations[0]!.unit = 'seconds';
    }
    input.candidate.observations[0]!.samples = [2, 1, 3, 4, 5, 6, 7, 4];
    expect(compareReferenceCaptures(input)).toEqual([]);
  });

  it('keeps legacy artifacts readable but refuses to guess missing comparison semantics', () => {
    const input = fixture(undefined);
    expect(ReferenceFidelityContractSchema.safeParse(input.contract).success).toBe(true);
    expect(referenceComparisonContractDifferences(input.contract)).toContainEqual({
      checkId: 'spatial-route-order-01', route: 'CONTRACT', reason: 'comparison-mode-missing',
    });
  });

  it.each(['mean', 'ordered'] as const)('persists the declared %s mode', (mode) => {
    expect(ReferenceComparisonSpecSchema.parse(fixture(mode).contract.behaviorChecks[0]!.comparison))
      .toMatchObject({ comparisonMode: mode });
  });

  it.each(['reference', 'candidate'] as const)('does not let ordered mode excuse absent %s input', (target) => {
    const input = fixture('ordered');
    input[target].actions = [];
    expect(compareReferenceCaptures(input)).toContainEqual({ checkId: '*', route: 'QA', reason: `${target}:natural-input-required` });
  });

  it('still rejects reference measurements outside the contract', () => {
    const input = fixture('ordered');
    input.reference.observations[0]!.samples = [0, 2, 3, 4, 5, 6, 7];
    expect(compareReferenceCaptures(input)).toContainEqual({
      checkId: 'spatial-route-order-01', route: 'RESEARCH', reason: 'reference-observation-contradicts-contract',
    });
  });
});

it('can preserve recording-only observations without representing them as logged normal input', () => {
 const input=fixture('ordered');
 const reference=ReferenceComparisonCaptureSchema.parse({...input.reference,authority:'recording-observation',startedFromReset:false,actions:[]});
 expect(compareReferenceCaptures({...input,reference})).toContainEqual(expect.objectContaining({route:'QA',reason:'reference:natural-input-required'}));
});
