import { z } from 'zod';
import { sha256Text } from './files.js';
import { getProductionLineContract, type ProductionLine } from './production-lines.js';
import {
  ExperienceContractSchema,
  NaturalPlayPlanSchema,
  ProfileExperienceBundleSchema,
  type ProfileExperienceBundle,
  type ProfileExperienceContract,
} from '../schemas/index.js';
import { PrimaryExperienceProfileSchema } from '../schemas/experience-profile.js';
// Keep one canonical product-experience schema. The former local handoff
// schema diverged from the factory artifact and let Builder and QA validate
// two incompatible meanings under the same exported name.
export { ProductExperienceContractSchema } from '../schemas/product-experience.js';
export type { ProductExperienceContract } from '../schemas/product-experience.js';

export function buildProductEvidenceInstruction() {
  return 'For every feature, report implementation evidence separately from player-visible product evidence and natural trigger evidence. A state field, event, or unit test alone is not player-visible proof: include the visible signal, the natural player action, and screenshot/trace evidence. Never claim a feature complete when it is only wired internally.';
}

type PrimaryExperienceProfile = z.infer<typeof PrimaryExperienceProfileSchema>;
type SupportedProfile = Exclude<PrimaryExperienceProfile, 'SOCIAL_EMOTION' | 'EXPLORATION_DISCOVERY'>;

const PROFILE_LINES: Record<SupportedProfile, ProductionLine> = {
  ACTION_FEEL: 'cut-stack-dodge',
  NARRATIVE_AGENCY: 'choice-life',
  STRATEGIC_SYSTEM: 'idle-management',
  PUZZLE_CLARITY: 'rule-puzzle',
};

function profileContract(profile: SupportedProfile, line: ReturnType<typeof getProductionLineContract>, acceptanceIds: string[]): ProfileExperienceContract {
  switch (profile) {
    case 'ACTION_FEEL':
      return {
        schemaVersion: 1,
        profile,
        inputRules: ['primary touch starts the verb immediately', 'release/cancel never leaves hidden input state', 'input remains available during feedback'],
        motionRules: ['fixed-step motion is continuous', 'contact resolves once and bodies settle before scoring', 'misses preserve a readable trajectory'],
        feedbackRules: ['contact feedback begins within the impact budget', 'success/failure is attributable to the player action', 'retry returns to a clean state without friction'],
        acceptanceIds,
      };
    case 'NARRATIVE_AGENCY':
      return {
        schemaVersion: 1,
        profile,
        choicePillars: ['choices express different values or risks', 'each choice changes a visible state or relationship', 'the player can anticipate the next meaningful question'],
        consequenceRules: ['immediate consequence is attributable to the selected choice', 'at least one consequence is delayed and state-backed', 'alternate routes cannot collapse into cosmetic text swaps'],
        pacingRules: ['one decision is presented at a time on mobile', 'a short scene resolves before the next branch', 'replay exposes a legible alternate outcome'],
        acceptanceIds,
      };
    case 'STRATEGIC_SYSTEM':
      return {
        schemaVersion: 1,
        profile,
        resourceTradeoffs: ['every spend has a visible opportunity cost', 'the next goal is visible before the player commits', 'resource changes identify their source and sink'],
        decisionConsequences: ['upgrade choices alter a measurable bottleneck', 'short-term gain can trade against a later objective', 'refresh/recovery preserves an understandable state'],
        progressionRules: ['growth changes capability or throughput, not only a number', 'one pressure variable rises at a time', 'a short session reaches a meaningful milestone'],
        acceptanceIds,
      };
    case 'PUZZLE_CLARITY':
      return {
        schemaVersion: 1,
        profile,
        ruleDiscovery: ['the active rule is observable before it is required', 'the first wrong move teaches without hidden punishment', 'new rules are introduced one at a time'],
        informationFairness: ['all required information is visible in the first viewport', 'legal and illegal moves are distinguishable', 'difficulty never depends on an unannounced timer'],
        solutionFeedback: ['a solved state is unmistakable', 'reset preserves the chance to try a variant', 'hints reveal reasoning rather than the entire answer'],
        acceptanceIds,
      };
  }
}

function normalizedFlow(flow: string[], fallback: string[]): string[] {
  const values = flow.map((item) => item.trim()).filter(Boolean);
  return [...new Set(values.length >= 3 ? values : fallback)].slice(0, 8);
}

