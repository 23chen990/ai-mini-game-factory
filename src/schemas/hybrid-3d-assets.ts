import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);
const HttpsUrlSchema = z.url().refine((value) => value.startsWith('https://'), 'evidence URLs must use https');
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'archiveSha256 must be a lowercase sha256 digest');
const MiniGamePlatformSchema = z.enum(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
const AllMiniGamePlatformsSchema = z.array(MiniGamePlatformSchema).length(3).superRefine((platforms, context) => {
  const required = MiniGamePlatformSchema.options;
  if (new Set(platforms).size !== required.length || required.some((platform) => !platforms.includes(platform))) {
    context.addIssue({ code: 'custom', message: 'all three mini-game targets are required' });
  }
});

const GeneratedImageUsageSchema = z.enum(['billboard', 'decal', 'ui', 'distant-backdrop']);
const ForbiddenGeneratedImageUsageSchema = z.enum(['collision-shape', 'navigation-obstacle', 'rotating-core-prop', 'animated-character']);

export const Hybrid3dAssetSourceSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  sourcePageUrl: HttpsUrlSchema,
  downloadUrl: HttpsUrlSchema,
  immutableRevision: NonEmptyStringSchema.refine(
    (value) => !['main', 'master', 'latest', 'head'].includes(value.toLowerCase()),
    'immutableRevision must name a versioned or hash-locked archive',
  ),
  version: NonEmptyStringSchema,
  archiveSha256: Sha256Schema,
  licenseSpdx: NonEmptyStringSchema,
  licenseEvidenceUrl: HttpsUrlSchema,
  embeddedLicensePath: NonEmptyStringSchema,
  selectedFilePatterns: z.array(NonEmptyStringSchema),
  targetPlatforms: AllMiniGamePlatformsSchema,
  cocosImport: z.object({
    formats: z.array(z.enum(['fbx', 'gltf', 'glb', 'png', 'webp'])).min(1),
    unitScale: z.number().positive(),
    materialPolicy: NonEmptyStringSchema,
  }).strict(),
  attributionDuties: z.array(NonEmptyStringSchema),
  redistributionPolicy: NonEmptyStringSchema,
  maintenanceRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  securityRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  decision: z.enum(['APPROVE', 'REJECT']),
  approvedUses: z.array(z.enum(['gameplay-geometry', 'animated-character', 'visual-reference'])),
  rationale: NonEmptyStringSchema,
}).strict().superRefine((source, context) => {
  if (source.decision === 'APPROVE' && source.approvedUses.length === 0) {
    context.addIssue({ code: 'custom', path: ['approvedUses'], message: 'APPROVE requires at least one approved use' });
  }
  if (source.decision === 'REJECT' && source.approvedUses.length > 0) {
    context.addIssue({ code: 'custom', path: ['approvedUses'], message: 'REJECT cannot carry approved uses' });
  }
});
export type Hybrid3dAssetSource = z.infer<typeof Hybrid3dAssetSourceSchema>;

export const Hybrid3dAssetResearchArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  researchId: NonEmptyStringSchema,
  targetGame: NonEmptyStringSchema,
  targetWorkspace: NonEmptyStringSchema,
  researchedAt: z.string().datetime({ offset: true }),
  visualStrategy: z.object({
    camera: z.literal('fixed-three-quarter'),
    gameplayGeometry: z.literal('true-3d'),
    generatedImageUsage: z.array(GeneratedImageUsageSchema).min(1),
    forbiddenGeneratedImageUsage: z.array(ForbiddenGeneratedImageUsageSchema).min(1),
    alphaValidation: z.object({
      required: z.literal(true),
      meaningfulAlpha: z.literal(true),
      compositeBackgrounds: z.tuple([z.literal('light'), z.literal('dark'), z.literal('saturated')]),
    }).strict(),
  }).strict(),
  sources: z.array(Hybrid3dAssetSourceSchema),
  selectedSourceIds: z.array(NonEmptyStringSchema),
  generatedCutouts: z.array(z.object({
    id: NonEmptyStringSchema,
    usage: GeneratedImageUsageSchema,
    view: z.literal('three-quarter-isometric'),
    background: z.literal('transparent'),
    alphaRequired: z.literal(true),
    purpose: NonEmptyStringSchema,
  }).strict()),
  architectureDecision: NonEmptyStringSchema,
}).strict().superRefine((artifact, context) => {
  const sourceIds = artifact.sources.map(({ id }) => id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({ code: 'custom', path: ['sources'], message: 'source ids must be unique' });
  }
  const approved = artifact.sources.filter(({ decision }) => decision === 'APPROVE').map(({ id }) => id).sort();
  const selected = [...artifact.selectedSourceIds].sort();
  if (JSON.stringify(approved) !== JSON.stringify(selected)) {
    context.addIssue({ code: 'custom', path: ['selectedSourceIds'], message: 'selectedSourceIds must exactly match approved sources' });
  }
});
export type Hybrid3dAssetResearchArtifact = z.infer<typeof Hybrid3dAssetResearchArtifactSchema>;
