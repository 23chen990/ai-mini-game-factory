import { z } from 'zod';

const Text = z.string().trim().min(1);
const DateTime = z.string().datetime({ offset: true });

export const FirstGameStatusSchema = z.enum(['NOT_STARTED', 'VALIDATING', 'REVENUE_VERIFIED', 'FAILED']);
export type FirstGameStatus = z.infer<typeof FirstGameStatusSchema>;

export const FirstGameValidationSchema = z.object({
  users: z.number().int().nonnegative(),
  observedDays: z.number().int().nonnegative(),
  netRevenueCents: z.number().int().nonnegative(),
  evidence: z.array(Text).min(1),
  source: z.enum(['launch-metrics', 'manual']).default('manual'),
}).strict();
export type FirstGameValidation = z.infer<typeof FirstGameValidationSchema>;

/** Factory-level throttle: validate one title before opening the portfolio. */
export const PortfolioStrategySchema = z.object({
  schemaVersion: z.literal(1),
  strategyId: Text,
  firstGameId: Text.nullable(),
  firstGameStatus: FirstGameStatusSchema,
  maxTitlesInFlight: z.number().int().positive(),
  requireFirstGameValidation: z.boolean().default(true),
  activeGameIds: z.array(Text).default([]),
  validation: FirstGameValidationSchema.optional(),
  evidence: z.array(Text).default([]),
  blockers: z.array(Text).default([]),
  updatedAt: DateTime,
}).strict().superRefine((strategy, context) => {
  if (new Set(strategy.activeGameIds).size !== strategy.activeGameIds.length) context.addIssue({ code: 'custom', path: ['activeGameIds'], message: 'active game ids must be unique' });
  if (strategy.firstGameStatus === 'NOT_STARTED' && strategy.firstGameId !== null) context.addIssue({ code: 'custom', path: ['firstGameId'], message: 'NOT_STARTED strategy cannot bind a first game' });
  if (strategy.firstGameStatus !== 'NOT_STARTED' && strategy.firstGameId === null) context.addIssue({ code: 'custom', path: ['firstGameId'], message: 'a validating, verified or failed strategy must identify its first game' });
  if (strategy.firstGameStatus === 'REVENUE_VERIFIED' && !strategy.validation) context.addIssue({ code: 'custom', path: ['validation'], message: 'revenue-verified strategy requires validation evidence' });
  if (strategy.firstGameStatus === 'FAILED' && strategy.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'failed first-game strategy requires a blocker' });
});
export type PortfolioStrategy = z.infer<typeof PortfolioStrategySchema>;

export const PortfolioGateEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  strategyId: Text,
  requestedGameId: Text,
  decision: z.enum(['START_FIRST_GAME', 'ALLOW_EXISTING', 'ALLOW_PORTFOLIO', 'BLOCK']),
  passed: z.boolean(),
  activeTitles: z.number().int().nonnegative(),
  maxTitlesInFlight: z.number().int().positive(),
  blockers: z.array(Text),
  evaluatedAt: DateTime,
}).strict().superRefine((evaluation, context) => {
  if (evaluation.passed && evaluation.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'passed portfolio evaluation cannot contain blockers' });
  if (!evaluation.passed && evaluation.decision !== 'BLOCK') context.addIssue({ code: 'custom', path: ['decision'], message: 'failed portfolio evaluation must use BLOCK decision' });
});
export type PortfolioGateEvaluation = z.infer<typeof PortfolioGateEvaluationSchema>;
