import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);
const SafeRelativePathSchema = NonEmptyStringSchema
  .refine((value) => !value.includes('\\') && !value.startsWith('/') && !/^[a-z]:/i.test(value), 'path must be repository-relative')
  .refine((value) => value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'), 'path contains an unsafe segment');

const ApprovedVisualStandardSchema = z.object({
  status: z.literal('HUMAN_APPROVED'),
  referenceId: z.literal('ui-f-night-market-interior'),
  referenceImage: z.literal('runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png'),
  orientation: z.literal('LANDSCAPE_16_9'),
  rendering: z.literal('MINIMAL_FLAT_2D'),
  hud: z.object({
    topLeft: z.literal('TOKEN_STATUS_ONLY'),
    topRight: z.literal('DESTINATION_AND_PAUSE'),
    center: z.literal('UNOBSTRUCTED'),
    pursuit: z.literal('VISIBLE_GUARDS_AND_THIN_LEFT_EDGE_ALERT'),
    persistentTutorial: z.literal(false),
  }).strict(),
  keep: z.tuple([
    z.literal('horizontal-lookahead'),
    z.literal('small-readable-characters'),
    z.literal('three-visible-grapple-nodes'),
    z.literal('minimal-corner-hud'),
    z.literal('covered-night-market-interior'),
    z.literal('minimal-flat-character-silhouettes'),
  ]),
  avoid: z.tuple([
    z.literal('portrait-layout'),
    z.literal('ornate-frames'),
    z.literal('scrolls-seals-calligraphy'),
    z.literal('poster-composition'),
    z.literal('dense-market-detail'),
    z.literal('open-sky-traversal'),
    z.literal('anime-detailed-protagonist'),
    z.literal('realistic-uniformed-guards'),
    z.literal('character-identity-drift'),
  ]),
  characterIdentity: z.object({
    enforcement: z.literal('STRICT_REFERENCE'),
    referenceImage: z.literal('runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png'),
    referenceSha256: z.literal('adb2a97b3f72d9233aa807a3f7833d4f2633c6e3210b570750ded32c04f2c3eb'),
    protagonist: z.tuple([
      z.literal('near-solid-blue-black-silhouette'),
      z.literal('short-vermilion-scarf'),
      z.literal('tiny-copper-waist-accent'),
    ]),
    pursuer: z.tuple([
      z.literal('near-solid-blue-black-silhouette'),
      z.literal('tiny-vermilion-headband'),
      z.literal('compact-low-running-pose'),
      z.literal('short-low-held-weapon'),
    ]),
    forbiddenDrift: z.tuple([
      z.literal('readable-face-or-skin'),
      z.literal('anime-rendering'),
      z.literal('realistic-costume-detail'),
      z.literal('spear-guard-redesign'),
    ]),
  }).strict(),
}).strict();

const CoveredNightMarketInteriorSchema = z.object({
  spatialSetting: z.literal('COVERED_NIGHT_MARKET_INTERIOR'),
  openSkyTraversal: z.literal(false),
  enclosure: z.tuple([
    z.literal('continuous-canopies'),
    z.literal('overhead-crossbeams'),
    z.literal('stall-walls'),
    z.literal('interior-columns'),
  ]),
  routes: z.object({
    high: z.tuple([
      z.literal('awning-rafters'),
      z.literal('interior-balconies'),
      z.literal('paifang-crossbeams'),
    ]),
    low: z.tuple([
      z.literal('stall-aisles'),
      z.literal('covered-alley'),
      z.literal('counter-passages'),
    ]),
  }).strict(),
  architecturalObstacles: z.tuple([
    z.object({ id: z.literal('barricade'), expression: z.literal('closing-stall-shutter'), anchoredTo: z.literal('stall-frame') }).strict(),
    z.object({ id: z.literal('roof-net'), expression: z.literal('beam-hung-cargo-net'), anchoredTo: z.literal('overhead-crossbeam') }).strict(),
    z.object({
      id: z.literal('closing-gate'),
      expression: z.literal('inner-market-gate'),
      anchoredTo: z.literal('market-exit-arch'),
      collision: z.literal('SOLID_LEAVES_LIVE_APERTURE'),
      success: z.literal('PLAYER_CROSSES_LIVE_APERTURE_ON_BEAT_3'),
      closureMotion: z.literal('HORIZONTAL_DOUBLE_LEAVES_INWARD'),
      motionReference: z.literal('FIXED_MARKET_EXIT_ARCH_WORLD_GEOMETRY'),
    }).strict(),
  ]),
}).strict();

export const FormalPrototypeFollowupConstraintsSchema = z.object({
  schemaVersion: z.literal(1),
  game: z.object({
    title: z.literal('夜市飞侠：护印突围'),
    shortTitle: z.literal('夜市飞侠'),
    subtitle: z.literal('护印突围'),
  }).strict(),
  targetWorkspace: SafeRelativePathSchema,
  openSourceResearchArtifact: SafeRelativePathSchema,
  implementationGate: z.object({
    actionExperimentRunId: NonEmptyStringSchema,
    requiredTerminalStage: z.literal('ACTION_EXPERIMENT_APPROVED'),
    selectedSlotRequired: z.literal(true),
    status: z.literal('REGISTERED_NOT_IMPLEMENTED'),
  }).strict(),
  isolatedActionExperiment: z.object({
    workspaces: z.array(SafeRelativePathSchema).length(3),
    chaseIncluded: z.literal(false),
    formalArtIncluded: z.literal(false),
  }).strict(),
  visualStandard: ApprovedVisualStandardSchema,
  environment: CoveredNightMarketInteriorSchema,
  narrative: z.object({
    protagonist: NonEmptyStringSchema,
    objective: NonEmptyStringSchema,
    pursuer: NonEmptyStringSchema,
  }).strict(),
  controls: z.object({
    hold: NonEmptyStringSchema,
    release: NonEmptyStringSchema,
    attackButtonIncluded: z.literal(false),
    grappleNodes: z.array(NonEmptyStringSchema).min(4),
  }).strict(),
  criticalPath: z.array(z.object({
    order: z.number().int().min(1).max(4),
    id: z.enum(['safe-tutorial', 'first-pursuit', 'route-alternation', 'gate-climax']),
    purpose: NonEmptyStringSchema,
  }).strict()).length(4),
  routes: z.object({
    high: z.object({ surfaces: z.array(NonEmptyStringSchema).min(1), benefit: NonEmptyStringSchema, risk: NonEmptyStringSchema }).strict(),
    low: z.object({ surfaces: z.array(NonEmptyStringSchema).min(1), benefit: NonEmptyStringSchema, risk: NonEmptyStringSchema }).strict(),
  }).strict(),
  terrain: z.tuple([
    z.object({
      kind: z.literal('布棚'),
      behavior: NonEmptyStringSchema,
      teachingOrder: z.literal('SAFE_THEN_CHASE'),
    }).strict(),
    z.object({
      kind: z.literal('竹架'),
      behavior: NonEmptyStringSchema,
      teachingOrder: z.literal('SAFE_THEN_CHASE'),
    }).strict(),
    z.object({
      kind: z.literal('窄巷'),
      behavior: NonEmptyStringSchema,
      teachingOrder: z.literal('SAFE_THEN_CHASE'),
    }).strict(),
  ]),
  chase: z.object({
    visiblePursuerRequired: z.literal(true),
    abstractMeterPrimary: z.literal(false),
    phoneLeftEdgePresence: NonEmptyStringSchema,
    closesDistanceOn: z.array(NonEmptyStringSchema).min(3),
    opensDistanceOn: z.array(NonEmptyStringSchema).min(2),
    events: z.array(z.object({
      id: z.enum(['barricade', 'roof-net', 'closing-gate']),
      test: NonEmptyStringSchema,
      allowedInput: z.literal('HOLD_RELEASE_ONLY'),
    }).strict()).length(3),
  }).strict(),
  originality: z.object({
    copyThirdPartyExpression: z.literal(false),
    copyThirdPartyBalanceValues: z.literal(false),
  }).strict(),
}).strict().superRefine((value, context) => {
  const expectedWorkspaces = ['workspace/action-a', 'workspace/action-b', 'workspace/action-c'];
  if (JSON.stringify(value.isolatedActionExperiment.workspaces) !== JSON.stringify(expectedWorkspaces)) {
    context.addIssue({ code: 'custom', message: 'action experiment workspaces must remain isolated A/B/C slots' });
  }
  const expectedPath = ['safe-tutorial', 'first-pursuit', 'route-alternation', 'gate-climax'];
  if (value.criticalPath.some((segment, index) => segment.order !== index + 1 || segment.id !== expectedPath[index])) {
    context.addIssue({ code: 'custom', message: 'criticalPath must preserve the required four-stage order' });
  }
  if (new Set(value.controls.grappleNodes).size !== value.controls.grappleNodes.length) {
    context.addIssue({ code: 'custom', message: 'grappleNodes must be unique' });
  }
  if (new Set(value.chase.events.map(({ id }) => id)).size !== 3) {
    context.addIssue({ code: 'custom', message: 'chase events must contain barricade, roof-net, and closing-gate exactly once' });
  }
});
export type FormalPrototypeFollowupConstraints = z.infer<typeof FormalPrototypeFollowupConstraintsSchema>;

export const FormalPrototypeBuildReportSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('BUILT'),
  game: z.literal('夜市飞侠：护印突围'),
  workspace: SafeRelativePathSchema,
  selectedActionSlot: z.enum(['A', 'B', 'C']),
  author: z.literal('BuilderAgent'),
  codexThreadId: NonEmptyStringSchema.nullable(),
  webBuild: SafeRelativePathSchema,
  files: z.array(SafeRelativePathSchema).min(1),
  verification: z.array(NonEmptyStringSchema).min(4),
  builtAt: z.string().datetime({ offset: true }),
}).strict();
export type FormalPrototypeBuildReport = z.infer<typeof FormalPrototypeBuildReportSchema>;
