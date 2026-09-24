import { ExperienceHypothesisSchema, type ExperienceHypothesis, type CoreSpecLock } from '../schemas/experience-hypothesis.js';
import { sha256Text } from './files.js';

export function buildExperienceHypothesis(input: { gameId: string; profile: ExperienceHypothesis['profile']; question: string; hypotheses: Array<{ id: string; statement: string; metric: string; target: string; failureCondition: string }>; sourceBlueprint?: unknown }): ExperienceHypothesis {
  const sourceBlueprintHash = input.sourceBlueprint === undefined ? undefined : sha256Text(JSON.stringify(input.sourceBlueprint));
  return ExperienceHypothesisSchema.parse({ schemaVersion: 1, gameId: input.gameId, profile: input.profile, question: input.question, hypotheses: input.hypotheses, status: sourceBlueprintHash ? 'READY' : 'DRAFT', sourceBlueprintHash, createdAt: new Date().toISOString() });
}

export function freezeCoreSpec(input: { gameId: string; profile: CoreSpecLock['profile']; hypothesis: ExperienceHypothesis; acceptanceDimensions: string[] }): CoreSpecLock {
  const hypothesis = ExperienceHypothesisSchema.parse(input.hypothesis);
  if (hypothesis.status !== 'READY' || !hypothesis.sourceBlueprintHash) throw new Error('cannot freeze a draft experience hypothesis');
  return { schemaVersion: 1, gameId: input.gameId, profile: input.profile, hypothesisHash: sha256Text(JSON.stringify(hypothesis)), acceptanceDimensions: input.acceptanceDimensions, frozenBy: 'human', version: 1, frozenAt: new Date().toISOString() };
}
