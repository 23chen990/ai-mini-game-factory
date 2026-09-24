import {
  RequestRouteSchema,
  RequestRouterInputSchema,
  ReviewEscalationSchema,
  type OptionalReviewStage,
  type RequestRoute,
  type RequestRouterInput,
  type RequestType,
  type ReviewEscalation,
  type StageName,
  type ExperienceProfileSelection,
} from '../schemas/index.js';
import { decideFeedbackRepairRoute } from './feedback-routing.js';

const NEW_GAME_STAGES: StageName[] = [
  'REFERENCE_DEEP_RESEARCH',
  'REFERENCE_MECHANIC_LOCK',
  'WAITING_FOR_REFERENCE_APPROVAL',
  'BLUEPRINT',
  'CORE_SPEC_FROZEN',
  'FULL_BUILD',
  'QA',
  'COMPLETED',
];

const REVISION_STAGES: Record<Exclude<RequestType, 'NEW_GAME'>, StageName[]> = {
  GAMEPLAY_REVISION: ['FULL_BUILD', 'QA'],
  PRODUCTIZATION_REVISION: ['EXPERIENCE_CONTRACT', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'CONTENT_EXPANSION', 'UI_SKELETON', 'FULL_BUILD', 'QA'],
  VISUAL_REVISION: ['ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK', 'ASSETS', 'FULL_BUILD', 'QA'],
  BALANCE_REVISION: ['FULL_BUILD', 'QA'],
  BUG_FIX: ['FIX', 'QA'],
  MONETIZATION_REVISION: ['FULL_BUILD', 'QA'],
  RELEASE: ['RELEASE'],
};

const CORE_ACTION_PROTOTYPE_STAGES: StageName[] = [
  'ACTION_EXPERIMENT_SPEC',
  'BUILD_ACTION_PROTOTYPES',
  'PLAYTEST_ACTION_PROTOTYPES',
  'WAITING_FOR_ACTION_APPROVAL',
];

const CORE_ACTION_PATTERN = /(?:摆荡手感|物理手感|自动选钩|松手动量|核心动作手感)/iu;
const PRODUCTIZATION_PATTERN = /(?:demo\s*(?:已|已经)?\s*(?:批准|通过)|扩(?:展|充)玩法|扩关卡|更多关卡|完善玩法|产品化|content\s*expansion|producti[sz]ation)/iu;
const DEEP_REFERENCE_PATTERN = /(?:竞品|复刻|还原|copy|竞品体验|核心体验).*(?:深度|完整|机制|关卡)|(?:深度|完整).*(?:竞品|复刻|还原|copy)/iu;
const NARRATIVE_PATTERN = /(?:剧情|叙事|故事|人物|角色关系|选择后果|结局|章节|文本人生|narrative|story|dialogue)/iu;
const SOCIAL_PATTERN = /(?:社交|情感互动|关系经营|聊天|dating|social|relationship)/iu;
const EXPLORATION_PATTERN = /(?:探索|地图|开放区域|探险|探索发现|exploration|discovery|traversal)/iu;
const PUZZLE_PATTERN = /(?:解谜|谜题|规则发现|推箱|消除|拼图|puzzle|sokoban|match-3)/iu;
const ACTION_FEEL_PATTERN = /(?:动作|手感|物理|碰撞|切割|射击|跳跃|移动|反弹|打击|action|feel|physics|collision)/iu;
const SEMANTIC_AUDIT_PATTERN = /(?:孤立交互对象|可触碰|可绕行|用于恢复|decorative|gameplay collider|交互对象.*视觉|视觉.*危险物|对象级自然复测|QA顶层)/iu;
const INSTRUCTION_REFERENCE_AUDIT_PATTERN = /(?:竞品说明写着|instruction-shaped-reference)/iu;
const UNSUPPORTED_PRODUCT_PATTERN = /(?:实时(?:多人|pvp)|多人联机|real[- ]?time multiplayer|开放世界|open[- ]?world|ugc|用户生成|复杂交易|交易市场|真实支付|real[- ]?money|大型s*3d|massives*3d)/iu;
const HYBRID_REVIEW_PATTERN = /(?:3d|角色表演|大量演出|长线经济|账号体系|后端|lives*service|社交|social)/iu;
const EXPERIENCE_FAILURE_PATTERN = /(?:截图|不合理|没被抓|成功了|失败压力|掉落|碰撞|关卡设计|看不懂|不在.*内|反思|背后.*问题|修正|纠正|改正)/iu;
const CROSS_MODULE_FEEDBACK_PATTERN = /(?:多个|三|两|跨模块|系统|体验).*(?:问题|不合理|修正|修复|改|调整)|(?:问题|不合理|修正|修复|改|调整).*(?:多个|三|两|跨模块|系统|体验)/iu;

