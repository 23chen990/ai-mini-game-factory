import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { bindReleaseCandidateAcceptance, packageRelease, packageReleaseCandidate } from '../../src/core/release.js';
import type { GameBlueprint } from '../../src/schemas/index.js';
import { QUALITY_DIMENSIONS } from '../../src/schemas/quality-gates.js';
import { buildQualityGateMatrix } from '../../src/core/quality-gates.js';
import { buildBusinessPreflightTemplate } from '../../src/core/operating-gates.js';
import { buildPlatformPolicyTemplate } from '../../src/core/platform-policy.js';

const blueprint: GameBlueprint = {
  schemaVersion: 1,
  gameId: 'release-test',
  title: 'Release Test',
  theme: 'dark cozy market',
  runtime: 'web-lite',
  template: 'idle-shop-v1',
  designMode: 'prototype_tournament',
  targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
  concept: 'test',
  coreLoop: ['arrive', 'produce', 'deliver', 'reward'],
  content: { productName: 'dango', customerName: 'spirit', currencyName: 'lamp' },
  balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 },
  preferences: {},
};

it('packages the actual marketing asset extension from the validated asset manifest', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-png-promo-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'real-png');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    provider: 'codex-imagegen',
    assets: [
      { id: 'customer', kind: 'character', path: 'assets/customer.png', prompt: 'customer', status: 'generated', sha256: 'hash' },
      { id: 'product', kind: 'product', path: 'assets/product.png', prompt: 'product', status: 'generated', sha256: 'hash' },
      { id: 'background', kind: 'background', path: 'assets/background.png', prompt: 'background', status: 'generated', sha256: 'hash' },
      { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
    ],
  }));

  const manifest = await packageRelease(runRoot, blueprint);

  expect(manifest.iconAndPromoAssets).toEqual(['marketing/promo.png']);
  await expect(readFile(path.join(runRoot, 'release-candidate/marketing/promo.png'), 'utf8')).resolves.toBe('real-png');
});

it('freezes a candidate before human acceptance and reuses the exact game files', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-candidate-freeze-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html><body>candidate-a</body>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'promo');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ success: true, runtime: 'web-lite', webBuild: 'workspace/game/dist' }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));

  const frozen = await packageReleaseCandidate(runRoot, blueprint);
  expect(frozen.candidate.coreHash).toHaveLength(64);
  const frozenHtml = await readFile(path.join(runRoot, 'release-candidate/web/index.html'), 'utf8');
  expect(frozenHtml).toContain('candidate-a');

  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html><body>candidate-b</body>');
  await expect(packageRelease(runRoot, blueprint, { reuseCandidate: true })).rejects.toThrow(/candidate|hash/i);
  expect(await readFile(path.join(runRoot, 'release-candidate/web/index.html'), 'utf8')).toContain('candidate-a');
});

it('binds final acceptance to the frozen candidate and rejects a different acceptance record', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-acceptance-binding-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html><body>bound</body>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'promo');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ success: true, runtime: 'web-lite', webBuild: 'workspace/game/dist' }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));
  const frozen = await packageReleaseCandidate(runRoot, blueprint);
  const acceptance = { schemaVersion: 1, core: { passed: true, evidence: 'core' }, normalFlow: { passed: true, evidence: 'flow' }, visualEvidence: { passed: true, evidence: 'visual' }, levelDifference: { passed: true, evidence: 'variation' }, humanPlaytest: { passed: true, evidence: 'human' }, releaseReady: true, candidateHash: frozen.candidate.coreHash };
  const bound = await bindReleaseCandidateAcceptance(runRoot, acceptance);
  expect(bound.acceptanceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/release-candidate.json'), 'utf8')).acceptanceHash).toBe(bound.acceptanceHash);
});

it('binds the quality matrix to the exact immutable candidate and ships the bound report', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-quality-binding-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html><body>quality-binding</body>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'promo');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ success: true, runtime: 'web-lite', webBuild: 'workspace/game/dist' }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));
  const matrix = buildQualityGateMatrix(Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, { passed: true, evidence: [`evidence:${id}`] }])) as never);
  await writeFile(path.join(runRoot, 'artifacts/quality-gate-matrix.json'), JSON.stringify(matrix));

  const frozen = await packageReleaseCandidate(runRoot, blueprint, { enforceOperatingGates: true });
  const bound = JSON.parse(await readFile(path.join(runRoot, 'release-candidate/reports/quality-gate-matrix.json'), 'utf8')) as { candidateHash?: string };
  expect(bound.candidateHash).toBe(frozen.candidate.coreHash);
  expect(frozen.candidate.qualityMatrix).toBe('reports/quality-gate-matrix.json');
  expect(frozen.manifest.reports).toContain('reports/quality-gate-matrix.json');
});

