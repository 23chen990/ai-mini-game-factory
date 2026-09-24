import { isIP } from 'node:net';
import { executionPolicyForStage } from './model-policy.js';
import { PermissionManifestBundleSchema, PermissionManifestSchema, type PermissionManifest, type PermissionManifestBundle } from '../schemas/permission-manifest.js';
import { StageNameSchema, type StageName } from '../schemas/index.js';
import { getStageContract } from './stage-contracts.js';

function scopeForStage(stage: StageName): PermissionManifest['allowedWriteScope'] {
  const scope = getStageContract(stage).mutationScope;
  const mapping: Record<typeof scope, PermissionManifest['allowedWriteScope']> = {
    none: 'none',
    'research-artifacts-only': 'research-artifacts',
    'design-artifacts-only': 'design-artifacts',
    'game-workspace': 'game-workspace',
    'qa-artifacts-only': 'qa-artifacts',
    'release-artifacts-only': 'release-artifacts',
    'run-metadata': 'run-metadata',
  };
  return mapping[scope];
}

function normalizeHost(value: string): string | undefined {
  const raw = value.trim().toLowerCase().replace(/\.+$/u, '');
  if (!raw || raw.includes('/') || raw.includes('@') || raw.includes('*') || raw.includes(':')) return undefined;
  if (raw === 'localhost' || raw.endsWith('.localhost') || isIP(raw) !== 0) return undefined;
  // DNS labels are intentionally conservative. This also rejects whitespace,
  // control characters and strings that merely look like a URL.
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(raw)) return undefined;
  return raw;
}

function researchHostsFromEnvironment(): string[] {
  const configured = process.env.FACTORY_RESEARCH_ALLOWED_HOSTS ?? '';
  return [...new Set(configured.split(/[\s,]+/u).map(normalizeHost).filter((host): host is string => Boolean(host)))];
}

export type PermissionManifestOptions = { researchAllowedHosts?: readonly string[] };

export type PermissionManifestBundleOptions = PermissionManifestOptions & {
  /** Stages that must be present in the closed-world inventory. */
  requiredStages?: readonly StageName[];
  requireResearchAllowlist?: boolean;
};

export function buildPermissionManifest(stageValue: StageName, options: PermissionManifestOptions = {}): PermissionManifest {
  const stage = StageNameSchema.parse(stageValue); const policy = executionPolicyForStage(stage);
  const network = policy.role === 'research' ? 'browser-read-only' as const : 'none' as const;
  const networkAllowlist = policy.role === 'research'
    ? [...new Set((options.researchAllowedHosts ?? researchHostsFromEnvironment()).map(normalizeHost).filter((host): host is string => Boolean(host)))]
    : [];
  const allowedWriteScope = scopeForStage(stage);
  const readScope = policy.role === 'builder' || policy.role === 'fixer'
    ? ['input/', 'artifacts/', 'human/', 'workspace/game/', 'templates/', ...(stage === 'BUILD_ACTION_PROTOTYPES' ? ['runs/'] : [])]
    : policy.role === 'release'
      ? ['input/', 'artifacts/', 'human/', 'release-candidate/', 'workspace/game/dist/']
      : policy.role === 'research'
        ? ['input/', 'artifacts/', 'human/', 'reference-evidence/']
      // Research and all metadata/QA roles may inspect only run evidence and
      // approvals.  They never receive workspace source or arbitrary files.
      : ['input/', 'artifacts/', 'human/'];
  // Commands are deliberately descriptive allow-list entries. Providers may
  // still choose not to expose a shell; this manifest is the auditable upper
  // bound and never grants a wildcard command.
  const allowedCommands = policy.role === 'builder' || policy.role === 'fixer'
    ? ['pnpm test', 'pnpm typecheck', 'pnpm build']
    : policy.role === 'evidence-helper' || policy.role === 'reviewer'
      ? ['pnpm test']
      : [];
  return PermissionManifestSchema.parse({ schemaVersion: 1, stage, role: policy.role, sandbox: policy.sandbox, network, canReadSecrets: false, canWriteGame: policy.canModifyWorkspace, canPublish: false, allowedWriteScope, readScope, allowedCommands, networkAllowlist, dependencyPolicy: { lockfileRequired: true, installAllowed: false, lifecycleScripts: 'deny', registries: [] }, deniedCapabilities: ['shell-arbitrary', 'secrets', 'production-publish', 'external-upload', 'cross-run-write'], generatedAt: new Date().toISOString() });
}

/** Build a deterministic run-level inventory.  The default covers the full
 * stage vocabulary, including governance and terminal stages, so adding a new
 * stage cannot silently create an unpermissioned provider call. */
export function buildPermissionManifestBundle(stages: readonly StageName[] = StageNameSchema.options, options: PermissionManifestOptions = {}): PermissionManifestBundle {
  const normalized = [...new Set(stages.map((stage) => StageNameSchema.parse(stage)))];
  return PermissionManifestBundleSchema.parse({ schemaVersion: 1, manifests: normalized.map((stage) => buildPermissionManifest(stage, options)) });
}

