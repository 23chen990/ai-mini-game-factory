import { describe, expect, it } from 'vitest';
import { ProductionLineContractSchema, ProductionLineSchema, getProductionLineContract, inferProductionLine, inferProductionLineFromText, lockProductionLine, productionLineForTemplate } from '../../src/core/production-lines.js';

describe('production line contracts', () => {
  it('maps different experience goals to different playable acceptance plans', () => {
    const action = getProductionLineContract('cut-stack-dodge');
    const narrative = getProductionLineContract('choice-life');
    expect(action.primaryProfile).toBe('ACTION_FEEL');
    expect(action.representativeFlow.some((step) => /drop|contact|retry/i.test(step))).toBe(true);
    expect(narrative.primaryProfile).toBe('NARRATIVE_AGENCY');
    expect(narrative.representativeFlow.some((step) => /choice|consequence|replay/i.test(step))).toBe(true);
    expect(narrative.acceptanceDimensions).not.toEqual(action.acceptanceDimensions);
  });

  it('infers a line without allowing a generic one-size-fits-all profile', () => {
    expect(inferProductionLine({ primary: 'ACTION_FEEL', secondary: 'NATURAL_PLAY' })).toBe('single-finger-action');
    expect(inferProductionLine({ primary: 'NARRATIVE_AGENCY', secondary: 'REPLAY_VALUE' })).toBe('choice-life');
    expect(ProductionLineSchema.parse('idle-management')).toBe('idle-management');
  });

  it('locks a deterministic line contract for legacy seeds without erasing profile-specific metrics', () => {
    const locked = lockProductionLine(inferProductionLineFromText('slice and dodge falling objects'));
    expect(ProductionLineContractSchema.parse(locked).line).toBe('cut-stack-dodge');
    expect(locked.acceptanceDimensions).toEqual(expect.arrayContaining(['drop trajectory']));
  });

  it('treats an explicit mother template as stronger evidence than generic title text', () => {
    expect(productionLineForTemplate('cut-stack-dodge-v1')).toBe('cut-stack-dodge');
    expect(productionLineForTemplate('idle-shop-v1')).toBe('idle-management');
    expect(productionLineForTemplate('spatial-shop-v1')).toBe('idle-management');
  });

  it('exposes reusable kernel, content topology and progression shell for each line', () => {
    for (const line of ProductionLineSchema.options) {
      const contract = ProductionLineContractSchema.parse(lockProductionLine(line));
      expect(contract.interactionKernel.length).toBeGreaterThan(0);
      expect(contract.contentTopology.length).toBeGreaterThan(0);
      expect(contract.progressionShell.length).toBeGreaterThan(0);
      expect(['stable', 'beta', 'unsupported']).toContain(contract.status);
    }
  });

  it('publishes a complete reusable mother-template profile for every line', () => {
    for (const line of ProductionLineSchema.options) {
      const contract = getProductionLineContract(line) as typeof getProductionLineContract extends (...args: never[]) => infer T ? T & Record<string, unknown> : never;
      expect(contract).toMatchObject({
        template: expect.any(String),
        prototypeTemplate: expect.any(String),
        automaticQaStrategy: expect.any(Array),
        contentGenerator: expect.any(String),
        uiTemplate: expect.any(String),
        performanceBudget: expect.objectContaining({ maxFrameMs: expect.any(Number) }),
        qaChecklist: expect.any(Array),
      });
    }
  });
});
