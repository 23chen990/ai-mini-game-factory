import { sha256Text } from './files.js';
import { ArtifactMetadataSchema, type ArtifactMetadata } from '../schemas/artifact-metadata.js';

export { ArtifactMetadataSchema } from '../schemas/artifact-metadata.js';

export function buildArtifactMetadata(input: {
  runId: string;
  path: string;
  producerStage: string;
  inputHashes: Record<string, string>;
  outputHash: string;
  model: string;
  reasoning: ArtifactMetadata['reasoning'];
  approvalStatus?: ArtifactMetadata['approval']['status'];
  artifactId?: string;
  artifactType?: ArtifactMetadata['artifactType'];
  dependsOn?: string[];
  supersedes?: string[];
  promptVersion?: string;
  policyVersion?: string;
  environmentFingerprint?: string;
  dataClassification?: ArtifactMetadata['dataClassification'];
  retentionPolicy?: ArtifactMetadata['retentionPolicy'];
  sourceRefs?: string[];
  createdByRole?: string;
}): ArtifactMetadata {
  const now = new Date().toISOString();
  const artifactId = input.artifactId ?? sha256Text(`${input.runId}\u0000${input.path}\u0000${input.outputHash}`);
  return ArtifactMetadataSchema.parse({
    schemaVersion: 1,
    runId: input.runId,
    path: input.path,
    artifactId,
    artifactType: input.artifactType ?? 'generic',
    producerStage: input.producerStage,
    inputHashes: input.inputHashes,
    inputArtifactHashes: input.inputHashes,
    dependsOn: input.dependsOn ?? Object.keys(input.inputHashes),
    supersedes: input.supersedes ?? [],
    outputHash: input.outputHash,
    model: input.model,
    reasoning: input.reasoning,
    promptVersion: input.promptVersion ?? 'unspecified',
    policyVersion: input.policyVersion ?? 'unspecified',
    environmentFingerprint: input.environmentFingerprint,
    dataClassification: input.dataClassification ?? 'internal',
    retentionPolicy: input.retentionPolicy ?? 'run-lifetime',
    sourceRefs: input.sourceRefs ?? [],
    createdByRole: input.createdByRole,
    status: 'ACTIVE',
    invalidatedBy: [],
    approval: { status: input.approvalStatus ?? 'PENDING' },
    createdAt: now,
    updatedAt: now,
  });
}

export function approveArtifactMetadata(value: unknown, approvedBy: string, note?: string): ArtifactMetadata {
  const metadata = ArtifactMetadataSchema.parse(value);
  const now = new Date().toISOString();
  return ArtifactMetadataSchema.parse({ ...metadata, approval: { status: 'APPROVED', approvedBy, approvedAt: now, note }, updatedAt: now });
}

export function invalidateArtifactMetadata(value: unknown, dependencyPath: string): ArtifactMetadata {
  const metadata = ArtifactMetadataSchema.parse(value);
  const now = new Date().toISOString();
  return ArtifactMetadataSchema.parse({ ...metadata, status: 'INVALIDATED', invalidatedBy: [...new Set([...metadata.invalidatedBy, dependencyPath])], updatedAt: now });
}