export function evaluatePermissionManifest(value: unknown, options: { requireResearchAllowlist?: boolean } = {}) {
  const parsed = PermissionManifestSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'], manifest: value };
  const manifest = parsed.data;
  const blockers: string[] = [];
  if (manifest.canReadSecrets) blockers.push('secret-read-enabled');
  if (manifest.canPublish) blockers.push('publish-enabled');
  if (manifest.role === 'research' && (manifest.sandbox !== 'read-only' || manifest.canWriteGame || manifest.network !== 'browser-read-only')) blockers.push('research-isolation-violated');
  if (manifest.role !== 'research' && manifest.network !== 'none') blockers.push('non-research-network-enabled');
  if (manifest.role === 'research' && options.requireResearchAllowlist === true && manifest.networkAllowlist.length === 0) blockers.push('research-network-allow-list-missing');
  if (manifest.networkAllowlist.some((host) => normalizeHost(host) !== host.toLowerCase().replace(/\.+$/u, ''))) blockers.push('network-allowlist-invalid');
  if ((manifest.role === 'builder' || manifest.role === 'fixer') && manifest.network !== 'none') blockers.push('builder-network-enabled');
  if (manifest.readScope.some((scope) => scope === '*' || scope.includes('..'))) blockers.push('read-scope-too-broad');
  if (manifest.allowedCommands.some((command) => command === '*' || /(?:rm\s+-rf|curl\s|wget\s|sudo\s|>|;|&&)/iu.test(command))) blockers.push('unsafe-command-allow-list');
  if (manifest.dependencyPolicy.lifecycleScripts !== 'deny' && manifest.dependencyPolicy.lifecycleScripts !== 'approved-only') blockers.push('dependency-script-policy-invalid');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], manifest };
}

/** Validate the run-level inventory before selecting a stage.  This is kept
 * separate from the per-stage evaluator so callers can distinguish a missing
 * manifest entry from a malformed capability declaration and route both to a
 * safe human-visible gate. */
export function evaluatePermissionManifestBundle(value: unknown, options: PermissionManifestBundleOptions = {}) {
  const parsed = PermissionManifestBundleSchema.safeParse(value);
  if (!parsed.success) {
    const rawManifests = value && typeof value === 'object' && Array.isArray((value as { manifests?: unknown }).manifests)
      ? (value as { manifests: unknown[] }).manifests
      : [];
    const rawStages = rawManifests
      .filter((item): item is { stage: unknown } => item !== null && typeof item === 'object' && 'stage' in item)
      .map((item) => typeof item.stage === 'string' ? item.stage : undefined)
      .filter((stage): stage is string => Boolean(stage));
    const duplicateBlockers = [...new Set(rawStages.filter((stage, index) => rawStages.indexOf(stage) !== index))]
      .map((stage) => `duplicate-stage:${stage}`);
    return { passed: false, blockers: ['schema-invalid', ...duplicateBlockers], manifests: rawManifests };
  }
  const blockers: string[] = [];
  const requiredStages = options.requiredStages ?? [];
  const byStage = new Map(parsed.data.manifests.map((manifest) => [manifest.stage, manifest]));
  for (const stageValue of requiredStages) {
    const stage = StageNameSchema.parse(stageValue);
    if (!byStage.has(stage)) blockers.push(`missing-stage:${stage}`);
  }
  for (const manifest of parsed.data.manifests) {
    const result = evaluatePermissionManifest(manifest, { requireResearchAllowlist: options.requireResearchAllowlist === true });
    if (!result.passed) blockers.push(...result.blockers.map((blocker) => `${manifest.stage}:${blocker}`));
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], manifests: parsed.data.manifests };
}

type PermissionOperation =
  | { kind: 'read'; path: string }
  | { kind: 'write'; path: string }
  | { kind: 'command'; command: string }
  | { kind: 'network'; host: string };

function pathAllowed(pathValue: string, scopes: string[]) {
  const normalized = pathValue.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return false;
  return scopes.some((scope) => {
    // Action-feel experiments may read one explicitly named prototype from a
    // prior run in order to make an isolated copy. Keep that cross-run read
    // narrowly scoped; arbitrary run artifacts/source are never exposed.
    if (scope === 'runs/') return /^runs\/[^/]+\/workspace\/prototype-[a-c](?:\/|$)/u.test(normalized);
    return normalized === scope.replace(/\/$/u, '') || normalized.startsWith(scope);
  });
}

/** Fail-closed operation check used by adapters before touching untrusted IO. */
export function assertPermissionOperation(value: PermissionManifest, operation: PermissionOperation): true {
  const manifest = PermissionManifestSchema.parse(value);
  const evaluation = evaluatePermissionManifest(manifest, { requireResearchAllowlist: operation.kind === 'network' });
  if (!evaluation.passed) throw new Error(`permission manifest is invalid: ${evaluation.blockers.join(', ')}`);
  if (operation.kind === 'read') {
    if (!pathAllowed(operation.path, manifest.readScope)) throw new Error(`read path is outside manifest scope: ${operation.path}`);
    return true;
  }
  if (operation.kind === 'write') {
    if (!manifest.canWriteGame && manifest.allowedWriteScope === 'none') throw new Error('manifest does not permit writes');
    const allowed = manifest.allowedWriteScope === 'game-workspace' ? pathAllowed(operation.path, ['workspace/game/']) : manifest.allowedWriteScope === 'research-artifacts' ? pathAllowed(operation.path, ['artifacts/', 'input/reference-research/']) : manifest.allowedWriteScope !== 'none' && pathAllowed(operation.path, ['artifacts/']);
    if (!allowed) throw new Error(`write path is outside manifest scope: ${operation.path}`);
    return true;
  }
  if (operation.kind === 'command') {
    const command = operation.command.trim();
    if (!manifest.allowedCommands.some((allowed) => command === allowed || command.startsWith(`${allowed} `))) throw new Error(`command is not allow-listed: ${command}`);
    return true;
  }
  if (manifest.network !== 'browser-read-only') throw new Error('network access is disabled by manifest');
  const host = operation.host.toLowerCase().replace(/:\d+$/u, '').replace(/\.+$/u, '');
  if (!normalizeHost(host)) throw new Error(`network host is invalid or not allow-listed: ${host}`);
  if (manifest.networkAllowlist.length === 0 || !manifest.networkAllowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) throw new Error(`network host is not allow-listed: ${host}`);
  return true;
}
