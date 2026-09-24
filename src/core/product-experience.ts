import type { ReferenceBehaviorCheck } from '../schemas/reference-fidelity.js';
import { ProductExperienceContractSchema, type ProductExperienceContract, type ProductExperienceViewport } from '../schemas/product-experience.js';

type ExperiencePillar = { id: string; name: string; observable: string };

type ProductExperienceBuildInput = {
  targetGame: string;
  targetRunId: string;
  targetWorkspace: string;
  runtime: 'web-lite' | 'cocos-3d';
  sourceArtifact: { kind: 'experience-contract' | 'reference-fidelity'; path: string; sha256: string };
  deviceBaselines: ProductExperienceViewport[];
  experiencePillars?: ExperiencePillar[];
  referenceBehaviorChecks?: ReferenceBehaviorCheck[];
};

function uniqueViewports(viewports: ProductExperienceViewport[]): ProductExperienceViewport[] {
  const seen = new Set<string>();
  return viewports.filter((viewport) => {
    const key = `${viewport.width}x${viewport.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runtimeEntrypoints(runtime: ProductExperienceBuildInput['runtime']) {
  return runtime === 'cocos-3d' ? ['assets/scripts/GameBootstrap.ts', 'assets/scenes/main.scene'] : ['src/main.ts'];
}

/** Build one canonical contract for both Builder handoff and independent QA. */
export function buildProductExperienceContract(input: ProductExperienceBuildInput): ProductExperienceContract {
  const baselines = uniqueViewports(input.deviceBaselines);
  if (baselines.length === 0) throw new Error('product experience requires at least one device baseline');
  const referenceChecks = input.referenceBehaviorChecks ?? [];
  const pillars = input.experiencePillars ?? [];
  if (input.sourceArtifact.kind === 'reference-fidelity' && referenceChecks.length === 0) {
    throw new Error('reference-fidelity product experience requires behavior checks');
  }
  if (input.sourceArtifact.kind === 'experience-contract' && pillars.length === 0) {
    throw new Error('generic product experience requires experience pillars');
  }

  const features = input.sourceArtifact.kind === 'reference-fidelity'
    ? referenceChecks.map((check) => ({
      id: check.id,
      sourceCheckIds: [check.id],
      objectType: check.objectType,
      stateBranch: check.stateBranch,
      playerAction: check.playerInput,
      visibleSignal: `${check.visibleFeedback.anchor}: ${check.visibleFeedback.eventOrder.join(' → ')}`,
      naturalTrigger: check.playerInput,
      expectedEventOrder: check.visibleFeedback.eventOrder,
      requiredViewports: uniqueViewports([
        ...baselines,
        { width: check.viewport.width, height: check.viewport.height, label: `reference-${check.viewport.width}x${check.viewport.height}` },
      ]),
      negativeAssertions: [
        `the visible signal remains anchored to ${check.visibleFeedback.anchor}`,
        'a sibling object or lifecycle branch cannot satisfy this check',
        'debug, fixture and state-injection operations cannot trigger or prove this check',
      ],
      sourceEvidence: check.sourceRefs.map((source) => `${source.path}#${source.locator}@${source.sha256}`),
      blockingIf: [
        'the exact object and lifecycle branch are not observed',
        'the declared event order is missing or reordered',
        'any required phone viewport lacks player-visible natural-input evidence',
      ],
    }))
    : pillars.map((pillar) => ({
      id: pillar.id,
      sourceCheckIds: [pillar.id],
      objectType: pillar.name,
      stateBranch: `default-journey:${pillar.id}`,
      playerAction: `perform the primary action for ${pillar.name}`,
      visibleSignal: pillar.observable,
      naturalTrigger: `reach ${pillar.name} from a clean reset using normal player input`,
      expectedEventOrder: [`player performs ${pillar.name} action`, pillar.observable],
      requiredViewports: baselines,
      negativeAssertions: [
        'state fields, unit tests and debug controls alone are not player-visible proof',
        'unrelated text changes or sibling branches cannot satisfy this feature',
        'the primary action and its consequence remain readable without helper text',
      ],
      sourceEvidence: [`${input.sourceArtifact.path}@${input.sourceArtifact.sha256}`, `experience-pillar:${pillar.id}`],
      blockingIf: [
        'the feature is wired only in state or tests',
        'the signal is hidden, occluded, detached or unreadable',
        'the trigger requires a debug or state-forcing API',
      ],
    }));

  return ProductExperienceContractSchema.parse({
    schemaVersion: 2,
    artifactType: 'product-experience-contract',
    targetGame: input.targetGame,
    targetRunId: input.targetRunId,
    targetWorkspace: input.targetWorkspace,
    runtime: input.runtime,
    runtimeEntrypoints: runtimeEntrypoints(input.runtime),
    sourceArtifact: input.sourceArtifact,
    features,
  });
}
