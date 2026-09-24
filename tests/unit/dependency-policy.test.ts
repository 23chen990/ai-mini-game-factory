import { describe, expect, it } from 'vitest';
import { buildDependencyPolicy, evaluateDependencyPolicy } from '../../src/core/dependency-policy.js';
import { SupplyChainManifestSchema } from '../../src/schemas/supply-chain.js';

const hash = 'a'.repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
  return SupplyChainManifestSchema.parse({
    schemaVersion: 1,
    gameId: 'dependency-test',
    lockfileHash: hash,
    dependencies: [{ name: 'phaser', version: '3.90.0', source: 'pnpm-lock:registry', license: 'MIT', licenseEvidence: 'https://opensource.org/license/mit', sha256: hash }],
    build: { sourceCommit: hash, builder: 'BuilderAgent', command: 'pnpm build', outputHash: hash },
    sbomHash: hash,
    generatedAt: new Date().toISOString(),
    ...overrides,
  });
}

function policy(overrides: Record<string, unknown> = {}) {
  return buildDependencyPolicy({
    policyId: 'factory-approved-dependencies-v1',
    entries: [{ name: 'phaser', version: '3.90.0', source: 'pnpm-lock:registry', license: 'MIT', licenseEvidence: 'https://opensource.org/license/mit', sha256: hash }],
    ...overrides,
  });
}

describe('dependency allowlist policy', () => {
  it('passes an exact, licensed and hash-bound dependency', () => {
    const result = evaluateDependencyPolicy(manifest(), policy(), { required: true });
    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.policyHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('fails closed for an unlisted dependency or mismatched provenance', () => {
    const result = evaluateDependencyPolicy(manifest({ dependencies: [{ name: 'phaser', version: '3.91.0', source: 'https://registry.example', license: 'UNKNOWN', sha256: 'b'.repeat(64) }] }), policy(), { required: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('dependency-not-allowlisted:phaser@3.91.0');
  });

  it('keeps an advisory policy visible without blocking an unlisted package', () => {
    const result = evaluateDependencyPolicy(manifest(), policy({ mode: 'advisory', entries: [] }), { required: false });
    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('dependency-not-allowlisted:phaser@3.90.0');
  });

  it('requires a policy when the caller enables the production gate', () => {
    const result = evaluateDependencyPolicy(manifest(), undefined, { required: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('dependency-policy-missing');
  });
});
