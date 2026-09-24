import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);

const AlphaMetricsSchema = z.object({
  minimum: z.number().int().min(0).max(255),
  maximum: z.number().int().min(0).max(255),
  transparentPixels: z.number().int().nonnegative(),
  translucentPixels: z.number().int().nonnegative(),
  opaquePixels: z.number().int().nonnegative(),
}).strict().superRefine((alpha, context) => {
  if (alpha.minimum >= 255 || alpha.transparentPixels === 0 || alpha.translucentPixels + alpha.opaquePixels === 0) {
    context.addIssue({ code: 'custom', message: 'asset must contain meaningful alpha with both transparent exterior and visible subject pixels' });
  }
});

export const GeneratedAlphaValidationArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  targetGame: NonEmptyStringSchema,
  validatedAt: z.string().datetime({ offset: true }),
  assets: z.array(z.object({
    id: NonEmptyStringSchema,
    path: NonEmptyStringSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alpha: AlphaMetricsSchema,
    composites: z.object({
      light: NonEmptyStringSchema,
      dark: NonEmptyStringSchema,
      saturated: NonEmptyStringSchema,
    }).strict(),
    inspection: z.object({
      bakedGrid: z.literal(false),
      matteColor: z.literal(false),
      halo: z.literal(false),
      edgeFringing: z.literal(false),
      passed: z.literal(true),
    }).strict(),
  }).strict()).min(1),
}).strict().superRefine((artifact, context) => {
  const ids = artifact.assets.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['assets'], message: 'asset ids must be unique' });
});
export type GeneratedAlphaValidationArtifact = z.infer<typeof GeneratedAlphaValidationArtifactSchema>;
