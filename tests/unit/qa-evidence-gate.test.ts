import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateNaturalFlow, evaluateQaEvidence } from '../../src/core/qa-evidence.js';
import { buildCompletionGateReport } from '../../src/qa/experience-gates.js';

describe('QA evidence gate', () => {
  it('requires a real natural trace for production while allowing oracle coverage as a separate mode', () => {
    const state = { schemaVersion: 1 as const, mode: 'STATE_COVERAGE' as const, actions: ['loadScenario'], artifacts: ['state.json'], forbiddenOperations: ['loadScenario'] };
    expect(evaluateQaEvidence([state], { requireNatural: true })).toMatchObject({ passed: false, blockers: ['natural-e2e-missing'] });
    const natural = { schemaVersion: 1 as const, mode: 'NATURAL_E2E' as const, actions: ['click:primary'], artifacts: ['natural.png'], forbiddenOperations: [] };
    expect(evaluateQaEvidence([state, natural], { requireNatural: true })).toMatchObject({ passed: true, modes: ['STATE_COVERAGE', 'NATURAL_E2E'] });
  });

  it('does not treat a screenshot or a single click as a complete natural flow', () => {
    expect(evaluateNaturalFlow({
      startedFromReset: true,
      actions: ['click:#produce'],
      transitions: [],
      completion: 'none',
      replayObserved: false,
      forbiddenOperations: [],
      screenshots: ['screenshots/start.png'],
    })).toMatchObject({ passed: false, blockers: expect.arrayContaining(['natural-action-trace-too-short', 'natural-state-transition-missing', 'natural-settlement-missing', 'natural-replay-missing']) });
  });

  it('requires settlement and replay for a strict production natural-flow gate', () => {
    const complete = evaluateNaturalFlow({
      startedFromReset: true,
      actions: ['page.goto', 'click:#produce', 'click:#deliver', 'page.reload', 'click:#produce'],
      transitions: [{ name: 'produce', changed: true, evidence: 'inventory 0→1' }, { name: 'deliver', changed: true, evidence: 'currency +1; customer settled' }],
      completion: 'settlement',
      replayObserved: true,
      forbiddenOperations: [],
      screenshots: ['screenshots/start.png', 'screenshots/settled.png'],
    });
    expect(complete).toMatchObject({ passed: true, blockers: [] });
    expect(evaluateQaEvidence([
      { schemaVersion: 1, mode: 'NATURAL_E2E', actions: ['click'], artifacts: ['natural.json'], forbiddenOperations: [] },
    ], { requireNatural: true, requireNaturalComplete: true })).toMatchObject({ passed: false, blockers: ['natural-flow-trace-missing'] });
  });

  it('never allows a state-forcing call inside a natural trace', () => {
    expect(evaluateNaturalFlow({
      startedFromReset: true,
      actions: ['click:#produce', 'click:#deliver'],
      transitions: [{ name: 'deliver', changed: true, evidence: 'currency +1' }],
      completion: 'settlement',
      replayObserved: true,
      forbiddenOperations: ['grantCurrency'],
      screenshots: ['screenshots/settled.png'],
    })).toMatchObject({ passed: false, blockers: ['natural-e2e-contains-state-forcing-operation'] });
  });

  it('requires trusted provenance and the expected build hash for strict release evidence', () => {
    const evidence = [
      { schemaVersion: 1 as const, mode: 'NATURAL_E2E' as const, actions: ['tap'], artifacts: ['natural.json'], forbiddenOperations: [], buildHash: 'a'.repeat(64), runtime: 'web-lite', device: { width: 390, height: 844, label: 'phone' }, seed: 42, runner: 'trusted-qa-runner' },
      { schemaVersion: 1 as const, mode: 'STATE_COVERAGE' as const, actions: ['oracle'], artifacts: ['state.json'], forbiddenOperations: [], buildHash: 'b'.repeat(64), runtime: 'web-lite', device: { width: 390, height: 844, label: 'phone' }, seed: 42, runner: 'trusted-qa-runner' },
    ];
    expect(evaluateQaEvidence(evidence, { requireNatural: true, requireStateCoverage: true, expectedBuildHash: 'a'.repeat(64), requireProvenance: true }).blockers).toContain('qa-build-hash-mismatch');
    expect(evaluateQaEvidence([{ schemaVersion: 1 as const, mode: 'NATURAL_E2E' as const, actions: ['tap'], artifacts: ['natural.json'], forbiddenOperations: [] }], { requireNatural: true, expectedBuildHash: 'a'.repeat(64), requireProvenance: true }).blockers).toEqual(expect.arrayContaining(['qa-provenance-missing']));
  });

  it('rejects a strict candidate-binding request without a candidate hash', async () => {
    const runRoot = await mkdtemp(path.join(os.tmpdir(), 'factory-candidate-binding-'));
    try {
      await expect(buildCompletionGateReport({
        runRoot,
        corePassed: true,
        normalFlowPassed: true,
        screenshots: [],
        requireCandidateBinding: true,
      })).rejects.toThrow('candidate binding requires candidateHash');
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
