import { AbandonmentDecisionSchema } from '../schemas/launch-operations.js';
import { CostBudgetAuthorizationSchema } from '../schemas/cost-budget-authorization.js';
import { StageNameSchema } from '../schemas/stage-name.js';

export function resolveAuthorizedCostBudget(input: {
  runId: string;
  abandonment: unknown;
  authorization: unknown;
  actualAbandonmentSha256: string;
}) {
  const abandonment = AbandonmentDecisionSchema.parse(input.abandonment);
  const authorization = CostBudgetAuthorizationSchema.parse(input.authorization);
  if (input.runId !== authorization.runId || abandonment.runId !== authorization.runId) throw new Error('cost continuation run mismatch');
  if (abandonment.decision !== 'ABANDON' || abandonment.reason !== 'cost-cap') throw new Error('cost continuation requires a cost-cap abandonment decision');
  if (authorization.abandonmentDecision.sha256 !== input.actualAbandonmentSha256) throw new Error('cost continuation abandonment-decision hash mismatch');
  if (authorization.previousMaxAgentTokens !== abandonment.budget.maxAgentTokens) throw new Error('cost continuation previous token ceiling mismatch');
  if (authorization.maxAgentTokens <= abandonment.usage.agentTokens) throw new Error('authorized token ceiling must exceed measured usage');
  const resumeStage = StageNameSchema.parse(abandonment.stage);
  if (resumeStage === 'ABANDONED' || resumeStage === 'COMPLETED') throw new Error(`cost continuation cannot resume terminal stage ${resumeStage}`);
  return {
    authorization,
    resumeStage,
    budget: { ...abandonment.budget, maxAgentTokens: authorization.maxAgentTokens },
  };
}

export function evaluateCostBudgetAuthorization(input: {
  state: { runId: string; stage: string };
  abandonment: unknown;
  authorization: unknown;
  actualAbandonmentSha256: string;
}) {
  if (input.state.stage !== 'ABANDONED') throw new Error('cost continuation requires an ABANDONED run');
  return resolveAuthorizedCostBudget({
    runId: input.state.runId,
    abandonment: input.abandonment,
    authorization: input.authorization,
    actualAbandonmentSha256: input.actualAbandonmentSha256,
  });
}
