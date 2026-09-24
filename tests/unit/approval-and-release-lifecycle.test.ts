import { describe, expect, it } from 'vitest';
import { buildHumanApprovalPlan, buildScheduledApprovalRecord, evaluateHumanApprovalRecords } from '../../src/core/human-approval.js';
import { promoteReleaseLifecycle } from '../../src/core/release-lifecycle.js';
import { HumanApprovalPlanSchema } from '../../src/schemas/human-approval.js';
import { ReleaseLifecycleSchema } from '../../src/schemas/release-lifecycle.js';
import { getStageContract } from '../../src/core/stage-contracts.js';

const hash = 'b'.repeat(64);

describe('human approval and release lifecycle', () => {
  it('makes exactly three scheduled human sessions and treats extra checks as exceptions', () => {
    const plan = buildHumanApprovalPlan('reference_reskin');
    expect(HumanApprovalPlanSchema.parse(plan).sessions).toHaveLength(3);
    expect(plan.sessions.map((session) => session.id)).toEqual(['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE']);
    expect(plan.exceptionGates).toEqual(expect.arrayContaining(['reference-conflict', 'rights-unknown', 'platform-unknown']));
    expect(plan.exceptionGates).toContain('differentiation-review');
    expect(plan.conditionalGates.find((gate) => gate.id === 'differentiation-review')?.countsTowardScheduledSession).toBe(false);
  });

  it('keeps originality and certification as evidence stages, never extra scheduled sessions', () => {
    const plan = buildHumanApprovalPlan('reference_reskin');
    expect(plan.sessions).toHaveLength(3);
    expect(getStageContract('ORIGINALITY_REVIEW').approvalRequired).toBe(false);
    expect(getStageContract('CERTIFICATION').approvalRequired).toBe(false);
    expect(plan.asyncRecords.some((record) => /certification/i.test(record.id) || /certification/i.test(record.purpose))).toBe(true);
  });

  it('binds scheduled approvals to artifacts that exist at their actual gate', () => {
    const reference = buildHumanApprovalPlan('reference_reskin');
    expect(reference.sessions.find((session) => session.id === 'GO_NO_GO')?.requiredArtifacts).toEqual([
      'artifacts/factory-profile.json',
      'artifacts/business-preflight.json',
    ]);
    expect(reference.sessions.find((session) => session.id === 'CORE_DEMO')?.requiredArtifacts).toEqual([
      'artifacts/game-blueprint.json',
      'artifacts/experience-contract.json',
      'artifacts/art-directions.json',
      'human/art-approval.yaml',
    ]);
    expect(reference.sessions.find((session) => session.id === 'FINAL_RELEASE')?.requiredArtifacts).toEqual([
      'artifacts/release-candidate.json',
      'artifacts/completion-gates.json',
      'artifacts/platform-release-matrix.json',
    ]);

    const prototype = buildHumanApprovalPlan('prototype_tournament');
    expect(prototype.sessions.find((session) => session.id === 'CORE_DEMO')?.requiredArtifacts).toEqual([
      'artifacts/game-blueprint.json',
      'artifacts/experience-contract.json',
      'artifacts/art-directions.json',
      'human/art-approval.yaml',
    ]);
  });

  it('builds a schema-valid deterministic scheduled approval record', () => {
    const record = buildScheduledApprovalRecord({
      sessionId: 'CORE_DEMO',
      decision: 'APPROVE',
      artifactRefs: ['artifacts/game-blueprint.json', 'artifacts/experience-contract.json', 'artifacts/art-directions.json', 'human/art-approval.yaml'],
      notes: ['mechanic and boundaries reviewed'],
      recordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(record).toMatchObject({
      recordId: 'scheduled:CORE_DEMO',
      sessionId: 'CORE_DEMO',
      approvalClass: 'scheduled',
      reviewer: 'HumanReviewer',
      decision: 'APPROVE',
    });
  });

  it('resolves a batched prototype artifact prefix against the real run inventory', () => {
    const basePlan = buildHumanApprovalPlan('prototype_tournament');
    const sessions = basePlan.sessions.map((session) => session.id === 'CORE_DEMO'
      ? { ...session, requiredArtifacts: ['artifacts/winner-selection.batch-'] }
      : session);
    const plan = HumanApprovalPlanSchema.parse({ ...basePlan, sessions, scheduledSessions: sessions });
    const records = plan.sessions.map((session) => buildScheduledApprovalRecord({
      sessionId: session.id,
      decision: 'APPROVE',
      artifactRefs: session.id === 'GO_NO_GO'
        ? session.requiredArtifacts
        : session.id === 'CORE_DEMO'
          ? session.requiredArtifacts
          : session.requiredArtifacts,
      ...(session.id === 'FINAL_RELEASE' ? { candidateHash: hash } : {}),
    }));
    const result = evaluateHumanApprovalRecords(plan, records, {
      candidateHash: hash,
      availableArtifacts: [
        'artifacts/factory-profile.json',
        'artifacts/business-preflight.json',
        'artifacts/winner-selection.batch-2.json',
        'artifacts/game-blueprint.json',
        'artifacts/experience-contract.json',
        'artifacts/art-directions.json',
        'human/art-approval.yaml',
        'artifacts/release-candidate.json',
        'artifacts/completion-gates.json',
        'artifacts/platform-release-matrix.json',
      ],
    });
    expect(result.blockers).not.toContain('scheduled:CORE_DEMO:artifact-unavailable:artifacts/winner-selection.batch-');
  });

  it('promotes the exact tested package without allowing a hash-changing rebuild', () => {
    const initial = promoteReleaseLifecycle(undefined, { gameId: 'g', releaseHash: hash, from: 'IMPLEMENTATION_READY', to: 'CANDIDATE_READY' });
    const final = promoteReleaseLifecycle(initial, { gameId: 'g', releaseHash: hash, from: 'CANDIDATE_READY', to: 'RELEASE_READY' });
    expect(ReleaseLifecycleSchema.parse(final).status).toBe('RELEASE_READY');
    expect(() => promoteReleaseLifecycle(final, { gameId: 'g', releaseHash: 'c'.repeat(64), from: 'RELEASE_READY', to: 'SUBMITTED' })).toThrow(/hash/i);
  });
});
