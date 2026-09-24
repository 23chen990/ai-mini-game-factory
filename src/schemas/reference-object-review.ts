import { z } from 'zod';
import { ReferenceObjectLifecycleSchema, ReferenceObjectRoleSchema } from './reference-recording.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const RunRelativePath = Text.refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'), 'path must stay relative to the owning run');
const AbsolutePath = Text.refine((value) => value.startsWith('/'), 'workspace must be absolute');
const NormalizedBounds = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).strict().superRefine((bounds, context) => {
  if (bounds.x + bounds.width > 1.000_001) context.addIssue({ code: 'custom', path: ['width'], message: 'normalized bounds exceed viewport width' });
  if (bounds.y + bounds.height > 1.000_001) context.addIssue({ code: 'custom', path: ['height'], message: 'normalized bounds exceed viewport height' });
});

export const ReferenceObjectReviewSourceSchema = z.object({ path: RunRelativePath, sha256: Sha256 }).strict();

/** The exact object record used by a checkpoint in ReferenceLevelReconstruction. */
export const ReferenceObjectReviewObjectSchema = z.object({
  semanticId: Text,
  role: ReferenceObjectRoleSchema,
  lifecycle: ReferenceObjectLifecycleSchema,
  boundsNormalized: NormalizedBounds,
  rotationDegrees: z.number().min(-360).max(360),
  visible: z.boolean(),
  confidence: z.number().min(0).max(1),
}).strict();

export const ReferenceObjectReviewFrameSchema = z.object({
  id: Text,
  path: RunRelativePath,
  sha256: Sha256,
}).strict();

export const ReferenceObjectReviewRowSchema = z.object({
  checkpointId: Text,
  // `object` is the canonical form. The flattened fields remain accepted so
  // a review table can carry the exact reconstruction object columns without
  // losing strict validation of the complete shape.
  object: ReferenceObjectReviewObjectSchema.optional(),
  semanticId: Text.optional(),
  role: ReferenceObjectRoleSchema.optional(),
  lifecycle: ReferenceObjectLifecycleSchema.optional(),
  boundsNormalized: NormalizedBounds.optional(),
  rotationDegrees: z.number().min(-360).max(360).optional(),
  visible: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceFrames: z.array(ReferenceObjectReviewFrameSchema).min(1),
  rationale: Text.optional(),
  observationRationale: Text.optional(),
}).strict().superRefine((row, context) => {
  const flatObjectFields = [row.semanticId, row.role, row.lifecycle, row.boundsNormalized, row.rotationDegrees, row.visible, row.confidence];
  const hasFlatObject = flatObjectFields.some((value) => value !== undefined);
  const completeFlatObject = flatObjectFields.every((value) => value !== undefined);
  if (row.object && hasFlatObject) context.addIssue({ code: 'custom', path: ['object'], message: 'review rows must use either object or flattened reconstruction fields, not both' });
  if (!row.object && !completeFlatObject) context.addIssue({ code: 'custom', path: ['object'], message: 'review rows require the complete reconstruction object shape' });
  if (!row.rationale && !row.observationRationale) context.addIssue({ code: 'custom', path: ['rationale'], message: 'review rows require an observation rationale' });
  if (row.rationale && row.observationRationale) context.addIssue({ code: 'custom', path: ['rationale'], message: 'review rows must provide one observation rationale field' });
  const frameIds = row.sourceFrames.map((frame) => frame.id);
  const framePaths = row.sourceFrames.map((frame) => frame.path);
  if (new Set(frameIds).size !== frameIds.length) context.addIssue({ code: 'custom', path: ['sourceFrames'], message: 'review source frame ids must be unique per row' });
  if (new Set(framePaths).size !== framePaths.length) context.addIssue({ code: 'custom', path: ['sourceFrames'], message: 'review source frame paths must be unique per row' });
});

/**
 * Human or independent reviewer evidence for a semantic object omitted by a
 * source reconstruction. Every row is bound to exact source frames and the
 * exact raw-analysis and frame-manifest artifacts used to review it.
 */
export const ReferenceObjectReviewSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-object-review'),
  targetRunId: Text,
  targetGame: Text,
  workspace: AbsolutePath,
  sourceAnalysis: ReferenceObjectReviewSourceSchema,
  frameManifest: ReferenceObjectReviewSourceSchema,
  rows: z.array(ReferenceObjectReviewRowSchema).min(1),
  status: z.enum(['READY', 'BLOCKED']).default('READY'),
  blockers: z.array(Text).default([]),
  reviewedAt: z.string().datetime().default(() => new Date().toISOString()),
}).strict().superRefine((review, context) => {
  const rowKeys = review.rows.map((row) => `${row.checkpointId}:${row.object?.semanticId ?? row.semanticId}`);
  if (new Set(rowKeys).size !== rowKeys.length) context.addIssue({ code: 'custom', path: ['rows'], message: 'review rows must be unique per checkpoint and semantic object' });
  if (review.status === 'READY' && review.blockers.length > 0) context.addIssue({ code: 'custom', path: ['status'], message: 'READY object reviews cannot retain blockers' });
  if (review.status === 'BLOCKED' && review.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED object reviews require blockers' });
});

export type ReferenceObjectReview = z.infer<typeof ReferenceObjectReviewSchema>;
export type ReferenceObjectReviewRow = z.infer<typeof ReferenceObjectReviewRowSchema>;
export type ReferenceObjectReviewObject = z.infer<typeof ReferenceObjectReviewObjectSchema>;
export type ReferenceObjectReviewFrame = z.infer<typeof ReferenceObjectReviewFrameSchema>;
