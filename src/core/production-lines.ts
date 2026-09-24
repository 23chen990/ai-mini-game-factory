import { z } from 'zod';
import type { ExperienceProfileSelection } from '../schemas/experience-profile.js';
import { ProductionLineDecisionSchema, type ProductionLineDecision } from '../schemas/production-line.js';

export const ProductionLineSchema = z.enum([
  'single-finger-action',
  'cut-stack-dodge',
  'idle-management',
  'choice-life',
  'rule-puzzle',
]);
export type ProductionLine = z.infer<typeof ProductionLineSchema>;

export type ExperienceProfileSupport = {
  status: 'stable' | 'beta' | 'new-line-required';
  line: ProductionLine | null;
  reason: string;
};

const profileSupport: Record<ExperienceProfileSelection['primary'], ExperienceProfileSupport> = {
  ACTION_FEEL: { status: 'stable', line: 'cut-stack-dodge', reason: 'Action feel has a dedicated interaction and physics line.' },
  NARRATIVE_AGENCY: { status: 'stable', line: 'choice-life', reason: 'Narrative agency has a dedicated branching and replay line.' },
  STRATEGIC_SYSTEM: { status: 'stable', line: 'idle-management', reason: 'Strategic systems use the bounded idle-management line.' },
  PUZZLE_CLARITY: { status: 'stable', line: 'rule-puzzle', reason: 'Puzzle clarity has a dedicated rule-discovery line.' },
  SOCIAL_EMOTION: { status: 'new-line-required', line: null, reason: 'Social/emotional products need additional relationship, moderation and privacy controls.' },
  EXPLORATION_DISCOVERY: { status: 'new-line-required', line: null, reason: 'Exploration products need a separate traversal/content streaming line.' },
};

export function getExperienceProfileSupport(profile: ExperienceProfileSelection['primary']): ExperienceProfileSupport {
  return { ...profileSupport[profile] };
}

export type ProductionLineContract = {
  line: ProductionLine;
  primaryProfile: 'ACTION_FEEL' | 'NARRATIVE_AGENCY' | 'STRATEGIC_SYSTEM' | 'PUZZLE_CLARITY';
  /** Reusable interaction kernel, content topology and progression shell. */
  interactionKernel: string[];
  contentTopology: string[];
  progressionShell: string[];
  status: 'stable' | 'beta' | 'unsupported';
  representativeFlow: string[];
  acceptanceDimensions: string[];
  requiredEvidence: string[];
  /** Reusable mother-template metadata used by Builder and QA routing. */
  template?: string;
  prototypeTemplate?: string;
  experienceMetrics?: string[];
  automaticQaStrategy?: string[];
  contentGenerator?: string;
  uiTemplate?: string;
  performanceBudget?: { maxFrameMs: number; maxMemoryMb: number; maxBundleMb: number };
  qaChecklist?: string[];
};

export const ProductionLineContractSchema = z.object({
  schemaVersion: z.literal(1),
  line: ProductionLineSchema,
  primaryProfile: z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY']),
  interactionKernel: z.array(z.string().trim().min(1)).min(1),
  contentTopology: z.array(z.string().trim().min(1)).min(1),
  progressionShell: z.array(z.string().trim().min(1)).min(1),
  status: z.enum(['stable', 'beta', 'unsupported']).default('stable'),
  representativeFlow: z.array(z.string().trim().min(1)).min(3),
  acceptanceDimensions: z.array(z.string().trim().min(1)).min(3),
  requiredEvidence: z.array(z.string().trim().min(1)).min(2),
  template: z.string().trim().min(1).optional(),
  prototypeTemplate: z.string().trim().min(1).optional(),
  experienceMetrics: z.array(z.string().trim().min(1)).min(1).optional(),
  automaticQaStrategy: z.array(z.string().trim().min(1)).min(1).optional(),
  contentGenerator: z.string().trim().min(1).optional(),
  uiTemplate: z.string().trim().min(1).optional(),
  performanceBudget: z.object({ maxFrameMs: z.number().positive(), maxMemoryMb: z.number().positive(), maxBundleMb: z.number().positive() }).strict().optional(),
  qaChecklist: z.array(z.string().trim().min(1)).min(1).optional(),
  lockedAt: z.string().datetime(),
}).strict();
export type LockedProductionLineContract = z.infer<typeof ProductionLineContractSchema>;

