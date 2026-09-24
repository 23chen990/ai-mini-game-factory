import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const ComplaintEvidenceSchema = z.object({
  path: Text,
  sha256: Sha256,
  kind: z.enum(['user-report', 'reference', 'runtime-capture', 'qa-artifact', 'factory-source']),
  provenance: z.enum(['verified-run-artifact', 'verified-reference', 'repository-source']),
}).strict();

export const ExperienceComplaintTriageSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('experience-complaint-triage'),
  targetGame: Text,
  workspace: Text,
  report: Text,
  classification: z.array(z.enum(['core-experience', 'reference-fidelity', 'visual-hierarchy', 'failure-attribution', 'mobile-readability', 'qa-false-positive', 'factory-routing'])).min(1),
  scope: z.object({
    route: z.enum(['direct-builder', 'formal-fixer', 'shared-factory']),
    rationale: Text,
    generatedWorkspaceModified: z.boolean(),
    contextIntentionallyOmitted: z.array(Text),
  }).strict(),
  reproduction: z.object({
    status: z.enum(['REPRODUCED', 'PARTIALLY_REPRODUCED', 'NOT_REPRODUCED']),
    steps: z.array(Text).min(1),
    observed: z.array(Text).min(1),
    evidence: z.array(ComplaintEvidenceSchema).min(1),
  }).strict(),
  acceptanceCriteria: z.array(Text).min(1),
  status: z.enum(['OPEN', 'READY_FOR_REPAIR', 'BLOCKED', 'CLOSED']),
  createdAt: z.string().datetime(),
}).strict();
export type ExperienceComplaintTriage = z.infer<typeof ExperienceComplaintTriageSchema>;

export const ExperienceReproductionMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('experience-reproduction-matrix'),
  targetGame: Text,
  workspace: Text,
  axes: z.object({
    objectTypes: z.array(Text).min(1),
    lifecycleStateBranches: z.array(Text).min(1),
    rendererPaths: z.array(Text).min(1),
    viewports: z.array(z.object({ label: Text, width: z.number().int().positive(), height: z.number().int().positive() }).strict()).min(1),
  }).strict(),
  cells: z.array(z.object({
    id: Text,
    objectType: Text,
    lifecycleStateBranch: Text,
    rendererPath: Text,
    viewport: z.object({ label: Text, width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
    status: z.enum(['REPRODUCED', 'PASS', 'BLOCKED', 'NOT_APPLICABLE']),
    expected: Text,
    observed: Text,
    evidence: z.array(ComplaintEvidenceSchema),
  }).strict()).min(1),
  confirmedFindings: z.array(Text),
  remainingGaps: z.array(Text),
  createdAt: z.string().datetime(),
}).strict().superRefine((matrix, context) => {
  const ids = matrix.cells.map((cell) => cell.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['cells'], message: 'matrix cell ids must be unique' });
  const declared = new Set(matrix.axes.viewports.map((viewport) => `${viewport.width}x${viewport.height}`));
  for (const [index, cell] of matrix.cells.entries()) {
    if (!declared.has(`${cell.viewport.width}x${cell.viewport.height}`)) context.addIssue({ code: 'custom', path: ['cells', index, 'viewport'], message: 'cell viewport must be declared on the matrix axis' });
  }
});
export type ExperienceReproductionMatrix = z.infer<typeof ExperienceReproductionMatrixSchema>;
