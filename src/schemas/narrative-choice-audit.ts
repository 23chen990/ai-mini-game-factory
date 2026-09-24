import { z } from 'zod';
import { resolveNarrativeEnding, type NarrativeLifePrototype } from './narrative-life-prototype.js';

const StatIdSchema = z.enum(['economy', 'skill', 'health', 'bonds']);
const EffectsSchema = z.object({
  economy: z.number().int().optional(),
  skill: z.number().int().optional(),
  health: z.number().int().optional(),
  bonds: z.number().int().optional(),
}).strict();
const PrioritySchema = z.enum(['P1', 'P2', 'P3']);
const IssueSchema = z.object({
  code: z.enum([
    'NUMERIC_DOMINANCE',
    'BODY_TOO_LONG',
    'CHOICE_LABEL_TOO_LONG',
    'RESULT_TOO_LONG',
    'LOW_SYSTEM_COVERAGE',
    'GATE_NEVER_AVAILABLE',
    'GATE_RARELY_AVAILABLE',
    'GATE_ALMOST_ALWAYS_AVAILABLE',
    'ENDING_OVERCONCENTRATION',
    'ENDINGS_UNSEEN_IN_SAMPLE',
  ]),
  priority: PrioritySchema,
  message: z.string().trim().min(1),
}).strict();

const EventIssueSchema = IssueSchema.omit({ code: true }).extend({
  code: z.enum([
    'NUMERIC_DOMINANCE',
    'BODY_TOO_LONG',
    'CHOICE_LABEL_TOO_LONG',
    'RESULT_TOO_LONG',
    'LOW_SYSTEM_COVERAGE',
    'GATE_NEVER_AVAILABLE',
    'GATE_RARELY_AVAILABLE',
    'GATE_ALMOST_ALWAYS_AVAILABLE',
  ]),
}).strict();

export const NarrativeChoiceAuditSchema = z.object({
  schemaVersion: z.literal(1),
  auditVersion: z.literal('choice-audit-v1'),
  prototypeId: z.string().trim().min(1),
  method: z.object({
    plotlessReview: z.literal(true),
    deterministic: z.literal(true),
    note: z.string().trim().min(1),
  }).strict(),
  thresholds: z.object({
    bodyMaxChars: z.number().int().positive(),
    choiceLabelMaxChars: z.number().int().positive(),
    resultMaxChars: z.number().int().positive(),
    rareGateRate: z.number().min(0).max(1),
    trivialGateRate: z.number().min(0).max(1),
    endingConcentrationRate: z.number().min(0).max(1),
  }).strict(),
  summary: z.object({
    score: z.number().int().min(0).max(100),
    recommendation: z.enum(['PASS', 'REVISE', 'BLOCK']),
    greenEvents: z.number().int().nonnegative(),
    yellowEvents: z.number().int().nonnegative(),
    redEvents: z.number().int().nonnegative(),
    p1Issues: z.number().int().nonnegative(),
    p2Issues: z.number().int().nonnegative(),
    p3Issues: z.number().int().nonnegative(),
  }).strict(),
  globalIssues: z.array(IssueSchema),
  systemInfluence: z.array(z.object({
    statId: StatIdSchema,
    eventCount: z.number().int().nonnegative(),
    choiceCount: z.number().int().nonnegative(),
  }).strict()).length(4),
  events: z.array(z.object({
    eventId: z.string().trim().min(1),
    year: z.number().int(),
    title: z.string().trim().min(1),
    status: z.enum(['GREEN', 'YELLOW', 'RED']),
    tradeoff: z.enum(['BALANCED', 'GATED_POWER', 'NUMERIC_DOMINANCE', 'IDENTITY_ONLY']),
    affectedSystems: z.array(StatIdSchema),
    choices: z.array(z.object({
      choiceId: z.string().trim().min(1),
      label: z.string().trim().min(1),
      totalEffects: EffectsSchema,
      requirement: z.string().trim().min(1).nullable(),
      availabilityRate: z.number().min(0).max(1).nullable(),
    }).strict()).length(2),
    issues: z.array(EventIssueSchema),
  }).strict()),
  simulation: z.object({
    sampleRuns: z.number().int().positive(),
    seed: z.number().int(),
    gatedChoiceAvailability: z.array(z.object({
      choiceId: z.string().trim().min(1),
      attempted: z.number().int().nonnegative(),
      available: z.number().int().nonnegative(),
      availableRate: z.number().min(0).max(1),
    }).strict()),
    endingRates: z.array(z.object({
      endingId: z.string().trim().min(1),
      count: z.number().int().nonnegative(),
      rate: z.number().min(0).max(1),
    }).strict()),
  }).strict(),
  humanSpotCheck: z.object({
    required: z.literal(true),
    testers: z.literal(5),
    cardsPerTester: z.literal(8),
    passRules: z.array(z.string().trim().min(1)).length(4),
  }).strict(),
}).strict();

