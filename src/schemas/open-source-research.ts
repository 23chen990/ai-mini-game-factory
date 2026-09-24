import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);
const EvidenceUrlSchema = z.string().url().refine((value) => value.startsWith('https://'), 'evidence URLs must use https');
const PlatformVerdictSchema = z.object({
  verdict: z.enum(['APPROVED', 'CONDITIONAL', 'REJECTED']),
  evidence: NonEmptyStringSchema,
}).strict();

export const OpenSourceCandidateSchema = z.object({
  name: NonEmptyStringSchema,
  repositoryUrl: EvidenceUrlSchema,
  immutableRevision: NonEmptyStringSchema.refine(
    (value) => !['main', 'master', 'latest', 'head'].includes(value.toLowerCase()),
    'immutableRevision must be a commit, tag, release, or dated archive marker',
  ),
  version: NonEmptyStringSchema,
  directLicenseEvidence: EvidenceUrlSchema,
  licenseSpdx: NonEmptyStringSchema,
  targetPlatformFit: z.object({
    webLite: PlatformVerdictSchema,
    wechatMiniGame: PlatformVerdictSchema,
    douyinMiniGame: PlatformVerdictSchema,
    tapTapMiniGame: PlatformVerdictSchema,
  }).strict(),
  maintenanceRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  securityRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  attributionDuties: z.array(NonEmptyStringSchema).min(1),
  decision: z.enum(['REUSE', 'REJECT']),
  approvedScope: z.array(NonEmptyStringSchema),
  rationale: NonEmptyStringSchema,
}).strict().superRefine((candidate, context) => {
  if (candidate.decision === 'REUSE' && candidate.approvedScope.length === 0) {
    context.addIssue({ code: 'custom', message: 'REUSE requires at least one explicitly approved scope' });
  }
  if (candidate.decision === 'REJECT' && candidate.approvedScope.length > 0) {
    context.addIssue({ code: 'custom', message: 'REJECT cannot carry an approved scope' });
  }
});
export type OpenSourceCandidate = z.infer<typeof OpenSourceCandidateSchema>;

export const OpenSourceResearchArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  researchId: NonEmptyStringSchema,
  targetGame: NonEmptyStringSchema,
  targetWorkspace: NonEmptyStringSchema,
  researchedAt: z.string().datetime({ offset: true }),
  candidates: z.array(OpenSourceCandidateSchema).min(1),
  conclusion: z.object({
    approvedCandidateNames: z.array(NonEmptyStringSchema),
    rejectedCandidateNames: z.array(NonEmptyStringSchema),
    noSuitablePlatformAdapter: z.boolean(),
    architectureDecision: NonEmptyStringSchema,
  }).strict(),
}).strict().superRefine((artifact, context) => {
  const candidateNames = artifact.candidates.map(({ name }) => name);
  if (new Set(candidateNames).size !== candidateNames.length) {
    context.addIssue({ code: 'custom', message: 'candidate names must be unique' });
  }
  const expectedApproved = artifact.candidates.filter(({ decision }) => decision === 'REUSE').map(({ name }) => name).sort();
  const expectedRejected = artifact.candidates.filter(({ decision }) => decision === 'REJECT').map(({ name }) => name).sort();
  const actualApproved = [...artifact.conclusion.approvedCandidateNames].sort();
  const actualRejected = [...artifact.conclusion.rejectedCandidateNames].sort();
  if (JSON.stringify(actualApproved) !== JSON.stringify(expectedApproved)) {
    context.addIssue({ code: 'custom', message: 'approvedCandidateNames must exactly match REUSE decisions' });
  }
  if (JSON.stringify(actualRejected) !== JSON.stringify(expectedRejected)) {
    context.addIssue({ code: 'custom', message: 'rejectedCandidateNames must exactly match REJECT decisions' });
  }
});
export type OpenSourceResearchArtifact = z.infer<typeof OpenSourceResearchArtifactSchema>;
