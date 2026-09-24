import { PortfolioGateEvaluationSchema, PortfolioStrategySchema, type FirstGameStatus, type PortfolioGateEvaluation, type PortfolioStrategy } from '../schemas/portfolio-strategy.js';
import { sha256Text } from './files.js';

export function buildPortfolioStrategy(input: {
  strategyId?: string;
  firstGameId?: string | null;
  firstGameStatus?: FirstGameStatus;
  maxTitlesInFlight?: number;
  requireFirstGameValidation?: boolean;
  activeGameIds?: string[];
} = {}): PortfolioStrategy {
  const firstGameStatus = input.firstGameStatus ?? 'NOT_STARTED';
  const firstGameId = input.firstGameId ?? null;
  return PortfolioStrategySchema.parse({
    schemaVersion: 1,
    strategyId: input.strategyId ?? `portfolio-${sha256Text(JSON.stringify({ firstGameId, maxTitlesInFlight: input.maxTitlesInFlight ?? 1 })).slice(0, 16)}`,
    firstGameId,
    firstGameStatus,
    maxTitlesInFlight: input.maxTitlesInFlight ?? 1,
    requireFirstGameValidation: input.requireFirstGameValidation ?? true,
    activeGameIds: input.activeGameIds ?? [],
    evidence: [],
    blockers: [],
    updatedAt: new Date().toISOString(),
  });
}

export function evaluatePortfolioGate(
  strategyValue: unknown,
  input: { requestedGameId: string; activeGameIds?: string[]; isNewTitle?: boolean },
): PortfolioGateEvaluation {
  const strategy = PortfolioStrategySchema.parse(strategyValue);
  const requestedGameId = input.requestedGameId.trim();
  if (!requestedGameId) throw new Error('requestedGameId must not be empty');
  const activeGameIds = [...new Set(input.activeGameIds ?? strategy.activeGameIds)];
  const existing = activeGameIds.includes(requestedGameId);
  const isNewTitle = input.isNewTitle ?? !existing;
  const blockers: string[] = [];
  let decision: PortfolioGateEvaluation['decision'] = existing ? 'ALLOW_EXISTING' : 'ALLOW_PORTFOLIO';
  if (isNewTitle && !existing && activeGameIds.length >= strategy.maxTitlesInFlight) blockers.push('portfolio:in-flight-capacity');
  if (strategy.firstGameStatus === 'FAILED' && isNewTitle) blockers.push('portfolio:first-game-failed');
  if (isNewTitle && strategy.requireFirstGameValidation) {
    if (strategy.firstGameId === null) decision = 'START_FIRST_GAME';
    else if (strategy.firstGameId !== requestedGameId && strategy.firstGameStatus !== 'REVENUE_VERIFIED') blockers.push('portfolio:first-game-validation-required');
    else if (strategy.firstGameId === requestedGameId && strategy.firstGameStatus === 'NOT_STARTED') decision = 'START_FIRST_GAME';
  }
  if (blockers.length > 0) decision = 'BLOCK';
  return PortfolioGateEvaluationSchema.parse({ schemaVersion: 1, strategyId: strategy.strategyId, requestedGameId, decision, passed: blockers.length === 0, activeTitles: activeGameIds.length, maxTitlesInFlight: strategy.maxTitlesInFlight, blockers: [...new Set(blockers)], evaluatedAt: new Date().toISOString() });
}

/** Bind the first title or record its measured validation outcome. */
export function updatePortfolioStrategy(value: unknown, input: {
  gameId: string;
  status: FirstGameStatus;
  evidence: string[];
  validation?: PortfolioStrategy['validation'];
  activeGameIds?: string[];
  blockers?: string[];
}): PortfolioStrategy {
  const current = PortfolioStrategySchema.parse(value);
  const gameId = input.gameId.trim();
  if (!gameId) throw new Error('gameId must not be empty');
  if (current.firstGameId !== null && current.firstGameId !== gameId) throw new Error(`first game is already bound to ${current.firstGameId}`);
  return PortfolioStrategySchema.parse({
    ...current,
    firstGameId: gameId,
    firstGameStatus: input.status,
    ...(input.validation !== undefined ? { validation: input.validation } : current.validation ? { validation: current.validation } : {}),
    activeGameIds: [...new Set(input.activeGameIds ?? current.activeGameIds)],
    evidence: [...new Set([...current.evidence, ...input.evidence])],
    blockers: input.blockers ?? (input.status === 'FAILED' ? ['first-game-validation-failed'] : []),
    updatedAt: new Date().toISOString(),
  });
}