export type NarrativeChoiceAudit = z.infer<typeof NarrativeChoiceAuditSchema>;

export type NarrativeChoiceAuditOptions = {
  sampleRuns?: number;
  seed?: number;
};

type StatId = z.infer<typeof StatIdSchema>;
type AuditIssue = z.infer<typeof IssueSchema>;
type EventAuditIssue = z.infer<typeof EventIssueSchema>;

const STAT_IDS: StatId[] = ['economy', 'skill', 'health', 'bonds'];
const STAT_LABELS: Record<StatId, string> = {
  economy: '家底',
  skill: '本事',
  health: '身体',
  bonds: '人情',
};
const DEFAULT_THRESHOLDS = {
  bodyMaxChars: 90,
  choiceLabelMaxChars: 18,
  resultMaxChars: 90,
  rareGateRate: 0.08,
  trivialGateRate: 0.92,
  endingConcentrationRate: 0.45,
} as const;

function characterCount(value: string): number {
  return [...value].length;
}

function addEffects(
  immediate: Record<string, number>,
  delayed: Record<string, number>,
): Partial<Record<StatId, number>> {
  return Object.fromEntries(STAT_IDS.flatMap((statId) => {
    const value = (immediate[statId] ?? 0) + (delayed[statId] ?? 0);
    return value === 0 ? [] : [[statId, value]];
  })) as Partial<Record<StatId, number>>;
}

function compareEffects(
  left: Partial<Record<StatId, number>>,
  right: Partial<Record<StatId, number>>,
): 'LEFT' | 'RIGHT' | 'NONE' | 'EQUAL' {
  const comparisons = STAT_IDS.map((statId) => (left[statId] ?? 0) - (right[statId] ?? 0));
  const leftDominates = comparisons.every((value) => value >= 0) && comparisons.some((value) => value > 0);
  const rightDominates = comparisons.every((value) => value <= 0) && comparisons.some((value) => value < 0);
  if (leftDominates) return 'LEFT';
  if (rightDominates) return 'RIGHT';
  return comparisons.every((value) => value === 0) ? 'EQUAL' : 'NONE';
}

