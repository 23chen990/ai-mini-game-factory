import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const ArtQualityAssetSchema = z.object({
  id: Text,
  kind: z.enum(['character', 'product', 'background', 'ui', 'marketing']),
  path: Text,
  format: z.enum(['png', 'webp', 'svg', 'other']),
  sha256: Sha256,
  bytes: z.number().int().nonnegative(),
  provenance: z.enum(['generated', 'licensed', 'original', 'procedural-placeholder']),
  licenseEvidence: Text.nullable(),
  alpha: z.object({ required: z.boolean(), supported: z.boolean(), meaningful: z.boolean(), minimum: z.number().int().min(0).max(255), maximum: z.number().int().min(0).max(255), transparentPixels: z.number().int().nonnegative(), translucentPixels: z.number().int().nonnegative(), opaquePixels: z.number().int().nonnegative() }).strict(),
  composites: z.object({ light: Text, dark: Text, saturated: Text }).strict(),
  checks: z.object({ exists: z.boolean(), hashMatches: z.boolean(), noBakedGrid: z.boolean(), noMatte: z.boolean(), noHalo: z.boolean(), noEdgeFringing: z.boolean(), programmaticGeometryOnly: z.boolean() }).strict(),
  issues: z.array(Text),
  passed: z.boolean(),
}).strict();
export type ArtQualityAsset = z.infer<typeof ArtQualityAssetSchema>;

export const ArtQualityAuditSchema = z.object({
  schemaVersion: z.literal(1),
  targetGame: Text,
  assetRoot: Text,
  strict: z.boolean(),
  assets: z.array(ArtQualityAssetSchema),
  blockers: z.array(Text),
  passed: z.boolean(),
  checkedAt: z.string().datetime(),
}).strict().superRefine((audit, context) => {
  const ids = audit.assets.map((asset) => asset.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['assets'], message: 'asset ids must be unique' });
  if (audit.passed !== (audit.blockers.length === 0 && audit.assets.every((asset) => asset.passed))) context.addIssue({ code: 'custom', path: ['passed'], message: 'passed must be derived from asset checks and blockers' });
});
export type ArtQualityAudit = z.infer<typeof ArtQualityAuditSchema>;
