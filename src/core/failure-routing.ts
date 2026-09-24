import { StageNameSchema, type StageName } from '../schemas/index.js';

export type FailureRouteClass = 'rights' | 'compliance' | 'core_experience' | 'platform' | 'build' | 'qa' | 'growth' | 'unknown' | 'monetization';
export type FailureRoute = { stage: StageName; owner: 'ResearchAgent' | 'ProducerAgent' | 'BuilderAgent' | 'FixerAgent' | 'QAAgent' | 'ReleaseAgent' | 'HumanReviewer' | 'FactoryControlPlane'; rationale: string; confidence: number };

const ROUTES: Record<FailureRouteClass, FailureRoute> = {
  rights: { stage: 'OPEN_SOURCE_RESEARCH', owner: 'ResearchAgent', rationale: 'Source, license and originality evidence must be resolved before implementation.', confidence: 0.9 },
  compliance: { stage: 'IAA_REVIEW', owner: 'ProducerAgent', rationale: 'Compliance and monetization constraints belong to the pre-build contract.', confidence: 0.85 },
  monetization: { stage: 'IAA_REVIEW', owner: 'ProducerAgent', rationale: 'Ad placement and reward policy is an upstream product decision.', confidence: 0.85 },
  core_experience: { stage: 'EXPERIENCE_HYPOTHESIS', owner: 'ProducerAgent', rationale: 'A weak or ambiguous core loop cannot be repaired safely in the generated workspace.', confidence: 0.9 },
  platform: { stage: 'PLATFORM_ADAPTER_QA', owner: 'QAAgent', rationale: 'Platform adapter/configuration evidence owns package-specific failures.', confidence: 0.85 },
  build: { stage: 'FULL_BUILD', owner: 'BuilderAgent', rationale: 'Compilation, tests and generated workspace integration belong to Builder.', confidence: 0.95 },
  qa: { stage: 'QA', owner: 'QAAgent', rationale: 'A reproducible QA observation should be re-run before any repair is attempted.', confidence: 0.8 },
  growth: { stage: 'LAUNCH_METRICS', owner: 'ReleaseAgent', rationale: 'Market signals are handled by the launch decision loop, not gameplay patching.', confidence: 0.85 },
  unknown: { stage: 'FACTORY_EVAL', owner: 'FactoryControlPlane', rationale: 'The control plane must classify an unresolved failure before delegating work.', confidence: 0.6 },
};

export function routeFailureToEarliestStage(input: { symptomStage: StageName | string; failureClass: FailureRouteClass; message?: string }): FailureRoute {
  // An explicit classifier is authoritative.  Message hints are only used for
  // an `unknown` classification; otherwise an incidental word such as
  // "source map" must not reroute a build failure to rights research.
  const message = String(input.message ?? '').toLowerCase();
  let route = ROUTES[input.failureClass] ?? ROUTES.unknown;
  if (input.failureClass === 'unknown') {
    if (/(license|copyright|素材|授权|source)/u.test(message)) route = ROUTES.rights;
    else if (/(package|adapter|wechat|douyin|taptap|平台)/u.test(message)) route = ROUTES.platform;
    else if (/(choice|consequence|replay|narrative|剧情|分支|feel|physics|手感)/u.test(message)) route = ROUTES.core_experience;
  }
  return { ...route, stage: StageNameSchema.parse(route.stage) };
}

export function routeFailureClassFromMessage(message: string): FailureRouteClass {
  const text = String(message);
  if (/license|copyright|original|rights|名称|素材|授权/iu.test(text)) return 'rights';
  if (/consent|compliance|防沉迷|privacy|ad policy/iu.test(text)) return 'compliance';
  if (/monetization|reward|广告|IAA/iu.test(text)) return 'monetization';
  if (/platform|wechat|douyin|taptap|package|adapter/iu.test(text)) return 'platform';
  if (/qa|playtest|screenshot|console/iu.test(text)) return 'qa';
  if (/build|vite|typecheck|test/iu.test(text)) return 'build';
  if (/retention|ecpm|cpi|revenue|growth/iu.test(text)) return 'growth';
  if (/choice|consequence|replay|feel|physics|fun|剧情|分支|手感/iu.test(text)) return 'core_experience';
  return 'unknown';
}
