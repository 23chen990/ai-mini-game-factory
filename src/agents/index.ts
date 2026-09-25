import type { RuntimeAdapter } from '../adapters/runtime.js';
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listFiles, sha256File, sha256Text, writeJsonAtomic } from '../core/files.js';
import { archiveRunPaths } from '../core/run-preservation.js';
import { packageRelease } from '../core/release.js';
import { z } from 'zod';
import type { AgentExecutionContext, AgentProvider, BuilderVerificationMode, CodexProvider, FormalPrototypeBuildInput, ImageProvider, QAProvider } from '../providers/interfaces.js';
import { ArtApprovalSchema, ArtDirectionsSchema, AssetManifestSchema, BuildReportSchema, CompetitorResearchSchema, FormalPrototypeBuildReportSchema, FormalPrototypeFollowupConstraintsSchema, GameBlueprintSchema, GameplayRevisionLockSchema, GreenlightDecisionSchema, IaaMonetizationReviewSchema, OpenSourceResearchArtifactSchema, OpenSourceResearchSchema, ProductionCostReviewSchema, QaEvidenceSchema, QaReportSchema, ReferenceBehaviorAnalysisSchema, ReferenceEvidencePackSchema, ReferenceMechanicSpecSchema, ReleaseManifestSchema, StyleLockSchema, type ArtApproval, type ArtDirections, type AssetManifest, type CompetitorResearch, type GameBlueprint, type GameplayRevisionLock, type IaaMonetizationReview, type OpenSourceResearch, type ProductionCostReview, type QaEvidence, type QaReport, type ReferenceEvidencePack, type ReferenceMechanicSpec, type Seed, type StyleLock } from '../schemas/index.js';
import { GameplayIdeaSchema, IdeaGenerationSchema, LowCostFilterSchema, PlaytestTournamentSchema, PrototypeBuildReportSchema, PrototypeSelectionSchema, WinnerSelectionSchema, type GameplayIdea, type IdeaGeneration, type LowCostFilter, type PlaytestTournament, type PrototypeBuildReport, type PrototypeSelection } from '../schemas/gameplay-experiment.js';
import { ActionMechanicExperimentSpecSchema, ActionPlaytestReportSchema, ActionPrototypeBuildReportSchema, type ActionMechanicExperimentSpec, type ActionPlaytestReport, type ActionPrototypeBuildReport } from '../schemas/action-mechanic-experiment.js';
import { Hybrid3dAssetResearchArtifactSchema, type Hybrid3dAssetResearchArtifact } from '../schemas/hybrid-3d-assets.js';
import { buildCompletionGateReport } from '../qa/experience-gates.js';
import { discoverRuntimeWiredFiles, resolveRuntimeProductGate, RuntimeProductGateSchema } from '../core/runtime-product-gates.js';
import { evaluateInteractionContinuity } from '../qa/interaction-continuity.js';
import { InteractionContinuityContractSchema, InteractionContinuityObservationSchema, InteractionContinuityReportSchema, type InteractionContinuityReport, type InteractionContinuityContract } from '../schemas/interaction-continuity.js';
import { verifyBuilderPreflight } from '../core/builder-preflight.js';
import { buildDeterministicReferenceLevelLayout } from '../core/reference-level-layout.js';
import { normalizeReferenceBehaviorAnalysis } from '../core/reference-evidence.js';
import { assertReferenceLevelRuntimeDataWritePath, readReferenceLevelRuntimeData, runtimeForTemplate, verifyReferenceLevelRuntimeDataFile, verifyReferenceLevelLayoutFile } from '../core/reference-level-binding.js';
import { referenceLevelRuntimeDataPath } from '../core/reference-level-runtime.js';
import { ReferenceLevelImplementationContractSchema } from '../schemas/reference-recording.js';
export { AgentPackageSchema, buildAgentPackageInstruction, packageForStage, type AgentPackage } from './packages.js';
export { compileAgentContext } from './context-compiler.js';

/** Non-builder roles return validated artifacts and never receive a game workspace. */
export class ReferenceResearchAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(pack: ReferenceEvidencePack, context?: AgentExecutionContext) {
    const parsedPack = ReferenceEvidencePackSchema.parse(pack);
    const result = await this.provider.analyzeReferenceEvidence(parsedPack, context);
    return { value: ReferenceBehaviorAnalysisSchema.parse(normalizeReferenceBehaviorAnalysis(result.value, parsedPack)), metrics: result.metrics };
  }
}
export class CompetitorResearchAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(seed: Seed, context?: AgentExecutionContext) { const result = await this.provider.generateCompetitorResearch(seed, context); return { value: CompetitorResearchSchema.parse(result.value), metrics: result.metrics }; }
}
export class OpenSourceResearchAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(seed: Seed, gameplay: GameplayIdea | ReferenceMechanicSpec, context?: AgentExecutionContext) { const result = await this.provider.generateOpenSourceResearch(seed, parseApprovedGameplay(gameplay), context); return { value: OpenSourceResearchSchema.parse(result.value), metrics: result.metrics }; }
}
export class ProductionCostReviewerAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(seed: Seed, research: CompetitorResearch, context?: AgentExecutionContext) { const result = await this.provider.generateProductionCostReview(seed, CompetitorResearchSchema.parse(research), context); return { value: ProductionCostReviewSchema.parse(result.value), metrics: result.metrics }; }
  async filter(ideas: IdeaGeneration, context?: AgentExecutionContext) { const result = await this.provider.generateLowCostFilter(IdeaGenerationSchema.parse(ideas), context); return { value: LowCostFilterSchema.parse(result.value), metrics: result.metrics }; }
}
export class IaaMonetizationReviewerAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(seed: Seed, gameplayContext: CompetitorResearch | ReferenceMechanicSpec, context?: AgentExecutionContext) {
    const parsedContext = 'lockedBy' in gameplayContext ? ReferenceMechanicSpecSchema.parse(gameplayContext) : CompetitorResearchSchema.parse(gameplayContext);
    const result = await this.provider.generateIaaMonetizationReview(seed, parsedContext, context);
    return { value: IaaMonetizationReviewSchema.parse(result.value), metrics: result.metrics };
  }
}
export class GreenlightAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(seed: Seed, research: CompetitorResearch, cost: ProductionCostReview, monetization: IaaMonetizationReview, context?: AgentExecutionContext) {
    const result = await this.provider.generateGreenlightDecision(seed, CompetitorResearchSchema.parse(research), ProductionCostReviewSchema.parse(cost), IaaMonetizationReviewSchema.parse(monetization), context);
    return { value: GreenlightDecisionSchema.parse(result.value), metrics: result.metrics };
  }
  async selectPrototypes(ideas: IdeaGeneration, filter: LowCostFilter, context?: AgentExecutionContext) { const result = await this.provider.generatePrototypeSelection(IdeaGenerationSchema.parse(ideas), LowCostFilterSchema.parse(filter), context); return { value: PrototypeSelectionSchema.parse(result.value), metrics: result.metrics }; }
  async selectWinner(tournament: PlaytestTournament, context?: AgentExecutionContext) { const result = await this.provider.generateWinnerSelection(PlaytestTournamentSchema.parse(tournament), context); return { value: WinnerSelectionSchema.parse(result.value), metrics: result.metrics }; }
}
export class ProducerAgent {
  constructor(private readonly provider: AgentProvider) {}
  async ideate(seed: Seed, research: CompetitorResearch, batch: number, context?: AgentExecutionContext) { const result = await this.provider.generateIdeas(seed, CompetitorResearchSchema.parse(research), batch, context); return { value: IdeaGenerationSchema.parse(result.value), metrics: result.metrics }; }
  async run(seed: Seed, gameplay: GameplayIdea | ReferenceMechanicSpec, openSourceResearch: OpenSourceResearch, context?: AgentExecutionContext) {
    const approvedGameplay = parseApprovedGameplay(gameplay);
    const result = await this.provider.generateBlueprint(seed, context, approvedGameplay, OpenSourceResearchSchema.parse(openSourceResearch));
    const generated = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
      ? result.value as Record<string, unknown>
      : {};
    const referenceMechanics = seed.designMode === 'reference_reskin' ? ReferenceMechanicSpecSchema.parse(approvedGameplay) : undefined;
    const value = GameBlueprintSchema.parse({
      ...generated,
      gameId: context?.targetGameId ?? generated.gameId,
      ...(seed.identity?.canonicalGameId ? { canonicalGameId: seed.identity.canonicalGameId } : {}),
      ...(seed.identity?.variantId ? { variantId: seed.identity.variantId } : {}),
      title: seed.title,
      theme: seed.theme,
      runtime: seed.runtime,
      template: seed.template,
      designMode: seed.designMode,
      referenceMechanics,
      spatialShop: seed.spatialShop,
      targetPlatforms: seed.targetPlatforms,
      coreLoop: referenceMechanics?.coreLoop ?? generated.coreLoop,
      preferences: seed.preferences,
    });
    return { value, metrics: result.metrics };
  }
}