it('refuses to freeze a strict candidate when an automatic quality dimension is unresolved', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-quality-unresolved-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html><body>quality-unresolved</body>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'promo');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ success: true, runtime: 'web-lite', webBuild: 'workspace/game/dist' }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));
  const unresolved = buildQualityGateMatrix({
    ...Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, { passed: true, evidence: [`evidence:${id}`] }])),
    visualUx: { passed: undefined, evidence: ['presentation-pending'] },
  } as never);
  await writeFile(path.join(runRoot, 'artifacts/quality-gate-matrix.json'), JSON.stringify(unresolved));

  await expect(packageReleaseCandidate(runRoot, blueprint, { enforceOperatingGates: true })).rejects.toThrow(/quality.*ready|quality.*matrix/i);
});

it('rejects a quality matrix already bound to another candidate', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-quality-binding-mismatch-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html><body>quality-mismatch</body>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'promo');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ success: true, runtime: 'web-lite', webBuild: 'workspace/game/dist' }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));
  const matrix = buildQualityGateMatrix(Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, { passed: true, evidence: [`evidence:${id}`] }])) as never, { candidateHash: 'b'.repeat(64), requireCandidateHash: true });
  await writeFile(path.join(runRoot, 'artifacts/quality-gate-matrix.json'), JSON.stringify(matrix));

  await expect(packageReleaseCandidate(runRoot, blueprint, { enforceOperatingGates: true })).rejects.toThrow(/different candidate|quality matrix/i);
});

it('uses the runtime-reported web build and generated-asset root for Cocos candidates', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-cocos-paths-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/build/web-mobile'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/generated-assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/build/web-mobile/index.html'), '<!doctype html>');
  await writeFile(path.join(runRoot, 'workspace/generated-assets/promo.webp'), 'real-webp');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ schemaVersion: 1, success: true, runtime: 'cocos-3d', template: 'spatial-shop-3d-v1', workspace: 'workspace/game', webBuild: 'workspace/game/build/web-mobile', files: ['index.html'], verification: ['test:passed', 'typecheck:passed'], builtAt: new Date().toISOString() }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), JSON.stringify({ schemaVersion: 1, passed: true, checks: [], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date().toISOString() }));
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    { id: 'customer', kind: 'character', path: 'customer.png', prompt: 'customer', status: 'generated', sha256: 'hash' },
    { id: 'product', kind: 'product', path: 'product.png', prompt: 'product', status: 'generated', sha256: 'hash' },
    { id: 'background', kind: 'background', path: 'background.png', prompt: 'background', status: 'generated', sha256: 'hash' },
    { id: 'promo', kind: 'marketing', path: 'promo.webp', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));

  const manifest = await packageRelease(runRoot, { ...blueprint, runtime: 'cocos-3d', template: 'spatial-shop-3d-v1', spatialShop: undefined } as unknown as GameBlueprint);
  expect(manifest.entrypoint).toBe('web/index.html');
  await expect(readFile(path.join(runRoot, 'release-candidate/web/index.html'), 'utf8')).resolves.toContain('doctype');
  await expect(readFile(path.join(runRoot, 'release-candidate/marketing/promo.webp'), 'utf8')).resolves.toBe('real-webp');
});

it('rejects a build output symlink even when its lexical path stays inside the run', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-build-symlink-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'release-build-outside-'));
  try {
    await Promise.all([
      mkdir(path.join(runRoot, 'workspace/game'), { recursive: true }),
      mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
      mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
      mkdir(path.join(outside, 'dist'), { recursive: true }),
    ]);
    await writeFile(path.join(outside, 'dist/index.html'), '<!doctype html><body>outside</body>');
    await symlink(path.join(outside, 'dist'), path.join(runRoot, 'workspace/game/dist-link'), 'dir');
    await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'promo');
    await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ runtime: 'web-lite', webBuild: 'workspace/game/dist-link' }));
    await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), '{}');
    await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
      ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
      { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
    ] }));

    await expect(packageReleaseCandidate(runRoot, blueprint)).rejects.toThrow(/symlink|real directory|build/i);
  } finally {
    await Promise.all([
      rm(runRoot, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
});

it('requires a hash-bound platform policy evaluation artifact in strict release mode', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-platform-policy-evaluation-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html>');
  const budget = { currency: 'CNY' as const, maxTotalCents: 100, maxPaidTrafficCents: 0, maxAgentTokens: 1000, maxHumanMinutes: 10, maxFixAttempts: 0, paybackWindowDays: 30 };
  const preflight = buildBusinessPreflightTemplate({ targets: ['wechat-minigame'], optionalTargets: [], budget });
  await writeFile(path.join(runRoot, 'artifacts/business-preflight.json'), JSON.stringify({ ...preflight, accountChecks: preflight.accountChecks.map((item) => ({ ...item, status: 'pass' })), rightsStatus: 'pass', payoutStatus: 'pass', decision: 'GO', blockers: [], unknowns: [] }));
  const policy = buildPlatformPolicyTemplate({ targets: ['wechat-minigame'], optionalTargets: [] });
  const now = new Date().toISOString();
  await writeFile(path.join(runRoot, 'artifacts/platform-policy.json'), JSON.stringify({ ...policy, sourceKind: 'operator', updatedAt: now, entries: policy.entries.map((entry) => ({ ...entry, status: 'VERIFIED', policyVersion: '2026-09', sourceRefs: ['https://developers.example.test/rules'], verifiedAt: now, verifiedBy: 'human:operator', requiredActions: [] })) }));
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), JSON.stringify({ schemaVersion: 1, passed: true, checks: [], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: now }));
  await expect(packageRelease(runRoot, blueprint, { enforceOperatingGates: true, requirePlatformPolicy: true })).rejects.toThrow(/platform-policy evaluation/i);
});

