import { z } from 'zod';

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const Text = z.string().trim().min(1);
const Finite = z.number().finite();
const PositiveFinite = Finite.positive();

export const REFERENCE_LEVEL_LAYOUT_SCHEMA_VERSION = 1 as const;
export const REFERENCE_LEVEL_LAYOUT_ARTIFACT = 'reference-level-layout' as const;
export const CUT_STACK_TEMPLATE_ID = 'cut-stack-dodge-v1' as const;
export const CUT_STACK_RUNTIME = 'web-lite' as const;
export const CUT_STACK_OBJECT_ROLES = ['cuttable', 'support', 'hazard', 'finish'] as const;
export const CutStackObjectRoleSchema = z.enum(CUT_STACK_OBJECT_ROLES);

const CourseObjectSchema = z.object({
  id: Text,
  role: CutStackObjectRoleSchema,
  x: Finite,
  y: Finite,
  width: PositiveFinite,
  height: PositiveFinite,
}).strict();

const PlayerSchema = z.object({
  x: Finite,
  y: Finite,
  radius: PositiveFinite,
  angle: Finite,
}).strict();

/**
 * The numeric course contract is intentionally independent from the template
 * implementation.  Builders author these values; the browser consumer only
 * receives the validated result and never derives them from observations.
 */
export const CutStackLevelConfigSchema = z.object({
  fixedStepSeconds: PositiveFinite.max(1),
  gravity: Finite.min(0),
  tapImpulse: Finite,
  forwardSpeed: PositiveFinite,
  angularImpulse: Finite,
  failY: Finite,
  finishX: PositiveFinite,
  player: PlayerSchema,
  objects: z.array(CourseObjectSchema).min(1),
}).strict().superRefine((level, context) => {
  const ids = new Set<string>();
  for (const [index, object] of level.objects.entries()) {
    if (ids.has(object.id)) context.addIssue({ code: 'custom', path: ['objects', index, 'id'], message: `duplicate course object id ${object.id}` });
    ids.add(object.id);
  }
  if (level.finishX <= level.player.x) context.addIssue({ code: 'custom', path: ['finishX'], message: 'finishX must be ahead of the player spawn' });
  if (level.failY <= level.player.y + level.player.radius) context.addIssue({ code: 'custom', path: ['failY'], message: 'failY must be below the player spawn' });
});

/** Builder-authored, run-bound layout consumed by the cut-stack mother template. */
export const ReferenceLevelLayoutSchema = z.object({
  schemaVersion: z.literal(REFERENCE_LEVEL_LAYOUT_SCHEMA_VERSION),
  artifactType: z.literal(REFERENCE_LEVEL_LAYOUT_ARTIFACT),
  template: z.literal(CUT_STACK_TEMPLATE_ID),
  runtime: z.literal(CUT_STACK_RUNTIME),
  sourceRuntimeDataHash: Sha256.nullable(),
  playerObjectId: Text,
  level: CutStackLevelConfigSchema,
}).strict();

export type CutStackLevelConfigData = z.infer<typeof CutStackLevelConfigSchema>;
export type ReferenceLevelLayout = z.infer<typeof ReferenceLevelLayoutSchema>;
export type CutStackCourseObject = z.infer<typeof CourseObjectSchema>;

export const ReferenceLevelSaveIdentitySchema = z.object({
  runtimeDataHash: Sha256.nullable(),
  layoutHash: Sha256,
  playerObjectId: Text,
  objectIds: z.array(Text).min(1),
}).strict();
export type ReferenceLevelSaveIdentity = z.infer<typeof ReferenceLevelSaveIdentitySchema>;
