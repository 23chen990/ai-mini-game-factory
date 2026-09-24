import { describe, expect, it } from 'vitest';
import { evaluateAssetProductionReadiness, AssetVisualFitReviewSchema } from '../../src/core/asset-production-gate.js';
import type { StyleLock } from '../../src/schemas/index.js';

const direction = {
  id: 'direction_a' as const,
  name: 'Preview Original Direction',
  summary: 'preview',
  visualKeywords: ['original'],
  palette: ['#112233'],
  characterStyle: 'silhouette',
  environmentStyle: 'scene',
  uiStyle: 'panels',
  iconConcept: 'mark',
  forbiddenElements: ['logos'],
  productionComplexity: 'low' as const,
  previewPrompt: 'original preview',
};

const previewLock: StyleLock = {
  schemaVersion: 1,
  directionId: direction.id,
  direction,
  kept: [],
  changes: [],
  notes: ['preview-only automatic direction; choose a human style lock in full-validation'],
  lockedAt: new Date().toISOString(),
};

const formalLock: StyleLock = { ...previewLock, notes: ['human selected: preserve simple silhouette'] };
const blueprint = { designMode: 'reference_reskin' as const, gameId: 'blade', template: 'cut-stack-dodge-v1' as const };

describe('asset production gate', () => {
  it('never lets a preview-only style lock produce formal image assets', () => {
    const result = evaluateAssetProductionReadiness({ blueprint, styleLock: previewLock, humanApprovalPresent: false, referenceEvidenceReady: true });
    expect(result.passed).toBe(false);
    expect(result.mode).toBe('formal');
    expect(result.blockers).toContain('style-lock:preview-only');
  });

  it('allows only an explicitly labelled mechanics preview to use procedural placeholders', () => {
    const result = evaluateAssetProductionReadiness({ blueprint, styleLock: previewLock, humanApprovalPresent: false, referenceEvidenceReady: false, allowMechanicsPreview: true });
    expect(result).toEqual(expect.objectContaining({ passed: true, mode: 'mechanics-preview' }));
    expect(result.evidence).toContain('preview:procedural-placeholders-only');
  });

  it('requires source-bound visual fit review before reference-reskin formal assets', () => {
    const result = evaluateAssetProductionReadiness({ blueprint, styleLock: formalLock, humanApprovalPresent: true, referenceEvidenceReady: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('asset-visual-fit-review:missing-or-blocked');
  });

  it('accepts a matching passing visual fit review', () => {
    const review = AssetVisualFitReviewSchema.parse({
      schemaVersion: 1,
      targetRunId: 'run-1',
      targetGame: 'blade',
      targetWorkspace: '/tmp/run/workspace/game',
      styleLockDirectionId: 'direction_a',
      reviewedBy: 'independent-agent',
      reviewedAt: new Date().toISOString(),
      sourceEvidence: [{ path: 'artifacts/reference-frame-manifest.json', sha256: 'a'.repeat(64) }, { path: 'artifacts/reference-object-review.json', sha256: 'b'.repeat(64) }],
      assets: [{ assetId: 'blade', role: 'player', camera: 'side-on', dimensionality: 'low-poly-3d', geometry: 'simple-faceted', material: 'matte-simple', lifecycleStates: ['ready', 'moving'], evidence: ['frame-00000'], status: 'PASS', notes: [] }],
      originalityBoundary: { preserveObserved: ['bright support lane'], createOriginal: ['new blade silhouette'], neverCopy: ['names', 'UI', 'tuning'] },
      status: 'PASS',
      blockers: [],
    });
    const result = evaluateAssetProductionReadiness({ blueprint, styleLock: formalLock, humanApprovalPresent: true, referenceEvidenceReady: true, visualFitReview: review });
    expect(result).toEqual(expect.objectContaining({ passed: true, mode: 'formal' }));
  });
});