const contracts: Record<ProductionLine, ProductionLineContract> = {
  'single-finger-action': {
    line: 'single-finger-action',
    primaryProfile: 'ACTION_FEEL',
    interactionKernel: ['touch hold/release', 'fixed-step motion', 'contact and miss feedback'],
    contentTopology: ['short lane', 'hazard sequence', 'retryable checkpoint'],
    progressionShell: ['speed or control modifier', 'scoped unlocks', 'seeded challenge variants'],
    status: 'stable',
    representativeFlow: ['reset', 'hold or tap the primary verb', 'release or complete the contact', 'observe motion and feedback', 'fail once and retry immediately'],
    acceptanceDimensions: ['input response', 'motion continuity', 'collision credibility', 'contact feedback', 'retry friction'],
    requiredEvidence: ['natural input trace', 'motion/contact screenshot', 'failure-to-retry trace'],
  },
  'cut-stack-dodge': {
    line: 'cut-stack-dodge',
    primaryProfile: 'ACTION_FEEL',
    interactionKernel: ['tap-flip or swipe/drag cut', 'sharp-edge contact segmentation', 'fixed-step settled-body physics'],
    contentTopology: ['authored course recipe', 'cuttable targets and supports', 'hazard and finish beats'],
    progressionShell: ['course sequence', 'material variants', 'risk-reward order'],
    status: 'stable',
    representativeFlow: ['reset', 'perform three varied cuts or flip contacts', 'observe natural object drop', 'encounter one obstacle', 'fail once and retry to settlement'],
    acceptanceDimensions: ['cut timing', 'drop trajectory', 'impact feedback', 'rhythm', 'retry friction'],
    requiredEvidence: ['natural input trace', 'before/after cut frames', 'drop and failure frames'],
  },
  'idle-management': {
    line: 'idle-management',
    primaryProfile: 'STRATEGIC_SYSTEM',
    interactionKernel: ['produce action', 'delivery resolution', 'upgrade choice'],
    contentTopology: ['station chain', 'customer/order cards', 'milestone unlocks'],
    progressionShell: ['resource sink', 'meaningful trade-off', 'visible next goal'],
    status: 'stable',
    representativeFlow: ['reset', 'produce', 'deliver', 'choose one upgrade trade-off', 'refresh and recover progress'],
    acceptanceDimensions: ['goal clarity', 'resource trade-off', 'reward readability', 'growth pacing', 'refresh recovery'],
    requiredEvidence: ['loop trace', 'resource ledger', 'refresh recovery trace'],
  },
  'choice-life': {
    line: 'choice-life',
    primaryProfile: 'NARRATIVE_AGENCY',
    interactionKernel: ['choice prompt', 'stateful consequence', 'delayed echo'],
    contentTopology: ['chapter beats', 'branch points', 'ending/replay nodes'],
    progressionShell: ['relationship or resource flags', 'chapter unlocks', 'alternate route memory'],
    status: 'stable',
    representativeFlow: ['reset', 'make a meaningful choice', 'observe an immediate consequence', 'reach a delayed consequence', 'replay with the alternate choice'],
    acceptanceDimensions: ['choice distinction', 'causal readability', 'character/relationship response', 'delayed consequence', 'replay reason'],
    requiredEvidence: ['branch trace A', 'branch trace B', 'consequence comparison'],
  },
  'rule-puzzle': {
    line: 'rule-puzzle',
    primaryProfile: 'PUZZLE_CLARITY',
    interactionKernel: ['observable rule', 'legal move resolution', 'fair hint/reset'],
    contentTopology: ['intro rule', 'escalation board', 'variant challenge'],
    progressionShell: ['rule mastery', 'hint economy', 'curated difficulty ladder'],
    status: 'stable',
    representativeFlow: ['reset', 'discover one rule from visible information', 'try a wrong move', 'receive a fair hint or response', 'solve and reset for a variant'],
    acceptanceDimensions: ['rule clarity', 'information fairness', 'error recovery', 'solution feedback', 'variant validity'],
    requiredEvidence: ['rule-discovery trace', 'wrong-attempt trace', 'solution frame'],
  },
};

