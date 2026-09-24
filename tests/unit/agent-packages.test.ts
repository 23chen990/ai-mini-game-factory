import { describe, expect, it } from 'vitest';
import { AgentPackageSchema } from '../../src/agents/packages.js';
import { buildAgentPackageInstruction, packageForStage } from '../../src/agents/packages.js';

describe('agent packages', () => {
  it('exposes one safe package contract for each execution role', () => {
    const stageRoles = {
      OPEN_SOURCE_RESEARCH: 'research', LOW_COST_FILTER: 'producer', FULL_BUILD: 'builder', FIX: 'fixer',
      QA: 'reviewer', PERCEPTUAL_QA: 'evidence-helper', RELEASE: 'release',
    } as const;
    for (const [stage, role] of Object.entries(stageRoles)) expect(AgentPackageSchema.parse(packageForStage(stage))).toMatchObject({ role });
  });

  it('wraps a specialist prompt with the stage boundary without widening permissions', () => {
    const instruction = buildAgentPackageInstruction({ stage: 'FULL_BUILD', base: 'Implement the frozen blueprint.' });
    expect(instruction).toContain('BuilderAgent');
    expect(instruction).toContain('workspace-write');
    expect(instruction).toContain('Zod-validated artifact');
    expect(instruction).toContain('never read secrets');
  });

  it('keeps QA and evidence packages read-only even when a stronger model is selected', () => {
    expect(packageForStage('QA')).toMatchObject({ role: 'reviewer', sandbox: 'read-only', canModifyWorkspace: false });
    expect(packageForStage('PERCEPTUAL_QA')).toMatchObject({ role: 'evidence-helper', sandbox: 'read-only', canModifyWorkspace: false });
  });

  it('preserves the concrete worker name inside the generic package', () => {
    expect(packageForStage('OPEN_SOURCE_RESEARCH')).toMatchObject({ agentClass: 'OpenSourceResearchAgent' });
    expect(packageForStage('QA')).toMatchObject({ agentClass: 'QAAgent' });
  });

  it('declares tools, oracle, and failure ownership for implementation agents', () => {
    expect(packageForStage('FULL_BUILD')).toMatchObject({
      allowedTools: ['read-artifacts', 'write-game-workspace', 'run-tests', 'run-build'],
      successOracle: expect.arrayContaining(['default-journey', 'runtime-product-gate']),
      failurePolicy: { returnToStage: 'FULL_BUILD' },
      planBeforeWrite: true,
      requiredPreflight: ['allowed-files', 'tests-to-run'],
    });
    expect(packageForStage('FIX')).toMatchObject({
      allowedTools: expect.not.arrayContaining(['write-design-artifacts']),
      failurePolicy: { returnToStage: 'QA' },
      planBeforeWrite: true,
    });
  });
});
