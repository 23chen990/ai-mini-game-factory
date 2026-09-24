import { describe, expect, it } from 'vitest';
import { evaluateCompletionGates } from '../../src/core/completion-gates.js';
import { evaluateFactoryConstitution, FACTORY_CONSTITUTION } from '../../src/core/factory-constitution.js';
import { buildEvidenceClaimSet } from '../../src/core/evidence-claims.js';
import { getDownstreamStages } from '../../src/core/downstream-stages.js';
import { migrateArtifact, assertCurrentArtifactVersion } from '../../src/core/schema-migrations.js';
import { executionPolicyForStage, getModelPolicy, validateModelRoute } from '../../src/core/model-policy.js';
import { ProfileExperienceContractSchema } from '../../src/schemas/experience-profile.js';
import { evaluateOperatingGates } from '../../src/core/operating-gates.js';
import { buildBusinessPreflightTemplate } from '../../src/core/operating-gates.js';
import { buildPlatformReleaseMatrix } from '../../src/core/factory-operating.js';
import { buildUnknownRegister } from '../../src/core/unknowns.js';
import { evaluateQualityGateMatrix } from '../../src/core/quality-gates.js';

const hash = 'a'.repeat(64);
const budget = {
  currency: 'CNY' as const,
  maxTotalCents: 30_000,
  maxPaidTrafficCents: 10_000,
  maxAgentTokens: 500_000,
  maxHumanMinutes: 360,
  maxFixAttempts: 2,
  paybackWindowDays: 30,
};

function allGates() {
  return evaluateCompletionGates({
    core: { passed: true, evidence: ['core'] },
    normalFlow: { passed: true, evidence: ['flow'] },
    visualEvidence: { passed: true, evidence: ['visual'] },
    levelDifference: { passed: true, evidence: ['variation'] },
    humanPlaytest: { passed: true, evidence: ['human'] },
  });
}

