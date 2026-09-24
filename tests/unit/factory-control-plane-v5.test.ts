import { describe, expect, it } from 'vitest';
import { getDownstreamArtifactPaths } from '../../src/core/downstream-stages.js';
import { buildPipelinePlan, CANONICAL_STAGE_ORDER } from '../../src/core/pipeline-plan.js';
import { executionPolicyForStage, getModelPolicy, modelPolicySignature } from '../../src/core/model-policy.js';
import { StageNameSchema } from '../../src/schemas/index.js';
import { getStageContract } from '../../src/core/stage-contracts.js';
import { evaluateFactoryConstitution } from '../../src/core/factory-constitution.js';
import { evaluateCompletionGates } from '../../src/core/completion-gates.js';
import { buildUnknownRegister } from '../../src/core/unknowns.js';

const completeGates = () => evaluateCompletionGates({
  core: { passed: true, evidence: ['core'] },
  normalFlow: { passed: true, evidence: ['flow'] },
  visualEvidence: { passed: true, evidence: ['visual'] },
  levelDifference: { passed: true, evidence: ['variation'] },
  humanPlaytest: { passed: true, evidence: ['human'] },
});

describe('factory control plane v5 contracts', () => {
  it('exposes an explicit, run-scoped cleanup set for downstream retries', () => {
    const paths = getDownstreamArtifactPaths('QA');
    expect(paths).toEqual(expect.arrayContaining([
      'artifacts/qa-report.json',
      'artifacts/runtime-product-gates.json',
      'artifacts/completion-gates.json',
      'artifacts/release-candidate.json',
      'release-candidate/',
      'artifacts/artifact-metadata/artifacts__qa-report.json.json',
    ]));
    expect(paths.every((item) => /^(?:artifacts|human|release-candidate|screenshots|logs|workspace\/generated-assets)(?:\/|$)/u.test(item))).toBe(true);
    expect(paths).not.toContain('workspace/game/');
  });

  it('plans production-line review and all five completion gates in canonical order', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'cut-stack-dodge', primaryProfile: 'ACTION_FEEL' });
    expect(plan.mandatoryStages).toEqual(expect.arrayContaining([
      'PRODUCTION_LINE_REVIEW', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA',
      'CONTENT_VARIATION_QA', 'WAITING_FOR_HUMAN_PLAYTEST',
    ]));
    const positions = plan.mandatoryStages.map((stage) => CANONICAL_STAGE_ORDER.indexOf(stage as never));
    expect(positions.every((position, index) => index === 0 || position >= positions[index - 1]!)).toBe(true);
  });

  it('maps high-impact design stages to producer boundaries and snapshots every stage', () => {
    expect(executionPolicyForStage('IAA_REVIEW')).toMatchObject({ role: 'producer', sandbox: 'read-only', canModifyWorkspace: false });
    expect(executionPolicyForStage('EXPERIENCE_HYPOTHESIS')).toMatchObject({ role: 'producer', sandbox: 'read-only', canModifyWorkspace: false });
    expect(executionPolicyForStage('CONTENT_EXPANSION')).toMatchObject({ role: 'producer', sandbox: 'read-only', canModifyWorkspace: false });
    const policies = getModelPolicy();
    for (const stage of StageNameSchema.options) expect(policies[stage]).toBeDefined();
    expect(modelPolicySignature().split('|').length).toBeGreaterThanOrEqual(StageNameSchema.options.length);
  });

  it('treats stage-contract audits as a release prerequisite when the strict lane is enabled', () => {
    const result = evaluateFactoryConstitution({
      completion: completeGates(),
      unknowns: buildUnknownRegister({ runId: 'run-1', items: [] }),
      ledger: { schemaVersion: 1, entries: [], updatedAt: new Date().toISOString() },
      requireStageContracts: true,
      stageContracts: [{ stage: getStageContract('QA').stage, passed: false }],
      selfAcceptance: { builder: false, fixer: false, producer: false },
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('stage-contracts');
  });

  it('requires verifier identity and independent separation for strict stage audits', () => {
    const incomplete = evaluateFactoryConstitution({
      completion: completeGates(),
      requireStageContracts: true,
      requiredStageContracts: ['FULL_BUILD'],
      stageContracts: [{ stage: 'FULL_BUILD', passed: true }],
    });
    expect(incomplete.passed).toBe(false);
    expect(incomplete.blockers).toContain('stage-contract-verifier');

    const valid = evaluateFactoryConstitution({
      completion: completeGates(),
      requireStageContracts: true,
      requiredStageContracts: ['FULL_BUILD'],
      stageContracts: [{ stage: 'FULL_BUILD', passed: true, ownerRole: 'BuilderAgent', verifierRole: 'QAAgent', verifiedByRole: 'QAAgent', independent: true }],
    });
    expect(valid.blockers).not.toContain('stage-contract-verifier');
  });
});