const motherTemplateProfiles: Record<ProductionLine, Required<Pick<ProductionLineContract, 'template' | 'prototypeTemplate' | 'experienceMetrics' | 'automaticQaStrategy' | 'contentGenerator' | 'uiTemplate' | 'performanceBudget' | 'qaChecklist'>>> = {
  'single-finger-action': { template: 'single-finger-action-v1', prototypeTemplate: 'action-graybox-v1', experienceMetrics: ['input-to-motion-ms', 'contact-credibility', 'retry-latency'], automaticQaStrategy: ['seeded-touch-trace', 'collision-boundary-sweep', 'fail-and-retry'], contentGenerator: 'seeded-lane-and-hazard-generator', uiTemplate: 'action-hud-v1', performanceBudget: { maxFrameMs: 16.7, maxMemoryMb: 160, maxBundleMb: 8 }, qaChecklist: ['touch starts and releases', 'motion is continuous', 'failure state is legible', 'retry is immediate'] },
  'cut-stack-dodge': { template: 'cut-stack-dodge-v1', prototypeTemplate: 'cut-physics-graybox-v1', experienceMetrics: ['cut-response-ms', 'settle-time-ms', 'drop-trajectory-error'], automaticQaStrategy: ['seeded-cut-trace', 'settled-body-check', 'obstacle-and-retry'], contentGenerator: 'seeded-stack-recipe-generator', uiTemplate: 'cut-tool-hud-v1', performanceBudget: { maxFrameMs: 16.7, maxMemoryMb: 180, maxBundleMb: 9 }, qaChecklist: ['cut contact is readable', 'objects settle before scoring', 'drops use physical trajectories', 'retry preserves input affordance'] },
  'idle-management': { template: 'idle-management-v1', prototypeTemplate: 'idle-loop-graybox-v1', experienceMetrics: ['goal-comprehension-s', 'decision-interval-s', 'reward-readability'], automaticQaStrategy: ['seeded-order-loop', 'resource-ledger-check', 'refresh-recovery'], contentGenerator: 'seeded-order-and-upgrade-generator', uiTemplate: 'management-dashboard-v1', performanceBudget: { maxFrameMs: 16.7, maxMemoryMb: 140, maxBundleMb: 7 }, qaChecklist: ['next goal is visible', 'trade-off is explicit', 'reward is attributed', 'refresh recovers state'] },
  'choice-life': { template: 'choice-life-v1', prototypeTemplate: 'narrative-branch-graybox-v1', experienceMetrics: ['choice-distinction', 'consequence-delay-s', 'replay-comprehension'], automaticQaStrategy: ['branch-pair-replay', 'flag-diff-check', 'ending-reachability'], contentGenerator: 'seeded-chapter-and-choice-generator', uiTemplate: 'dialogue-choice-v1', performanceBudget: { maxFrameMs: 16.7, maxMemoryMb: 150, maxBundleMb: 7 }, qaChecklist: ['choices change state', 'consequence is attributable', 'delayed echo is reachable', 'alternate replay differs'] },
  'rule-puzzle': { template: 'rule-puzzle-v1', prototypeTemplate: 'rule-discovery-graybox-v1', experienceMetrics: ['rule-discovery-s', 'wrong-move-recovery', 'solve-confidence'], automaticQaStrategy: ['seeded-rule-sweep', 'illegal-move-check', 'hint-fairness'], contentGenerator: 'seeded-rule-and-board-generator', uiTemplate: 'puzzle-board-v1', performanceBudget: { maxFrameMs: 16.7, maxMemoryMb: 150, maxBundleMb: 8 }, qaChecklist: ['rule is observable', 'wrong move teaches', 'hint is fair', 'variant remains solvable'] },
};

export function getProductionLineContract(line: ProductionLine): ProductionLineContract & typeof motherTemplateProfiles[ProductionLine] {
  const contract = contracts[ProductionLineSchema.parse(line)];
  const profile = motherTemplateProfiles[contract.line];
  return {
    ...contract,
    ...profile,
    interactionKernel: [...contract.interactionKernel],
    contentTopology: [...contract.contentTopology],
    progressionShell: [...contract.progressionShell],
    representativeFlow: [...contract.representativeFlow],
    acceptanceDimensions: [...contract.acceptanceDimensions],
    requiredEvidence: [...contract.requiredEvidence],
    experienceMetrics: [...profile.experienceMetrics],
    automaticQaStrategy: [...profile.automaticQaStrategy],
    qaChecklist: [...profile.qaChecklist],
    performanceBudget: { ...profile.performanceBudget },
  };
}

export function lockProductionLine(line: ProductionLine): LockedProductionLineContract {
  const contract = getProductionLineContract(line);
  return ProductionLineContractSchema.parse({ schemaVersion: 1, ...contract, lockedAt: new Date().toISOString() });
}

const templateLines: Readonly<Record<string, ProductionLine>> = {
  'cut-stack-dodge-v1': 'cut-stack-dodge',
  'idle-shop-v1': 'idle-management',
  'spatial-shop-v1': 'idle-management',
  'spatial-shop-3d-v1': 'idle-management',
};

