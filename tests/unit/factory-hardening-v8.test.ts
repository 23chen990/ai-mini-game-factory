import { describe, expect, it } from 'vitest';
import { buildProfileExperienceBundle, evaluateProfileExperienceBundle } from '../../src/core/profile-contract.js';
import { evaluateProductionLineCapability } from '../../src/core/production-line-capability.js';
import { buildHandoffPacket, verifyHandoffPacketIntegrity } from '../../src/core/context-budget.js';
import { makeGrowthExperiment } from '../../src/core/factory-operating.js';
import { GrowthExperimentSchema } from '../../src/schemas/factory-operating.js';
import { buildFactorySourceSignature, defaultFactoryEvalCases, runFactoryEvalSuite } from '../../src/core/factory-eval.js';
import { RequestRouter } from '../../src/core/request-router.js';
import { routeFailureToEarliestStage } from '../../src/core/failure-routing.js';

const hash = 'a'.repeat(64);

describe('factory hardening v8', () => {
  it('builds a profile contract and natural-play plan that agree with the locked production line', () => {
    const bundle = buildProfileExperienceBundle({
      gameId: 'village-south',
      title: '村口向南',
      theme: '有分支后果的村口故事',
      line: 'choice-life',
      profile: 'NARRATIVE_AGENCY',
      blueprintHash: hash,
      representativeFlow: ['reset', 'make a meaningful choice', 'observe consequence', 'reach delayed consequence', 'replay'],
    });
    expect(bundle.profileContract.profile).toBe('NARRATIVE_AGENCY');
    expect(bundle.experienceContract.acceptanceIds.length).toBeGreaterThanOrEqual(4);
    expect(bundle.naturalPlayPlan.oracleFree).toBe(true);
    expect(evaluateProfileExperienceBundle(bundle, { line: 'choice-life', profile: 'NARRATIVE_AGENCY', blueprintHash: hash }).passed).toBe(true);
    expect(evaluateProfileExperienceBundle({ ...bundle, line: 'cut-stack-dodge' }, { line: 'choice-life', profile: 'NARRATIVE_AGENCY', blueprintHash: hash }).passed).toBe(false);
  });

  it('blocks a production line when the selected runtime template cannot implement it', () => {
    const unsupported = evaluateProductionLineCapability({ line: 'choice-life', template: 'idle-shop-v1', runtime: 'web-lite' });
    expect(unsupported.passed).toBe(false);
    expect(unsupported.blockers).toContain('template-line-mismatch');
    const idle = evaluateProductionLineCapability({ line: 'idle-management', template: 'idle-shop-v1', runtime: 'web-lite' });
    expect(idle.passed).toBe(true);
    const cut = evaluateProductionLineCapability({ line: 'cut-stack-dodge', template: 'cut-stack-dodge-v1', runtime: 'web-lite' });
    expect(cut.passed).toBe(true);
  });

  it('keeps handoff integrity valid after compacting a tiny budget', () => {
    const packet = buildHandoffPacket({
      fromStage: 'QA',
      toStage: 'FIX',
      summary: 'x'.repeat(4_000),
      artifacts: [{ path: 'artifacts/qa-report.json', content: '{"issue":"collision"}' }],
      changedFiles: ['src/game.ts'],
      commandsRun: ['pnpm test'],
      maxChars: 700,
    });
    expect(verifyHandoffPacketIntegrity(packet)).toEqual({ passed: true, blockers: [] });
  });

  it('does not create a paid channel when paid traffic is disabled', () => {
    const plan = makeGrowthExperiment({ gameId: 'g', platform: 'wechat-minigame', maxBudgetCents: 0 });
    expect(plan.channels.map((channel) => channel.kind)).toEqual(['organic']);
    expect(GrowthExperimentSchema.parse(plan)).toBeTruthy();
  });

  it('changes the factory signature when a source/template input changes', () => {
    const first = buildFactorySourceSignature([{ path: 'src/factory.ts', content: 'one' }, { path: 'src/core/model-policy.ts', content: 'two' }]);
    const reordered = buildFactorySourceSignature([{ path: 'src/core/model-policy.ts', content: 'two' }, { path: 'src/factory.ts', content: 'one' }]);
    const changed = buildFactorySourceSignature([{ path: 'src/factory.ts', content: 'changed' }, { path: 'src/core/model-policy.ts', content: 'two' }]);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('keeps an explicit failure class authoritative over incidental words in the message', () => {
    expect(routeFailureToEarliestStage({ symptomStage: 'QA', failureClass: 'build', message: 'source map missing during vite build' }).stage).toBe('FULL_BUILD');
  });

  it('can execute feedback-free factory evals with a source signature', () => {
    const report = runFactoryEvalSuite(defaultFactoryEvalCases(), (input) => new RequestRouter().route(input), { modelSignature: 'm', promptSignature: 'p', factorySignature: hash });
    expect(report.factorySignature).toBe(hash);
  });
});
