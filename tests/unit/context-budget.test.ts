import { describe, expect, it } from 'vitest';
import { buildContextPacket, buildHandoffPacket, HandoffPacketSchema, verifyContextPacketIntegrity, verifyHandoffPacketIntegrity } from '../../src/core/context-budget.js';
import { sha256Text } from '../../src/core/files.js';

describe('context budget', () => {
  it('deduplicates inputs and caps the handoff payload', () => {
    const packet = buildContextPacket({ stage: 'FIX', summary: '修复 QA 指出的碰撞问题', maxChars: 180, inputs: [
      { path: 'artifacts/qa-report.json', content: '{"issues":["collision"]}', priority: 'required' },
      { path: 'artifacts/qa-report.json', content: '{"issues":["collision"]}', priority: 'required' },
      { path: 'logs/console.log', content: 'x'.repeat(400), priority: 'optional' },
    ] });
    expect(packet.totalChars).toBeLessThanOrEqual(180);
    expect(packet.inputs).toHaveLength(2);
    expect(packet.omitted).toContain('logs/console.log');
  });

  it('requires handoffs to carry a compact summary and artifact pointers, never raw transcript', () => {
    const packet = HandoffPacketSchema.parse({ schemaVersion: 1, fromStage: 'FULL_BUILD', toStage: 'FIX', summary: 'build completed; QA found collision issue', artifactPaths: ['artifacts/qa-report.json'], changedFiles: ['src/game.ts'], commandsRun: ['pnpm test'], omittedContext: ['builder transcript'], estimatedChars: 120 });
    expect(packet).not.toHaveProperty('transcript');
  });

  it('hard-caps an oversized summary and records hashes instead of embedding long logs', () => {
    const packet = buildContextPacket({ stage: 'FIX', summary: 'x'.repeat(4_000), maxChars: 180, inputs: [{ path: 'artifacts/qa-report.json', content: 'y'.repeat(4_000), priority: 'required' }] });
    expect(packet.totalChars).toBeLessThanOrEqual(180);
    const handoff = buildHandoffPacket({ fromStage: 'QA', toStage: 'FIX', summary: 'fix collision', artifacts: [{ path: 'artifacts/qa-report.json', content: '{"issue":"collision"}' }], changedFiles: ['src/game.ts'], commandsRun: ['pnpm test'], maxChars: 500 });
    expect(HandoffPacketSchema.parse(handoff)).toMatchObject({ artifactPaths: ['artifacts/qa-report.json'], artifactHashes: { 'artifacts/qa-report.json': expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(JSON.stringify(handoff).length).toBeLessThanOrEqual(500);
  });

  it('trims metadata as well as the summary when a handoff budget is tiny', () => {
    const handoff = buildHandoffPacket({ fromStage: 'QA', toStage: 'FIX', summary: 's'.repeat(4_000), artifacts: Array.from({ length: 32 }, (_, index) => ({ path: `artifacts/${index}.json`, content: 'x'.repeat(500) })), changedFiles: Array.from({ length: 64 }, (_, index) => `src/${index}.ts`), commandsRun: Array.from({ length: 32 }, (_, index) => `command-${index}`), maxChars: 700 });
    expect(JSON.stringify(handoff).length).toBeLessThanOrEqual(700);
    expect(handoff.omittedContext.length).toBeGreaterThan(0);
  });

  it('keeps a realistic context packet bounded after JSON metadata is included', () => {
    const packet = buildContextPacket({ stage: 'QA', summary: 's'.repeat(4_000), maxChars: 700, inputs: Array.from({ length: 20 }, (_, index) => ({ path: `artifacts/${index}.json`, content: 'x'.repeat(2_000), priority: index === 0 ? 'required' as const : 'optional' as const })) });
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(700);
  });

  it('binds each selected handoff input to a content hash', () => {
    const packet = buildContextPacket({ stage: 'BLUEPRINT', summary: 'bounded handoff', maxChars: 900, inputs: [
      { path: 'artifacts/seed.json', content: '{"a":1}', priority: 'required' },
    ] });
    expect(packet.inputHashes?.['artifacts/seed.json']).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('can bind a persisted handoff to the exact bounded context packet', () => {
    const contextHash = 'a'.repeat(64);
    const packet = buildHandoffPacket({
      fromStage: 'QA',
      toStage: 'FIX',
      summary: 'bounded',
      artifacts: [{ path: 'artifacts/qa.json', content: 'issue' }],
      changedFiles: [],
      commandsRun: [],
      contextPacketHash: contextHash,
      maxChars: 600,
    });
    expect(packet.contextPacketHash).toBe(contextHash);
    expect(HandoffPacketSchema.parse(packet).contextPacketHash).toBe(contextHash);
  });

  it('signs the schema-canonical summary after trimming whitespace and truncation', () => {
    const whitespace = buildContextPacket({ stage: 'BLUEPRINT', summary: ' Compile reference data ', inputs: [], maxChars: 1_200 });
    const truncated = buildContextPacket({ stage: 'BLUEPRINT', summary: 'summary '.repeat(600), inputs: [], maxChars: 300 });

    expect(whitespace.summary).toBe('Compile reference data');
    expect(truncated.summary.endsWith(' ')).toBe(false);
    expect(verifyContextPacketIntegrity(whitespace)).toEqual({ passed: true, blockers: [] });
    expect(verifyContextPacketIntegrity(truncated)).toEqual({ passed: true, blockers: [] });
    expect(whitespace.totalChars).toBe(whitespace.summary.length + whitespace.inputs.reduce((total, item) => total + item.excerpt.length, 0));
    expect(truncated.totalChars).toBe(truncated.summary.length + truncated.inputs.reduce((total, item) => total + item.excerpt.length, 0));
  });

  it('keeps handoff summary hash and token metadata aligned after final budget trimming', () => {
    const packet = buildHandoffPacket({
      fromStage: ' QA ',
      toStage: ' FIX ',
      summary: 'summary '.repeat(600),
      artifacts: [],
      changedFiles: [],
      commandsRun: [],
      maxChars: 128,
    });

    if (packet.summaryHash !== undefined) expect(packet.summaryHash).toBe(sha256Text(packet.summary));
    expect(packet.estimatedTokens).toBe(Math.max(1, Math.ceil(packet.summary.length / 4)));
    expect(verifyHandoffPacketIntegrity(packet)).toEqual({ passed: true, blockers: [] });
  });
});
