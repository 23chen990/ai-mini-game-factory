import { describe, expect, it } from 'vitest';
import { buildUnknownRegister, evaluateUnknownRegister } from '../../src/core/unknowns.js';

const hash = 'a'.repeat(64);

describe('unknown waiver binding', () => {
  it('requires a scoped, signed, expiring artifact-bound waiver in strict mode', () => {
    const register = buildUnknownRegister({ runId: 'waiver-binding', items: [{
      id: 'content-risk', class: 'content', description: 'temporary copy concern', blocking: false,
      owner: 'HumanReviewer', dueStage: 'CONTENT_EXPANSION', status: 'WAIVED',
      waiver: { approvedBy: 'human', reason: 'ship a limited test', approvedAt: '2026-09-01T00:00:00.000Z' },
    }] });
    const result = evaluateUnknownRegister(register, { requireAllResolved: true, requireBoundWaivers: true });
    expect(result.passed).toBe(false);
    expect(result.blocking).toEqual(expect.arrayContaining([
      'content-risk:waiver-artifact-hash-missing',
      'content-risk:waiver-scope-missing',
      'content-risk:waiver-signer-missing',
      'content-risk:waiver-expiry-missing',
    ]));
  });

  it('rejects a waiver bound to a stale artifact hash', () => {
    const register = buildUnknownRegister({ runId: 'waiver-stale', items: [{
      id: 'license-risk', class: 'license', description: 'temporary license review', blocking: true,
      owner: 'HumanReviewer', dueStage: 'OPEN_SOURCE_RESEARCH', status: 'WAIVED',
      waiver: { approvedBy: 'human', reason: 'documented exception', approvedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-30T00:00:00.000Z', artifactHash: hash, scope: 'artifacts/open-source-research.json', signer: 'owner' },
    }] });
    expect(evaluateUnknownRegister(register, { requireAllResolved: true, requireBoundWaivers: true, artifactHashes: { 'artifacts/open-source-research.json': 'b'.repeat(64) } })).toMatchObject({ passed: false, blocking: ['license-risk:waiver-artifact-hash-mismatch'] });
  });

  it('accepts a current, explicitly bounded waiver', () => {
    const register = buildUnknownRegister({ runId: 'waiver-valid', items: [{
      id: 'ops-risk', class: 'operational', description: 'temporary operational exception', blocking: false,
      owner: 'HumanReviewer', dueStage: 'RELEASE', status: 'WAIVED',
      waiver: { approvedBy: 'human', reason: 'pilot cohort only', approvedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-30T00:00:00.000Z', artifactHash: hash, scope: 'artifacts/release-candidate.json', signer: 'owner' },
    }] });
    expect(evaluateUnknownRegister(register, { now: new Date('2026-09-02T00:00:00.000Z'), requireAllResolved: true, requireBoundWaivers: true, artifactHashes: { 'artifacts/release-candidate.json': hash } })).toMatchObject({ passed: true, blocking: [] });
  });
});
