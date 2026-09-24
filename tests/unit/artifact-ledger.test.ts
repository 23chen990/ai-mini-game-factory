import { describe, expect, it } from 'vitest';
import { createArtifactLedger, recordArtifact, recordStageEmission, evaluateArtifactLedger, invalidateArtifacts } from '../../src/core/artifact-ledger.js';

const hash = (letter: string) => letter.repeat(64);

describe('artifact dependency ledger', () => {
  it('invalidates direct and transitive evidence when an approved input changes', () => {
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'artifacts/experience-contract.json', sha256: hash('a'), producerStage: 'EXPERIENCE_CONTRACT', inputHashes: {} });
    ledger = recordArtifact(ledger, { path: 'artifacts/build-report.json', sha256: hash('b'), producerStage: 'FULL_BUILD', inputHashes: { 'artifacts/experience-contract.json': hash('a') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/qa-report.json', sha256: hash('c'), producerStage: 'QA', inputHashes: { 'artifacts/build-report.json': hash('b') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/experience-contract.json', sha256: hash('d'), producerStage: 'EXPERIENCE_CONTRACT', inputHashes: {} });
    expect(ledger.entries.find((entry) => entry.path === 'artifacts/build-report.json')?.status).toBe('INVALIDATED');
    expect(ledger.entries.find((entry) => entry.path === 'artifacts/qa-report.json')?.status).toBe('INVALIDATED');
    expect(evaluateArtifactLedger(ledger).passed).toBe(false);
  });

  it('accepts a stable graph with matching input hashes', () => {
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'artifacts/a.json', sha256: hash('a'), producerStage: 'BLUEPRINT', inputHashes: {} });
    ledger = recordArtifact(ledger, { path: 'artifacts/b.json', sha256: hash('b'), producerStage: 'FULL_BUILD', inputHashes: { 'artifacts/a.json': hash('a') } });
    expect(evaluateArtifactLedger(ledger)).toMatchObject({ passed: true, blockers: [] });
  });

  it('invalidates explicitly retried outputs and their transitive dependents', () => {
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'artifacts/blueprint.json', sha256: hash('a'), producerStage: 'BLUEPRINT', inputHashes: {} });
    ledger = recordArtifact(ledger, { path: 'artifacts/build-report.json', sha256: hash('b'), producerStage: 'FULL_BUILD', inputHashes: { 'artifacts/blueprint.json': hash('a') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/qa-report.json', sha256: hash('c'), producerStage: 'QA', inputHashes: { 'artifacts/build-report.json': hash('b') } });

    const retried = invalidateArtifacts(ledger, ['artifacts/blueprint.json'], 'retry:BLUEPRINT');
    expect(retried.entries.find((entry) => entry.path === 'artifacts/blueprint.json')?.status).toBe('INVALIDATED');
    expect(retried.entries.find((entry) => entry.path === 'artifacts/build-report.json')?.status).toBe('INVALIDATED');
    expect(retried.entries.find((entry) => entry.path === 'artifacts/qa-report.json')?.status).toBe('INVALIDATED');
    expect(retried.entries.find((entry) => entry.path === 'artifacts/blueprint.json')?.invalidatedBy).toContain('retry:BLUEPRINT');
  });

  it('keeps an already-invalidated dependent invalid until its producer is rebuilt', () => {
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'artifacts/spec.json', sha256: hash('a'), producerStage: 'EXPERIENCE_CONTRACT', inputHashes: {} });
    ledger = recordArtifact(ledger, { path: 'artifacts/build.json', sha256: hash('b'), producerStage: 'FULL_BUILD', inputHashes: { 'artifacts/spec.json': hash('a') } });
    ledger = invalidateArtifacts(ledger, ['artifacts/spec.json'], 'drift:spec');
    const rebuiltSpec = recordArtifact(ledger, { path: 'artifacts/spec.json', sha256: hash('c'), producerStage: 'EXPERIENCE_CONTRACT', inputHashes: {} });
    expect(rebuiltSpec.entries.find((entry) => entry.path === 'artifacts/build.json')?.status).toBe('INVALIDATED');
    expect(evaluateArtifactLedger(rebuiltSpec).passed).toBe(false);
  });

  it('keeps an unchanged standalone re-record invalidated', () => {
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'artifacts/spec.json', sha256: hash('a'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: {} });
    ledger = invalidateArtifacts(ledger, ['artifacts/spec.json'], 'drift:spec');

    const rerecorded = recordArtifact(ledger, { path: 'artifacts/spec.json', sha256: hash('a'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: {} });
    expect(rerecorded.entries.find((entry) => entry.path === 'artifacts/spec.json')).toMatchObject({ status: 'INVALIDATED', invalidatedBy: ['drift:spec'] });
  });

  it('clears only unchanged outputs proven by a stage emission and refreshes their input hashes', () => {
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'artifacts/source.json', sha256: hash('a'), producerStage: 'INPUT', inputHashes: {} });
    ledger = recordArtifact(ledger, { path: 'artifacts/pack.json', sha256: hash('c'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: { 'artifacts/source.json': hash('a') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/fidelity.json', sha256: hash('f'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: { 'artifacts/source.json': hash('a') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/old-output.json', sha256: hash('e'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: { 'artifacts/source.json': hash('a') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/blueprint.json', sha256: hash('b'), producerStage: 'BLUEPRINT', inputHashes: { 'artifacts/pack.json': hash('c') } });
    ledger = recordArtifact(ledger, { path: 'artifacts/source.json', sha256: hash('b'), producerStage: 'INPUT', inputHashes: {} });

    const emitted = recordStageEmission(ledger, {
      producerStage: 'REFERENCE_DEEP_RESEARCH',
      outputs: [
        { path: 'artifacts/fidelity.json', sha256: hash('f'), inputHashes: { 'artifacts/source.json': hash('b') } },
        { path: 'artifacts/pack.json', sha256: hash('c'), inputHashes: { 'artifacts/source.json': hash('b') } },
      ],
    });

    expect(emitted.entries.find((entry) => entry.path === 'artifacts/pack.json')).toMatchObject({ status: 'VALID', inputHashes: { 'artifacts/source.json': hash('b') }, invalidatedBy: [] });
    expect(emitted.entries.find((entry) => entry.path === 'artifacts/fidelity.json')).toMatchObject({ status: 'VALID', inputHashes: { 'artifacts/source.json': hash('b') }, invalidatedBy: [] });
    expect(emitted.entries.find((entry) => entry.path === 'artifacts/old-output.json')?.status).toBe('INVALIDATED');
    expect(emitted.entries.find((entry) => entry.path === 'artifacts/blueprint.json')?.status).toBe('INVALIDATED');
  });

  it('is independent of sibling output order when one emitted output changes', () => {
    const initialLedger = () => {
      let ledger = createArtifactLedger();
      ledger = recordArtifact(ledger, { path: 'artifacts/source.json', sha256: hash('a'), producerStage: 'INPUT', inputHashes: {} });
      ledger = recordArtifact(ledger, { path: 'artifacts/pack.json', sha256: hash('c'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: { 'artifacts/source.json': hash('a') } });
      ledger = recordArtifact(ledger, { path: 'artifacts/fidelity.json', sha256: hash('f'), producerStage: 'REFERENCE_DEEP_RESEARCH', inputHashes: { 'artifacts/source.json': hash('a'), 'artifacts/pack.json': hash('c') } });
      ledger = recordArtifact(ledger, { path: 'artifacts/blueprint.json', sha256: hash('b'), producerStage: 'BLUEPRINT', inputHashes: { 'artifacts/fidelity.json': hash('f') } });
      return recordArtifact(ledger, { path: 'artifacts/source.json', sha256: hash('b'), producerStage: 'INPUT', inputHashes: {} });
    };
    const outputs: Array<{ path: string; sha256: string; inputHashes: Record<string, string> }> = [
      { path: 'artifacts/pack.json', sha256: hash('d'), inputHashes: { 'artifacts/source.json': hash('b') } },
      { path: 'artifacts/fidelity.json', sha256: hash('f'), inputHashes: { 'artifacts/source.json': hash('b'), 'artifacts/pack.json': hash('d') } },
    ];

    const forward = recordStageEmission(initialLedger(), { producerStage: 'REFERENCE_DEEP_RESEARCH', outputs });
    const reverse = recordStageEmission(initialLedger(), { producerStage: 'REFERENCE_DEEP_RESEARCH', outputs: [...outputs].reverse() });
    const comparable = (value: typeof forward) => value.entries.map(({ path, sha256, producerStage, inputHashes, status, invalidatedBy }) => ({ path, sha256, producerStage, inputHashes, status, invalidatedBy }));

    expect(comparable(forward)).toEqual(comparable(reverse));
    expect(forward.entries.find((entry) => entry.path === 'artifacts/pack.json')?.status).toBe('VALID');
    expect(forward.entries.find((entry) => entry.path === 'artifacts/fidelity.json')?.status).toBe('VALID');
    expect(forward.entries.find((entry) => entry.path === 'artifacts/blueprint.json')?.status).toBe('INVALIDATED');
  });
});
