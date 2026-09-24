import { describe, expect, it } from 'vitest';
import { assertPermissionOperation, buildPermissionManifest, buildPermissionManifestBundle, evaluatePermissionManifest, evaluatePermissionManifestBundle } from '../../src/core/permission-manifest.js';
import { PermissionManifestBundleSchema, PermissionManifestSchema } from '../../src/schemas/permission-manifest.js';
import { StageNameSchema } from '../../src/schemas/index.js';

describe('agent permission manifest', () => {
  it('isolates untrusted research from mutating roles', () => {
    const research = buildPermissionManifest('COMPETITOR_RESEARCH');
    const builder = buildPermissionManifest('FULL_BUILD');
    expect(PermissionManifestSchema.parse(research)).toMatchObject({ role: 'research', sandbox: 'read-only', network: 'browser-read-only', canReadSecrets: false, canWriteGame: false });
    expect(builder).toMatchObject({ role: 'builder', sandbox: 'workspace-write', network: 'none', canReadSecrets: false, canWriteGame: true });
  });

  it('never grants network or secret access to a fast helper', () => {
    expect(buildPermissionManifest('UI_SKELETON')).toMatchObject({ role: 'reviewer', network: 'none', canReadSecrets: false, canWriteGame: false });
  });

  it('gives producer and release roles narrow metadata scopes', () => {
    expect(buildPermissionManifest('BLUEPRINT')).toMatchObject({ role: 'producer', allowedWriteScope: 'design-artifacts', canWriteGame: false });
    expect(buildPermissionManifest('RELEASE')).toMatchObject({ role: 'release', allowedWriteScope: 'release-artifacts', canWriteGame: false });
  });

  it('allows only the explicitly shaped prior-run prototype read for action experiments', () => {
    const action = buildPermissionManifest('BUILD_ACTION_PROTOTYPES');
    expect(assertPermissionOperation(action, { kind: 'read', path: 'runs/prior-run/workspace/prototype-a' })).toBe(true);
    expect(() => assertPermissionOperation(action, { kind: 'read', path: 'runs/prior-run/artifacts/secret.json' })).toThrow(/outside manifest scope/i);
  });

  it('derives the write scope from the stage contract for control stages', () => {
    expect(buildPermissionManifest('PRODUCTION_LINE_REVIEW')).toMatchObject({ allowedWriteScope: 'run-metadata', canWriteGame: false });
    expect(buildPermissionManifest('BUSINESS_PREFLIGHT')).toMatchObject({ allowedWriteScope: 'run-metadata', canWriteGame: false });
  });

  it('fails closed when a research request has no explicit network allowlist', () => {
    const research = buildPermissionManifest('COMPETITOR_RESEARCH', { researchAllowedHosts: [] });
    expect(() => assertPermissionOperation(research, { kind: 'network', host: 'example.com' })).toThrow(/allow-list/i);
    expect(evaluatePermissionManifest(research, { requireResearchAllowlist: true })).toMatchObject({ passed: false, blockers: ['research-network-allow-list-missing'] });
  });

  it('normalizes research hosts and permits exact hosts plus subdomains only', () => {
    const research = buildPermissionManifest('COMPETITOR_RESEARCH', { researchAllowedHosts: [' GitHub.com ', 'raw.githubusercontent.com.'] });
    expect(research.networkAllowlist).toEqual(['github.com', 'raw.githubusercontent.com']);
    expect(assertPermissionOperation(research, { kind: 'network', host: 'api.github.com' })).toBe(true);
    expect(() => assertPermissionOperation(research, { kind: 'network', host: 'github.com.evil.test' })).toThrow(/allow-list/i);
  });

  it('builds one auditable manifest for every known stage with unique identities', () => {
    const bundle = buildPermissionManifestBundle();
    expect(PermissionManifestBundleSchema.parse(bundle).manifests).toHaveLength(StageNameSchema.options.length);
    expect(new Set(bundle.manifests.map((manifest) => manifest.stage)).size).toBe(StageNameSchema.options.length);
    expect(evaluatePermissionManifestBundle(bundle, { requiredStages: StageNameSchema.options })).toMatchObject({ passed: true, blockers: [] });
  });

  it('fails closed when a bundle is partial, duplicated, or malformed', () => {
    const bundle = buildPermissionManifestBundle(['COMPETITOR_RESEARCH', 'FULL_BUILD']);
    expect(evaluatePermissionManifestBundle(bundle, { requiredStages: ['COMPETITOR_RESEARCH', 'FULL_BUILD', 'QA'] })).toMatchObject({ passed: false, blockers: ['missing-stage:QA'] });
    const duplicate = { ...bundle, manifests: [bundle.manifests[0], bundle.manifests[0]] };
    expect(evaluatePermissionManifestBundle(duplicate).blockers).toContain('duplicate-stage:COMPETITOR_RESEARCH');
    expect(evaluatePermissionManifestBundle({ schemaVersion: 1, manifests: [{ stage: 'NOPE' }] })).toMatchObject({ passed: false, blockers: ['schema-invalid'] });
  });
});
