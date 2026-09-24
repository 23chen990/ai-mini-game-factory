import { z } from 'zod';

const Text = z.string().trim().min(1);

export const PrimaryExperienceProfileSchema = z.enum([
  'ACTION_FEEL',
  'NARRATIVE_AGENCY',
  'STRATEGIC_SYSTEM',
  'PUZZLE_CLARITY',
  'SOCIAL_EMOTION',
  'EXPLORATION_DISCOVERY',
]);
export const SecondaryExperienceProfileSchema = z.enum(['NATURAL_PLAY', 'REPLAY_VALUE', 'PROGRESSION_FEEDBACK']);

export const ExperienceProfileSelectionSchema = z.object({
  schemaVersion: z.literal(1),
  primary: PrimaryExperienceProfileSchema,
  secondary: SecondaryExperienceProfileSchema.nullable(),
  lockedBy: z.enum(['human', 'agent']),
  rationale: Text,
}).strict();
export type ExperienceProfileSelection = z.infer<typeof ExperienceProfileSelectionSchema>;

export const ActionFeelContractSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal('ACTION_FEEL'),
  inputRules: z.array(Text).min(3),
  motionRules: z.array(Text).min(3),
  feedbackRules: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(3),
}).strict();

export const NarrativeAgencyContractSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal('NARRATIVE_AGENCY'),
  choicePillars: z.array(Text).min(3),
  consequenceRules: z.array(Text).min(3),
  pacingRules: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(3),
}).strict();

export const StrategicSystemContractSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal('STRATEGIC_SYSTEM'),
  resourceTradeoffs: z.array(Text).min(3),
  decisionConsequences: z.array(Text).min(3),
  progressionRules: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(3),
}).strict();

export const PuzzleClarityContractSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal('PUZZLE_CLARITY'),
  ruleDiscovery: z.array(Text).min(3),
  informationFairness: z.array(Text).min(3),
  solutionFeedback: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(3),
}).strict();

/** Social and exploration are intentionally explicit contracts even though
 * they are not enabled by the default five production lines yet.  Keeping a
 * schema for them prevents an unsupported request from being coerced into an
 * idle/action contract and gives a future line a stable handoff shape. */
export const SocialEmotionContractSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal('SOCIAL_EMOTION'),
  relationshipPillars: z.array(Text).min(3),
  consequenceRules: z.array(Text).min(3),
  pacingRules: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(3),
}).strict();

export const ExplorationDiscoveryContractSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.literal('EXPLORATION_DISCOVERY'),
  discoveryPillars: z.array(Text).min(3),
  traversalRules: z.array(Text).min(3),
  pacingRules: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(3),
}).strict();

export const ProfileExperienceContractSchema = z.discriminatedUnion('profile', [
  ActionFeelContractSchema,
  NarrativeAgencyContractSchema,
  StrategicSystemContractSchema,
  PuzzleClarityContractSchema,
  SocialEmotionContractSchema,
  ExplorationDiscoveryContractSchema,
]);
export type ProfileExperienceContract = z.infer<typeof ProfileExperienceContractSchema>;
