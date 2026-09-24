import { createHash } from 'node:crypto';
import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

const ArtifactMetadataBaseSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text,
  path: Text,
  artifactId: Sha256,
  artifactType: z.enum(['generic', 'research', 'design', 'build', 'qa', 'evidence', 'asset', 'release', 'governance']),
  producerStage: Text,
  inputHashes: z.record(Text, Sha256),
  /** Alias used by handoff packets; kept in sync with inputHashes. */
  inputArtifactHashes: z.record(Text, Sha256),
  dependsOn: z.array(Text),
  supersedes: z.array(Text),
  outputHash: Sha256,
  model: Text,
  reasoning: z.enum(['low', 'medium', 'high', 'max']),
  promptVersion: Text,
  policyVersion: Text,
  environmentFingerprint: Text.optional(),
  dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
  retentionPolicy: z.enum(['ephemeral', 'run-lifetime', 'release-lifetime', 'indefinite']),
  sourceRefs: z.array(Text),
  createdByRole: Text.optional(),
  status: z.enum(['ACTIVE', 'INVALIDATED']),
  invalidatedBy: z.array(Text),
  approval: z.object({ status: z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']), approvedBy: z.string().trim().optional(), approvedAt: z.string().datetime().optional(), note: z.string().trim().optional() }).strict(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

/** Normalize legacy metadata while making provenance fields mandatory for new writes. */
export const ArtifactMetadataSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const inputHashes = (record.inputHashes && typeof record.inputHashes === 'object') ? record.inputHashes : {};
  const outputHash = typeof record.outputHash === 'string' ? record.outputHash : '';
  const runId = typeof record.runId === 'string' ? record.runId : '';
  const artifactPath = typeof record.path === 'string' ? record.path : '';
  const artifactId = typeof record.artifactId === 'string' ? record.artifactId : undefined;
  return {
    ...record,
    artifactId: artifactId ?? sha256Identity(runId, artifactPath, outputHash),
    artifactType: record.artifactType ?? 'generic',
    inputArtifactHashes: record.inputArtifactHashes ?? inputHashes,
    dependsOn: record.dependsOn ?? Object.keys(inputHashes as Record<string, unknown>),
    supersedes: record.supersedes ?? [],
    promptVersion: record.promptVersion ?? 'unspecified',
    policyVersion: record.policyVersion ?? 'unspecified',
    dataClassification: record.dataClassification ?? 'internal',
    retentionPolicy: record.retentionPolicy ?? 'run-lifetime',
    sourceRefs: record.sourceRefs ?? [],
  };
}, ArtifactMetadataBaseSchema).superRefine((metadata, context) => {
  if (JSON.stringify(metadata.inputHashes) !== JSON.stringify(metadata.inputArtifactHashes)) context.addIssue({ code: 'custom', path: ['inputArtifactHashes'], message: 'inputArtifactHashes must mirror inputHashes' });
  if (metadata.approval.status === 'APPROVED' && (!metadata.approval.approvedBy || !metadata.approval.approvedAt)) context.addIssue({ code: 'custom', path: ['approval'], message: 'approved artifacts require signer and timestamp' });
  if (metadata.status === 'INVALIDATED' && metadata.invalidatedBy.length === 0) context.addIssue({ code: 'custom', path: ['invalidatedBy'], message: 'invalidated artifacts require a dependency path' });
});
export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

function sha256Identity(runId: string, artifactPath: string, outputHash: string): string {
  return createHash('sha256').update(`${runId}\u0000${artifactPath}\u0000${outputHash}`).digest('hex');
}