describe('factory control plane v4', () => {
  it('exposes a single constitution with the five completion gates and immutable quality rules', () => {
    expect(FACTORY_CONSTITUTION.requiredCompletionGates).toEqual(['core', 'normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest']);
    expect(FACTORY_CONSTITUTION.rules).toContain('UNKNOWN_ZERO_AT_RELEASE');
    expect(FACTORY_CONSTITUTION.rules).toContain('NO_SELF_ACCEPTANCE');
  });

  it('blocks release when a dependency is invalidated or a blocking unknown remains', () => {
    const result = evaluateFactoryConstitution({
      completion: allGates(),
      unknowns: buildUnknownRegister({ runId: 'run-1', items: [{ id: 'license', class: 'license', description: 'missing license', blocking: true, owner: 'ResearchAgent', dueStage: 'OPEN_SOURCE_RESEARCH' }] }),
      ledger: {
        schemaVersion: 1,
        entries: [{ path: 'artifacts/build-report.json', sha256: hash, producerStage: 'FULL_BUILD', inputHashes: {}, status: 'INVALIDATED', invalidatedBy: ['artifacts/game-blueprint.json'], recordedAt: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      },
      selfAcceptance: { builder: true, fixer: false, producer: false },
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['unknowns', 'artifact-ledger', 'self-acceptance']));
  });

  it('accepts a fully evidenced release only when optional required gates are supplied', () => {
    const result = evaluateFactoryConstitution({
      completion: allGates(),
      unknowns: buildUnknownRegister({ runId: 'run-1', items: [] }),
      ledger: { schemaVersion: 1, entries: [], updatedAt: new Date().toISOString() },
      platformPackages: { schemaVersion: 1, gameId: 'g', coreHash: hash, requiredPlatforms: ['wechat-minigame'], packages: [{ platform: 'wechat-minigame', status: 'READY', adapterPath: 'src/platform/wechat', configPath: 'platform-config/wechat.json', packagePath: 'platform-builds/wechat-minigame', buildTool: 'test', artifactHash: hash, coreHash: hash, device: { name: 'phone', width: 390, height: 844, os: 'test' }, evidence: ['device smoke'], blockers: [], generatedAt: new Date().toISOString() }], generatedAt: new Date().toISOString() },
      requirePlatformPackages: true,
      selfAcceptance: { builder: false, fixer: false, producer: false },
    });
    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('treats the seven-dimension quality matrix as a hard constitution input when enabled', () => {
    const blocked = evaluateFactoryConstitution({ completion: allGates(), requireQualityMatrix: true });
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers).toContain('quality-matrix');
    const matrix = evaluateQualityGateMatrix({
      candidateHash: hash,
      gates: Object.fromEntries(['functionality', 'coreExperience', 'contentDifficulty', 'visualUx', 'performanceCompatibility', 'productIntegrity', 'releaseEngineering'].map((id) => [id, { status: 'PASS' as const, evidence: [`evidence:${id}`] }])),
    });
    const passed = evaluateFactoryConstitution({ completion: allGates(), requireQualityMatrix: true, qualityMatrix: matrix });
    expect(passed.blockers).not.toContain('quality-matrix');
  });

  it('keeps stage-specific downstream invalidation deterministic', () => {
    expect(getDownstreamStages('BUSINESS_PREFLIGHT')).toEqual(expect.arrayContaining(['PRODUCTION_LINE_REVIEW', 'FULL_BUILD', 'RELEASE_CANDIDATE', 'RELEASE', 'COMPLETED']));
    expect(getDownstreamStages('QA')).toEqual(expect.arrayContaining(['FINAL_PROFILE_QA', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED']));
    expect(getDownstreamStages('FULL_BUILD')).toContain('FINAL_PROFILE_QA');
  });

  it('carries source hashes into observed and inferred research claims', () => {
    const claims = buildEvidenceClaimSet({ source: 'https://example.com', sourceHashes: [hash], observations: ['observed'], inferences: ['inferred'], unknowns: [] });
    expect(claims.claims[0]?.sourceHashes).toEqual([hash]);
    expect(claims.claims[1]?.sourceHashes).toEqual([hash]);
  });

  it('supports explicit, bounded artifact schema migrations and rejects stale versions', () => {
    const migrated = migrateArtifact({ schemaVersion: 1, value: 'ok' }, { artifact: 'example', currentVersion: 2, migrations: { 1: (value) => ({ ...(value as object), schemaVersion: 2, migrated: true }) } });
    expect(migrated).toMatchObject({ schemaVersion: 2, migrated: true });
    expect(() => assertCurrentArtifactVersion(migrated, 2, 'example')).not.toThrow();
    expect(() => assertCurrentArtifactVersion({ schemaVersion: 1 }, 2, 'example')).toThrow(/version/i);
  });

  it('keeps social and exploration profiles explicit instead of silently using an idle contract', () => {
    expect(ProfileExperienceContractSchema.parse({ schemaVersion: 1, profile: 'SOCIAL_EMOTION', relationshipPillars: ['trust', 'reciprocity', 'boundaries'], consequenceRules: ['choice changes relationship state', 'cooldown prevents spam', 'privacy boundary remains visible'], pacingRules: ['one social beat per short session', 'response is immediate', 'replay changes relationship'], acceptanceIds: ['SOC-001', 'SOC-002', 'SOC-003'] }).profile).toBe('SOCIAL_EMOTION');
    expect(ProfileExperienceContractSchema.parse({ schemaVersion: 1, profile: 'EXPLORATION_DISCOVERY', discoveryPillars: ['landmark', 'curiosity', 'return path'], traversalRules: ['route is readable', 'risk is telegraphed', 'backtracking has purpose'], pacingRules: ['discovery every short beat', 'rest follows risk', 'new route is previewed'], acceptanceIds: ['EXP-001', 'EXP-002', 'EXP-003'] }).profile).toBe('EXPLORATION_DISCOVERY');
  });

  it('rejects model routes that try to grant a read-only stage workspace mutation', () => {
    expect(() => validateModelRoute('UI_SKELETON', { tier: 'builder', role: 'builder', sandbox: 'workspace-write' })).toThrow(/route|permission|sandbox/i);
    expect(executionPolicyForStage('UI_SKELETON').sandbox).toBe('read-only');
    expect(Object.keys(getModelPolicy())).toContain('CONTENT_EXPANSION');
  });

  it('keeps the aggregate operating gate compatible while accepting constitution evidence', () => {
    const business = buildBusinessPreflightTemplate({ targets: ['wechat-minigame'], budget });
    const platform = buildPlatformReleaseMatrix({ gameId: 'g', coreHash: hash, primaryPlatform: 'wechat-minigame', targets: ['wechat-minigame'] });
    const result = evaluateOperatingGates({ completion: allGates(), qaEvidence: [], business, platform, constitution: { passed: false, blockers: ['unknowns'] } });
    expect(result.blockers).toContain('constitution:unknowns');
  });

  it('fails closed with a report when transition history contains malformed data', () => {
    expect(() => evaluateFactoryConstitution({
      completion: allGates(),
      requireStateTransitions: true,
      stateTransitions: [{ from: 'QA', to: 'RELEASE', reason: 42, at: 'not-a-date' }],
    })).not.toThrow();
    const result = evaluateFactoryConstitution({
      completion: allGates(),
      requireStateTransitions: true,
      stateTransitions: [{ from: 'QA', to: 'RELEASE', reason: 42, at: 'not-a-date' }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('state-transitions');
  });
});