it('blocks packaging when the player acceptance gate is explicitly not release-ready', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-acceptance-gate-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'real-png');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({
    schemaVersion: 1, provider: 'test', assets: [
      ...['customer', 'product', 'background'].map((id) => ({ id, kind: id === 'customer' ? 'character' : id, path: `assets/${id}.png`, prompt: id, status: 'generated', sha256: 'hash' })),
      { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
    ],
  }));
  const dimension = { passed: true, evidence: 'evidence' };
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), JSON.stringify({
    schemaVersion: 1, passed: true, checks: [], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date().toISOString(),
    acceptance: { schemaVersion: 1, core: dimension, normalFlow: { passed: false, evidence: 'normal flow failed' }, visualEvidence: dimension, levelDifference: dimension, humanPlaytest: dimension, releaseReady: false },
  }));
  await expect(packageRelease(runRoot, blueprint)).rejects.toThrow(/player acceptance gate/);
});

it('can enforce the acceptance artifact for production release packaging', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-acceptance-required-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'real-png');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), JSON.stringify({ schemaVersion: 1, passed: true, checks: [], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date().toISOString() }));
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    { id: 'customer', kind: 'character', path: 'assets/customer.png', prompt: 'customer', status: 'generated', sha256: 'hash' },
    { id: 'product', kind: 'product', path: 'assets/product.png', prompt: 'product', status: 'generated', sha256: 'hash' },
    { id: 'background', kind: 'background', path: 'assets/background.png', prompt: 'background', status: 'generated', sha256: 'hash' },
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));
  await expect(packageRelease(runRoot, blueprint, { enforceAcceptance: true })).rejects.toThrow(/requires artifacts\/qa-report\.json acceptance/);
});

it('requires business preflight and independently ready platform children in strict production mode', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'release-operating-gates-'));
  await Promise.all([
    mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true }),
    mkdir(path.join(runRoot, 'workspace/game/public/assets'), { recursive: true }),
    mkdir(path.join(runRoot, 'artifacts'), { recursive: true }),
  ]);
  await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<!doctype html>');
  await writeFile(path.join(runRoot, 'workspace/game/public/assets/promo.png'), 'real-png');
  await writeFile(path.join(runRoot, 'artifacts/build-report.json'), '{}');
  await writeFile(path.join(runRoot, 'artifacts/asset-manifest.json'), JSON.stringify({ schemaVersion: 1, provider: 'test', assets: [
    { id: 'customer', kind: 'character', path: 'assets/customer.png', prompt: 'customer', status: 'generated', sha256: 'hash' },
    { id: 'product', kind: 'product', path: 'assets/product.png', prompt: 'product', status: 'generated', sha256: 'hash' },
    { id: 'background', kind: 'background', path: 'assets/background.png', prompt: 'background', status: 'generated', sha256: 'hash' },
    { id: 'promo', kind: 'marketing', path: 'assets/promo.png', prompt: 'promo', status: 'generated', sha256: 'hash' },
  ] }));
  const dimension = { passed: true, evidence: 'evidence' };
  await writeFile(path.join(runRoot, 'artifacts/qa-report.json'), JSON.stringify({
    schemaVersion: 1, passed: true, checks: [], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date().toISOString(),
    acceptance: { schemaVersion: 1, core: dimension, normalFlow: dimension, visualEvidence: dimension, levelDifference: dimension, humanPlaytest: dimension, releaseReady: true },
  }));
  await expect(packageRelease(runRoot, blueprint, { enforceAcceptance: true, enforceOperatingGates: true })).rejects.toThrow(/business-preflight|platform-release-matrix/i);
});
