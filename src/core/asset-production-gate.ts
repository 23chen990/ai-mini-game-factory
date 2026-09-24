import { z } from 'zod';
import type { GameBlueprint, StyleLock } from '../schemas/index.js';

const Text = z.string().trim().min(1);

export const AssetVisualFitReviewSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  targetGame: Text,
  targetWorkspace: Text.refine((value) => value.startsWith('/'), 'target workspace must be absolute'),
  styleLockDirectionId: Text,
  reviewedBy: z.enum(['human', 'independent-agent']),
  reviewedAt: z.string().datetime(),
  sourceEvidence: z.array(z.object({ path: Text, sha256: z.string().regex(/^[a-f0-9]{64}$/iu) }).strict()).min(2),
  assets: z.array(z.object({
    assetId: Text,
    role: z.enum(['player', 'cuttable', 'support', 'hazard', 'finish', 'background', 'ui', 'marketing']),
    camera: z.enum(['side-on', 'orthographic', 'perspective', 'mixed', 'unknown']),
    dimensionality: z.enum(['flat-2d', 'low-poly-3d', 'mixed', 'unknown']),
    geometry: z.enum(['simple-rounded-blocks', 'simple-faceted', 'organic-rounded', 'mixed', 'unknown']),
    material: z.enum(['matte-simple', 'soft-plastic', 'flat-colour', 'mixed', 'unknown']),
    lifecycleStates: z.array(Text).min(1),
    evidence: z.array(Text).min(1),
    status: z.enum(['PASS', 'BLOCKED']),
    notes: z.array(Text),
  }).strict()).min(1),
  originalityBoundary: z.object({
    preserveObserved: z.array(Text).min(1),
    createOriginal: z.array(Text).min(1),
    neverCopy: z.array(Text).min(1),
  }).strict(),
  status: z.enum(['PASS', 'BLOCKED']),
  blockers: z.array(Text),
}).strict().superRefine((value, context) => {
  const assetsPass = value.assets.every((asset) => asset.status === 'PASS');
  if (value.status === 'PASS' && (!assetsPass || value.blockers.length > 0)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'a passing visual fit review requires every asset to pass and no blockers' });
  }
  if (value.status === 'BLOCKED' && value.blockers.length === 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'a blocked visual fit review requires blockers' });
  }
  if (value.assets.some((asset) => asset.assetId === 'background' && asset.role !== 'background')) {
    context.addIssue({ code: 'custom', path: ['assets'], message: 'background asset must use the background role' });
  }
});
export type AssetVisualFitReview = z.infer<typeof AssetVisualFitReviewSchema>;

export const AssetProductionGateSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['formal', 'mechanics-preview']),
  passed: z.boolean(),
  blockers: z.array(Text),
  evidence: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.passed && value.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'a passing asset gate cannot retain blockers' });
  if (!value.passed && value.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'a blocked asset gate requires blockers' });
});
export type AssetProductionGate = z.infer<typeof AssetProductionGateSchema>;

export type AssetProductionReadiness = {
  passed: boolean;
  mode: 'formal' | 'mechanics-preview';
  blockers: string[];
  evidence: string[];
};

export type AssetProductionGateInput = {
  blueprint: Pick<GameBlueprint, 'designMode' | 'gameId' | 'template'>;
  styleLock: StyleLock;
  humanApprovalPresent: boolean;
  referenceEvidenceReady?: boolean;
  visualFitReview?: AssetVisualFitReview;
  allowMechanicsPreview?: boolean;
};

/**
 * Formal image assets are allowed only after a human style approval and a
 * source-bound visual-fit review. A replica preview may use procedural
 * placeholders, but that lane can never be mistaken for formal art.
 */
export function evaluateAssetProductionReadiness(input: AssetProductionGateInput): AssetProductionReadiness {
  const blockers: string[] = [];
  const evidence: string[] = [];
  const previewOnly = input.styleLock.notes.some((note) => /preview-only automatic direction/iu.test(note));
  const reference = input.blueprint.designMode === 'reference_reskin';

  if (previewOnly) blockers.push('style-lock:preview-only');
  if (reference && !input.humanApprovalPresent) blockers.push('human-art-approval:missing');
  if (reference && input.referenceEvidenceReady !== true) blockers.push('reference-visual-evidence:missing');
  if (reference && input.visualFitReview?.status !== 'PASS') blockers.push('asset-visual-fit-review:missing-or-blocked');
  if (input.visualFitReview && input.visualFitReview.styleLockDirectionId !== input.styleLock.directionId) blockers.push('asset-visual-fit-review:style-lock-mismatch');
  if (input.visualFitReview && input.visualFitReview.targetGame !== input.blueprint.gameId) blockers.push('asset-visual-fit-review:game-mismatch');

  if (input.allowMechanicsPreview && previewOnly) {
    return { passed: true, mode: 'mechanics-preview', blockers: [], evidence: ['preview:procedural-placeholders-only', 'formal-art:blocked-by-preview-style-lock'] };
  }

  if (input.humanApprovalPresent) evidence.push('human-art-approval:present');
  if (input.referenceEvidenceReady) evidence.push('reference-visual-evidence:present');
  if (input.visualFitReview?.status === 'PASS') evidence.push('asset-visual-fit-review:passed');
  return { passed: blockers.length === 0, mode: 'formal', blockers, evidence };
}