function parseApprovedGameplay(value: GameplayIdea | ReferenceMechanicSpec) {
  const reference = ReferenceMechanicSpecSchema.safeParse(value);
  return reference.success ? reference.data : GameplayIdeaSchema.parse(value);
}

/** Read the run-owned blueprint used to translate the slug boundary into the
 * human title stored by reference-level artifacts. */
async function readRunBlueprint(runRoot: string): Promise<GameBlueprint | undefined> {
  const root = path.resolve(runRoot);
  const file = path.join(root, 'artifacts/game-blueprint.json');
  let stat;
  try {
    stat = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Builder identity blueprint must be a regular run-local file');
  const [rootReal, fileReal] = await Promise.all([realpath(root), realpath(file)]);
  if (!isChildPath(rootReal, fileReal)) throw new Error('Builder identity blueprint resolves outside the current run');
  try {
    return GameBlueprintSchema.parse(JSON.parse(await readFile(fileReal, 'utf8')));
  } catch (error) {
    throw new Error(`Builder identity blueprint is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function requireRunBlueprint(runRoot: string, targetGameId: string): Promise<GameBlueprint> {
  const blueprint = await readRunBlueprint(runRoot);
  if (!blueprint) throw new Error(`Builder identity blueprint is required to validate target game ${targetGameId}`);
  if (blueprint.gameId !== targetGameId) throw new Error(`Builder target game mismatch: ${targetGameId} !== ${blueprint.gameId}`);
  return blueprint;
}
export class ArtDirectorAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(blueprint: GameBlueprint, context?: AgentExecutionContext) { const result = await this.provider.generateArtDirections(blueprint, context); return { value: ArtDirectionsSchema.parse(result.value), metrics: result.metrics }; }
}
export class StyleLockAgent {
  constructor(private readonly provider: AgentProvider) {}
  async run(blueprint: GameBlueprint, directions: ArtDirections, approval: ArtApproval, context?: AgentExecutionContext) { const result = await this.provider.generateStyleLock(blueprint, directions, ArtApprovalSchema.parse(approval), context); return { value: StyleLockSchema.parse(result.value), metrics: result.metrics }; }
}
export class AssetProducerAgent {
  constructor(private readonly provider: ImageProvider) {}
  async run(outputDir: string, blueprint: GameBlueprint, styleLock: StyleLock) { return AssetManifestSchema.parse(await this.provider.produce({ outputDir, blueprint, styleLock })); }
}

/** Builder and Fixer are the only roles whose provider is authorized to edit the game workspace. */
export function builderVerificationPassed(checks: readonly string[]): boolean {
  return checks.length >= 2 && checks.every((check) => !/(?:^|[:\s_-])(?:fail(?:ed|ure)?|error|missing|blocked)(?:$|[:\s_-])/iu.test(check));
}

export class BuilderAgent {
  constructor(private readonly provider: CodexProvider, private readonly runtime: RuntimeAdapter) {}
  private async loadReferenceRuntimeData(runRoot: string, workspace: string, blueprint: GameBlueprint, template: string) {
    return readReferenceLevelRuntimeData(runRoot, workspace, {
      // Reference-level artifacts are bound to the immutable game identity
      // (the variant/canonical slug), while the title is presentation data.
      // Using the title here breaks reskin variants such as 符刃夜行.
      targetGame: blueprint.gameId,
      template,
      runtime: blueprint.runtime,
    });
  }
  private async loadReferenceBehaviorTargets(runRoot: string, blueprint: GameBlueprint) {
    const contractPath = path.join(runRoot, 'artifacts/reference-level-implementation-contract.json');
    const raw = await readFile(contractPath, 'utf8').catch(() => undefined);
    if (raw === undefined) return undefined;
    const contract = ReferenceLevelImplementationContractSchema.parse(JSON.parse(raw));
    if (contract.targetRunId !== path.basename(runRoot) || contract.targetGame !== blueprint.gameId || path.resolve(contract.workspace) !== path.resolve(path.join(runRoot, 'workspace/game'))) {
      throw new Error('reference-level behavior targets are bound to a different run, game, or workspace');
    }
    return contract.behaviorMeasurements;
  }
  private async assertPreflight(workspace: string, blueprint: GameBlueprint, context?: AgentExecutionContext) {
    if (!context?.enforceBoundary) return;
    if (context.targetGameId !== undefined && context.targetGameId !== blueprint.gameId) throw new Error(`Builder target game mismatch: ${context.targetGameId} !== ${blueprint.gameId}`);
    const result = await verifyBuilderPreflight({
      runRoot: context.runRoot,
      workspace,
      targetGameId: context.targetGameId ?? blueprint.gameId,
      targetWorkspaceRelative: context.targetWorkspaceRelative ?? 'workspace/game',
      requiredArtifacts: context.requiredArtifacts ?? context.inputPaths.filter((item) => item.startsWith('artifacts/')),
    });
    if (!result.passed) throw new Error(`Builder preflight rejected workspace: ${result.blockers.join(', ')}`);
    const blueprintArtifact = path.join(context.runRoot, 'artifacts/game-blueprint.json');
    try {
      const raw = JSON.parse(await readFile(blueprintArtifact, 'utf8')) as { gameId?: unknown };
      if (raw.gameId !== blueprint.gameId) throw new Error(`Builder blueprint artifact game mismatch: ${String(raw.gameId)} !== ${blueprint.gameId}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Builder blueprint artifact game mismatch:')) throw error;
      throw new Error(`Builder preflight could not verify game blueprint artifact: ${blueprintArtifact}`);
    }
  }
  private async verifyAndReport(workspace: string, template: string, threadId: string | undefined, verificationMode: BuilderVerificationMode) {
    const verification = await this.runtime.verifyProject(workspace, { requireScripts: verificationMode === 'full' });
    const webBuild = await this.runtime.buildWeb(workspace);
    const runtime = template === 'spatial-shop-3d-v1' ? 'cocos-3d' : 'web-lite';
    const webBuildPath = runtime === 'cocos-3d' ? 'workspace/game/build/web-mobile' : 'workspace/game/dist';
    const success = builderVerificationPassed(verification);
    const report = BuildReportSchema.parse({ schemaVersion: 1, success, runtime, template, codexThreadId: threadId, workspace: 'workspace/game', webBuild: webBuildPath, files: await listFiles(webBuild), verification, builtAt: new Date().toISOString(), completion: { status: success ? 'IMPLEMENTATION_READY' : 'CANDIDATE_BLOCKED', blockers: ['normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest', 'runtimeProductJourney'] } });
    return { report, threadId };
  }
  async run(workspace: string, blueprint: GameBlueprint, styleLock: StyleLock, assets: AssetManifest, template: string, assetSource: string, approved3dAssets?: { research: Hybrid3dAssetResearchArtifact; sourceRoot: string }, gameplayRevision?: GameplayRevisionLock, context?: AgentExecutionContext, interactionContinuityContract?: InteractionContinuityContract) {
    if (context && !isChildPath(path.join(path.resolve(context.runRoot), 'workspace'), path.resolve(workspace))) throw new Error('Builder workspace must remain inside the current run workspace');
    await this.assertPreflight(workspace, blueprint, context);
    const runRoot = context?.runRoot ?? path.resolve(workspace, '../..');
    const referenceRuntimeData = await this.loadReferenceRuntimeData(runRoot, workspace, blueprint, template);
    const referenceLevelBehaviorTargets = await this.loadReferenceBehaviorTargets(runRoot, blueprint);
    if (referenceRuntimeData) await assertReferenceLevelRuntimeDataWritePath(workspace, referenceRuntimeData.production.runtime);
    await this.runtime.createProject(workspace, template);
    await this.runtime.applyBlueprint(workspace, blueprint, styleLock);
    await this.runtime.importAssets(workspace, assets, assetSource);
    if (approved3dAssets) {
      if (!this.runtime.importApproved3dAssets) throw new Error('The selected runtime cannot import approved 3D assets');
      await this.runtime.importApproved3dAssets(workspace, Hybrid3dAssetResearchArtifactSchema.parse(approved3dAssets.research), approved3dAssets.sourceRoot);
    }
    const validatedGameplayRevision = gameplayRevision ? GameplayRevisionLockSchema.parse(gameplayRevision) : undefined;
    const validatedContinuity = interactionContinuityContract ? InteractionContinuityContractSchema.parse(interactionContinuityContract) : undefined;
    if (validatedContinuity && context?.runRoot) {
      await mkdir(path.join(context.runRoot, 'artifacts'), { recursive: true });
      await writeFile(path.join(context.runRoot, 'artifacts/interaction-continuity-contract.json'), `${JSON.stringify(validatedContinuity, null, 2)}\n`);
    }
    if (referenceRuntimeData) {
      await assertReferenceLevelRuntimeDataWritePath(workspace, referenceRuntimeData.production.runtime);
      const stagedPath = path.join(workspace, referenceLevelRuntimeDataPath(referenceRuntimeData.production.runtime));
      await writeJsonAtomic(stagedPath, referenceRuntimeData);
    }
    const codexResult = await this.provider.build({ workspace, blueprint, styleLock, assets, template, gameplayRevision: validatedGameplayRevision, interactionContinuityContract: validatedContinuity, ...(referenceLevelBehaviorTargets ? { referenceLevelBehaviorTargets } : {}), context });
    if (referenceRuntimeData && codexResult.metrics.provider === 'mock' && template === 'cut-stack-dodge-v1') {
      // The mock Builder has no model turn to author numeric layout values.
      // Keep this explicit preview-only fallback inside BuilderAgent so a
      // missing layout cannot be mistaken for a production build.
      const layoutPath = path.join(workspace, 'src/generated/reference-level-layout.json');
      await writeJsonAtomic(layoutPath, buildDeterministicReferenceLevelLayout(referenceRuntimeData));
    }
    if (referenceRuntimeData) {
      await verifyReferenceLevelRuntimeDataFile(workspace, referenceRuntimeData);
      await verifyReferenceLevelLayoutFile(workspace, referenceRuntimeData);
    }
    return { ...await this.verifyAndReport(workspace, template, codexResult.threadId, codexResult.verificationMode), metrics: codexResult.metrics };
  }
  async verifyExisting(workspace: string, template: string, threadId: string, verificationMode: BuilderVerificationMode = 'full', context?: AgentExecutionContext) {
    if (context && !isChildPath(path.join(path.resolve(context.runRoot), 'workspace'), path.resolve(workspace))) throw new Error('Builder workspace must remain inside the current run workspace');
    const runRoot = context?.runRoot ?? path.resolve(workspace, '../..');
    const identityBlueprint = context?.targetGameId === undefined ? undefined : await requireRunBlueprint(runRoot, context.targetGameId);
    const referenceRuntimeData = await readReferenceLevelRuntimeData(
      runRoot,
      workspace,
      {
        ...(identityBlueprint ? { targetGame: identityBlueprint.gameId } : {}),
        template,
        runtime: runtimeForTemplate(template),
      },
    );
    if (referenceRuntimeData) {
      await verifyReferenceLevelRuntimeDataFile(workspace, referenceRuntimeData);
      await verifyReferenceLevelLayoutFile(workspace, referenceRuntimeData);
    }
    return this.verifyAndReport(workspace, template, threadId, verificationMode);
  }
  async implementFormalPrototype(workspace: string, input: FormalPrototypeBuildInput) {
    if (!path.isAbsolute(workspace)) throw new Error('Formal prototype workspace must be an absolute path');
    if (!this.provider.formalPrototype) throw new Error('The configured Codex provider cannot implement a formal prototype follow-up');
    if (!this.runtime.verifyFormalProject) throw new Error('The configured runtime cannot verify a formal prototype follow-up');
    const constraints = FormalPrototypeFollowupConstraintsSchema.parse(input.constraints);
    const research = OpenSourceResearchArtifactSchema.parse(input.research);
    const result = await this.provider.formalPrototype({ ...input, constraints, research, workspace });
    const verification = await this.runtime.verifyFormalProject(workspace);
    const webBuildAbsolute = await this.runtime.buildWeb(workspace);
    const report = FormalPrototypeBuildReportSchema.parse({
      schemaVersion: 1,
      status: 'BUILT',
      game: constraints.game.title,
      workspace: constraints.targetWorkspace,
      selectedActionSlot: input.actionSelection.selectedSlot,
      author: 'BuilderAgent',
      codexThreadId: result.threadId ?? null,
      webBuild: path.posix.join(constraints.targetWorkspace, 'dist'),
      files: await listFiles(webBuildAbsolute),
      verification,
      builtAt: new Date().toISOString(),
    });
    return { report, metrics: result.metrics };
  }
  async buildPrototypes(runRoot: string, ideas: IdeaGeneration, selection: PrototypeSelection, context?: AgentExecutionContext) {
    const resolvedRunRoot = path.resolve(runRoot);
    if (!isChildPath(path.dirname(resolvedRunRoot), resolvedRunRoot)) throw new Error('Prototype run root must be an absolute non-root path');
    const ideaById = new Map(ideas.ideas.map((idea) => [idea.id, idea]));
    const slots = ['a', 'b', 'c'] as const;
    const prototypes = []; const metrics = { provider: 'prototype-builder', model: 'mixed', calls: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]; const ideaId = selection.selectedIdeaIds[index];
      if (!slot || !ideaId) throw new Error(`Prototype selection is missing slot ${index}`);
      const idea = ideaById.get(ideaId);
      if (!idea) throw new Error(`Selected prototype idea ${ideaId} does not exist`);
      const workspace = path.join(resolvedRunRoot, 'workspace', `prototype-${slot}`);
      const builtFile = path.join(workspace, 'dist/index.html'); let built = '';
      try { built = await readFile(builtFile, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (!hasPlayablePrototypeContract(built)) {
        await rm(workspace, { recursive: true, force: true }); await mkdir(path.join(workspace, 'dist'), { recursive: true });
        const html = prototypeHtml(slot, idea);
        await writeFile(path.join(workspace, 'index.html'), html); await writeFile(builtFile, html);
        if (this.provider.prototype) { const result = await this.provider.prototype({ workspace, idea, slot, context }); metrics.calls += result.metrics.calls; if (result.metrics.usage) { metrics.usage.inputTokens += result.metrics.usage.inputTokens; metrics.usage.outputTokens += result.metrics.usage.outputTokens; metrics.usage.totalTokens += result.metrics.usage.totalTokens; } }
        built = await readFile(builtFile, 'utf8');
      }
      if (!hasPlayablePrototypeContract(built)) throw new Error(`prototype-${slot} is not immediately playable or testable`);
      prototypes.push({ slot, ideaId, workspace: `workspace/prototype-${slot}`, entrypoint: `workspace/prototype-${slot}/dist/index.html`, launchCommand: `pnpm factory preview ${path.basename(runRoot)} prototype-${slot}`, placeholderArt: true as const, formalUi: false as const, iaaIncluded: false as const, majorSystems: idea.majorSystems, verification: ['html:playable', 'test-api:available'], author: 'BuilderAgent' as const });
    }
    return { report: PrototypeBuildReportSchema.parse({ schemaVersion: 1, batch: ideas.batch, prototypes }), metrics };
  }
  async buildActionPrototypes(runRoot: string, sourceWorkspaceAbsolute: string, inputSpec: ActionMechanicExperimentSpec, context?: AgentExecutionContext) {
    if (!path.isAbsolute(sourceWorkspaceAbsolute)) throw new Error('Action prototype source workspace must be an absolute path');
    const spec = ActionMechanicExperimentSpecSchema.parse(inputSpec);
    if (typeof this.provider.actionPrototype !== 'function') throw new Error('Action prototype provider capability is required; configure an explicit mock provider for fixture output');
    const resolvedRunRoot = path.resolve(runRoot);
    const resolvedSource = path.resolve(sourceWorkspaceAbsolute);
    const metrics = { provider: 'action-prototype-builder', model: 'mixed', calls: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
    const prototypes = [];

    for (const variant of spec.prototypes) {
      const workspace = path.resolve(resolvedRunRoot, variant.workspace);
      if (!isChildPath(resolvedRunRoot, workspace)) throw new Error(`Action prototype workspace must stay inside the run root: ${variant.workspace}`);
      if (workspace === resolvedSource || isChildPath(resolvedSource, workspace)) throw new Error(`Action prototype workspace must be isolated from its source: ${variant.workspace}`);
      await assertActionPrototypeWorkspacePath(resolvedRunRoot, workspace);
      const builtFile = path.join(workspace, 'dist/index.html');
      let built = await readActionPrototypeOutput(workspace);
      const resumable = await hasResumableActionPrototype(resolvedRunRoot, variant.workspace, workspace, builtFile, built, variant);
      let generatedByFallback = false;
      if (!resumable) {
        await archiveRunPaths(resolvedRunRoot, [variant.workspace], `action-prototype-${variant.slot.toLowerCase()}`);
        await copyActionPrototypeSource(resolvedSource, workspace);

        let providerName = 'mock';
        let providerModel = 'fixture';
        const variantContext = context
          ? {
            ...context,
            outputPath: path.join(context.runRoot, `artifacts/action-feel-${variant.slot.toLowerCase()}-builder-handoff.json`),
          }
          : context;
        const result = await this.provider.actionPrototype({ workspace, spec, variant, context: variantContext });
        metrics.calls += result.metrics.calls;
        if (result.metrics.usage) {
          metrics.usage.inputTokens += result.metrics.usage.inputTokens;
          metrics.usage.outputTokens += result.metrics.usage.outputTokens;
          metrics.usage.totalTokens += result.metrics.usage.totalTokens;
        }
        providerName = result.metrics.provider;
        providerModel = result.metrics.model;
        generatedByFallback = result.metrics.provider === 'mock';
        await assertActionPrototypeWorkspacePath(resolvedRunRoot, workspace);
        if (generatedByFallback) {
          await mkdir(path.dirname(builtFile), { recursive: true });
          await writeFile(builtFile, actionPrototypeHtml(variant));
        }
        const generated = await readActionPrototypeOutput(workspace);
        if (!hasActionPrototypeContract(generated)) throw new Error(`Action prototype ${variant.slot} dist/index.html must expose window.__ACTION_TEST__ contractVersion 1`);
        await writeActionPrototypeProvenance(resolvedRunRoot, variant.workspace, workspace, variant, generated, {
          mode: generatedByFallback ? 'mock-fixture' : 'provider',
          provider: providerName,
          model: providerModel,
        });
        built = generated;
      }
      if (!hasActionPrototypeContract(built)) throw new Error(`Action prototype ${variant.slot} dist/index.html must expose window.__ACTION_TEST__ contractVersion 1`);

      prototypes.push({
        slot: variant.slot,
        workspace: variant.workspace,
        geometryFixtureHash: variant.geometryFixtureHash,
        treatmentHash: variant.treatmentHash,
        entrypoint: path.posix.join(variant.workspace.replaceAll('\\', '/'), 'dist/index.html'),
        launchCommand: `pnpm --dir ${variant.workspace} preview`,
        author: 'BuilderAgent' as const,
        verification: [
          resumable ? 'resume:existing-output' : generatedByFallback ? 'provider-mock-fixture' : 'source:isolated-copy',
          'action-test-contract:v1',
        ],
      });
    }

    return { report: ActionPrototypeBuildReportSchema.parse({ schemaVersion: 1, experimentId: spec.experimentId, prototypes }), metrics };
  }
}
export class QAAgent {
  constructor(private readonly provider: QAProvider, private readonly runtime: RuntimeAdapter) {}
  async run(workspace: string, runRoot: string, buildPassed = false): Promise<QaReport> {
    const raw = await this.provider.playtest({ runtime: this.runtime, workspace, runRoot });
    const rawRecord = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
    const rawEvidence = rawRecord?.evidence;
    const validEvidence: QaEvidence[] = [];
    let invalidEvidenceCount = 0;
    if (Array.isArray(rawEvidence)) {
      for (const item of rawEvidence) {
        const parsedEvidence = QaEvidenceSchema.safeParse(item);
        if (parsedEvidence.success) validEvidence.push(parsedEvidence.data);
        else invalidEvidenceCount += 1;
      }
    } else if (rawEvidence !== undefined) {
      invalidEvidenceCount = 1;
    }
    // Parse the report body independently from evidence so a provider that
    // emits one malformed evidence row cannot crash the whole QA stage before
    // the control plane can record a visible blocker and safe fallback.
    const parsed = QaReportSchema.parse(rawRecord ? (() => {
      const body = { ...rawRecord };
      delete body.evidence;
      delete body.interactionContinuityContract;
      delete body.interactionContinuityObservation;
      delete body.interactionContinuity;
      return body;
    })() : raw);
    const fallbackEvidence = [{
      schemaVersion: 1,
      mode: 'STATE_COVERAGE' as const,
      actions: parsed.checks.map((check) => check.name).slice(0, 16).concat('provider-playtest'),
      artifacts: parsed.screenshots.length ? parsed.screenshots : ['artifacts/qa-report.json'],
      forbiddenOperations: ['provider-test-api-oracle'],
    }];
    // Some providers legitimately omit evidence while older providers may
    // serialize an empty array.  Treat both forms as missing; an empty array
    // is not usable evidence and must never be persisted as a passing report.
    let interactionContinuity: InteractionContinuityReport | undefined;
    const continuityContract = rawRecord?.interactionContinuityContract ?? (rawRecord?.interactionContinuity && typeof rawRecord.interactionContinuity === 'object' && !Array.isArray(rawRecord.interactionContinuity) ? (rawRecord.interactionContinuity as Record<string, unknown>).contract : undefined);
    const continuityObservation = rawRecord?.interactionContinuityObservation ?? (rawRecord?.interactionContinuity && typeof rawRecord.interactionContinuity === 'object' && !Array.isArray(rawRecord.interactionContinuity) ? (rawRecord.interactionContinuity as Record<string, unknown>).observation : undefined);
    if (continuityContract !== undefined || continuityObservation !== undefined) {
      try {
        const contract = InteractionContinuityContractSchema.parse(continuityContract);
        const observation = InteractionContinuityObservationSchema.parse(continuityObservation);
        interactionContinuity = evaluateInteractionContinuity(contract, observation);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'interaction continuity artifact is invalid';
        interactionContinuity = InteractionContinuityReportSchema.parse({ schemaVersion: 1, contractId: 'invalid-interaction-continuity', passed: false, blockers: [`contract:invalid:${message.slice(0, 240)}`], evidence: ['artifacts/interaction-continuity-report.json'], checkedNodes: 0, checkedScenarios: 0, checkedRepetitions: 0, evaluatedAt: new Date().toISOString() });
      }
    }
    const report = QaReportSchema.parse({
      ...parsed,
      evidence: validEvidence.length > 0 ? validEvidence : fallbackEvidence,
      ...(interactionContinuity ? { interactionContinuity } : {}),
      ...(invalidEvidenceCount > 0 ? {
        issues: [...parsed.issues, {
          id: 'qa-evidence-normalization',
          severity: 'error' as const,
          message: `${invalidEvidenceCount} provider QA evidence item(s) failed schema validation and were replaced with a diagnostic fallback.`,
          evidence: 'artifacts/qa-evidence.json',
        }],
      } : {}),
    });
    const continuityFailed = interactionContinuity !== undefined && !interactionContinuity.passed;
    const finalReport = continuityFailed
      ? QaReportSchema.parse({ ...report, passed: false, issues: [...report.issues, { id: 'interaction-continuity', severity: 'error' as const, message: 'interaction continuity contract failed', evidence: 'artifacts/interaction-continuity-report.json' }] })
      : report;
    await writeFile(path.join(runRoot, 'artifacts/qa-evidence.json'), `${JSON.stringify(report.evidence, null, 2)}\n`);
    if (interactionContinuity) await writeFile(path.join(runRoot, 'artifacts/interaction-continuity-report.json'), `${JSON.stringify(interactionContinuity, null, 2)}\n`);
    const runtimeWiredFiles = await discoverRuntimeWiredFiles(runRoot);
    const journeyEvidence = [...new Set([
      ...(finalReport.naturalFlow?.screenshots ?? []),
      ...finalReport.screenshots,
      'artifacts/runtime-product-journey.json',
    ])];
    await writeFile(path.join(runRoot, 'artifacts/runtime-product-journey.json'), `${JSON.stringify({
      schemaVersion: 1,
      screenshots: journeyEvidence.filter((item) => item !== 'artifacts/runtime-product-journey.json'),
      observedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    const runtimeProduct = resolveRuntimeProductGate({
      naturalFlow: finalReport.naturalFlow,
      runtimeWiredFiles,
      browserEvidence: journeyEvidence,
    });
    await writeFile(path.join(runRoot, 'artifacts/runtime-product-gates.json'), `${JSON.stringify(RuntimeProductGateSchema.parse(runtimeProduct), null, 2)}\n`);
    await writeFile(path.join(runRoot, 'artifacts/completion-gates.json'), JSON.stringify(await buildCompletionGateReport({ runRoot, corePassed: buildPassed, normalFlowPassed: finalReport.passed, screenshots: finalReport.screenshots }), null, 2) + '\n');
    return finalReport;
  }
  async tournament(report: PrototypeBuildReport, runRoot: string): Promise<PlaytestTournament> { return PlaytestTournamentSchema.parse(await this.provider.playtestTournament({ runtime: this.runtime, report: PrototypeBuildReportSchema.parse(report), runRoot })); }
  async actionTournament(spec: ActionMechanicExperimentSpec, report: ActionPrototypeBuildReport, runRoot: string): Promise<ActionPlaytestReport> {
    return ActionPlaytestReportSchema.parse(await this.provider.playtestActionMechanics({
      runtime: this.runtime,
      spec: ActionMechanicExperimentSpecSchema.parse(spec),
      report: ActionPrototypeBuildReportSchema.parse(report),
      runRoot,
    }));
  }
}
export class FixerAgent {
  constructor(private readonly provider: CodexProvider, private readonly runtime: RuntimeAdapter) {}
  async run(workspace: string, threadId: string | undefined, qaReport: QaReport, context?: AgentExecutionContext) {
    if (context && !isChildPath(path.join(path.resolve(context.runRoot), 'workspace'), path.resolve(workspace))) throw new Error('Fixer workspace must remain inside the current run workspace');
    const runRoot = context?.runRoot ?? path.resolve(workspace, '../..');
    const identityBlueprint = context?.targetGameId === undefined ? undefined : await requireRunBlueprint(runRoot, context.targetGameId);
    const referenceRuntimeData = await readReferenceLevelRuntimeData(
      runRoot,
      workspace,
      identityBlueprint
        ? { targetGame: identityBlueprint.gameId, template: identityBlueprint.template, runtime: identityBlueprint.runtime }
        : undefined,
    );
    if (referenceRuntimeData) await verifyReferenceLevelRuntimeDataFile(workspace, referenceRuntimeData);
    const result = await this.provider.fix({ workspace, threadId, qaReport: QaReportSchema.parse(qaReport), context });
    if (referenceRuntimeData) {
      await verifyReferenceLevelRuntimeDataFile(workspace, referenceRuntimeData);
      await verifyReferenceLevelLayoutFile(workspace, referenceRuntimeData);
    }
    // A repair is not complete merely because the provider returned. Full-mode
    // providers (real codex integrations) get the complete local regression so
    // the handoff cannot claim a fix without test/typecheck evidence. Contract-
    // mode providers (mock/stub) never touched the workspace, so the lightweight
    // contract checks mirror BuilderAgent instead of pretending a full
    // regression ran.
    const verification = await this.runtime.verifyProject(workspace, { requireScripts: result.verificationMode === 'full' });
    if (result.verificationMode === 'full' && (!verification.includes('test:passed') || !verification.includes('typecheck:passed'))) {
      const blockers = ['test:passed', 'typecheck:passed'].filter((check) => !verification.includes(check));
      if (context?.runRoot) {
        await mkdir(path.join(context.runRoot, 'artifacts'), { recursive: true });
        await writeFile(path.join(context.runRoot, 'artifacts/fix-verification-blockers.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'FIX', passed: false, verification, blockers, fixedAt: new Date().toISOString() }, null, 2)}\n`);
      }
      throw new Error(`Fixer verification must include test:passed and typecheck:passed; missing ${blockers.join(', ')}`);
    }
    await this.runtime.buildWeb(workspace);
    return { ...result, verification };
  }
  async runFormal(workspace: string, threadId: string | undefined, qaReport: QaReport, context?: AgentExecutionContext) {
    if (!path.isAbsolute(workspace)) throw new Error('Formal prototype workspace must be an absolute path');
    if (!this.runtime.verifyFormalProject) throw new Error('The configured runtime cannot verify a formal prototype repair');
    const result = await this.provider.fix({ workspace, threadId, qaReport: QaReportSchema.parse(qaReport), context });
    const verification = await this.runtime.verifyFormalProject(workspace);
    const webBuild = await this.runtime.buildWeb(workspace);
    return { ...result, verification, webBuild };
  }
}
export class ReleaseAgent {
  async run(runRoot: string, blueprint: GameBlueprint, options?: { enforceAcceptance?: boolean; enforceOperatingGates?: boolean; certificationRequired?: boolean; artQualityRequired?: boolean; requirePresentation?: boolean; requirePlatformSpine?: boolean; requirePlatformPackages?: boolean; requireDependencyAllowlist?: boolean; requireSideEffectJournal?: boolean; requirePortfolioGate?: boolean; requirePlatformPolicy?: boolean; reuseCandidate?: boolean }) { return ReleaseManifestSchema.parse(await packageRelease(runRoot, blueprint, options)); }
}

function hasPlayablePrototypeContract(html: string) {
  if (!html.includes('__PROTOTYPE_TEST__')) return false;
  const controlTags = html.match(/<[^>]*\bdata-(?:choice|action|lantern)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/giu) ?? [];
  return controlTags.some((tag) => !/\sdisabled(?:\s|=|>)/iu.test(tag));
}

const actionCopyExcludedDirectories = new Set(['node_modules', 'dist', 'coverage', 'screenshots', 'playwright-report', 'test-results', 'qa-evidence']);
const actionCopyExcludedFiles = new Set(['qa-report.json', 'qa-evidence.md', 'console.log']);

const ActionPrototypeProvenanceSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('action-prototype-provenance'),
  mode: z.enum(['provider', 'mock-fixture']),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  runRoot: z.string().trim().min(1),
  workspace: z.string().trim().min(1),
  slot: z.enum(['A', 'B', 'C']),
  geometryFixtureHash: z.string().regex(/^sha256:[a-f0-9]{64}$/iu),
  treatmentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/iu),
  outputPath: z.literal('dist/index.html'),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  distContentHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/iu),
}).strict();
type ActionPrototypeProvenance = z.infer<typeof ActionPrototypeProvenanceSchema>;

