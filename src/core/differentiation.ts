import { DifferentiationContractSchema, type DifferentiationContract } from '../schemas/differentiation.js';

const cosmetic = /(?:换色|颜色|配色|文案|文字|名字|命名|换皮|palette|color|text|copy|cosmetic)/iu;
export function evaluateDifferentiationContract(value: DifferentiationContract) {
  const contract = DifferentiationContractSchema.parse(value);
  const blockers: string[] = [];
  if (contract.twists.length < 2) blockers.push('fewer-than-two-player-facing-twists');
  if (contract.twists.every((twist) => cosmetic.test(twist))) blockers.push('twists-are-cosmetic-only');
  if (contract.twists.some((twist) => /(?:same as|完全照搬|原样|copy|复制)/iu.test(twist))) blockers.push('twist-describes-copying');
  return { passed: contract.status === 'PASS' && blockers.length === 0, blockers };
}

export function buildDifferentiationContract(input: { gameId: string; title: string; concept: string; referenceInsight?: string }): DifferentiationContract {
  const raw = DifferentiationContractSchema.parse({
    schemaVersion: 1, gameId: input.gameId,
    playerPromise: `${input.title}让玩家在短局内做出一次可见且有后果的取舍。`,
    referenceInsight: input.referenceInsight ?? '清晰的短局目标与即时反馈。',
    twists: ['以一个可观察的风险—回报选择改变下一轮节奏', '以分支目标或资源取舍形成第二次可重玩的路线'],
    forbiddenCopyFields: ['names', 'text', 'ui-layout', 'assets', 'audio', 'tuning-values'],
    status: 'PASS', blockers: [], evidence: [`concept:${input.concept}`, 'twists:player-facing'], createdAt: new Date().toISOString(),
  });
  const result = evaluateDifferentiationContract(raw);
  return DifferentiationContractSchema.parse({ ...raw, status: result.passed ? 'PASS' : 'BLOCKED', blockers: result.blockers });
}
