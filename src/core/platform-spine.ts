import { sha256Text } from './files.js';
import { DistributionPlatformSchema } from '../schemas/factory-operating.js';
import { PlatformSpineContractSchema, type PlatformSpineContract } from '../schemas/platform-spine.js';

const adapterRoots: Record<string, string> = {
  'wechat-minigame': 'src/platform/wechat',
  'douyin-minigame': 'src/platform/douyin',
  'taptap-minigame': 'src/platform/taptap',
  'poki-web': 'src/platform/poki',
  'crazygames-web': 'src/platform/crazygames',
};

export function buildPlatformSpineContract(input: { gameId: string; runtime: 'web-lite' | 'cocos-3d'; targets?: string[]; requiredTargets?: string[]; optionalTargets?: string[] }): PlatformSpineContract {
  const required = [...new Set((input.requiredTargets ?? input.targets ?? []).map((target) => DistributionPlatformSchema.parse(target)))];
  const optional = [...new Set((input.optionalTargets ?? []).map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !required.includes(target));
  const targets = [...required, ...optional];
  if (targets.length === 0) throw new Error('at least one platform target is required');
  const adapters = targets.map((platform) => ({
    platform,
    required: required.includes(platform),
    adapterPath: adapterRoots[platform] ?? `src/platform/${platform}`,
    configPath: `platform-config/${platform}.json`,
    buildPath: `platform-builds/${platform}`,
    packageEntrypoint: `platform-builds/${platform}/game.json`,
    status: 'planned' as const,
    evidence: [],
    artifactHash: null,
  }));
  return PlatformSpineContractSchema.parse({
    schemaVersion: 1,
    contractId: sha256Text(`${input.gameId}:${input.runtime}:${targets.join(',')}`).slice(0, 16),
    gameId: input.gameId,
    runtime: input.runtime,
    targetPlatforms: targets,
    requiredPlatforms: required,
    optionalPlatforms: optional,
    sharedInterfaces: {
      lifecycle: { launch: true, hideShow: true, errorBoundary: true },
      input: { normalizedActions: true, touchSafeArea: true, pointerFallback: true },
      ads: { rewarded: true, rewardCloseRequiresEnded: true, frequencyCapRequired: true, testUnitsExcludedFromRelease: true },
      save: { versioned: true, atomic: true, restoreOnResume: true },
      audio: { gestureUnlock: true, muteControl: true },
      antiAddiction: { consentGate: true, ageGuard: true, pauseOnLimit: true },
      telemetry: { versionedEvents: true, noPii: true, crashBreadcrumbs: true },
    },
    invariants: [
      'rewarded-ad-grant-only-when-isEnded-true',
      'platform-child-hash-must-match-tested-package',
      'no-production-test-ad-units',
      'platform-adapter-never-writes-another-child',
      'release-package-is-promoted-without-rebuilding-core',
    ],
    adapters,
    packageBudget: { coreMaxBytes: 4_000_000, perPlatformMaxBytes: 8_000_000, measured: false },
    generatedAt: new Date().toISOString(),
  });
}

export function evaluatePlatformSpine(contractValue: PlatformSpineContract, evidence: Record<string, { artifactHash: string; evidence: string[] }>) {
  const contract = PlatformSpineContractSchema.parse(contractValue);
  const blockers: string[] = [];
  const required = new Set(contract.requiredPlatforms ?? contract.adapters.filter((adapter) => adapter.required).map((adapter) => adapter.platform));
  const adapters = contract.adapters.map((adapter) => {
    const result = evidence[adapter.platform];
    const valid = Boolean(result?.evidence?.length) && /^[a-f0-9]{64}$/iu.test(result?.artifactHash ?? '');
    if (!valid && required.has(adapter.platform)) blockers.push(adapter.platform);
    return { ...adapter, status: valid ? 'verified' as const : 'blocked' as const, evidence: result?.evidence ?? ['platform-spine:evidence-missing'], artifactHash: valid ? result!.artifactHash : null };
  });
  const normalized = PlatformSpineContractSchema.parse({ ...contract, adapters });
  return { passed: blockers.length === 0, blockers, contract: normalized };
}
