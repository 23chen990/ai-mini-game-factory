import { z } from 'zod';

const Text = z.string().trim().min(1);
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const ComparisonEvidenceFileSchema = z.object({ path: Text, sha256: Hash }).strict();

/** Research owns the measurement protocol and tolerance; Builder cannot relax it. */
export const ReferenceComparisonSpecSchema = z.object({
  evidenceBasis: z.enum(['runtime-observed', 'source-derived', 'inferred', 'unknown']),
  referenceArtifact: ComparisonEvidenceFileSchema,
  condition: Text,
  protocol: Text,
  metric: Text,
  unit: Text,
  /** Legacy artifacts remain readable; acceptance requires explicit semantics. */
  comparisonMode: z.enum(['mean', 'ordered']).optional(),
  referenceRange: z.object({ min: z.number().finite(), max: z.number().finite() }).strict()
    .refine((range) => range.min <= range.max, 'reference range must be ordered'),
  maxDelta: z.number().finite().nonnegative(),
  minimumSamples: z.number().int().positive(),
}).strict();

/** An independent QA adapter observes both targets; this is not a Builder self-report. */
export const ReferenceComparisonCaptureSchema = z.object({
  schemaVersion: z.literal(1), targetRunId: Text, contractHash: Hash,
  target: z.enum(['reference', 'candidate']), artifactHash: Hash,
  authority: z.enum(['normal-input', 'fixture']), startedFromReset: z.boolean(),
  actions: z.array(Text), forbiddenOperations: z.array(Text),
  observedAt: z.string().datetime(), durationMs: z.number().finite().positive(),
  observations: z.array(z.object({
    checkId: Text, objectType: Text, stateBranch: Text,
    viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
    condition: Text, protocol: Text, metric: Text, unit: Text,
    samples: z.array(z.number().finite()), screenshots: z.array(ComparisonEvidenceFileSchema).min(1),
  }).strict()).refine((rows) => new Set(rows.map((row) => row.checkId)).size === rows.length, 'duplicate check observations'),
}).strict();
export type ReferenceComparisonCapture = z.infer<typeof ReferenceComparisonCaptureSchema>;

export const ReferenceDifferenceSchema = z.object({
  checkId: Text, route: z.enum(['RESEARCH', 'CONTRACT', 'BUILDER', 'QA']), reason: Text,
}).strict();
export type ReferenceDifference = z.infer<typeof ReferenceDifferenceSchema>;

/** A routed handoff is pending work, not evidence that an agent executed it. */
export const ReferenceComparisonTaskSchema = z.object({
  schemaVersion: z.literal(1), targetRunId: Text, workspace: Text,
  contractHash: Hash.nullable(), buildHash: Hash,
  stage: z.enum(['REFERENCE_DEEP_RESEARCH', 'FIX', 'QA']),
  owner: z.enum(['ResearchAgent', 'FixerAgent', 'QAAgent']),
  execution: z.literal('waiting-handoff'),
  inputArtifacts: z.array(Text).min(1), blockers: z.array(Text).min(1),
  differences: z.array(ReferenceDifferenceSchema), instructions: z.array(Text).min(1),
}).strict();
