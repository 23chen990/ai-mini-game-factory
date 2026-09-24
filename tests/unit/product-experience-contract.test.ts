import { describe, expect, it } from 'vitest';
import { ProductExperienceContractSchema, PerceptualQaReportSchema } from '../../src/schemas/product-experience.js';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { getStageContract } from '../../src/core/stage-contracts.js';
import { getDownstreamArtifactPaths, getDownstreamStages } from '../../src/core/downstream-stages.js';
import { buildPipelinePlan } from '../../src/core/pipeline-plan.js';
import { canTransition } from '../../src/core/state-machine.js';
import { modelForStage } from '../../src/core/model-policy.js';
import { sha256Text } from '../../src/core/files.js';
import { referenceBehaviorChecks } from '../fixtures/reference-behavior.js';

const sourceHash = sha256Text('experience contract');

describe('product experience contracts', () => {
  it('rejects legacy prose-only contracts that are not bound to a run, workspace, branch and viewport', () => {
    expect(() => ProductExperienceContractSchema.parse({
      schemaVersion: 1, artifactType: 'product-experience-contract', game: 'demo', features: [{
        id: 'coins', playerAction: 'move', visibleSignal: 'coin HUD', naturalTrigger: 'collect coin',
        evidence: ['state:coins'], blockingIf: ['state-only'],
      }],
    })).toThrow();
  });

  it('derives exact object/state/viewport checks from the reference fidelity contract', () => {
    const source = { path: 'reference-evidence/verified/reference.txt', sha256: sha256Text('reference') };
    const behaviorChecks = referenceBehaviorChecks(source);
    const contract = buildProductExperienceContract({
      targetGame: 'demo', targetRunId: 'run-1', targetWorkspace: '/tmp/run-1/workspace/game', runtime: 'web-lite',
      sourceArtifact: { kind: 'reference-fidelity', path: 'artifacts/reference-fidelity-contract.json', sha256: sourceHash },
      referenceBehaviorChecks: behaviorChecks,
      deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }, { width: 430, height: 932, label: 'phone-large' }],
    });
    expect(contract.schemaVersion).toBe(2);
    expect(contract.features).toHaveLength(behaviorChecks.length);
    expect(contract.features[0]).toMatchObject({
      id: behaviorChecks[0]?.id,
      objectType: behaviorChecks[0]?.objectType,
      stateBranch: behaviorChecks[0]?.stateBranch,
      sourceCheckIds: [behaviorChecks[0]?.id],
      expectedEventOrder: behaviorChecks[0]?.visibleFeedback.eventOrder,
    });
    expect(contract.features[0]?.requiredViewports).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 390, height: 844 }),
      expect.objectContaining({ width: 430, height: 932 }),
    ]));
  });

  it('rejects a passing report without independent, build-bound, exact-case evidence', () => {
    const contract = buildProductExperienceContract({
      targetGame: 'demo', targetRunId: 'run-1', targetWorkspace: '/tmp/run-1/workspace/game', runtime: 'web-lite',
      sourceArtifact: { kind: 'experience-contract', path: 'artifacts/experience-contract.json', sha256: sourceHash },
      experiencePillars: [{ id: 'coins', name: 'coin collection', observable: 'coin reward appears at the collected object' }],
      deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }],
    });
    expect(() => PerceptualQaReportSchema.parse({
      schemaVersion: 2, artifactType: 'perceptual-qa-report', targetGame: 'demo', targetRunId: 'run-1',
      targetWorkspace: contract.targetWorkspace, runtimeEntrypoints: contract.runtimeEntrypoints,
      contractHash: sha256Text(JSON.stringify(contract)), buildHash: sha256Text('build'), runtime: 'web-lite',
      reviewer: 'DeterministicCapture', authorIndependent: false, passed: true, blockers: [], checkedAt: new Date().toISOString(),
      cases: [{
        featureId: 'coins', sourceCheckIds: ['coins'], objectType: 'coin collection', stateBranch: 'default-journey:coins',
        viewport: { width: 390, height: 844, label: 'phone-portrait' }, playerVisible: true,
        naturalTriggerVerified: true, eventOrderVerified: true, negativeAssertionsPassed: true, perceptualPassed: true,
        observedSignal: 'coin reward', observedEventOrder: ['collect coin', 'reward'], screenshots: [],
        evidence: ['string-only claim'], notes: [],
      }],
    })).toThrow(/independent|screenshot|trace|capture/i);
  });

  it('registers build and QA handoffs with product and reference fidelity inputs', () => {
    expect(getStageContract('PRODUCT_EXPERIENCE_CONTRACT').outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/product-experience-contract.json', schema: 'ProductExperienceContractSchema' }),
    ]));
    expect(getStageContract('FULL_BUILD').inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/product-experience-contract.json', required: true }),
      expect.objectContaining({ path: 'artifacts/reference-fidelity-contract.json', required: false }),
    ]));
    expect(getStageContract('QA').inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/product-experience-contract.json', required: true }),
      expect.objectContaining({ path: 'artifacts/reference-fidelity-contract.json', required: false }),
    ]));
    expect(getStageContract('PERCEPTUAL_QA').outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'artifacts/perceptual-qa-report.json', schema: 'PerceptualQaReportSchema' }),
      expect.objectContaining({ path: 'artifacts/perceptual-qa-gate.json', schema: 'PerceptualQaGateSchema' }),
    ]));
    expect(getDownstreamStages('PRODUCT_EXPERIENCE_CONTRACT')).toContain('PERCEPTUAL_QA');
    expect(getDownstreamArtifactPaths('PERCEPTUAL_QA')).toContain('artifacts/perceptual-qa-report.json');
  });

  it('puts both gates in productization plans and allows their transitions', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'web-lite' });
    expect(plan.mandatoryStages).toEqual(expect.arrayContaining(['PRODUCT_EXPERIENCE_CONTRACT', 'PERCEPTUAL_QA']));
    expect(canTransition('EXPERIENCE_CONTRACT', 'PRODUCT_EXPERIENCE_CONTRACT')).toBe(true);
    expect(canTransition('PRODUCT_EXPERIENCE_CONTRACT', 'PERCEPTUAL_QA')).toBe(true);
    expect(modelForStage('PRODUCT_EXPERIENCE_CONTRACT').tier).toBe('frontier');
    expect(modelForStage('PERCEPTUAL_QA').tier).toBe('fast');
  });
});
