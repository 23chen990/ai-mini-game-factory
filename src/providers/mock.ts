import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256File, sha256Text } from '../core/files.js';
import { deriveAssetDefinitions } from '../core/asset-definitions.js';
import type { AgentExecutionContext, AgentProvider, AgentProviderResult, CodexProvider, ImageProvider } from './interfaces.js';
import { ReferenceFrameManifestSchema, ReferenceLevelReconstructionSchema, type ArtApproval, type ArtDirections, type GameBlueprint, type ReferenceEvidencePack, type ReferenceMechanicSpec, type Seed, type StyleLock } from '../schemas/index.js';
import type { GameplayIdea, IdeaGeneration, LowCostFilter, PlaytestTournament } from '../schemas/gameplay-experiment.js';

export class MockAgentProvider implements AgentProvider {
  async analyzeReferenceEvidence(pack: ReferenceEvidencePack, context?: AgentExecutionContext): Promise<AgentProviderResult> {
    const source = pack.sourceFiles[0];
    if (!source) return { value: { schemaVersion: 1, targetRunId: pack.targetRunId, behaviorChecks: [], observations: [], inferences: [], unknowns: ['No bound reference source is available for behavior analysis.'], levelReconstruction: null, status: 'BLOCKED' }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
    const cases = [
      ['input_state', 'primary controllable object', 'ready → primary input → resolved state', 'normal primary tap', 'primary input changes the declared controllable state', 'play object', ['input accepted', 'object state visibly changes']],
      ['spatial_relation', 'target and support pair', 'approach → contact → support consequence', 'normal primary tap at the visible target', 'contact resolves against the declared target/support relationship', 'target/support pair', ['contact shown at target', 'support consequence remains world-local']],
      ['failure_recovery', 'declared danger object', 'safe approach → danger contact → failure → retry', 'normal input that visibly reaches danger, then retry', 'danger contact causes an attributable failure and retry resets cleanly', 'danger object', ['danger telegraph is visible', 'contact causes failure', 'retry restores ready state']],
      ['feedback_sequence', 'successful target', 'intact → contact → resolution → reward', 'normal input that reaches the target', 'success feedback follows contact and resolution in causal order', 'resolved target', ['contact cue', 'object resolution', 'world-local reward']],
      ['terminal_replay', 'finish and replay control', 'finish approach → settlement → replay → ready', 'normal input through finish, then visible replay control', 'the declared loop reaches settlement and replay returns to a fresh ready state', 'finish result', ['finish result appears', 'settlement appears', 'replay returns to ready']],
    ] as const;
    const failurePressureContract = {
      schemaVersion: 1 as const,
      purpose: 'Record source-bound reference pressure for deterministic orchestration tests.',
      evidence: [{
        id: 'reference-pressure', competitor: pack.benchmark.name, sourceRefs: [source.path],
        observed: ['A visible danger branch ends the current attempt.'],
        inferred: ['The approach creates a timing decision.'], applicability: 'adapt' as const,
        applicabilityRationale: 'Preserve causal pressure with original expression and values.',
        rejectExpression: ['names', 'assets', 'UI layout', 'audio', 'numeric tuning'], confidence: 'high' as const,
      }],
      rules: [{
        id: 'reference-pressure-rule', pressureType: 'hazard' as const,
        trigger: 'The controllable object reaches the visible danger object.',
        playerSignal: 'The danger object is visible before contact.',
        escalation: 'Forward motion reduces the remaining response window.',
        failureOutcome: 'The attempt enters a visible failed state.',
        attribution: 'Impact feedback is anchored to the danger contact.',
        recovery: 'The visible retry control restores the ready state.',
        sourceEvidenceRefs: ['reference-pressure'],
        implementationImplications: ['Keep danger visible before contact.', 'Expose natural-input retry.'],
      }],
      noCopyBoundary: ['Do not copy third-party names, assets, UI, audio, content, or numeric tuning.'],
    };
    let levelReconstruction = null;
    if (context?.inputPaths.includes('artifacts/reference-frame-manifest.json')) {
      const frameManifestPath = path.join(context.runRoot, 'artifacts/reference-frame-manifest.json');
      const frameManifest = ReferenceFrameManifestSchema.parse(JSON.parse(await readFile(frameManifestPath, 'utf8')));
      const frameManifestSha256 = await sha256File(frameManifestPath);
      const phases = ['ready', 'input', 'interaction', 'terminal', 'replay'] as const;
      const checkpointAt = (index: number) => Math.min(frameManifest.source.durationMs - 1, Math.round((frameManifest.source.durationMs - 1) * index / (phases.length - 1)));
      const checkpoints = phases.map((phase, index) => ({
        id: `reference-${phase}`,
        phase,
        atMs: checkpointAt(index),
        sourceFrameIds: [frameManifest.frames[Math.min(frameManifest.frames.length - 1, Math.round((frameManifest.frames.length - 1) * index / (phases.length - 1)))]!.id],
        input: phase === 'input'
          ? { actionId: 'primary-action', kind: 'tap' as const, targetObjectId: 'player-object', gestureDirection: 'none' as const, sourcePointNormalized: { x: 0.25, y: 0.5 }, confidence: 1 }
          : phase === 'replay'
            ? { actionId: 'replay', kind: 'tap' as const, targetObjectId: 'replay-control', gestureDirection: 'none' as const, sourcePointNormalized: { x: 0.5, y: 0.75 }, confidence: 1 }
            : { actionId: null, kind: 'none' as const, targetObjectId: null, gestureDirection: 'none' as const, sourcePointNormalized: null, confidence: 1 },
        camera: { mode: phase === 'replay' ? 'cut' as const : 'follow' as const, focusObjectIds: ['player-object'], motion: phase === 'ready' ? 'static' as const : phase === 'replay' ? 'cut' as const : 'forward' as const, confidence: 1 },
        objects: [
          { semanticId: 'player-object', role: 'player' as const, lifecycle: phase === 'ready' ? 'ready' as const : phase === 'terminal' ? 'settled' as const : 'moving' as const, boundsNormalized: { x: 0.15, y: 0.4, width: 0.1, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 1 },
          { semanticId: 'target-object', role: 'cuttable' as const, lifecycle: phase === 'interaction' ? 'resolved' as const : phase === 'terminal' || phase === 'replay' ? 'hidden' as const : 'ready' as const, boundsNormalized: { x: 0.5, y: 0.5, width: 0.15, height: 0.15 }, rotationDegrees: 0, visible: phase !== 'terminal' && phase !== 'replay', confidence: 1 },
          { semanticId: 'support-object', role: 'support' as const, lifecycle: 'ready' as const, boundsNormalized: { x: 0.4, y: 0.7, width: 0.35, height: 0.1 }, rotationDegrees: 0, visible: phase !== 'replay', confidence: 1 },
          { semanticId: 'hazard-object', role: 'hazard' as const, lifecycle: phase === 'terminal' || phase === 'replay' ? 'hidden' as const : 'ready' as const, boundsNormalized: { x: 0.66, y: 0.55, width: 0.1, height: 0.2 }, rotationDegrees: 0, visible: phase !== 'terminal' && phase !== 'replay', confidence: 1 },
          { semanticId: 'finish-object', role: 'finish' as const, lifecycle: phase === 'terminal' ? 'resolved' as const : phase === 'replay' ? 'hidden' as const : 'ready' as const, boundsNormalized: { x: 0.86, y: 0.2, width: 0.05, height: 0.6 }, rotationDegrees: 0, visible: phase !== 'replay', confidence: 1 },
          { semanticId: 'replay-control', role: 'replay-control' as const, lifecycle: phase === 'terminal' ? 'ready' as const : phase === 'replay' ? 'resolved' as const : 'hidden' as const, boundsNormalized: { x: 0.4, y: 0.78, width: 0.2, height: 0.1 }, rotationDegrees: 0, visible: phase === 'terminal' || phase === 'replay', confidence: 1 },
        ],
        visibleFeedback: [{ id: `feedback-${phase}`, anchorObjectId: phase === 'interaction' ? 'target-object' : 'player-object', order: 1, event: `${phase} state is player-visible` }],
      }));
      levelReconstruction = ReferenceLevelReconstructionSchema.parse({
        schemaVersion: 1, artifactType: 'reference-level-reconstruction', targetRunId: pack.targetRunId, targetGame: frameManifest.targetGame, workspace: frameManifest.workspace,
        source: { frameManifestPath: 'artifacts/reference-frame-manifest.json', frameManifestSha256, recordingSha256: frameManifest.source.sha256, viewport: { width: frameManifest.source.width, height: frameManifest.source.height } },
        checkpoints,
        spatialRelations: [{ id: 'target-supported', fromObjectId: 'target-object', relation: 'supported-by', toObjectId: 'support-object', checkpointIds: ['reference-ready', 'reference-input'], observed: true }],
        interactionSequence: [{ order: 1, actionId: 'primary-action', kind: 'tap', targetObjectId: 'player-object', fromCheckpointId: 'reference-ready', toCheckpointId: 'reference-interaction', responseClass: 'immediate', expectedStateChange: 'the primary action moves the player object through the target object' }],
        cameraSequence: [{ order: 1, checkpointId: 'reference-ready', mode: 'follow', focusObjectRole: 'player' }, { order: 2, checkpointId: 'reference-terminal', mode: 'follow', focusObjectRole: 'player' }],
        terminal: { checkpointId: 'reference-terminal', result: 'level-complete', causeVisible: true, settlementVisible: true },
        replay: { checkpointId: 'reference-replay', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'reference-ready' },
        observations: ['Synthetic mock reconstruction is for orchestration tests only.'], inferences: [], unknowns: [], status: 'READY', blockers: [], analyzedAt: new Date().toISOString(),
      });
    }
    return { value: {
      schemaVersion: 1,
      targetRunId: pack.targetRunId,
      behaviorChecks: cases.map(([dimension, objectType, stateBranch, playerInput, expectedStateChange, anchor, eventOrder]) => ({
        id: `reference-${dimension}`,
        dimension,
        sourceRefs: [{ path: source.path, sha256: source.sha256, locator: source.observations[0] ?? 'bound source' }],
        objectType,
        stateBranch,
        playerInput,
        expectedStateChange,
        spatialRelationship: 'Preserve the observed causal attachment/support/reachability relationship using original layout values.',
        visibleFeedback: { anchor, eventOrder: [...eventOrder] },
        viewport: { width: 390, height: 844 },
      })),
      observations: ['Mock analyzer produced source-bound cases for the five required behavior dimensions.'],
      inferences: [], unknowns: [], failurePressureContract, levelReconstruction, status: 'READY',
    }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateCompetitorResearch(seed: Seed): Promise<AgentProviderResult> {
    const retrievedAt = new Date(0).toISOString();
    const sourceRecords = ['compact-shop', 'collection-idle', 'story-market'].map((sourceId, index) => ({
      sourceId,
      kind: 'store_listing' as const,
      locator: `https://reference.example/${sourceId}`,
      title: `${sourceId} benchmark listing`,
      retrievedAt,
      contentHash: sha256Text(`${seed.theme}:${sourceId}:${index}`),
      notes: ['structured metadata only'],
    }));
    const failurePressureContract = {
      schemaVersion: 1 as const,
      purpose: 'Record generic service-loop pressure without copying any competitor expression or tuning.',
      evidence: sourceRecords.map((source) => ({
        id: `pressure-${source.sourceId}`,
        competitor: source.sourceId,
        sourceRefs: [source.sourceId],
        observed: ['A short repeatable service loop creates a visible next task.'],
        inferred: ['An unmet service step can increase perceived pressure.'],
        applicability: 'adapt' as const,
        applicabilityRationale: 'Adapt the causal pressure relationship using original content and values.',
        rejectExpression: ['names', 'assets', 'UI layout', 'text', 'tuning values'],
        confidence: 'low' as const,
      })),
      rules: sourceRecords.map((source, index) => ({
        id: `pressure-rule-${index + 1}`,
        pressureType: 'timing' as const,
        trigger: 'A customer request remains unresolved while the service loop continues.',
        playerSignal: 'Show the requested product and queue state next to the active customer.',
        escalation: 'Keep additional requests visible so the player can choose a recovery action.',
        failureOutcome: 'The request times out or leaves without rewarding the player.',
        attribution: 'The unresolved request and its missing product remain visible at the time of failure.',
        recovery: 'Restock or change route, then serve the next request without a full reset.',
        sourceEvidenceRefs: [`pressure-${source.sourceId}`],
        implementationImplications: ['Keep pressure local to the customer and stock state.', 'Do not use hidden timers as the only signal.'],
      })),
      noCopyBoundary: ['Do not copy competitor names, characters, assets, map layout, UI shapes, text, fonts, audio or numeric tuning.'],
    };
    return { value: { schemaVersion: 1, observations: ['Each benchmark exposes a short repeatable service loop.'], inferences: ['Optional rewarded ads may fit a short session when they do not interrupt the core action.'], unknowns: ['Exact retention and ad yield require live measurement.'], sourceRecords, market: `${seed.theme} casual idle-shop games`, competitors: [
      { name: 'Compact Shop Reference', positioning: 'short-session service loop', coreLoop: ['serve customers', 'upgrade station'], monetization: ['optional rewarded ads'], strengths: ['clear goals'], weaknesses: ['limited variety'] },
      { name: 'Collection Idle Reference', positioning: 'collection-led idle progression', coreLoop: ['collect products', 'expand catalog'], monetization: ['rewarded ads', 'interstitial ads'], strengths: ['long-term goals'], weaknesses: ['slow onboarding'] },
      { name: 'Story Market Reference', positioning: 'narrative market simulation', coreLoop: ['serve visitors', 'unlock stories'], monetization: ['optional rewarded ads'], strengths: ['memorable theme'], weaknesses: ['high content cost'] },
    ], opportunities: ['three-minute sessions', `original ${seed.theme} presentation`], risks: ['crowded casual category'], differentiationThesis: `${seed.theme} content combined with deterministic three-minute shop sessions.`, failurePressureContract }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateOpenSourceResearch(seed: Seed): Promise<AgentProviderResult> {
    return { value: {
      schemaVersion: 1,
      targetPlatforms: seed.targetPlatforms,
      queries: ['portable canvas mini game adapter', 'wechat douyin minigame adapter', 'taptap minigame adapter'],
      candidates: [],
      outcome: 'NO_SUITABLE_CANDIDATE',
      selectedCandidateIds: [],
      rationale: 'Deterministic mock research found no candidate with verified license evidence and support for all three target platforms.',
      researchedAt: new Date().toISOString(),
    }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateIdeas(seed: Seed, _research: unknown, batch: number): Promise<AgentProviderResult> {
    const concepts = [
      ['双线分流', '根据顾客特征将其导向左右摊位', '选择稳定清队或追求连击', '队列爆满会结束本局'],
      ['火候押注', '在温度窗口内决定收锅或继续加热', '选择安全收益或冒险翻倍', '连续烧焦会失败'],
      ['符牌记忆', '根据短暂出现的符号选择对应摊位', '选择立即提交或等待更多线索', '错误会累积惊吓值'],
      ['灯笼换位', '每次移动一盏灯笼改变路线', '选择保护当前顾客或为下一位留路', '黑雾逼近会封锁路线'],
      ['香气拼配', '将两种香气中的一种推向顾客', '选择立即满足或留作组合', '香气槽满时无法新增'],
      ['影子估价', '在两个报价中选择一个接单', '选择低风险快单或高风险长单', '超时订单会占用有限栏位'],
    ];
    return { value: { schemaVersion: 1, batch, theme: seed.theme, ideas: concepts.map(([name, coreAction, decision, pressure], index) => ({ id: `idea_${batch}_${index + 1}`, name: `${name}·${batch}`, coreAction, decisionIntervalSeconds: 10 + index * 2, decision, choiceDrivers: ['当前状态', '随机特征'], pressure, firstDelight: '首次正确预判触发清晰的连锁反馈', secondRunVariation: '随机顺序、特征与奖励窗口改变', growthMechanic: '局间可选的单个规则修饰器', randomVariation: '带种子的特征序列', majorSystems: ['核心操作', '压力队列'], realDecision: true })) }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateLowCostFilter(ideas: IdeaGeneration): Promise<AgentProviderResult> {
    const selectedIdeaIds = ideas.ideas.slice(0, 3).map(({ id }) => id);
    return { value: { schemaVersion: 1, batch: ideas.batch, selectedIdeaIds, evaluations: ideas.ideas.map((idea, index) => ({ ideaId: idea.id, hasOneCoreAction: true, hasRealDecision: true, majorSystemCount: idea.majorSystems.length, prototypeMinutes: 30 + index * 5, verdict: index < 3 ? 'SELECT' : 'REJECT', rationale: index < 3 ? '单操作、单决策且可用占位符验证。' : '与前三名相比验证成本或理解成本更高。' })) }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generatePrototypeSelection(ideas: IdeaGeneration, filter: LowCostFilter): Promise<AgentProviderResult> {
    return { value: { schemaVersion: 1, batch: ideas.batch, decision: 'BUILD_3', selectedIdeaIds: filter.selectedIdeaIds, rationale: '这三个方案值得做极简玩法原型，不代表获准完整制作。', constraints: ['30-60 minutes', 'placeholder art', 'no IAA', 'at most two major systems'] }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateWinnerSelection(tournament: PlaytestTournament): Promise<AgentProviderResult> {
    const comparison = tournament.comparisons[0]; if (!comparison) throw new Error('Tournament requires three comparisons');
    return { value: { schemaVersion: 1, batch: tournament.batch, decision: 'WINNER_A', selectedIdeaId: comparison.ideaId, rationale: 'Prototype A creates the clearest repeated decision, pressure, variation and retry signal.' }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateProductionCostReview(): Promise<AgentProviderResult> {
    return { value: { schemaVersion: 1, costBand: 'low', prototypeDays: 2, productionWeeks: 2, teamSize: 1, assetEstimate: { characters: 4, environments: 1, ui: 8, audio: 6 }, technicalRisks: ['save recovery across refresh'], scopeCuts: ['one shop and one upgrade path'], recommendation: 'proceed', rationale: 'The concept fits the existing web-lite idle-shop template and a compact asset budget.' }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateIaaMonetizationReview(_seed?: Seed, _gameplayContext?: unknown, _context?: AgentExecutionContext): Promise<AgentProviderResult> {
    void _seed; void _context;
    const referenceMode = typeof _gameplayContext === 'object' && _gameplayContext !== null && 'lockedBy' in _gameplayContext;
    return { value: { schemaVersion: 1, audienceFit: 'broad casual audience', sessionFit: 'medium', placements: [{ format: 'rewarded', trigger: referenceMode ? 'optional active-action boost' : 'optional production boost', playerValue: 'shorter wait', frequencyCap: 'at most once per three-minute session' }], retentionRisk: 'low', revenuePotential: 'medium', complianceRisks: ['age-appropriate consent flow'], recommendation: 'test_cautiously', rationale: referenceMode ? 'A single optional reward can fit the locked action loop without changing its mechanics.' : 'A single optional rewarded placement supports IAA testing without interrupting the core order loop.' }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateGreenlightDecision(): Promise<AgentProviderResult> {
    return { value: { schemaVersion: 1, decision: 'GO', overallScore: 80, scores: { differentiation: 78, productionFeasibility: 90, iaaFit: 72, strategicFit: 80 }, reasons: ['Distinct theme, feasible scope, and a non-interruptive IAA experiment fit the factory constraints.'], blockers: [], requiredChanges: ['Keep rewarded ads optional and frequency-capped.'] }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateBlueprint(seed: Seed, _context?: AgentExecutionContext, gameplay?: GameplayIdea | ReferenceMechanicSpec) {
    const reference = gameplay && 'lockedBy' in gameplay ? gameplay : undefined;
    const idea = gameplay && 'name' in gameplay ? gameplay : undefined;
    return { value: { schemaVersion: 1, gameId: _context?.targetGameId ?? seed.title.toLowerCase().replace(/\s+/g, '-'), ...(seed.identity?.canonicalGameId ? { canonicalGameId: seed.identity.canonicalGameId } : {}), ...(seed.identity?.variantId ? { variantId: seed.identity.variantId } : {}), title: seed.title, theme: seed.theme, runtime: seed.runtime, template: seed.template, designMode: seed.designMode, referenceMechanics: reference, spatialShop: seed.spatialShop, targetPlatforms: seed.targetPlatforms, concept: reference ? `${seed.theme}题材下对人类已锁定机制关系的原创表现实现` : idea ? `${seed.theme}下的${idea.name}` : `${seed.theme}主题的轻量点击经营游戏`, coreLoop: reference?.coreLoop ?? ['顾客出现', '玩家做选择', '压力状态变化', '获得即时反馈', '进入下一轮'], content: { productName: '焕新计划', customerName: '都市访客', currencyName: '闪耀值' }, balance: { startingCurrency: 0, orderReward: 5, baseUpgradeCost: 10 }, preferences: seed.preferences }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateArtDirections(blueprint: GameBlueprint) {
    const specs = [
      ['direction_a', '墨灯剪影', ['ink', 'paper-cut'], ['#151225', '#F6C768', '#D66B5D'], '头身比 1:2 的剪影角色', 'sharp cards', 'layered silhouettes', '灯笼封印'],
      ['direction_b', '雾蓝夜摊', ['soft gouache', 'mist'], ['#172A46', '#78B9B5', '#F4D58D'], '头身比 1:2.5 的柔和角色', 'rounded minimal', 'misty stalls', '月雾小碗'],
      ['direction_c', '霓虹符纸', ['neon', 'graphic'], ['#1A102B', '#EF4E8B', '#53D8FB'], '头身比 1:3 的几何角色', 'bold geometric', 'graphic night market', '霓虹符纸'],
      ['direction_d', '木刻怪谈', ['woodcut', 'limited color'], ['#211A17', '#D99A4E', '#A84632'], '头身比 1:2 的木刻角色', 'seal-like', 'textured woodcut', '木刻钱币'],
    ] as const;
    return { value: { directions: specs.map(([id, name, keywords, palette, characterStyle, uiStyle, environmentStyle, iconConcept]) => ({ id, name, summary: `${name}以独立轮廓、场景层次和 UI 几何形成完整视觉方向`, visualKeywords: [...keywords], palette: [...palette], characterStyle, uiStyle, environmentStyle, iconConcept, forbiddenElements: ['existing franchise likeness', 'third-party logo', 'illegible UI'], productionComplexity: id === 'direction_c' ? 'medium' : 'low', previewPrompt: `Original ${name} key art for ${blueprint.theme}, ${keywords.join(', ')}, no text, no known characters`, previewPath: `previews/${id}.svg` })) }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
  async generateStyleLock(_blueprint: GameBlueprint, directions: ArtDirections, approvalValue: unknown) {
    const approval = approvalValue as ArtApproval; const direction = directions.directions.find((item) => item.id === approval.selected_direction);
    if (!direction) throw new Error('Approved art direction does not exist');
    return { value: { schemaVersion: 1, directionId: direction.id, direction, kept: approval.keep, changes: approval.change, notes: approval.notes, lockedAt: new Date().toISOString() }, metrics: { provider: 'mock', model: 'deterministic', calls: 0 } };
  }
}

export class MockImageProvider implements ImageProvider {
  async producePreviews({ outputDir, directions }: { outputDir: string; directions: ArtDirections }) {
    await mkdir(outputDir, { recursive: true });
    const previews = [];
    for (const direction of directions.directions) {
      const startedAt = new Date().toISOString();
      const bands = direction.palette.map((color, index) => `<rect x="${index * (800 / direction.palette.length)}" width="${800 / direction.palette.length + 1}" height="500" fill="${color}"/>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">${bands}<rect x="180" y="90" width="440" height="320" rx="70" fill="#1119"/><text x="400" y="230" text-anchor="middle" fill="white" font-family="sans-serif" font-size="50">${direction.name}</text></svg>`;
      await writeFile(path.join(outputDir, `${direction.id}.svg`), svg);
      previews.push({ directionId: direction.id, provider: 'mock-svg', model: 'deterministic', prompt: direction.previewPrompt, size: '800x500', quality: 'mock', outputPath: `previews/${direction.id}.svg`, startedAt, finishedAt: new Date().toISOString(), attempts: 1 as const, status: 'generated' as const, error: null });
    }
    return { schemaVersion: 1 as const, provider: 'mock-svg', callCount: 0, previews };
  }

  async produce({ outputDir, blueprint, styleLock }: { outputDir: string; blueprint: GameBlueprint; styleLock: StyleLock }) {
    await mkdir(outputDir, { recursive: true });
    const definitions = deriveAssetDefinitions(blueprint);
    const assets = [];
    for (const [index, [id, kind, purpose]] of definitions.entries()) {
      const color = styleLock.direction.palette[index % styleLock.direction.palette.length] ?? '#F6C768';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="48" fill="${styleLock.direction.palette[0]}"/><circle cx="256" cy="220" r="120" fill="${color}"/><text x="256" y="430" text-anchor="middle" fill="white" font-family="sans-serif" font-size="36">${blueprint.title} · ${id}</text></svg>`;
      const file = path.join(outputDir, `${id}.svg`); await writeFile(file, svg);
      assets.push({ id, kind, path: `assets/${id}.svg`, prompt: `${styleLock.direction.previewPrompt}; ${purpose}`, status: 'generated', generationMethod: 'procedural-placeholder' as const, sourceEvidence: ['mock:deterministic-placeholder'], sha256: sha256Text(svg) });
    }
    return { schemaVersion: 1, assets, provider: 'mock-svg' };
  }
}

export class MockCodexProvider implements CodexProvider {
  async prototype() { return { threadId: `mock-prototype-${Date.now()}`, verificationMode: 'contract' as const, metrics: { provider: 'mock', model: 'mock', calls: 0 } }; }
  async actionPrototype() { return { threadId: `mock-action-prototype-${Date.now()}`, verificationMode: 'contract' as const, metrics: { provider: 'mock', model: 'mock', calls: 0 } }; }
  async formalPrototype() { return { threadId: `mock-formal-prototype-${Date.now()}`, verificationMode: 'full' as const, metrics: { provider: 'mock', model: 'mock', calls: 0 } }; }
  async build() { return { threadId: `mock-thread-${Date.now()}`, verificationMode: 'contract' as const, metrics: { provider: 'mock', model: 'mock', calls: 0 } }; }
  async fix({ threadId }: { threadId?: string }) { return { threadId: threadId ?? `mock-thread-${Date.now()}`, summary: 'Mock repair acknowledged only the reported QA issues.', verificationMode: 'contract' as const, metrics: { provider: 'mock', model: 'mock', calls: 0 } }; }
}
