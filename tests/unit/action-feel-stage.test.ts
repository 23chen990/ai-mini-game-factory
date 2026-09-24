import { describe, expect, it } from 'vitest';
import { buildActionFeelExperienceReview, buildActionFeelRepairTriage, buildActionFeelStageSpec, buildProfileStageEvidence } from '../../src/core/action-feel-stage.js';
import { ActionPlaytestReportSchema } from '../../src/schemas/action-mechanic-experiment.js';

describe('action-feel profile stage adapter', () => {
  it('creates three isolated, same-geometry candidates', () => {
    const spec = buildActionFeelStageSpec({
      runId: 'run-1',
      sourceWorkspace: 'templates/web-lite/cut-stack-dodge-v1',
      representativeFlow: ['reset', 'cut', 'support', 'hazard', 'retry'],
      targetGame: '符刃夜行',
      productionLine: 'cut-stack-dodge',
      template: 'cut-stack-dodge-v1',
      profile: 'ACTION_FEEL',
    });
    expect(spec.prototypes).toHaveLength(3);
    expect(new Set(spec.prototypes.map((item) => item.geometryFixtureHash)).size).toBe(1);
    expect(new Set(spec.prototypes.map((item) => item.workspace)).size).toBe(3);
    expect(spec.constraints.greyboxOnly).toBe(true);
  });

  it('binds candidate copy to the target game and rejects unsupported action lines', () => {
    const spec = buildActionFeelStageSpec({
      runId: 'run-2',
      sourceWorkspace: 'templates/web-lite/cut-stack-dodge-v1',
      representativeFlow: ['reset', 'cut', 'support', 'hazard', 'retry'],
      targetGame: 'Lantern Drift',
      productionLine: 'cut-stack-dodge',
      template: 'cut-stack-dodge-v1',
      profile: 'ACTION_FEEL',
    });
    expect(spec.prototypes[0]?.name).toContain('Lantern Drift');
    expect(() => buildActionFeelStageSpec({
      runId: 'run-2',
      sourceWorkspace: 'templates/web-lite/cut-stack-dodge-v1',
      representativeFlow: ['reset', 'cut', 'support', 'hazard', 'retry'],
      targetGame: 'Lantern Drift',
      productionLine: 'single-finger-action',
      template: 'single-finger-action-v1',
      profile: 'ACTION_FEEL',
    })).toThrow(/unsupported|cut-stack-dodge|template/i);
    expect(() => buildActionFeelStageSpec({
      runId: 'run-2',
      sourceWorkspace: 'templates/web-lite/cut-stack-dodge-v1',
      representativeFlow: ['reset', 'cut', 'support', 'hazard', 'retry'],
      targetGame: 'Lantern Drift',
    })).toThrow(/missing|unsupported|profile|template/i);
  });

  it('records a blocked stage when an independent check fails', () => {
    const evidence = buildProfileStageEvidence({
      stage: 'NATURAL_PLAY_QA',
      targetRunId: 'run-1',
      targetGame: '符刃夜行',
      targetWorkspace: '/tmp/run/workspace/game',
      sourceArtifacts: [{ path: 'artifacts/action-feel-natural-play-qa.json', sha256: 'a'.repeat(64) }],
      checks: [{ id: 'feel:natural-input', passed: false, evidence: 'retry path missing' }],
    });
    expect(evidence.status).toBe('BLOCKED');
  });

  it('blocks fixture-only threshold evidence even when every metric passes', () => {
    const report = ActionPlaytestReportSchema.parse({
      schemaVersion: 1,
      experimentId: 'feel-run-1',
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
      results: ['A', 'B', 'C'].map((slot) => ({
        slot,
        workspace: `workspace/feel-prototype-${slot.toLowerCase()}`,
        inputResponseMs: { value: 20, passed: true, evidence: 'input trace' },
        releaseVelocityRetentionRatio: { value: 0.95, passed: true, evidence: 'velocity trace' },
        wrongHookAttachments: { value: 0, passed: true, evidence: 'contact trace' },
        maxEventGapMs: { value: 100, passed: true, evidence: 'event trace' },
        retryFrictionMs: { value: 50, passed: true, evidence: 'retry trace' },
        missedFinishDetections: { value: 0, passed: true, evidence: 'finish trace' },
      })),
      recommendation: 'B',
      rationale: 'B passes all thresholds.',
    });
    const review = buildActionFeelExperienceReview({ contractId: 'experience-run-1-action-feel', playtest: report });
    expect(review.decision).toBe('FEEL_REPAIR_REQUIRED');
    expect(review.statuses.naturalPlay).toBe('FAIL');
    expect(review.statuses.presentation).toBe('FAIL');
  });

  it('approves only when independent natural, visual, and perceptual evidence is bound', () => {
    const report = ActionPlaytestReportSchema.parse({
      schemaVersion: 1,
      experimentId: 'feel-run-1',
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
      results: ['A', 'B', 'C'].map((slot) => ({
        slot,
        workspace: `workspace/feel-prototype-${slot.toLowerCase()}`,
        inputResponseMs: { value: 20, passed: true, evidence: 'input trace' },
        releaseVelocityRetentionRatio: { value: 0.95, passed: true, evidence: 'velocity trace' },
        wrongHookAttachments: { value: 0, passed: true, evidence: 'contact trace' },
        maxEventGapMs: { value: 100, passed: true, evidence: 'event trace' },
        retryFrictionMs: { value: 50, passed: true, evidence: 'retry trace' },
        missedFinishDetections: { value: 0, passed: true, evidence: 'finish trace' },
      })),
      recommendation: 'B',
      rationale: 'B passes all thresholds.',
    });
    const review = buildActionFeelExperienceReview({
      contractId: 'experience-run-1-action-feel',
      playtest: report,
      naturalPlayEvidence: { passed: true, freshContext: true, naturalInput: true, replayObserved: true, completion: 'terminal', evidence: ['natural-flow.json'], blockers: [], targetRunId: 'run-1', targetGame: '符刃夜行', targetWorkspace: 'workspace/feel-prototype-b', experimentId: 'feel-run-1', buildHash: 'd'.repeat(64) },
      visualEvidence: { passed: true, evidence: ['screenshots/action-A.png', 'screenshots/action-B.png'], blockers: [], targetRunId: 'run-1', targetGame: '符刃夜行', targetWorkspace: 'workspace/feel-prototype-b', experimentId: 'feel-run-1', buildHash: 'd'.repeat(64) },
      perceptualEvidence: { passed: true, playerVisible: true, authorIndependent: true, evidence: ['perceptual-review.json'], blockers: [], targetRunId: 'run-1', targetGame: '符刃夜行', targetWorkspace: 'workspace/feel-prototype-b', experimentId: 'feel-run-1', buildHash: 'd'.repeat(64) },
      selectedCandidate: { slot: 'B', workspace: 'workspace/feel-prototype-b', targetRunId: 'run-1', targetGame: '符刃夜行', experimentId: 'feel-run-1' },
    });
    expect(review.decision).toBe('APPROVED');
    const unboundReview = buildActionFeelExperienceReview({
      contractId: 'experience-run-1-action-feel',
      playtest: report,
      naturalPlayEvidence: review.decision === 'APPROVED' ? {
        passed: true,
        freshContext: true,
        naturalInput: true,
        replayObserved: true,
        completion: 'terminal',
        evidence: ['natural-flow.json'],
        blockers: [],
        targetRunId: 'run-1',
        targetGame: '符刃夜行',
        targetWorkspace: 'workspace/game',
        experimentId: 'feel-run-1',
        buildHash: 'd'.repeat(64),
      } : undefined,
      visualEvidence: {
        passed: true,
        evidence: ['screenshots/action-B.png'],
        blockers: [],
        targetRunId: 'run-1',
        targetGame: '符刃夜行',
        targetWorkspace: 'workspace/game',
        experimentId: 'feel-run-1',
        buildHash: 'd'.repeat(64),
      },
      perceptualEvidence: {
        passed: true,
        playerVisible: true,
        authorIndependent: true,
        evidence: ['perceptual-review.json'],
        blockers: [],
        targetRunId: 'run-1',
        targetGame: '符刃夜行',
        targetWorkspace: 'workspace/game',
        experimentId: 'feel-run-1',
        buildHash: 'd'.repeat(64),
      },
      selectedCandidate: { slot: 'B', workspace: 'workspace/game', targetRunId: 'run-1', targetGame: '符刃夜行', experimentId: 'feel-run-1' },
    });
    expect(unboundReview.decision).toBe('FEEL_REPAIR_REQUIRED');
  });

  it('rejects natural evidence when visual evidence is blank or missing', () => {
    const report = ActionPlaytestReportSchema.parse({
      schemaVersion: 1,
      experimentId: 'feel-run-1',
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
      results: ['A', 'B', 'C'].map((slot) => ({
        slot,
        workspace: `workspace/feel-prototype-${slot.toLowerCase()}`,
        inputResponseMs: { value: 20, passed: true, evidence: 'input trace' },
        releaseVelocityRetentionRatio: { value: 0.95, passed: true, evidence: 'velocity trace' },
        wrongHookAttachments: { value: 0, passed: true, evidence: 'contact trace' },
        maxEventGapMs: { value: 100, passed: true, evidence: 'event trace' },
        retryFrictionMs: { value: 50, passed: true, evidence: 'retry trace' },
        missedFinishDetections: { value: 0, passed: true, evidence: 'finish trace' },
      })),
      recommendation: 'B',
      rationale: 'B passes all thresholds.',
    });
    const review = buildActionFeelExperienceReview({
      contractId: 'experience-run-1-action-feel',
      playtest: report,
      naturalPlayEvidence: { passed: true, freshContext: true, naturalInput: true, replayObserved: true, completion: 'terminal', evidence: ['natural-flow.json'], blockers: [], targetRunId: 'run-1', targetGame: '符刃夜行', targetWorkspace: 'workspace/feel-prototype-b', experimentId: 'feel-run-1' },
      visualEvidence: { passed: false, evidence: ['screenshots:blank-or-unreadable'], blockers: ['visual:evidence-missing-or-blank'], targetRunId: 'run-1', targetGame: '符刃夜行', targetWorkspace: 'workspace/feel-prototype-b', experimentId: 'feel-run-1' },
      perceptualEvidence: { passed: true, playerVisible: true, authorIndependent: true, evidence: ['perceptual-review.json'], blockers: [], targetRunId: 'run-1', targetGame: '符刃夜行', targetWorkspace: 'workspace/feel-prototype-b', experimentId: 'feel-run-1' },
    });
    expect(review.decision).toBe('FEEL_REPAIR_REQUIRED');
    expect(review.statuses.presentation).toBe('FAIL');
  });

  it('creates a matrix-bound repair triage record for a blocked profile review', () => {
    const triage = buildActionFeelRepairTriage({
      targetRunId: 'run-1',
      targetGame: '符刃夜行',
      targetWorkspace: '/tmp/run/workspace/game',
      sourceArtifacts: [{ path: 'artifacts/action-feel-natural-play-qa.json', sha256: 'a'.repeat(64) }],
    });
    expect(triage.issueId).toBe('action-feel-thresholds');
    expect(triage.reproduction.viewport).toBe('390x844 portrait');
    expect(triage.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
    expect(triage.acceptanceCriteria.some((item) => /engineering evidence only/i.test(item))).toBe(true);
  });
});