/** Build the durable, profile-specific handoff used by Builder and QA. */
export function buildProfileExperienceBundle(input: {
  gameId: string;
  title: string;
  theme: string;
  line: ProductionLine;
  profile: SupportedProfile;
  blueprintHash: string;
  representativeFlow?: string[];
}): ProfileExperienceBundle {
  const line = getProductionLineContract(input.line);
  if (PROFILE_LINES[input.profile] !== input.line && !(input.profile === 'ACTION_FEEL' && input.line === 'single-finger-action')) {
    throw new Error(`profile ${input.profile} is not served by production line ${input.line}`);
  }
  const contractId = `experience-${input.gameId}-${input.profile.toLowerCase().replaceAll('_', '-')}`;
  const acceptanceIds = line.acceptanceDimensions.slice(0, 5).map((dimension) => `${input.profile.toLowerCase()}:${dimension.replaceAll(/[^a-z0-9]+/giu, '-')}`);
  while (acceptanceIds.length < 4) acceptanceIds.push(`${input.profile.toLowerCase()}:acceptance-${acceptanceIds.length + 1}`);
  const generic = ExperienceContractSchema.parse({
    schemaVersion: 1,
    contractId,
    targetGame: input.gameId,
    targetWorkspace: 'workspace/game',
    lockedBy: 'human',
    pillars: line.acceptanceDimensions.slice(0, 5).map((name, index) => ({ id: `${input.profile.toLowerCase()}-pillar-${index + 1}`, name, observable: `Evidence must show ${name} during a clean natural run.` })),
    feedbackTiming: { impactMs: input.profile === 'ACTION_FEEL' ? 100 : 250, settleMs: input.profile === 'ACTION_FEEL' ? 850 : 1_200, inputNeverBlocked: true },
    motionInvariants: line.interactionKernel.map((item) => `Preserve ${item} through the complete representative flow.`),
    causalRules: line.progressionShell.map((item) => `A player-visible consequence must be attributable to ${item}.`),
    antiPatterns: ['cosmetic-only variation presented as new gameplay', 'debug/state-forcing APIs used as natural-play proof', 'an ad or overlay blocking the primary action'],
    acceptanceIds,
  });
  const flow = normalizedFlow(input.representativeFlow ?? [], line.representativeFlow);
  const natural = NaturalPlayPlanSchema.parse({
    schemaVersion: 1,
    contractId,
    startCommand: 'resetGame',
    inputMode: 'mouse_and_touch',
    forbiddenApis: ['window.__GAME_TEST__ state-forcing methods', 'loadScenario', 'debugSetState', 'setVelocity', 'setPose', 'grantCurrency'],
    scenarios: flow.slice(0, 5).map((goal, index) => ({ id: `scenario-${index + 1}`, goal })),
    successCriteria: [`complete the ${input.profile} representative flow with visible state changes`, 'reach a clear success or failure terminal state', 'restart and observe a materially different or replayable outcome'],
    evidenceCheckpoints: ['clean reset screenshot and input trace', 'terminal/settlement screenshot and retry trace'],
    oracleFree: true,
  });
  const bundle = ProfileExperienceBundleSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    title: input.title,
    theme: input.theme,
    line: input.line,
    profile: input.profile,
    blueprintHash: input.blueprintHash,
    profileContract: profileContract(input.profile, line, acceptanceIds),
    experienceContract: generic,
    naturalPlayPlan: natural,
    createdAt: new Date().toISOString(),
  });
  return bundle;
}

export function evaluateProfileExperienceBundle(value: unknown, expected?: { line?: ProductionLine; profile?: SupportedProfile; blueprintHash?: string }) {
  const parsed = ProfileExperienceBundleSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'] as string[] };
  const bundle = parsed.data;
  const blockers: string[] = [];
  if (expected?.line && bundle.line !== expected.line) blockers.push('line-mismatch');
  if (expected?.profile && bundle.profile !== expected.profile) blockers.push('profile-mismatch');
  if (expected?.blueprintHash && bundle.blueprintHash !== expected.blueprintHash) blockers.push('blueprint-hash-mismatch');
  const line = getProductionLineContract(bundle.line);
  if (line.primaryProfile !== bundle.profile) blockers.push('line-profile-mismatch');
  if (bundle.profileContract.profile !== bundle.profile) blockers.push('profile-contract-mismatch');
  if (bundle.experienceContract.targetGame !== bundle.gameId) blockers.push('contract-game-mismatch');
  if (bundle.experienceContract.contractId !== bundle.naturalPlayPlan.contractId) blockers.push('natural-play-contract-mismatch');
  if (bundle.experienceContract.lockedBy !== 'human') blockers.push('contract-not-human-locked');
  if (!bundle.naturalPlayPlan.oracleFree) blockers.push('oracle-play-plan');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], bundle };
}

/** Stable hash for audit consumers that need to bind a bundle to a blueprint. */
export function profileBundleFingerprint(bundle: ProfileExperienceBundle): string {
  const parsed = ProfileExperienceBundleSchema.parse(bundle);
  const stable = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'createdAt'));
  return sha256Text(JSON.stringify(stable));
}