function classifySupport(request: string): 'SUPPORTED' | 'HYBRID_REVIEW_REQUIRED' | 'NEW_LINE_REQUIRED' | 'UNSUPPORTED' {
  if (UNSUPPORTED_PRODUCT_PATTERN.test(request)) return 'UNSUPPORTED';
  if (SOCIAL_PATTERN.test(request) || EXPLORATION_PATTERN.test(request)) return 'NEW_LINE_REQUIRED';
  if (HYBRID_REVIEW_PATTERN.test(request)) return 'HYBRID_REVIEW_REQUIRED';
  return 'SUPPORTED';
}

const PROFILE_STAGES: Record<ExperienceProfileSelection['primary'], StageName[]> = {
  ACTION_FEEL: ['EXPERIENCE_CONTRACT', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW'],
  NARRATIVE_AGENCY: ['NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA'],
  STRATEGIC_SYSTEM: ['SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW'],
  PUZZLE_CLARITY: ['PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW'],
  SOCIAL_EMOTION: ['NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW'],
  EXPLORATION_DISCOVERY: ['EXPERIENCE_CONTRACT', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW'],
};

function inferExperienceProfile(request: string): ExperienceProfileSelection {
  const primary: ExperienceProfileSelection['primary'] = SOCIAL_PATTERN.test(request)
    ? 'SOCIAL_EMOTION'
    : EXPLORATION_PATTERN.test(request)
      ? 'EXPLORATION_DISCOVERY'
    : NARRATIVE_PATTERN.test(request)
    ? 'NARRATIVE_AGENCY'
      : PUZZLE_PATTERN.test(request)
        ? 'PUZZLE_CLARITY'
      : SEMANTIC_AUDIT_PATTERN.test(request)
        ? 'ACTION_FEEL'
      : ACTION_FEEL_PATTERN.test(request)
        ? 'ACTION_FEEL'
        : 'STRATEGIC_SYSTEM';
  return {
    schemaVersion: 1,
    primary,
    secondary: primary === 'NARRATIVE_AGENCY' ? 'REPLAY_VALUE' : primary === 'ACTION_FEEL' ? 'NATURAL_PLAY' : 'PROGRESSION_FEEDBACK',
    lockedBy: 'agent',
    rationale: `Request language maps the primary experience to ${primary}; human input may override this before production.`,
  };
}

const REVIEW_ORDER: OptionalReviewStage[] = ['COMPETITOR_RESEARCH', 'PRODUCTION_COST_REVIEW', 'IAA_MONETIZATION_REVIEW'];
const CLASSIFIERS: Array<[Exclude<RequestType, 'NEW_GAME'>, RegExp]> = [
  ['RELEASE', /(?:发布|发行|上线|提交商店|release|publish|ship\b)/iu],
  ['BUG_FIX', /(?:修复|修正|纠正|改正|错误|故障|崩溃|闪退|卡死|bug|crash|broken|exception|error)/iu],
  ['MONETIZATION_REVISION', /(?:变现|商业化|广告|激励视频|插屏|频控|内购|moneti[sz]ation|\biaa\b|\biap\b|rewarded|interstitial)/iu],
  ['VISUAL_REVISION', /(?:视觉|美术|画面|角色图|背景图|配色|图标|动效|重画|界面|\bui\b|visual|artwork|sprite|animation|palette)/iu],
  ['BALANCE_REVISION', /(?:平衡|数值|奖励|价格|掉率|概率|难度|经济|成长曲线|balance|reward|price|drop rate|difficulty|economy)/iu],
  ['GAMEPLAY_REVISION', /(?:玩法|机制|关卡|操作|核心循环|连击|技能|战斗|gameplay|mechanic|level|control|core loop|combo)/iu],
];

function classify(request: string, targetRunId: string | undefined): RequestType {
  if (/(?:新游戏|新建|创建|从零|做一个|make a new|create|new game)/iu.test(request)) return 'NEW_GAME';
  if (PRODUCTIZATION_PATTERN.test(request)) return 'PRODUCTIZATION_REVISION';
  for (const [requestType, pattern] of CLASSIFIERS) if (pattern.test(request)) return requestType;
  return targetRunId ? 'GAMEPLAY_REVISION' : 'NEW_GAME';
}

export class RequestRouter {
  route(inputValue: RequestRouterInput): RequestRoute {
    const input = RequestRouterInputSchema.parse(inputValue);
    const requestType = classify(input.request, input.targetRunId);
    const experienceProfile = inferExperienceProfile(input.request);
    const supportDecision = classifySupport(input.request);
    const requiresCoreActionPrototype = requestType === 'GAMEPLAY_REVISION' && CORE_ACTION_PATTERN.test(input.request);
    const requiresSemanticExperienceGate = SEMANTIC_AUDIT_PATTERN.test(input.request) || INSTRUCTION_REFERENCE_AUDIT_PATTERN.test(input.request);
    const formalFeedback = requestType !== 'NEW_GAME' && !SEMANTIC_AUDIT_PATTERN.test(input.request) && !INSTRUCTION_REFERENCE_AUDIT_PATTERN.test(input.request) && (
      requestType === 'BUG_FIX'
      || EXPERIENCE_FAILURE_PATTERN.test(input.request)
      || (Boolean(input.targetRunId) && CROSS_MODULE_FEEDBACK_PATTERN.test(input.request))
    )
      ? decideFeedbackRepairRoute({ requestType, issueCount: 2, affectedSystems: ['core-loop', 'collision', 'level-design'], rootCauseClear: false, validatedQaIssue: true })
      : null;
    const routedStages = formalFeedback?.stages ?? null;
    return RequestRouteSchema.parse({
      schemaVersion: 1,
      request: input.request,
      requestType,
      targetRunId: requestType === 'NEW_GAME' ? null : input.targetRunId ?? null,
      stages: routedStages ?? ((supportDecision === 'UNSUPPORTED' || supportDecision === 'NEW_LINE_REQUIRED')
        ? ['BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW']
        : requiresSemanticExperienceGate
        ? [...PROFILE_STAGES.ACTION_FEEL, 'PERCEPTUAL_QA', 'FULL_BUILD', 'QA']
        : requestType === 'NEW_GAME'
        ? NEW_GAME_STAGES
        : requestType === 'GAMEPLAY_REVISION' && DEEP_REFERENCE_PATTERN.test(input.request)
          ? ['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL', ...PROFILE_STAGES[experienceProfile.primary], 'CONTENT_EXPANSION', 'UI_SKELETON', 'FULL_BUILD', 'QA']
          : requiresCoreActionPrototype
            ? CORE_ACTION_PROTOTYPE_STAGES
            : requiresSemanticExperienceGate
              ? [...PROFILE_STAGES.ACTION_FEEL, 'PERCEPTUAL_QA', 'FULL_BUILD', 'QA']
            : requestType === 'PRODUCTIZATION_REVISION'
              ? [...PROFILE_STAGES[experienceProfile.primary], 'CONTENT_EXPANSION', 'UI_SKELETON', 'FULL_BUILD', 'QA']
              : REVISION_STAGES[requestType]),
      fullGreenlight: requestType === 'NEW_GAME' && supportDecision === 'SUPPORTED',
      reviewEscalations: [],
      experienceProfile,
      supportDecision,
      repairRoute: formalFeedback?.route ?? 'direct-builder',
      repairReasons: formalFeedback?.reasons ?? [],
      rationale: formalFeedback
        ? `Experience feedback is routed through ${formalFeedback.route}: ${formalFeedback.reasons.join(', ')}. Capture a triage record and reproduction matrix before implementation.`
        : requestType === 'NEW_GAME'
        ? supportDecision === 'UNSUPPORTED'
          ? 'This request is unsupported/high-risk for the default light-game boundary (for example real-time multiplayer, open-world, UGC or complex 3D). Keep it blocked until a separately reviewed production line and additional human approvals exist.'
          : 'A new reference game uses the replica-preview lane: bind verified reference behavior, obtain a human mechanic lock, build one candidate, and run core QA. Release, platform and monetization gates remain deferred until full-validation is explicitly requested.'
        : requiresCoreActionPrototype
          ? 'A core-action feel revision requires a prototype tournament and human gameplay approval before full production.'
        : requestType === 'PRODUCTIZATION_REVISION'
          ? 'An approved demo must become a product through authored content expansion and a functional UI skeleton before rebuilding.'
          : requestType === 'GAMEPLAY_REVISION' && DEEP_REFERENCE_PATTERN.test(input.request)
            ? 'Deep competitor-inspired requests require evidence-backed mechanic research and human lock before implementation; expression remains original.'
            : supportDecision === 'UNSUPPORTED'
              ? 'The requested product shape is outside the default light-game factory boundary; no build route is greenlit.'
              : supportDecision === 'HYBRID_REVIEW_REQUIRED'
                ? 'The request may be possible, but it needs a dedicated risk review and possibly a new production line before implementation.'
                : `${requestType} uses the shortest default path and does not repeat pre-production reviews.`,
    });
  }

  escalate(routeValue: RequestRoute, decisionValue: ReviewEscalation): RequestRoute {
    const route = RequestRouteSchema.parse(routeValue);
    const decision = ReviewEscalationSchema.parse(decisionValue);
    if (route.requestType === 'NEW_GAME') throw new Error('NEW_GAME already includes all default pre-production reviews');
    if (route.reviewEscalations.some((existing) => existing.review === decision.review)) return route;
    const reviewEscalations = [...route.reviewEscalations, decision]
      .sort((left, right) => REVIEW_ORDER.indexOf(left.review) - REVIEW_ORDER.indexOf(right.review));
    const reviews = REVIEW_ORDER.filter((review) => reviewEscalations.some((item) => item.review === review));
    const baseStages = route.stages.filter((stage) => !REVIEW_ORDER.includes(stage as OptionalReviewStage));
    return RequestRouteSchema.parse({ ...route, stages: [...reviews, ...baseStages], reviewEscalations });
  }
}
