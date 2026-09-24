import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateEvidenceProvenance, ingestReferenceMedia, reviewReferenceMediaIdentity, usableEvidenceEntries, verifyEvidenceFileBindings } from '../../src/core/evidence-provenance.js';
import { EvidenceIdentityReviewSchema, EvidenceProvenanceManifestSchema } from '../../src/schemas/evidence-provenance.js';

const expected = {
  targetGame: 'mobile-slice-adaptation-20260830',
  workspace: '/workspace/runs/mobile-slice-adaptation-20260830/workspace/prototype-a',
};
const hash = 'a'.repeat(64);

describe('evidence provenance', () => {
  it('allows only a verified target recording into evidence inputs', () => {
    const manifest = EvidenceProvenanceManifestSchema.parse({
      schemaVersion: 1,
      ...expected,
      entries: [{ id: 'target', sourcePath: '/tmp/target.mp4', sha256: hash, ...expected, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true }],
    });
    expect(evaluateEvidenceProvenance(manifest, expected).passed).toBe(true);
    expect(usableEvidenceEntries(manifest, expected)).toHaveLength(1);
  });

  it('keeps platform/package evidence out of gameplay-reference inputs', () => {
    const manifest = EvidenceProvenanceManifestSchema.parse({
      schemaVersion: 1,
      ...expected,
      entries: [
        { id: 'gameplay', sourcePath: '/tmp/gameplay.mp4', purpose: 'gameplay-reference', sha256: hash, ...expected, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true },
        { id: 'device-log', sourcePath: '/tmp/device.log', purpose: 'platform-qa', sha256: hash, ...expected, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true },
      ],
    });
    expect(usableEvidenceEntries(manifest, expected, { purposes: ['gameplay-reference', 'design-document'] }).map((entry) => entry.id)).toEqual(['gameplay']);
  });

  it('blocks a mismatched recording even when it sits beside the target media', () => {
    const manifest = {
      schemaVersion: 1,
      ...expected,
      entries: [{ id: 'wrong', sourcePath: '/tmp/other-game.mp4', sha256: hash, ...expected, identityStatus: 'MISMATCHED_UNRELATED_GAME', reviewStatus: 'EXCLUDED', usableAsEvidence: false }],
    };
    expect(evaluateEvidenceProvenance(manifest, expected).passed).toBe(true);
    expect(usableEvidenceEntries(manifest, expected)).toHaveLength(0);
  });

  it('blocks an entry bound to another target workspace', () => {
    const manifest = {
      schemaVersion: 1,
      ...expected,
      entries: [{ id: 'cross-run', sourcePath: '/tmp/other.mp4', sha256: hash, targetGame: 'mobile-chart-adaptation-20260830', workspace: '/workspace/runs/mobile-chart-adaptation-20260830/workspace/prototype-a', identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true }],
    };
    const result = evaluateEvidenceProvenance(manifest, expected);
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('evidence-provenance:entry-game-mismatch:cross-run');
  });

  it('blocks a review that has no verified target recording instead of guessing from nearby media', () => {
    const manifest = EvidenceProvenanceManifestSchema.parse({
      schemaVersion: 1,
      ...expected,
      entries: [{ id: 'missing', sourcePath: '/tmp/missing.mp4', sha256: null, ...expected, identityStatus: 'UNAVAILABLE', reviewStatus: 'BLOCKED', usableAsEvidence: false }],
    });
    const result = evaluateEvidenceProvenance(manifest, expected, { requireVerified: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('evidence-provenance:no-verified-target-evidence');
  });

  it('copies an incoming recording into the owning run before identity review', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-media-ingest-'));
    const source = path.join(root, 'source recording.mp4');
    const runRoot = path.join(root, 'runs', 'slice-run');
    await writeFile(source, 'recording-bytes');
    const result = await ingestReferenceMedia({ sourcePath: source, runRoot, targetGame: 'slice-run', purpose: 'gameplay-reference' });
    expect(result.destination).toContain('/reference-evidence/incoming/');
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as { entries: Array<{ reviewStatus: string; usableAsEvidence: boolean; sha256: string; purpose: string }> };
    expect(manifest.entries[0]?.reviewStatus).toBe('PENDING');
    expect(manifest.entries[0]?.usableAsEvidence).toBe(false);
    expect(manifest.entries[0]?.sha256).toHaveLength(64);
    expect(manifest.entries[0]?.purpose).toBe('gameplay-reference');
    await rm(root, { recursive: true, force: true });
  });

  it('moves an exact hash-matched item to verified through an explicit identity review', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-media-review-'));
    const source = path.join(root, 'provided-level.mp4');
    const runRoot = path.join(root, 'runs', 'slice-run');
    const workspace = path.join(runRoot, 'workspace/game');
    await writeFile(source, 'exact-recording-bytes');
    const ingested = await ingestReferenceMedia({ sourcePath: source, runRoot, targetGame: 'slice-run', workspace, id: 'level-01', purpose: 'gameplay-reference' });

    const reviewed = await reviewReferenceMediaIdentity({
      runRoot,
      targetGame: 'slice-run',
      workspace,
      id: 'level-01',
      expectedSha256: ingested.sha256,
      reviewer: 'factory-operator',
      basis: 'Matched the user-designated source entry and exact SHA-256 from the prior verified run.',
    });

    expect(reviewed.entry).toMatchObject({ identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true });
    expect(reviewed.entry.storedPath).toMatch(/^reference-evidence\/verified\//);
    await expect(readFile(path.join(runRoot, reviewed.entry.storedPath!), 'utf8')).resolves.toBe('exact-recording-bytes');
    expect(EvidenceIdentityReviewSchema.parse(JSON.parse(await readFile(reviewed.reviewPath, 'utf8')))).toMatchObject({ entryId: 'level-01', decision: 'VERIFIED_TARGET', expectedSha256: ingested.sha256 });
    const manifest = JSON.parse(await readFile(ingested.manifestPath, 'utf8'));
    expect(verifyEvidenceFileBindings(manifest, { targetGame: 'slice-run', workspace }, { runRoot, requireRunLocal: true })).resolves.toMatchObject({ passed: true });
    await rm(root, { recursive: true, force: true });
  });

  it('rejects identity review when the operator-supplied expected hash differs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-media-review-reject-'));
    const source = path.join(root, 'provided-level.mp4');
    const runRoot = path.join(root, 'runs', 'slice-run');
    await writeFile(source, 'recording');
    await ingestReferenceMedia({ sourcePath: source, runRoot, targetGame: 'slice-run', id: 'level-01', purpose: 'gameplay-reference' });
    await expect(reviewReferenceMediaIdentity({ runRoot, targetGame: 'slice-run', workspace: path.join(runRoot, 'workspace/game'), id: 'level-01', expectedSha256: 'f'.repeat(64), reviewer: 'factory-operator', basis: 'expected prior hash' })).rejects.toThrow(/expected sha-256/i);
    await rm(root, { recursive: true, force: true });
  });

  it('records a run-local stored path so verified evidence survives removal of the original source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-media-local-'));
    const source = path.join(root, 'outside-source.txt');
    const runRoot = path.join(root, 'runs', 'slice-run');
    await writeFile(source, 'reference notes');
    const result = await ingestReferenceMedia({ sourcePath: source, runRoot, targetGame: 'slice-run' });
    const raw = JSON.parse(await readFile(result.manifestPath, 'utf8')) as { workspace: string; entries: Array<Record<string, unknown>> };
    expect(raw.workspace).toBe(path.join(runRoot, 'workspace/game'));
    raw.entries[0] = { ...raw.entries[0], identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true };
    await writeFile(result.manifestPath, JSON.stringify(raw));
    await rm(source);
    const verified = await verifyEvidenceFileBindings(raw, { targetGame: 'slice-run', workspace: raw.workspace }, { runRoot, requireRunLocal: true });
    expect(verified.passed).toBe(true);
    expect(raw.entries[0]?.storedPath).toMatch(/^reference-evidence\/incoming\//);
    expect(raw.entries[0]?.analysisTextPath).toMatch(/\.analysis\.txt$/);
    await expect(readFile(path.join(runRoot, String(raw.entries[0]?.analysisTextPath)), 'utf8')).resolves.toBe('reference notes\n');
    await rm(root, { recursive: true, force: true });
  });
});