function requirementText(
  requirements: NarrativeLifePrototype['events'][number]['choices'][number]['requirements'],
): string | null {
  if (!requirements) return null;
  const parts = Object.entries(requirements.stats ?? {}).map(([statId, bounds]) => {
    const label = STAT_LABELS[statId as StatId] ?? statId;
    if (bounds.min !== undefined && bounds.max !== undefined) return `${label} ${bounds.min}—${bounds.max}`;
    if (bounds.min !== undefined) return `${label}≥${bounds.min}`;
    return `${label}≤${String(bounds.max)}`;
  });
  if ((requirements.allFlags?.length ?? 0) > 0) parts.push(`经历齐备×${requirements.allFlags!.length}`);
  if ((requirements.anyFlags?.length ?? 0) > 0) parts.push(`相关经历×${requirements.anyFlags!.length}`);
  if ((requirements.noneFlags?.length ?? 0) > 0) parts.push(`排除经历×${requirements.noneFlags!.length}`);
  return parts.join(' · ');
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function simulate(prototype: NarrativeLifePrototype, sampleRuns: number, seed: number) {
  const random = createRandom(seed);
  const gatedChoices = prototype.events.flatMap(({ choices }) => choices).filter(({ requirements }) => requirements !== undefined);
  const availability = new Map(gatedChoices.map(({ id }) => [id, { attempted: 0, available: 0 }]));
  const endingCounts = new Map(prototype.endings.map(({ id }) => [id, 0]));

  for (let runIndex = 0; runIndex < sampleRuns; runIndex += 1) {
    const selected = prototype.events.map(({ choices }) => choices[random() < 0.5 ? 0 : 1]!.id);
    const selectedGated = new Set(selected.filter((choiceId) => availability.has(choiceId)));
    selectedGated.forEach((choiceId) => { availability.get(choiceId)!.attempted += 1; });
    const rejected = new Set<string>();
    let resolved: ReturnType<typeof resolveNarrativeEnding> | undefined;

    for (let attempt = 0; attempt <= gatedChoices.length; attempt += 1) {
      try {
        resolved = resolveNarrativeEnding(prototype, selected);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const match = /^choice (.+) is unavailable because/.exec(message);
        if (!match) throw error;
        const choiceId = match[1]!;
        rejected.add(choiceId);
        const eventIndex = prototype.events.findIndex(({ choices }) => choices.some(({ id }) => id === choiceId));
        const fallback = prototype.events[eventIndex]?.choices.find(({ requirements }) => requirements === undefined);
        if (eventIndex < 0 || !fallback) throw new Error(`audit could not find fallback for unavailable choice ${choiceId}`);
        selected[eventIndex] = fallback.id;
      }
    }
    if (!resolved) throw new Error(`audit could not resolve simulation run ${runIndex}`);
    selectedGated.forEach((choiceId) => {
      if (!rejected.has(choiceId)) availability.get(choiceId)!.available += 1;
    });
    endingCounts.set(resolved.ending.id, (endingCounts.get(resolved.ending.id) ?? 0) + 1);
  }

  return {
    sampleRuns,
    seed,
    gatedChoiceAvailability: gatedChoices.map(({ id }) => {
      const counts = availability.get(id)!;
      return {
        choiceId: id,
        attempted: counts.attempted,
        available: counts.available,
        availableRate: counts.attempted === 0 ? 0 : counts.available / counts.attempted,
      };
    }),
    endingRates: prototype.endings.map(({ id }) => {
      const count = endingCounts.get(id) ?? 0;
      return { endingId: id, count, rate: count / sampleRuns };
    }),
  };
}

function countPriorities(issues: Array<{ priority: 'P1' | 'P2' | 'P3' }>) {
  return {
    p1: issues.filter(({ priority }) => priority === 'P1').length,
    p2: issues.filter(({ priority }) => priority === 'P2').length,
    p3: issues.filter(({ priority }) => priority === 'P3').length,
  };
}

export function auditNarrativeChoices(
  prototype: NarrativeLifePrototype,
  options: NarrativeChoiceAuditOptions = {},
): NarrativeChoiceAudit {
  const sampleRuns = options.sampleRuns ?? 4096;
  const seed = options.seed ?? 1978;
  if (!Number.isInteger(sampleRuns) || sampleRuns <= 0) throw new Error('sampleRuns must be a positive integer');
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
  const simulation = simulate(prototype, sampleRuns, seed);
  const gateRates = new Map(simulation.gatedChoiceAvailability.map((entry) => [entry.choiceId, entry.availableRate]));
  const systemInfluence = STAT_IDS.map((statId) => ({
    statId,
    eventCount: prototype.events.filter(({ choices }) => choices.some((choice) => (
      choice.immediateEffects[statId] !== undefined
      || choice.delayedEcho.effects[statId] !== undefined
      || choice.requirements?.stats?.[statId] !== undefined
    ))).length,
    choiceCount: prototype.events.flatMap(({ choices }) => choices).filter((choice) => (
      choice.immediateEffects[statId] !== undefined
      || choice.delayedEcho.effects[statId] !== undefined
      || choice.requirements?.stats?.[statId] !== undefined
    )).length,
  }));

  const events = prototype.events.map((event) => {
    const issues: EventAuditIssue[] = [];
    const choiceEffects = event.choices.map((choice) => addEffects(choice.immediateEffects, choice.delayedEcho.effects));
    const dominance = compareEffects(choiceEffects[0]!, choiceEffects[1]!);
    const dominantChoice = dominance === 'LEFT' ? event.choices[0] : dominance === 'RIGHT' ? event.choices[1] : undefined;
    let tradeoff: NarrativeChoiceAudit['events'][number]['tradeoff'] = dominance === 'EQUAL' ? 'IDENTITY_ONLY' : 'BALANCED';
    if (dominantChoice) {
      if (dominantChoice.requirements) {
        tradeoff = 'GATED_POWER';
      } else {
        tradeoff = 'NUMERIC_DOMINANCE';
        issues.push({
          code: 'NUMERIC_DOMINANCE',
          priority: 'P1',
          message: `${dominantChoice.id} 在四项可见数值上无代价地压过另一项，容易形成标准答案。`,
        });
      }
    }

    const bodyLength = characterCount(prototype.strings[event.bodyTextId]!);
    if (bodyLength > DEFAULT_THRESHOLDS.bodyMaxChars) {
      issues.push({ code: 'BODY_TOO_LONG', priority: 'P2', message: `正文 ${bodyLength} 字，超过单卡 ${DEFAULT_THRESHOLDS.bodyMaxChars} 字上限。` });
    }
    event.choices.forEach((choice) => {
      const labelLength = characterCount(prototype.strings[choice.labelTextId]!);
      const resultLength = characterCount(prototype.strings[choice.resultTextId]!);
      if (labelLength > DEFAULT_THRESHOLDS.choiceLabelMaxChars) {
        issues.push({ code: 'CHOICE_LABEL_TOO_LONG', priority: 'P2', message: `${choice.id} 标签 ${labelLength} 字，按钮扫读过慢。` });
      }
      if (resultLength > DEFAULT_THRESHOLDS.resultMaxChars) {
        issues.push({ code: 'RESULT_TOO_LONG', priority: 'P3', message: `${choice.id} 即时结果 ${resultLength} 字，反馈节奏偏慢。` });
      }
      if (choice.requirements) {
        const availabilityRate = gateRates.get(choice.id) ?? 0;
        if (availabilityRate === 0) {
          issues.push({ code: 'GATE_NEVER_AVAILABLE', priority: 'P1', message: `${choice.id} 在抽样中从未满足条件。` });
        } else if (availabilityRate < DEFAULT_THRESHOLDS.rareGateRate) {
          issues.push({ code: 'GATE_RARELY_AVAILABLE', priority: 'P2', message: `${choice.id} 仅 ${(availabilityRate * 100).toFixed(1)}% 的尝试可选。` });
        } else if (availabilityRate > DEFAULT_THRESHOLDS.trivialGateRate) {
          issues.push({ code: 'GATE_ALMOST_ALWAYS_AVAILABLE', priority: 'P3', message: `${choice.id} 有 ${(availabilityRate * 100).toFixed(1)}% 的尝试可选，门槛存在感很弱。` });
        }
      }
    });

    const affectedSystems = STAT_IDS.filter((statId) => event.choices.some((choice) => (
      choice.immediateEffects[statId] !== undefined
      || choice.delayedEcho.effects[statId] !== undefined
      || choice.requirements?.stats?.[statId] !== undefined
    )));
    if (affectedSystems.length < 2) {
      issues.push({ code: 'LOW_SYSTEM_COVERAGE', priority: 'P2', message: '这张卡只牵动一个可见系统，选择后果偏单薄。' });
    }
    const priorities = countPriorities(issues);
    return {
      eventId: event.id,
      year: event.year,
      title: prototype.strings[event.titleTextId]!,
      status: priorities.p1 > 0 ? 'RED' as const : issues.length > 0 ? 'YELLOW' as const : 'GREEN' as const,
      tradeoff,
      affectedSystems,
      choices: event.choices.map((choice, index) => ({
        choiceId: choice.id,
        label: prototype.strings[choice.labelTextId]!,
        totalEffects: choiceEffects[index]!,
        requirement: requirementText(choice.requirements),
        availabilityRate: choice.requirements ? (gateRates.get(choice.id) ?? 0) : null,
      })) as NarrativeChoiceAudit['events'][number]['choices'],
      issues,
    };
  });

  const globalIssues: AuditIssue[] = [];
  const largestEndingRate = Math.max(...simulation.endingRates.map(({ rate }) => rate));
  if (largestEndingRate > DEFAULT_THRESHOLDS.endingConcentrationRate) {
    globalIssues.push({
      code: 'ENDING_OVERCONCENTRATION',
      priority: 'P2',
      message: `最高频结局占 ${(largestEndingRate * 100).toFixed(1)}%，随机人生可能过度收束。`,
    });
  }
  const unseenEndingCount = simulation.endingRates.filter(({ count }) => count === 0).length;
  if (unseenEndingCount > 0) {
    globalIssues.push({
      code: 'ENDINGS_UNSEEN_IN_SAMPLE',
      priority: 'P3',
      message: `${unseenEndingCount} 个结局未在均匀随机抽样中出现；它们仍由既有人工路径证明可达。`,
    });
  }

  const allIssues = [...events.flatMap(({ issues }) => issues), ...globalIssues];
  const priorities = countPriorities(allIssues);
  const hasDeadGate = events.some(({ issues }) => issues.some(({ code }) => code === 'GATE_NEVER_AVAILABLE'));
  const score = Math.max(0, 100 - priorities.p1 * 8 - priorities.p2 * 3 - priorities.p3);
  const report = {
    schemaVersion: 1 as const,
    auditVersion: 'choice-audit-v1' as const,
    prototypeId: prototype.prototypeId,
    method: {
      plotlessReview: true as const,
      deterministic: true as const,
      note: '报告不复制剧情正文或结果文案，只检查数值权衡、条件可达性、四系统参与度、移动端字数与结局分布。',
    },
    thresholds: DEFAULT_THRESHOLDS,
    summary: {
      score,
      recommendation: hasDeadGate ? 'BLOCK' as const : priorities.p1 > 0 || priorities.p2 > 0 ? 'REVISE' as const : 'PASS' as const,
      greenEvents: events.filter(({ status }) => status === 'GREEN').length,
      yellowEvents: events.filter(({ status }) => status === 'YELLOW').length,
      redEvents: events.filter(({ status }) => status === 'RED').length,
      p1Issues: priorities.p1,
      p2Issues: priorities.p2,
      p3Issues: priorities.p3,
    },
    globalIssues,
    systemInfluence,
    events,
    simulation,
    humanSpotCheck: {
      required: true as const,
      testers: 5 as const,
      cardsPerTester: 8 as const,
      passRules: [
        '至少 80% 的选择能在 8 秒内完成，不需要展开剧情说明。',
        '同一张卡的选择理由不能有 80% 以上都归结为“这项数值更高”。',
        '至少 4/5 位测试者能说清选项影响的是哪一到两个系统。',
        '至少 3/5 位测试者愿意重开一次验证另一条人生路线。',
      ],
    },
  };
  return NarrativeChoiceAuditSchema.parse(report);
}