/** An explicitly selected mother template is authoritative production-line evidence. */
export function productionLineForTemplate(template: string): ProductionLine | undefined {
  return templateLines[template];
}

export function inferProductionLine(profile: Pick<ExperienceProfileSelection, 'primary' | 'secondary'>): ProductionLine {
  if (profile.primary === 'NARRATIVE_AGENCY') return 'choice-life';
  if (profile.primary === 'PUZZLE_CLARITY') return 'rule-puzzle';
  if (profile.primary === 'ACTION_FEEL') return profile.secondary === 'NATURAL_PLAY' ? 'single-finger-action' : 'cut-stack-dodge';
  return 'idle-management';
}

/** Deterministic fallback used when a legacy seed has no explicit profile field. */
export function inferProductionLineFromText(value: string): ProductionLine {
  const text = value.toLowerCase();
  if (/(剧情|叙事|选择|人生|故事|dialogue|narrative|choice|story)/iu.test(text)) return 'choice-life';
  if (/(解谜|谜题|规则|拼图|推箱|puzzle|sokoban|match)/iu.test(text)) return 'rule-puzzle';
  if (/(切割|堆叠|躲避|跑酷|物理|碰撞|slice|stack|dodge|runner|physics)/iu.test(text)) return 'cut-stack-dodge';
  if (/(动作|手感|跳跃|移动|action|feel)/iu.test(text)) return 'single-finger-action';
  return 'idle-management';
}

/**
 * Route a request with an explicit support decision. This is intentionally
 * separate from the legacy line-only inference so unsupported profiles cannot
 * silently fall back to the idle template.
 */
export function inferProductionLineDecisionFromText(value: string): ProductionLineDecision {
  const text = value.toLowerCase();
  const signals: string[] = [];
  const unsupported = /(?:实时(?:多人|pvp)|多人联机|开放世界|open[- ]?world|ugc|用户生成|真实支付|real[- ]?money)/iu.test(text);
  const social = /(?:社交|情感互动|关系经营|聊天|dating|social|relationship)/iu.test(text);
  const exploration = /(?:探索|开放区域|探险|探索发现|exploration|discovery|traversal)/iu.test(text);
  const puzzle = /(?:解谜|谜题|规则发现|推箱|消除|拼图|puzzle|sokoban|match-3)/iu.test(text);
  const narrative = /(?:剧情|叙事|故事|人物|角色关系|选择后果|结局|章节|narrative|story|dialogue)/iu.test(text);
  const action = /(?:动作|手感|物理|碰撞|切割|切开|堆叠|躲避|跑酷|射击|跳跃|移动|反弹|打击|action|feel|physics|collision|cut|slice|stack|dodge|runner)/iu.test(text);
  if (unsupported) { signals.push('unsupported-product-shape'); return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'UNSUPPORTED', profile: social ? 'SOCIAL_EMOTION' : exploration ? 'EXPLORATION_DISCOVERY' : 'STRATEGIC_SYSTEM', line: null, detectedSignals: signals, reason: 'The request exceeds the default light-game production boundary.' }); }
  if (social) { signals.push('social-emotion'); return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'NEW_LINE_REQUIRED', profile: 'SOCIAL_EMOTION', line: null, detectedSignals: signals, reason: 'Social and relationship products need a separate moderation, privacy and relationship-state line.' }); }
  if (exploration) { signals.push('exploration-discovery'); return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'NEW_LINE_REQUIRED', profile: 'EXPLORATION_DISCOVERY', line: null, detectedSignals: signals, reason: 'Exploration products need a traversal and content-streaming line.' }); }
  if (puzzle) { signals.push('puzzle-clarity'); return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'SUPPORTED', profile: 'PUZZLE_CLARITY', line: 'rule-puzzle', detectedSignals: signals, reason: 'The request maps to the stable rule-puzzle line.' }); }
  if (narrative) { signals.push('narrative-agency'); return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'SUPPORTED', profile: 'NARRATIVE_AGENCY', line: 'choice-life', detectedSignals: signals, reason: 'The request maps to the stable choice-life line.' }); }
  if (action) { signals.push('action-feel'); return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'SUPPORTED', profile: 'ACTION_FEEL', line: 'cut-stack-dodge', detectedSignals: signals, reason: 'The request maps to the stable action-feel line.' }); }
  signals.push('strategic-system-default');
  return ProductionLineDecisionSchema.parse({ schemaVersion: 1, supportDecision: 'SUPPORTED', profile: 'STRATEGIC_SYSTEM', line: 'idle-management', detectedSignals: signals, reason: 'The request uses the bounded idle-management default.' });
}
