import { describe, expect, it } from 'vitest';
import * as comparison from '../../src/core/reference-comparison.js';
import type { ReferenceDifference } from '../../src/schemas/reference-comparison.js';

describe('reference discrepancy routing', () => {
  it('exposes one shared routing decision for preview and full validation', () => {
    expect(comparison).toHaveProperty('referenceComparisonNextStage');
  });
  it.each<[ReferenceDifference['route'][], string]>([
    [['BUILDER'], 'FIX'], [['RESEARCH'], 'REFERENCE_DEEP_RESEARCH'], [['CONTRACT'], 'REFERENCE_DEEP_RESEARCH'],
    [['QA'], 'QA'], [['QA', 'BUILDER'], 'QA'], [['RESEARCH', 'BUILDER'], 'REFERENCE_DEEP_RESEARCH'],
  ])('routes %j to %s, never repairing implementation on invalid research', (routes, expected) => {
    expect(comparison.referenceComparisonNextStage(routes.map((route) => ({checkId: 'core', route, reason: 'test discrepancy'})))).toBe(expected);
  });

  it.each([
    ['RESEARCH', 'REFERENCE_DEEP_RESEARCH', 'ResearchAgent', '补充研究'],
    ['CONTRACT', 'REFERENCE_DEEP_RESEARCH', 'ResearchAgent', '测量协议'],
    ['BUILDER', 'FIX', 'FixerAgent', 'QA → Fixer → QA'],
    ['QA', 'QA', 'QAAgent', 'comparison.reference'],
  ] as const)('hands %s differences to the matching owner, not a generic QA task', (route, stage, owner, instruction) => {
    const task = comparison.buildReferenceComparisonTask({
      workspace: '/runs/example/workspace/game', inputArtifacts: ['artifacts/reference-fidelity-contract.json'],
      gate: { schemaVersion: 1, targetRunId: 'example', contractHash: 'a'.repeat(64), buildHash: 'b'.repeat(64),
        passed: false, blockers: ['fidelity:comparison:core:test'], requiredCheckIds: ['core'], checkedIds: [],
        differences: [{ checkId: 'core', route, reason: 'test discrepancy' }] },
    });
    expect(task).toMatchObject({ stage, owner, execution: 'waiting-handoff', contractHash: 'a'.repeat(64), buildHash: 'b'.repeat(64) });
    expect(task.instructions.join('\n')).toContain(instruction);
    expect(task.differences).toEqual([{ checkId: 'core', route, reason: 'test discrepancy' }]);
  });

  it('asks existing QA to challenge the contract with reference-first causal observations', () => {
    const task = comparison.buildReferenceComparisonTask({
      workspace: '/runs/example/workspace/game', inputArtifacts: ['artifacts/reference-fidelity-contract.json'],
      gate: { schemaVersion: 1, targetRunId: 'example', contractHash: 'a'.repeat(64), buildHash: 'b'.repeat(64),
        passed: false, blockers: ['fidelity:review-missing'], requiredCheckIds: [], checkedIds: [], differences: [] },
    });
    expect(task.instructions.join('\n')).toContain('先观察参考');
    expect(task.instructions.join('\n')).toContain('合同之外');
    expect(task.instructions.join('\n')).toContain('相同操作意图');
  });
});
