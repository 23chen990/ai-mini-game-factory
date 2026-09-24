import { z } from 'zod';

const DurationRangeSchema = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
]).refine(([minimum, maximum]) => minimum <= maximum, 'animation duration range must be ordered');

export const UiAnimationStandardSchema = z.object({
  schemaVersion: z.literal(1),
  strategy: z.literal('key-poses-plus-runtime-motion'),
  assetPolicy: z.object({
    independentAiInbetweenFrames: z.literal(false),
    aiKeyPoseLimit: z.number().int().min(2).max(4),
    preferredSequenceLayout: z.literal('single-aligned-sprite-sheet'),
    lockedFrameProperties: z.tuple([
      z.literal('canvas'),
      z.literal('camera'),
      z.literal('scale'),
      z.literal('pivot'),
      z.literal('palette'),
      z.literal('lighting'),
      z.literal('background-mode'),
    ]),
    trimFramesIndependently: z.literal(false),
    requireMeaningfulAlphaForTransparentAssets: z.literal(true),
  }),
  runtimePolicy: z.object({
    clock: z.literal('time-based-requestAnimationFrame'),
    preload: z.literal('textures-and-atlases-before-first-use'),
    swapImageUrlsDuringPlayback: z.literal(false),
    interpolateWith: z.tuple([
      z.literal('transform'),
      z.literal('opacity'),
      z.literal('mask'),
    ]),
    useSpriteFramesFor: z.tuple([
      z.literal('silhouette-change'),
      z.literal('deformation'),
    ]),
    perFrameDurations: z.literal(true),
  }),
  motionTokensMs: z.object({
    press: DurationRangeSchema,
    microFeedback: DurationRangeSchema,
    panelTransition: DurationRangeSchema,
    ambientLoop: DurationRangeSchema,
  }),
  easing: z.object({
    enter: z.literal('ease-out'),
    exit: z.literal('ease-in'),
    emphasis: z.literal('back-out-subtle'),
    allowLinearForUi: z.literal(false),
  }),
  accessibility: z.object({
    respectPrefersReducedMotion: z.literal(true),
    reducedMotionFallback: z.literal('short-crossfade-or-immediate-state'),
  }),
  verification: z.object({
    refreshRatesHz: z.tuple([z.literal(30), z.literal(60), z.literal(120)]),
    requireSameFinalStateAcrossRefreshRates: z.literal(true),
    requirePreloadTest: z.literal(true),
    requireReducedMotionTest: z.literal(true),
    visualChecks: z.tuple([
      z.literal('identity-stability'),
      z.literal('pivot-stability'),
      z.literal('no-background-jitter'),
      z.literal('no-edge-halo'),
    ]),
  }),
});

export type UiAnimationStandard = z.infer<typeof UiAnimationStandardSchema>;