const actionPrototypeProvenanceRelativePath = 'dist/action-prototype-provenance.json';

async function assertActionPrototypeWorkspacePath(runRoot: string, workspace: string): Promise<void> {
  const resolvedRoot = path.resolve(runRoot);
  const resolvedWorkspace = path.resolve(workspace);
  if (!isChildPath(resolvedRoot, resolvedWorkspace)) throw new Error(`Action prototype workspace must stay inside the run root: ${workspace}`);
  let current = resolvedRoot;
  for (const component of path.relative(resolvedRoot, resolvedWorkspace).split(path.sep)) {
    current = path.join(current, component);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Action prototype workspace path must not be a symlink: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Action prototype workspace path must be a directory: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

async function readActionPrototypeOutput(workspace: string): Promise<string> {
  const distDirectory = path.join(workspace, 'dist');
  const builtFile = path.join(distDirectory, 'index.html');
  try {
    const distStat = await lstat(distDirectory);
    if (distStat.isSymbolicLink()) throw new Error(`Action prototype output directory must not be a symlink: ${distDirectory}`);
    if (!distStat.isDirectory()) throw new Error(`Action prototype output directory must be a directory: ${distDirectory}`);
    const builtStat = await lstat(builtFile);
    if (builtStat.isSymbolicLink()) throw new Error(`Action prototype output must not be a symlink: ${builtFile}`);
    if (!builtStat.isFile()) throw new Error(`Action prototype output must be a regular file: ${builtFile}`);
    return await readFile(builtFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

async function readActionPrototypeProvenance(workspace: string): Promise<ActionPrototypeProvenance | undefined> {
  const file = path.join(workspace, actionPrototypeProvenanceRelativePath);
  try {
    const stat = await lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return undefined;
    return ActionPrototypeProvenanceSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return undefined;
  }
}

async function hashActionPrototypeDist(workspace: string): Promise<string> {
  const distDirectory = path.join(workspace, 'dist');
  const entries: Array<{ path: string; sha256: string }> = [];
  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const children = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      if (relative === actionPrototypeProvenanceRelativePath.replace(/^dist\//u, '')) continue;
      const file = path.join(directory, child.name);
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error(`Action prototype dist content must not contain a symlink: ${file}`);
      if (stat.isDirectory()) await visit(file, relative);
      else if (stat.isFile()) entries.push({ path: relative, sha256: await sha256File(file) });
      else throw new Error(`Unsupported action prototype dist content: ${file}`);
    }
  }
  const distStat = await lstat(distDirectory);
  if (distStat.isSymbolicLink() || !distStat.isDirectory()) throw new Error(`Action prototype dist must be a regular directory: ${distDirectory}`);
  await visit(distDirectory, '');
  return sha256Text(JSON.stringify(entries));
}

async function hasResumableActionPrototype(
  runRoot: string,
  workspaceRelative: string,
  workspace: string,
  builtFile: string,
  built: string,
  variant: ActionMechanicExperimentSpec['prototypes'][number],
): Promise<boolean> {
  if (!hasCompleteActionPrototypeContract(built)
    || !built.includes(variant.geometryFixtureHash)
    || !hasActionVariantMarker(built, variant.slot)) return false;
  const provenance = await readActionPrototypeProvenance(workspace);
  if (!provenance
    || provenance.runRoot !== path.resolve(runRoot)
    || provenance.workspace !== workspaceRelative
    || provenance.slot !== variant.slot
    || provenance.geometryFixtureHash !== variant.geometryFixtureHash
    || provenance.treatmentHash !== variant.treatmentHash
    || provenance.outputPath !== 'dist/index.html'
    || provenance.outputHash !== await sha256File(builtFile)
    || provenance.distContentHash !== await hashActionPrototypeDist(workspace)
    || provenance.bindingHash !== actionPrototypeProvenanceBindingHash(provenance)) return false;
  if (provenance.mode === 'provider' && provenance.provider === 'mock') return false;
  if (provenance.mode === 'mock-fixture') return false;
  return true;
}

async function writeActionPrototypeProvenance(
  runRoot: string,
  workspaceRelative: string,
  workspace: string,
  variant: ActionMechanicExperimentSpec['prototypes'][number],
  built: string,
  source: Pick<ActionPrototypeProvenance, 'mode' | 'provider' | 'model'>,
) {
  const builtFile = path.join(workspace, 'dist/index.html');
  const outputHash = await sha256File(builtFile);
  const distContentHash = await hashActionPrototypeDist(workspace);
  const withoutBinding = {
    schemaVersion: 1 as const,
    artifactType: 'action-prototype-provenance' as const,
    ...source,
    runRoot: path.resolve(runRoot),
    workspace: workspaceRelative,
    slot: variant.slot,
    geometryFixtureHash: variant.geometryFixtureHash,
    treatmentHash: variant.treatmentHash,
    outputPath: 'dist/index.html' as const,
    outputHash,
    distContentHash,
  } satisfies Omit<ActionPrototypeProvenance, 'bindingHash'>;
  const provenance = ActionPrototypeProvenanceSchema.parse({ ...withoutBinding, bindingHash: actionPrototypeProvenanceBindingHash(withoutBinding) });
  if (!built) throw new Error(`Action prototype ${variant.slot} output is empty`);
  await writeJsonAtomic(path.join(workspace, actionPrototypeProvenanceRelativePath), provenance);
}

function actionPrototypeProvenanceBindingHash(value: Partial<ActionPrototypeProvenance>): string {
  const withoutBinding = { ...value };
  delete withoutBinding.bindingHash;
  return sha256Text(JSON.stringify(withoutBinding));
}

function isChildPath(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function copyActionPrototypeSource(source: string, destination: string) {
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => {
      if (candidate === source) return true;
      const name = path.basename(candidate).toLowerCase();
      return !actionCopyExcludedDirectories.has(name) && !actionCopyExcludedFiles.has(name);
    },
  });
}

export function hasActionPrototypeContract(html: string) {
  return html.includes('__ACTION_TEST__') && /["']?contractVersion["']?\s*:\s*1\b/.test(html);
}

export function hasCompleteActionPrototypeContract(html: string) {
  return hasActionPrototypeContract(html)
    && /fixedStepSeconds/.test(html)
    && /fixedStepSeconds/.test(html)
    && /courseFixtureHash/.test(html)
    && /anchorPolicy/.test(html)
    && ['input-response', 'release-kinematics', 'hook-selection', 'event-gap', 'retry-friction', 'finish-crossing'].every((scenario) => html.includes(scenario));
}

function hasActionVariantMarker(html: string, slot: ActionMechanicExperimentSpec['prototypes'][number]['slot']) {
  return html.includes(`variant:\`${slot}\``)
    || new RegExp(`["']?slot["']?\\s*[:=]\\s*["']${slot}["']`, 'u').test(html);
}

export function actionPrototypeHtml(variant: ActionMechanicExperimentSpec['prototypes'][number]) {
  const payload = JSON.stringify({ slot: variant.slot, geometryFixtureHash: variant.geometryFixtureHash, treatment: variant.treatment }).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Action prototype ${variant.slot}</title><style>html,body{margin:0;height:100%;background:#151821;color:#fff;font:16px system-ui}main{height:100%;display:grid;place-items:center}canvas{width:min(100%,390px);height:auto;background:#252b38;touch-action:none}</style><main><canvas width="390" height="844" aria-label="Hold and release action prototype"></canvas></main><script>const variant=${payload};const anchors=[{id:'anchor-1',x:190,y:220},{id:'anchor-2',x:20,y:180}];let state;let events=[];function snapshot(){return JSON.parse(JSON.stringify(state))}function emit(type,source){state.eventSeq++;events.push({seq:state.eventSeq,tick:state.tick,type,source})}function resetGame(){events=[];state={tick:0,status:'playing',inputHeld:false,player:{x:60,y:420,vx:4,vy:0},anchors,attachedAnchorId:null,ropeLength:null,maxSpeed:8,finishX:360,failY:820,eventSeq:0};return snapshot()}function act(command){const held=!!command.held;state.inputHeld=held;if(state.status==='failed'&&held){state.status='playing';state.player.y=420;state.player.vx=4;emit('retry',command.source||'input');return snapshot()}state.attachedAnchorId=held?'anchor-1':null;state.ropeLength=held?240:null;if(!held&&state.attachedAnchorId===null)state.player.vx=Math.max(state.player.vx,4);emit(held?'input-held':'input-released',command.source||'input');return snapshot()}function advanceTicks(count){for(let i=0;i<count&&state.status==='playing';i++){state.tick++;const previousX=state.player.x;state.player.x+=state.player.vx;state.player.y+=state.player.vy;state.player.vx=state.player.vx===4?5:4;emit('motion','simulation');if(previousX<state.finishX&&state.player.x>=state.finishX){state.status='won';emit('finish','simulation')}if(state.player.y>=state.failY){state.status='failed';emit('failure','simulation')}}return snapshot()}function loadScenario(id){resetGame();if(id==='input-response'){state.player.x=60;state.player.vx=4}if(id==='release-kinematics'){state.player.vx=6;state.player.vy=2;state.attachedAnchorId='anchor-1';state.ropeLength=240}if(id==='hook-selection'){state.player.x=60;state.player.vx=4}if(id==='event-gap'){state.player.vx=4}if(id==='retry-friction'){state.status='failed';state.player.y=state.failY;emit('failure','scenario')}if(id==='finish-crossing'){state.player.x=state.finishX-5;state.player.vx=8}return snapshot()}function getEvents(sinceSeq=0){return events.filter(event=>event.seq>sinceSeq).map(event=>({...event}))}window.__ACTION_TEST__={contractVersion:1,getManifest(){return {slot:variant.slot,fixedStepSeconds:1/60,courseFixtureHash:variant.geometryFixtureHash,anchorPolicy:variant.treatment.join('; ')}},resetGame,getState:snapshot,act,advanceTicks,loadScenario,getEvents};const canvas=document.querySelector('canvas');canvas.addEventListener('pointerdown',()=>act({held:true,source:'pointer'}));canvas.addEventListener('pointerup',()=>act({held:false,source:'pointer'}));addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat)act({held:true,source:'keyboard'})});addEventListener('keyup',event=>{if(event.code==='Space')act({held:false,source:'keyboard'})});resetGame()</script></html>`;
}

function prototypeHtml(slot: 'a' | 'b' | 'c', idea: GameplayIdea) {
  const payload = JSON.stringify({ slot, ideaId: idea.id, name: idea.name, coreAction: idea.coreAction, decision: idea.decision, pressure: idea.pressure });
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${idea.name}</title><style>html,body{margin:0;height:100%;background:#171923;color:#f7fafc;font:18px system-ui}main{max-width:700px;margin:auto;padding:24px}#arena{height:240px;border:3px solid #718096;display:grid;place-items:center;background:#2d3748}button{font:inherit;padding:18px;margin:12px 8px 0 0;background:#f6ad55;border:0;border-radius:8px}small{color:#cbd5e0}</style><main><small>PROTOTYPE ${slot.toUpperCase()} · PLACEHOLDER ART</small><h1>${idea.name}</h1><p>${idea.coreAction}</p><div id="arena"><div><b id="prompt"></b><p id="state"></p></div></div><button data-choice="0">安全选择</button><button data-choice="1">冒险选择</button><p>${idea.decision}</p></main><script>const spec=${payload};let state;function resetGame(seed=1){state={seed,turn:0,score:0,pressure:2,combo:0,failed:false,lastChoice:null,variation:0};render();return getState()}function getState(){return JSON.parse(JSON.stringify(state))}function act(choice){if(state.failed)return getState();const target=(state.seed+state.turn+(spec.slot.charCodeAt(0)-97))%2;const correct=choice===target;state.turn++;state.lastChoice=choice;state.variation=target;if(correct){state.score+=choice?3:1;state.combo++;state.pressure=Math.max(0,state.pressure-1)}else{state.combo=0;state.pressure+=choice?2:1}if(state.pressure>=7)state.failed=true;render();return getState()}function render(){document.querySelector('#prompt').textContent='Signal '+(state.variation?'◆':'●')+' — choose before pressure fills';document.querySelector('#state').textContent='Turn '+state.turn+' · Score '+state.score+' · Pressure '+state.pressure+'/7'+(state.failed?' · FAILED':'')}document.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>act(Number(button.dataset.choice)));window.__PROTOTYPE_TEST__={resetGame,getState,act,spec};resetGame()</script></html>`;
}
