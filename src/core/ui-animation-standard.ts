import { UiAnimationStandardSchema } from '../schemas/ui-animation-standard.js';

export const UI_ANIMATION_STANDARD = UiAnimationStandardSchema.parse({
  schemaVersion: 1,
  strategy: 'key-poses-plus-runtime-motion',
  assetPolicy: {
    independentAiInbetweenFrames: false,
    aiKeyPoseLimit: 4,
    preferredSequenceLayout: 'single-aligned-sprite-sheet',
    lockedFrameProperties: ['canvas', 'camera', 'scale', 'pivot', 'palette', 'lighting', 'background-mode'],
    trimFramesIndependently: false,
    requireMeaningfulAlphaForTransparentAssets: true,
  },
  runtimePolicy: {
    clock: 'time-based-requestAnimationFrame',
    preload: 'textures-and-atlases-before-first-use',
    swapImageUrlsDuringPlayback: false,
    interpolateWith: ['transform', 'opacity', 'mask'],
    useSpriteFramesFor: ['silhouette-change', 'deformation'],
    perFrameDurations: true,
  },
  motionTokensMs: {
    press: [80, 120],
    microFeedback: [120, 180],
    panelTransition: [180, 260],
    ambientLoop: [600, 1600],
  },
  easing: {
    enter: 'ease-out',
    exit: 'ease-in',
    emphasis: 'back-out-subtle',
    allowLinearForUi: false,
  },
  accessibility: {
    respectPrefersReducedMotion: true,
    reducedMotionFallback: 'short-crossfade-or-immediate-state',
  },
  verification: {
    refreshRatesHz: [30, 60, 120],
    requireSameFinalStateAcrossRefreshRates: true,
    requirePreloadTest: true,
    requireReducedMotionTest: true,
    visualChecks: ['identity-stability', 'pivot-stability', 'no-background-jitter', 'no-edge-halo'],
  },
});

export function builderUiAnimationInstruction() {
  return `Apply uiAnimationStandard to every HUD, menu, overlay, icon, and state transition. Never generate independent AI images for every in-between frame. When image poses are necessary, keep the same canvas, camera, scale, pivot, palette, lighting, and background mode, and prefer one aligned sprite sheet with two to four key poses. Use runtime transform, opacity, or mask interpolation for UI motion; reserve frame animation for real silhouette changes or deformation. Drive playback by elapsed time with requestAnimationFrame, use per-frame durations, and never advance one image per render tick. Preload textures and atlases before first visibility; never swap image URLs during playback. Use the supplied duration and easing tokens, respect prefers-reduced-motion, and keep interaction available while feedback settles. Add focused tests proving the same semantic final state at different refresh rates, preload-before-playback behavior, and the reduced-motion fallback.`;
}

export function builderInputWithUiAnimationStandard<T extends object>(input: T) {
  return { ...input, uiAnimationStandard: UI_ANIMATION_STANDARD };
}
