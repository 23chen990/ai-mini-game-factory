import { describe, expect, it } from 'vitest';
import { compileAgentContext } from '../../src/agents/context-compiler.js';
import { verifyContextPacketIntegrity } from '../../src/core/context-budget.js';

describe('agent context compiler', () => {
  it('produces a bounded, role-aware packet and retains required artifact pointers', () => {
    const result = compileAgentContext({
      stage: 'FIX',
      summary: 'Repair the exact QA issue.',
      inputs: [
        { path: 'artifacts/qa-report.json', content: '{"issue":"missing feedback"}' },
        { path: 'artifacts/unrelated-history.json', content: 'do not forward this' },
      ],
      requiredPaths: ['artifacts/qa-report.json'],
      maxChars: 1_200,
    });

    expect(result.package.agentClass).toBe('FixerAgent');
    expect(result.packet.stage).toBe('FIX');
    expect(result.packet.inputs[0]).toMatchObject({ path: 'artifacts/qa-report.json', priority: 'required' });
    expect(result.packet.totalChars).toBeLessThanOrEqual(1_200);
    expect(result.packet.omitted).toContain('artifacts/unrelated-history.json');
    expect(verifyContextPacketIntegrity(result.packet)).toEqual({ passed: true, blockers: [] });
  });

  it('keeps omitted metadata bounded and covered by the packet signature', () => {
    const result = compileAgentContext({
      stage: 'FIX',
      summary: 'Repair the exact QA issue.',
      inputs: [
        { path: 'artifacts/qa-report.json', content: '{"issue":"missing feedback"}' },
        ...Array.from({ length: 80 }, (_, index) => ({ path: `artifacts/unselected-${index}.json`, content: `history-${index}` })),
      ],
      requiredPaths: ['artifacts/qa-report.json'],
      maxChars: 1_200,
    });

    expect(result.packet.omitted.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(result.packet).length).toBeLessThanOrEqual(1_200);
    expect(verifyContextPacketIntegrity(result.packet)).toEqual({ passed: true, blockers: [] });
  });
});
