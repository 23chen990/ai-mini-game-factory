import { describe, expect, it } from 'vitest';
import { ExperienceContractSchema, ExperienceReviewReportSchema, NaturalPlayPlanSchema } from '../../src/schemas/experience-contract.js';

const contract = {
  schemaVersion: 1,
  contractId: 'feel-contract-1',
  targetGame: '符刃夜行',
  targetWorkspace: 'runs/example/workspace/game',
  lockedBy: 'human',
  pillars: [
    { id: 'weight', name: '有重量的动作', observable: '切割后碎片先分离再下坠' },
    { id: 'causality', name: '因果可信', observable: '切割方向改变碎片分离方向' },
    { id: 'readability', name: '反馈可读', observable: '玩家能看出切中、反弹和失败原因' },
  ],
  feedbackTiming: { impactMs: 80, settleMs: 900, inputNeverBlocked: true },
  motionInvariants: ['固定步进模拟', '切割方向影响分离方向', '碎片最终进入静止状态'],
  causalRules: ['接触点决定冲量', '场景碰撞与视觉同步', '已分离接触不得凭空加速'],
  antiPatterns: ['瞬移', '无接触反弹', '测试脚本坐标特判'],
  acceptanceIds: ['FEEL-001', 'FEEL-002', 'FEEL-003', 'FEEL-004'],
};

describe('experience contracts', () => {
  it('requires observable, causal feel invariants instead of a vague quality flag', () => {
    expect(ExperienceContractSchema.parse(contract).pillars).toHaveLength(3);
    expect(() => ExperienceContractSchema.parse({ ...contract, causalRules: [] })).toThrow();
  });

  it('requires oracle-free natural-play evidence inputs', () => {
    const plan = NaturalPlayPlanSchema.parse({
      schemaVersion: 1,
      contractId: contract.contractId,
      startCommand: 'resetGame',
      inputMode: 'mouse_and_touch',
      forbiddenApis: ['loadScenario', 'debugSetVelocity'],
      scenarios: [
        { id: 'cut', goal: '从起点自然切开首个目标' },
        { id: 'recover', goal: '从一次反弹后自然救回' },
        { id: 'finish', goal: '不读取关卡坐标完成终点' },
      ],
      successCriteria: ['真实输入可完成', '失败原因可归因', '同一动作反馈一致'],
      evidenceCheckpoints: ['切割瞬间截图', '碎片落地截图'],
      oracleFree: true,
    });
    expect(plan.oracleFree).toBe(true);
  });

  it('makes experience failures first-class and blocks silent greenlighting', () => {
    const report = ExperienceReviewReportSchema.parse({
      schemaVersion: 1,
      contractId: contract.contractId,
      statuses: { mechanics: 'PASS', feel: 'FAIL', naturalPlay: 'FAIL', presentation: 'PARTIAL' },
      oracleDetected: true,
      issues: [{ id: 'FEEL-001', severity: 'blocker', category: 'motion', evidence: '碎片无接触横向爆射' }],
      decision: 'FEEL_REPAIR_REQUIRED',
    });
    expect(report.decision).toBe('FEEL_REPAIR_REQUIRED');
  });
});
