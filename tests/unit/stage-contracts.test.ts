import { describe, expect, it } from 'vitest';
import { StageContractSchema } from '../../src/schemas/stage-contracts.js';
import { getStageContract, evaluateStageEvidence, evaluateStageContract, evaluateStageContractRegistry, evaluateVerifierSeparation, isStageContractExplicit, stageAttemptAllowed } from '../../src/core/stage-contracts.js';

describe('stage contracts', () => {
  it('requires reference research to emit a source-bound five-dimension behavior contract', () => {
    const contract = getStageContract('REFERENCE_DEEP_RESEARCH');
    expect(contract.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/reference-evidence-pack.json', required: true }),
      expect.objectContaining({ path: 'artifacts/reference-fidelity-contract.json', required: true }),
      expect.objectContaining({ path: 'artifacts/reference-behavior-analysis.raw.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-level-reconstruction.raw.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-research-resolution.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-behavior-analysis.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-failure-pressure-contract.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-frame-manifest.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-level-reconstruction.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-level-implementation-contract.json', required: false }),
    ]));
    expect(contract.evidenceRequired.map((item) => item.id)).toContain('reference:five-dimension-behavior-contract');
    expect(contract.evidenceRequired.map((item) => item.id)).toContain('reference:recording-level-contract-when-recording');
    for (const stage of ['BLUEPRINT', 'PRODUCT_EXPERIENCE_CONTRACT', 'FULL_BUILD', 'QA', 'FIX'] as const) {
      expect(getStageContract(stage).inputs).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'artifacts/reference-research-resolution.json', required: false }),
        expect.objectContaining({ path: 'artifacts/reference-failure-pressure-contract.json', required: false }),
      ]));
    }
    for (const stage of ['FULL_BUILD', 'QA'] as const) {
      expect(getStageContract(stage).inputs).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'artifacts/reference-level-implementation-contract.json', required: false }),
      ]));
    }
    expect(getStageContract('FIX').inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/reference-level-implementation-contract.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-level-runtime-trace.json', required: false }),
      expect.objectContaining({ path: 'artifacts/reference-level-comparison-gate.json', required: false }),
    ]));
  });

  it('records an independent verifier and rejects protected self-acceptance', () => {
    const build = getStageContract('FULL_BUILD');
    expect(evaluateVerifierSeparation(build)).toMatchObject({ passed: true, verifierRole: 'QAAgent' });
    const forged = { ...build, verifierRole: 'BuilderAgent' as const };
    expect(evaluateVerifierSeparation(forged)).toMatchObject({
      passed: false,
      blockers: expect.arrayContaining(['self-acceptance:BuilderAgent']),
    });
  });

  it('includes owner/verifier identity in the durable contract audit', () => {
    const contract = getStageContract('FULL_BUILD');
    const inputs = contract.inputs.filter((item) => item.required).map((item) => item.path);
    const artifacts = contract.outputs.filter((item) => item.required).map((item) => item.path);
    const audit = evaluateStageContract(contract, {
      inputs,
      artifacts,
      // Evidence ids may carry `|` any-of alternatives (e.g. full vs contract
      // verification strength); feeding the first branch keeps this audit
      // satisfied by the full-mode evidence.
      evidence: contract.evidenceRequired.flatMap((item) => item.id.split('|')[0]!),
      artifactVersions: Object.fromEntries([...inputs, ...artifacts].map((item) => [item, 1])),
      strictVersions: true,
    });
    expect(audit).toMatchObject({
      ownerRole: 'BuilderAgent',
      verifierRole: 'QAAgent',
      verifiedByRole: 'QAAgent',
      independent: true,
    });
  });

  it('defines hard inputs, outputs, evidence and an owning failure route', () => {
    const contract = getStageContract('NORMAL_FLOW_QA');
    expect(StageContractSchema.parse(contract)).toMatchObject({
      stage: 'NORMAL_FLOW_QA',
      ownerRole: 'QAAgent',
      mutationScope: 'qa-artifacts-only',
      approvalRequired: false,
      failureRoute: expect.objectContaining({ stage: 'FULL_BUILD' }),
    });
    expect(contract.inputs.length).toBeGreaterThan(0);
    expect(contract.outputs.length).toBeGreaterThan(0);
    expect(contract.evidenceRequired.length).toBeGreaterThan(0);
  });

  it('binds the business gate to the operator-verified platform policy snapshot', () => {
    const business = getStageContract('BUSINESS_PREFLIGHT');
    expect(business.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/platform-policy.json', required: true }),
      expect.objectContaining({ path: 'artifacts/platform-policy-evaluation.json', required: true }),
    ]));
    expect(business.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/platform-policy-evaluation.json', required: true }),
    ]));
    expect(business.evidenceRequired.map((item) => item.id)).toContain('business:platform-policy');
  });

  it('rejects a contract that omits a concrete input, output, or required evidence rule', () => {
    const contract = getStageContract('NORMAL_FLOW_QA');
    expect(() => StageContractSchema.parse({ ...contract, inputs: [] })).toThrow(/input/i);
    expect(() => StageContractSchema.parse({ ...contract, outputs: [] })).toThrow(/output/i);
    expect(() => StageContractSchema.parse({ ...contract, evidenceRequired: contract.evidenceRequired.map((item) => ({ ...item, required: false })) })).toThrow(/evidence/i);
  });

  it('does not pass a stage when a required artifact or evidence item is missing', () => {
    const contract = getStageContract('CONTENT_VARIATION_QA');
    const failed = evaluateStageEvidence(contract, { artifacts: [], evidence: [] });
    expect(failed.passed).toBe(false);
    expect(failed.missing).toEqual(expect.arrayContaining(['artifacts/content-variation.json']));
    const passed = evaluateStageEvidence(contract, {
      artifacts: contract.outputs.map((item) => item.path),
      evidence: contract.evidenceRequired.map((item) => item.id),
    });
    expect(passed.passed).toBe(true);
  });

  it('keeps the final release contract stricter than a build contract', () => {
    const build = getStageContract('FULL_BUILD');
    const release = getStageContract('RELEASE');
    expect(release.approvalRequired).toBe(true);
    expect(release.outputs.map((item) => item.path)).toEqual(expect.arrayContaining(['artifacts/release-candidate.json']));
    expect(release.maxAttempts ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(build.maxAttempts ?? Number.POSITIVE_INFINITY);
  });

  it('allows evidence-backed formal fixer retries without a fixed attempt ceiling', () => {
    const fixer = getStageContract('FIX');
    expect(isStageContractExplicit('FIX')).toBe(true);
    expect(fixer.ownerRole).toBe('FixerAgent');
    expect(fixer.verifierRole).toBe('QAAgent');
    expect(fixer.maxAttempts).toBeNull();
    expect(fixer.retryPolicy.maxAttempts).toBeNull();
    expect(fixer.retryPolicy.unboundedUntilPass).toBe(true);
    expect(fixer.passCriteria).toEqual(expect.arrayContaining(['formal QA → FIX → QA has no fixed repair-attempt ceiling']));
    expect(stageAttemptAllowed(fixer, 6)).toBe(true);
    expect(stageAttemptAllowed(fixer, 1_000)).toBe(true);
    expect(stageAttemptAllowed(getStageContract('QA'), 3)).toBe(false);
    expect(fixer.mutationScope).toBe('game-workspace');
  });

  it('requires the canonical quality matrix before release and acceptance review', () => {
    const release = getStageContract('RELEASE');
    const acceptance = getStageContract('ACCEPTANCE_REVIEW');
    expect(release.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/quality-gate-matrix.json', required: true }),
    ]));
    expect(acceptance.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/quality-gate-matrix.json', required: true }),
    ]));
  });

  it('binds the frozen release candidate to the quality matrix evidence', () => {
    const candidate = getStageContract('RELEASE_CANDIDATE');
    expect(candidate.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/quality-gate-matrix.json', required: true }),
    ]));
    expect(candidate.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/quality-gate-matrix.json', required: true }),
    ]));
    expect(candidate.evidenceRequired.map((item) => item.id)).toContain('candidate:quality-matrix-bound');
  });

  it('keeps the budget gate explicitly contracted because it is release-critical', () => {
    expect(isStageContractExplicit('VISUAL_EVIDENCE_QA')).toBe(true);
    expect(isStageContractExplicit('COST_GATE')).toBe(true);
    const report = evaluateStageContractRegistry(['VISUAL_EVIDENCE_QA', 'COST_GATE']);
    expect(report.passed).toBe(true);
    expect(report.explicitStages).toEqual(['VISUAL_EVIDENCE_QA', 'COST_GATE']);
    expect(report.fallbackStages).toEqual([]);
  });

  it('keeps post-release and terminal control stages explicitly contracted', () => {
    for (const stage of ['LAUNCH_METRICS', 'LIVE_MONITORING', 'LIVE_VERIFIED', 'ABANDONED', 'COMPLETED']) {
      expect(isStageContractExplicit(stage), stage).toBe(true);
      const contract = getStageContract(stage);
      expect(contract.inputs.length, `${stage} inputs`).toBeGreaterThan(0);
      expect(contract.outputs.length, `${stage} outputs`).toBeGreaterThan(0);
      expect(contract.evidenceRequired.length, `${stage} evidence`).toBeGreaterThan(0);
    }
    const live = getStageContract('LIVE_VERIFIED');
    expect(live.outputs.some((item) => item.path === 'artifacts/live-verification/*')).toBe(true);
  });

  it('checks required input artifact versions when strict contract enforcement is enabled', () => {
    const contract = getStageContract('BLUEPRINT');
    const inputs = contract.inputs.filter((item) => item.required).map((item) => item.path);
    const artifacts = contract.outputs.filter((item) => item.required).map((item) => item.path);
    const artifactVersions = Object.fromEntries([...inputs, ...artifacts].map((item) => [item, 1]));
    const matching = evaluateStageContract(contract, {
      inputs,
      artifacts,
      evidence: contract.evidenceRequired.map((item) => item.id),
      artifactVersions,
      strictVersions: true,
    });
    expect(matching.passed).toBe(true);

    const wrongInput = { ...artifactVersions, [inputs[0]!]: 2 };
    const failed = evaluateStageContract(contract, {
      inputs,
      artifacts,
      evidence: contract.evidenceRequired.map((item) => item.id),
      artifactVersions: wrongInput,
      strictVersions: true,
    });
    expect(failed.passed).toBe(false);
    expect(failed.missing).toContain(`artifact-version:${inputs[0]}:expected-1`);
  });

  it('requires a version entry for every required input in strict mode', () => {
    const contract = getStageContract('BLUEPRINT');
    const inputs = contract.inputs.filter((item) => item.required).map((item) => item.path);
    const artifacts = contract.outputs.filter((item) => item.required).map((item) => item.path);
    const artifactVersions = Object.fromEntries(artifacts.map((item) => [item, 1]));
    const failed = evaluateStageContract(contract, {
      inputs,
      artifacts,
      evidence: contract.evidenceRequired.map((item) => item.id),
      artifactVersions,
      strictVersions: true,
    });
    expect(failed.passed).toBe(false);
    expect(failed.missing).toContain(`artifact-version:${inputs[0]}:missing`);
  });

  it('binds wildcard input versions to each concrete observed input', () => {
    const contract = getStageContract('BUILD_3_PROTOTYPES');
    const inputs = ['artifacts/idea-generation.batch-a.json', 'artifacts/prototype-selection.batch-a.json'];
    const artifacts = ['artifacts/prototype-build-report.batch-a.json', 'workspace/prototype-a/dist/'];
    const evidence = contract.evidenceRequired.map((item) => item.id);
    const versions = {
      [inputs[0]!]: 1,
      [inputs[1]!]: 1,
      [artifacts[0]!]: 1,
      [artifacts[1]!]: 1,
      // An unrelated child must not satisfy the wildcard input version.
      'workspace/prototype-b/dist/': 2,
    };
    const failed = evaluateStageContract(contract, { inputs, artifacts, evidence, artifactVersions: versions, strictVersions: true });
    expect(failed.passed).toBe(true);

    const missingConcrete = evaluateStageContract(contract, {
      inputs,
      artifacts,
      evidence,
      artifactVersions: Object.fromEntries(Object.entries(versions).filter(([name]) => name !== artifacts[1])),
      strictVersions: true,
    });
    expect(missingConcrete.passed).toBe(false);
    expect(missingConcrete.missing).toContain(`artifact-version:${artifacts[1]}:missing`);
  });

  it('does not let an unrelated wildcard output version satisfy strict mode', () => {
    const contract = getStageContract('LIVE_VERIFIED');
    const inputs = ['artifacts/release-candidate.json'];
    const artifacts = ['artifacts/live-verification/wechat.json', 'artifacts/release-lifecycle.json'];
    const evidence = contract.evidenceRequired.map((item) => item.id);
    const failed = evaluateStageContract(contract, {
      inputs,
      artifacts,
      evidence,
      artifactVersions: {
        [inputs[0]!]: 1,
        'artifacts/live-verification/douyin.json': 1,
        [artifacts[1]!]: 1,
      },
      strictVersions: true,
    });
    expect(failed.passed).toBe(false);
    expect(failed.missing).toContain(`artifact-version:${artifacts[0]}:missing`);
  });
});
