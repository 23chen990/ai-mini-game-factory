import { z } from 'zod';

const Text = z.string().trim().min(1);
const Format = z.enum(['rewarded', 'interstitial', 'banner', 'app_open']);

/** Runtime safeguards that must be proven independently of ad placement copy.
 * Defaults fail closed for legacy artifacts; the evaluator, rather than the
 * parser, turns missing proof into a release blocker so old runs remain
 * readable and resumable. */
export const IaaSafetySchema = z.object({
  consent: z.boolean().default(false),
  ageGate: z.boolean().default(false),
  testUnitsExcluded: z.boolean().default(false),
  rewardGrantTerminalOnly: z.boolean().default(false),
  rewardIdempotent: z.boolean().default(false),
  forbiddenContexts: z.array(Text).default(['first-run', 'mid-action', 'before-terminal-state']),
}).strict();
export type IaaSafety = z.infer<typeof IaaSafetySchema>;

export const IaaContractSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  monetization: z.literal('IAA'),
  placements: z.array(z.object({
    id: Text,
    format: Format,
    trigger: Text,
    playerValue: Text,
    frequencyCapSeconds: z.number().int().nonnegative(),
    maxPerSession: z.number().int().nonnegative(),
    optional: z.boolean(),
  }).strict()),
  delivery: z.object({
    firstRun: z.literal('ENDING_ONLY'),
    minSecondsBetweenAds: z.number().int().nonnegative(),
    maxAdsPerSession: z.number().int().nonnegative(),
    rewardRequiredForRewarded: z.literal(true),
    noFill: z.enum(['continue-without-ad', 'show-retry']),
    closeBehavior: z.enum(['immediate', 'after-reward']),
    backgroundBehavior: z.enum(['pause-and-resume', 'cancel-safely']),
  }).strict(),
  analyticsEvents: z.array(Text).min(3),
  safety: IaaSafetySchema.default({
    consent: false,
    ageGate: false,
    testUnitsExcluded: false,
    rewardGrantTerminalOnly: false,
    rewardIdempotent: false,
    forbiddenContexts: ['first-run', 'mid-action', 'before-terminal-state'],
  }),
  status: z.enum(['PASS', 'BLOCKED']),
  blockers: z.array(Text),
  sourceReview: Text,
  createdAt: z.string().datetime(),
}).strict().superRefine((contract, context) => {
  const rewarded = contract.placements.filter((placement) => placement.format === 'rewarded');
  if (rewarded.some((placement) => !placement.optional || placement.playerValue.length < 2)) {
    context.addIssue({ code: 'custom', path: ['placements'], message: 'rewarded ads must be optional and provide explicit player value' });
  }
  if (contract.status === 'PASS' && contract.blockers.length > 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'PASS IAA contracts cannot retain blockers' });
  }
  if (contract.status === 'BLOCKED' && contract.blockers.length === 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED IAA contracts require blockers' });
  }
});
export type IaaContract = z.infer<typeof IaaContractSchema>;
