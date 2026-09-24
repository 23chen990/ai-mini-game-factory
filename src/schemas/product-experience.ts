import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u, 'expected a SHA-256 hex digest');

export const ProductExperienceViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: Text,
}).strict();
export type ProductExperienceViewport = z.infer<typeof ProductExperienceViewportSchema>;

export const EvidenceFileBindingSchema = z.object({ path: Text, sha256: Sha256 }).strict();

export const ProductExperienceFeatureSchema = z.object({
  id: Text,
  /** Exact upstream acceptance checks represented by this product case. */
  sourceCheckIds: z.array(Text).min(1),
  objectType: Text,
  stateBranch: Text,
  playerAction: Text,
  visibleSignal: Text,
  naturalTrigger: Text,
  expectedEventOrder: z.array(Text).min(2),
  requiredViewports: z.array(ProductExperienceViewportSchema).min(1),
  negativeAssertions: z.array(Text).min(1),
  sourceEvidence: z.array(Text).min(1),
  blockingIf: z.array(Text).min(1),
}).strict().superRefine((feature, context) => {
  if (new Set(feature.sourceCheckIds).size !== feature.sourceCheckIds.length) {
    context.addIssue({ code: 'custom', path: ['sourceCheckIds'], message: 'source check ids must be unique' });
  }
  const viewports = feature.requiredViewports.map((viewport) => `${viewport.width}x${viewport.height}:${viewport.label}`);
  if (new Set(viewports).size !== viewports.length) {
    context.addIssue({ code: 'custom', path: ['requiredViewports'], message: 'required viewports must be unique' });
  }
});
export type ProductExperienceFeature = z.infer<typeof ProductExperienceFeatureSchema>;

/**
 * Version 2 binds every player-visible promise to one run, workspace,
 * upstream artifact, runtime entrypoint, exact object/state branch and phone
 * viewport. Version 1 was intentionally retired because prose-only contracts
 * allowed unrelated clicks and screenshots to satisfy every feature.
 */
export const ProductExperienceContractSchema = z.object({
  schemaVersion: z.literal(2),
  artifactType: z.literal('product-experience-contract'),
  targetGame: Text,
  targetRunId: Text,
  targetWorkspace: Text,
  runtime: z.enum(['web-lite', 'cocos-3d']),
  runtimeEntrypoints: z.array(Text).min(1),
  sourceArtifact: z.object({
    kind: z.enum(['experience-contract', 'reference-fidelity']),
    path: Text,
    sha256: Sha256,
  }).strict(),
  features: z.array(ProductExperienceFeatureSchema).min(1),
}).strict().superRefine((contract, context) => {
  const ids = contract.features.map((feature) => feature.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['features'], message: 'feature ids must be unique' });
  if (new Set(contract.runtimeEntrypoints).size !== contract.runtimeEntrypoints.length) context.addIssue({ code: 'custom', path: ['runtimeEntrypoints'], message: 'runtime entrypoints must be unique' });
});
export type ProductExperienceContract = z.infer<typeof ProductExperienceContractSchema>;

export const PerceptualQaCaseResultSchema = z.object({
  featureId: Text,
  sourceCheckIds: z.array(Text).min(1),
  objectType: Text,
  stateBranch: Text,
  viewport: ProductExperienceViewportSchema,
  playerVisible: z.boolean(),
  naturalTriggerVerified: z.boolean(),
  eventOrderVerified: z.boolean(),
  negativeAssertionsPassed: z.boolean(),
  perceptualPassed: z.boolean(),
  observedSignal: Text,
  observedEventOrder: z.array(Text),
  screenshots: z.array(EvidenceFileBindingSchema),
  trace: EvidenceFileBindingSchema.optional(),
  evidence: z.array(Text).min(1),
  notes: z.array(Text).default([]),
}).strict();
export type PerceptualQaCaseResult = z.infer<typeof PerceptualQaCaseResultSchema>;

export const PerceptualQaReportSchema = z.object({
  schemaVersion: z.literal(2),
  artifactType: z.literal('perceptual-qa-report'),
  targetGame: Text,
  targetRunId: Text,
  targetWorkspace: Text,
  runtimeEntrypoints: z.array(Text).min(1),
  contractHash: Sha256,
  buildHash: Sha256,
  runtime: z.enum(['web-lite', 'cocos-3d']),
  reviewer: z.enum(['DeterministicCapture', 'QAAgent', 'HumanReviewer']),
  authorIndependent: z.boolean(),
  passed: z.boolean(),
  blockers: z.array(Text),
  cases: z.array(PerceptualQaCaseResultSchema).min(1),
  checkedAt: z.string().datetime(),
}).strict().superRefine((report, context) => {
  const caseIds = report.cases.map((item) => `${item.featureId}@${item.viewport.width}x${item.viewport.height}:${item.viewport.label}`);
  if (new Set(caseIds).size !== caseIds.length) context.addIssue({ code: 'custom', path: ['cases'], message: 'perceptual cases must be unique by feature and viewport' });
  if (report.passed !== (report.blockers.length === 0)) context.addIssue({ code: 'custom', path: ['passed'], message: 'report status must match blockers' });
  if (!report.passed) return;
  if (report.reviewer === 'DeterministicCapture' || !report.authorIndependent) {
    context.addIssue({ code: 'custom', path: ['reviewer'], message: 'passing perceptual QA requires an independent QA or human reviewer; deterministic capture cannot self-approve' });
  }
  report.cases.forEach((item, index) => {
    if (!item.playerVisible) context.addIssue({ code: 'custom', path: ['cases', index, 'playerVisible'], message: 'passing perceptual QA requires player-visible evidence' });
    if (!item.naturalTriggerVerified) context.addIssue({ code: 'custom', path: ['cases', index, 'naturalTriggerVerified'], message: 'passing perceptual QA requires natural-trigger verification' });
    if (!item.eventOrderVerified) context.addIssue({ code: 'custom', path: ['cases', index, 'eventOrderVerified'], message: 'passing perceptual QA requires event-order verification' });
    if (!item.negativeAssertionsPassed) context.addIssue({ code: 'custom', path: ['cases', index, 'negativeAssertionsPassed'], message: 'passing perceptual QA requires negative assertions' });
    if (!item.perceptualPassed) context.addIssue({ code: 'custom', path: ['cases', index, 'perceptualPassed'], message: 'passing perceptual QA requires pixel-level perceptual review' });
    if (item.screenshots.length === 0) context.addIssue({ code: 'custom', path: ['cases', index, 'screenshots'], message: 'passing perceptual QA requires hashed screenshots' });
    if (!item.trace) context.addIssue({ code: 'custom', path: ['cases', index, 'trace'], message: 'passing perceptual QA requires a hashed natural-input trace' });
  });
});
export type PerceptualQaReport = z.infer<typeof PerceptualQaReportSchema>;

export const PerceptualQaGateSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  contractHash: Sha256.nullable(),
  buildHash: Sha256,
  passed: z.boolean(),
  blockers: z.array(Text),
  requiredCaseIds: z.array(Text),
  checkedCaseIds: z.array(Text),
}).strict().superRefine((gate, context) => {
  if (gate.passed !== (gate.blockers.length === 0)) context.addIssue({ code: 'custom', path: ['passed'], message: 'gate status must match blockers' });
});
export type PerceptualQaGate = z.infer<typeof PerceptualQaGateSchema>;
