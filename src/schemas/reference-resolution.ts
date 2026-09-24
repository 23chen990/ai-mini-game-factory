import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const RunRelativePath = Text.refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'), 'path must stay relative to the owning run');

export const ReferenceResearchResolutionDispositionSchema = z.enum([
  'HUMAN_LOCK_REQUIREMENT',
  'ORIGINAL_TUNING_EXCLUDED',
  'SEMANTIC_GROUPING',
  'FRAME_MANIFEST_VERIFIED',
  'OBJECT_REVIEW_VERIFIED',
  'BLOCKING',
]);

const ResolutionSourceSchema = z.object({
  path: RunRelativePath,
  sha256: Sha256,
  locator: Text,
}).strict();

/**
 * Auditable bridge from raw research truth to an implementation target.
 * Raw observations remain immutable; only an explicit, source-bound
 * disposition may remove a research gap from the canonical Builder input.
 */
export const ReferenceResearchResolutionSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-research-resolution'),
  targetRunId: Text,
  targetGame: Text,
  workspace: Text.refine((value) => value.startsWith('/'), 'workspace must be absolute'),
  sourceAnalysis: z.object({ path: RunRelativePath, sha256: Sha256 }).strict(),
  humanLock: z.object({ path: RunRelativePath, sha256: Sha256 }).strict(),
  entries: z.array(z.object({
    gap: Text,
    disposition: ReferenceResearchResolutionDispositionSchema,
    rationale: Text,
    sourceRefs: z.array(ResolutionSourceSchema).min(1),
  }).strict()),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(Text),
  createdAt: z.string().datetime(),
}).strict().superRefine((resolution, context) => {
  const gaps = resolution.entries.map((entry) => entry.gap);
  if (new Set(gaps).size !== gaps.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'resolution gaps must be unique' });
  const blockingEntries = resolution.entries.filter((entry) => entry.disposition === 'BLOCKING').map((entry) => entry.gap);
  if (resolution.status === 'READY' && (resolution.blockers.length > 0 || blockingEntries.length > 0)) context.addIssue({ code: 'custom', path: ['status'], message: 'READY resolutions cannot retain blockers' });
  if (resolution.status === 'BLOCKED' && resolution.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED resolutions require blockers' });
  for (const blocker of blockingEntries) if (!resolution.blockers.includes(blocker)) context.addIssue({ code: 'custom', path: ['blockers'], message: `blocking resolution entry is missing from blockers: ${blocker}` });
});

export type ReferenceResearchResolution = z.infer<typeof ReferenceResearchResolutionSchema>;
export type ReferenceResearchResolutionDisposition = z.infer<typeof ReferenceResearchResolutionDispositionSchema>;

export {
  ReferenceObjectReviewFrameSchema,
  ReferenceObjectReviewObjectSchema,
  ReferenceObjectReviewRowSchema,
  ReferenceObjectReviewSchema,
  ReferenceObjectReviewSourceSchema,
} from './reference-object-review.js';
export type { ReferenceObjectReview, ReferenceObjectReviewFrame, ReferenceObjectReviewObject, ReferenceObjectReviewRow } from './reference-object-review.js';
