import { describe, expect, it } from 'vitest';
import { AcceptanceManifestSchema, ActionRealizabilitySchema, PlaytestTraceSchema, ProfileReviewReportSchema, PlayerAcceptanceGateSchema, isPlayerAcceptanceReady } from '../../src/schemas/acceptance-artifacts.js';

const manifest = {
  schemaVersion: 1,
  manifestId: 'acceptance-1',
  targetGame: '村口向南',
  targetWorkspace: 'runs/example/workspace/game',
  experienceProfile: { primary: 'NARRATIVE_AGENCY', secondary: 'REPLAY_VALUE' },
  primaryExperience: '玩家因选择后果而想继续下一次人生决策',
  playTasks: [
    { id: 'route-a', goal: '完成一条自然路线', input: '真实点击两个选择' },
    { id: 'route-b', goal: '完成相反路线', input: '不读取内部状态' },
    { id: 'replay', goal: '重开并发现不同后果', input: '从新局开始' },
  ],
  forbiddenShortcuts: ['loadScenario', 'debugSetState'],
  successMetrics: ['玩家能解释路线差异', '至少三个后果改变后续内容'],
  failureMetrics: ['选择只改变文案', '玩家无法解释失败原因'],
  evidenceRequired: ['playtest trace', 'route comparison'],
};

describe('acceptance artifacts', () => {
  it('models action realizability generically without game-specific mechanics', () => {
    const contract = ActionRealizabilitySchema.parse({
      schemaVersion: 1,
      actionId: 'primary-interaction',
      feedbackSignal: 'the highlighted candidate is actionable now',
      successCondition: 'the action enters its intended playable state',
      constraints: [{ id: 'response-window', measure: 'time-to-resolution-ms', operator: '<=', target: 1000 }],
      recovery: { required: true, description: 'a recoverable miss or protected retry window' },
      repetition: { attempts: 3, minimumSuccesses: 3 },
      evidence: ['trace.json', 'feedback.png'],
    });
    expect(contract.actionId).toBe('primary-interaction');
  });

  it('requires five player-facing acceptance dimensions before release readiness', () => {
    const dimension = { passed: true, evidence: 'normal-flow trace and screenshot evidence' };
    const gate = PlayerAcceptanceGateSchema.parse({
      schemaVersion: 1, core: dimension, normalFlow: dimension, visualEvidence: dimension,
      levelDifference: dimension, humanPlaytest: dimension, releaseReady: true,
    });
    expect(isPlayerAcceptanceReady(gate)).toBe(true);
    expect(() => PlayerAcceptanceGateSchema.parse({ ...gate, releaseReady: false })).toThrow(/releaseReady/);
  });

  it('blocks release readiness when any player-facing dimension fails', () => {
    const dimension = { passed: true, evidence: 'evidence' };
    expect(() => PlayerAcceptanceGateSchema.parse({
      schemaVersion: 1, core: dimension, normalFlow: { passed: false, evidence: 'normal-flow failed at net encounter' },
      visualEvidence: dimension, levelDifference: dimension, humanPlaytest: dimension, releaseReady: true,
    })).toThrow(/releaseReady/);
  });

  it('requires profile-specific natural-play tasks and explicit anti-oracle rules', () => {
    expect(AcceptanceManifestSchema.parse(manifest).experienceProfile.primary).toBe('NARRATIVE_AGENCY');
    expect(() => AcceptanceManifestSchema.parse({ ...manifest, forbiddenShortcuts: [] })).toThrow();
  });

  it('records a replayable trace rather than only a screenshot', () => {
    const trace = PlaytestTraceSchema.parse({
      schemaVersion: 1,
      manifestId: manifest.manifestId,
      sessionId: 'session-1',
      inputMode: 'touch',
      naturalInput: true,
      events: [
        { atMs: 0, kind: 'reset', detail: 'resetGame' },
        { atMs: 1200, kind: 'input', detail: 'choice-a' },
        { atMs: 1800, kind: 'feedback', detail: 'economy -1, bonds +2' },
      ],
      outcome: 'completed',
      playerNotes: ['第二局出现了不同事件'],
      evidence: ['trace.json', 'route-b.png'],
    });
    expect(trace.naturalInput).toBe(true);
  });

  it('cannot approve a profile when its primary experience failed', () => {
    const report = ProfileReviewReportSchema.parse({
      schemaVersion: 1,
      manifestId: manifest.manifestId,
      profile: 'NARRATIVE_AGENCY',
      dimensions: { primaryExperience: 'FAIL', technical: 'PASS', naturalPlay: 'FAIL', replayValue: 'PARTIAL' },
      issues: [{ id: 'NARR-001', severity: 'blocker', evidence: '两条路线只有结果文案不同' }],
      decision: 'REWORK',
    });
    expect(report.decision).toBe('REWORK');
  });
});
