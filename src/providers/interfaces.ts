import type { ArtDirections, ArtPreviewManifest, AssetManifest, CompetitorResearch, GameBlueprint, GameplayRevisionLock, IaaMonetizationReview, InteractionContinuityContract, OpenSourceResearch, ProductionCostReview, QaReport, ReferenceEvidencePack, ReferenceMechanicSpec, RuntimeName, Seed, StyleLock, ProductExperienceContract, PerceptualQaReport } from '../schemas/index.js';
import type { GameplayIdea, IdeaGeneration, LowCostFilter, PlaytestTournament, PrototypeBuildReport } from '../schemas/gameplay-experiment.js';
import type { ActionMechanicExperimentSpec, ActionPrototypeBuildReport } from '../schemas/action-mechanic-experiment.js';
import type { FormalPrototypeFollowupConstraints, OpenSourceResearchArtifact } from '../schemas/index.js';
import type { RuntimeAdapter } from '../adapters/runtime.js';
import type { ReferenceBehaviorTarget } from '../schemas/reference-recording.js';

export type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type AgentCallMetrics = { provider: string; model: string; calls: number; usage?: TokenUsage };
export type AgentProviderResult = { value: unknown; metrics: AgentCallMetrics };
export type AgentExecutionContext = {
  runRoot: string;
  outputPath: string;
  logDir: string;
  inputPaths: string[];
  /** Verified run-local image evidence copied byte-for-byte into an isolated
   * research sandbox. The hash is checked again immediately before copying. */
  mediaInputs?: Array<{ path: string; sha256: string }>;
  /** Identity and contract inputs used by workspace writers at the hard boundary. */
  targetGameId?: string;
  targetWorkspaceRelative?: string;
  requiredArtifacts?: string[];
  /** Stage/model metadata is recorded and enforced at the provider boundary. */
  stage?: string;
  model?: string;
  reasoning?: 'low' | 'medium' | 'high' | 'max';
  sandbox?: 'read-only' | 'workspace-write';
  contextPacket?: unknown;
  /** The factory sets this for real runs; direct provider unit callers may omit it for legacy compatibility. */
  enforceBoundary?: boolean;
};
export interface AgentProvider {
  analyzeReferenceEvidence(pack: ReferenceEvidencePack, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateCompetitorResearch(seed: Seed, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateOpenSourceResearch(seed: Seed, gameplay: GameplayIdea | ReferenceMechanicSpec, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateIdeas(seed: Seed, research: CompetitorResearch, batch: number, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateLowCostFilter(ideas: IdeaGeneration, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generatePrototypeSelection(ideas: IdeaGeneration, filter: LowCostFilter, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateWinnerSelection(tournament: PlaytestTournament, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateProductionCostReview(seed: Seed, research: CompetitorResearch, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateIaaMonetizationReview(seed: Seed, gameplayContext: CompetitorResearch | ReferenceMechanicSpec, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateGreenlightDecision(seed: Seed, research: CompetitorResearch, cost: ProductionCostReview, monetization: IaaMonetizationReview, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateBlueprint(seed: Seed, context?: AgentExecutionContext, gameplay?: GameplayIdea | ReferenceMechanicSpec, openSourceResearch?: OpenSourceResearch): Promise<AgentProviderResult>;
  generateArtDirections(blueprint: GameBlueprint, context?: AgentExecutionContext): Promise<AgentProviderResult>;
  generateStyleLock(blueprint: GameBlueprint, directions: ArtDirections, approval: unknown, context?: AgentExecutionContext): Promise<AgentProviderResult>;
}
export type BuilderVerificationMode = 'contract' | 'full';
export type CodexBuildResult = { threadId?: string; verificationMode: BuilderVerificationMode; metrics: AgentCallMetrics };
export type CodexFixResult = CodexBuildResult & { summary: string; verification?: string[] };
export type FormalPrototypeBuildInput = {
  constraints: FormalPrototypeFollowupConstraints;
  research: OpenSourceResearchArtifact;
  actionSelection: {
    runId: string;
    decision: 'KEEP';
    selectedSlot: 'A' | 'B' | 'C';
    selectedWorkspace: string;
    treatment: string[];
  };
};
export interface CodexProvider {
  prototype?(input: { workspace: string; idea: GameplayIdea; slot: 'a' | 'b' | 'c'; context?: AgentExecutionContext }): Promise<CodexBuildResult>;
  actionPrototype?(input: { workspace: string; spec: ActionMechanicExperimentSpec; variant: ActionMechanicExperimentSpec['prototypes'][number]; context?: AgentExecutionContext }): Promise<CodexBuildResult>;
  formalPrototype?(input: FormalPrototypeBuildInput & { workspace: string; context?: AgentExecutionContext }): Promise<CodexBuildResult>;
  build(input: { workspace: string; blueprint: GameBlueprint; styleLock: StyleLock; assets: AssetManifest; template: string; gameplayRevision?: GameplayRevisionLock; interactionContinuityContract?: InteractionContinuityContract; referenceLevelBehaviorTargets?: ReferenceBehaviorTarget[]; context?: AgentExecutionContext }): Promise<CodexBuildResult>;
  fix(input: { workspace: string; threadId?: string; qaReport: QaReport; context?: AgentExecutionContext }): Promise<CodexFixResult>;
}
export interface ImageProvider { produce(input: { outputDir: string; blueprint: GameBlueprint; styleLock: StyleLock }): Promise<unknown>; producePreviews?(input: { outputDir: string; directions: ArtDirections }): Promise<ArtPreviewManifest>; }
export interface RuntimeProvider { runtime(name: RuntimeName): RuntimeAdapter; }
export interface QAProvider {
  playtest(input: { runtime: RuntimeAdapter; workspace: string; runRoot: string }): Promise<unknown>;
  playtestTournament(input: { runtime: RuntimeAdapter; report: PrototypeBuildReport; runRoot: string }): Promise<unknown>;
  playtestActionMechanics(input: { runtime: RuntimeAdapter; spec: ActionMechanicExperimentSpec; report: ActionPrototypeBuildReport; runRoot: string }): Promise<unknown>;
  /** Optional contract-driven perceptual pass; legacy providers may omit it. */
  perceptualQa?(input: { runtime: RuntimeAdapter; workspace: string; runRoot: string; contract: ProductExperienceContract; buildHash: string }): Promise<PerceptualQaReport>;
}
