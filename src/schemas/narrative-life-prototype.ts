import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);
const CompactStatIdSchema = z.enum(['economy', 'skill', 'health', 'bonds']);
const UniqueStringsSchema = z.array(NonEmptyStringSchema).superRefine((values, context) => {
  if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', message: 'values must be unique' });
});
const StatEffectsSchema = z.record(NonEmptyStringSchema, z.number().int()).refine(
  (effects) => Object.keys(effects).length > 0 && Object.values(effects).some((value) => value !== 0),
  'effects must contain at least one non-zero immediate effect',
);
const OptionalStatEffectsSchema = z.record(NonEmptyStringSchema, z.number().int()).default({});

const SourceSchema = z.object({
  id: NonEmptyStringSchema,
  kind: z.enum(['historical', 'competitor', 'platform-policy', 'open-source']),
  title: NonEmptyStringSchema,
  url: z.string().url(),
  accessedAt: z.string().datetime({ offset: true }),
}).strict();

const StatSchema = z.object({
  id: CompactStatIdSchema,
  labelTextId: NonEmptyStringSchema,
  initial: z.number().int(),
  min: z.number().int(),
  max: z.number().int(),
}).strict().refine(({ initial, min, max }) => min <= initial && initial <= max, 'initial stat value must be within min and max');

const KeepsakeSchema = z.object({
  id: NonEmptyStringSchema,
  nameTextId: NonEmptyStringSchema,
  descriptionTextId: NonEmptyStringSchema,
  effects: StatEffectsSchema,
  setFlags: UniqueStringsSchema.min(1),
}).strict();

const DelayedEchoSchema = z.discriminatedUnion('trigger', [
  z.object({
    trigger: z.literal('after_events'),
    afterEvents: z.number().int().positive(),
    textId: NonEmptyStringSchema,
    effects: OptionalStatEffectsSchema,
    setFlags: UniqueStringsSchema.default([]),
  }).strict(),
  z.object({
    trigger: z.literal('summary'),
    afterEvents: z.undefined().optional(),
    textId: NonEmptyStringSchema,
    effects: OptionalStatEffectsSchema,
    setFlags: UniqueStringsSchema.default([]),
  }).strict(),
]);

const StateRequirementsSchema = z.object({
  allFlags: UniqueStringsSchema.optional(),
  anyFlags: UniqueStringsSchema.optional(),
  noneFlags: UniqueStringsSchema.optional(),
  stats: z.record(NonEmptyStringSchema, z.object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  }).strict().refine(({ min, max }) => min === undefined || max === undefined || min <= max, 'state requirement minimum must not exceed maximum')).optional(),
}).strict().refine((requirements) => {
  return Object.keys(requirements.stats ?? {}).length > 0
    || (requirements.allFlags?.length ?? 0) > 0
    || (requirements.anyFlags?.length ?? 0) > 0
    || (requirements.noneFlags?.length ?? 0) > 0;
}, 'state requirements must contain at least one stat or flag condition');

const ChoiceSchema = z.object({
  id: NonEmptyStringSchema,
  labelTextId: NonEmptyStringSchema,
  resultTextId: NonEmptyStringSchema,
  immediateEffects: StatEffectsSchema,
  setFlags: UniqueStringsSchema.default([]),
  requirements: StateRequirementsSchema.optional(),
  unavailableTextId: NonEmptyStringSchema.optional(),
  delayedEcho: DelayedEchoSchema,
}).strict().superRefine((choice, context) => {
  if ((choice.requirements === undefined) !== (choice.unavailableTextId === undefined)) {
    context.addIssue({ code: 'custom', message: 'a choice with state requirements must provide a short unavailable reason' });
  }
});

const EventSchema = z.object({
  id: NonEmptyStringSchema,
  chapterId: NonEmptyStringSchema,
  year: z.number().int(),
  titleTextId: NonEmptyStringSchema,
  bodyTextId: NonEmptyStringSchema,
  sourceIds: UniqueStringsSchema.min(1),
  choices: z.array(ChoiceSchema).length(2, 'each mobile event card must present exactly two main choices'),
}).strict();

const EndingConditionSchema = StateRequirementsSchema.or(z.object({}).strict());

const EndingSchema = z.object({
  id: NonEmptyStringSchema,
  titleTextId: NonEmptyStringSchema,
  summaryTextId: NonEmptyStringSchema,
  reflectionTextId: NonEmptyStringSchema,
  outcomeProfile: z.object({
    trajectory: z.enum(['ROOTED', 'UPWARD', 'BREAKOUT', 'RECOVERY']),
    economicAgency: z.enum(['HOUSEHOLD', 'PUBLIC_SERVICE', 'SELF_EMPLOYED', 'OWNER', 'WAGE_LEADER', 'COLLECTIVE']),
    geographicReach: z.enum(['VILLAGE', 'COUNTY', 'REGIONAL', 'CROSS_PROVINCE']),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  }).strict(),
  priority: z.number().int(),
  fallback: z.boolean(),
  conditions: EndingConditionSchema,
}).strict();

const ChapterSchema = z.object({
  id: NonEmptyStringSchema,
  titleTextId: NonEmptyStringSchema,
  eventIds: UniqueStringsSchema.length(6, 'each chapter must contain exactly six unique event cards'),
}).strict();

const ReachabilitySchema = z.object({
  endingId: NonEmptyStringSchema,
  choiceIds: UniqueStringsSchema.length(24),
  rationaleTextId: NonEmptyStringSchema,
}).strict();

const NarrativeLifePrototypeBaseSchema = z.object({
  schemaVersion: z.literal(1),
  prototypeId: NonEmptyStringSchema,
  targetGame: NonEmptyStringSchema,
  targetWorkspace: NonEmptyStringSchema,
  targetPlatforms: z.array(z.enum(['wechat-minigame', 'douyin-minigame', 'taptap-minigame'])).length(3),
  prototypeQuestion: NonEmptyStringSchema,
  format: z.literal('throwaway_text_spike'),
  timeboxMinutes: z.number().int().positive(),
  sessionMinutes: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }).strict().refine(({ min, max }) => min <= max, 'session minimum must not exceed maximum'),
  mobileUiPolicy: z.object({
    visibleStatIds: z.tuple([
      z.literal('economy'),
      z.literal('skill'),
      z.literal('health'),
      z.literal('bonds'),
    ]),
    maxPrimaryChoices: z.literal(2),
    unavailableChoiceBehavior: z.literal('disabled_with_short_reason'),
    hiddenContext: z.array(NonEmptyStringSchema).min(1),
  }).strict(),
  historicalFrame: z.object({
    startYear: z.number().int(),
    endYear: z.number().int(),
    fictionalSetting: NonEmptyStringSchema,
    disclaimers: z.array(NonEmptyStringSchema).min(1),
    sourceIds: UniqueStringsSchema.min(1),
  }).strict().refine(({ startYear, endYear }) => startYear <= endYear, 'historical frame start must not exceed end'),
  sources: z.array(SourceSchema).min(1),
  locale: z.literal('zh-CN'),
  strings: z.record(NonEmptyStringSchema, NonEmptyStringSchema),
  stats: z.array(StatSchema).length(4),
  keepsakes: z.array(KeepsakeSchema).length(3),
  chapters: z.array(ChapterSchema).length(4),
  events: z.array(EventSchema).length(24),
  endings: z.array(EndingSchema).length(12),
  reachability: z.array(ReachabilitySchema).length(12),
  iaaPrototypePolicy: z.object({
    included: z.literal(false),
    rationale: NonEmptyStringSchema,
  }).strict(),
  keepCriteria: z.array(NonEmptyStringSchema).min(1),
  killCriteria: z.array(NonEmptyStringSchema).min(1),
}).strict();

type NarrativeLifePrototypeData = z.infer<typeof NarrativeLifePrototypeBaseSchema>;

function duplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function matchesEnding(
  ending: NarrativeLifePrototypeData['endings'][number],
  stats: Record<string, number>,
  flags: Set<string>,
): boolean {
  return matchesStateRequirements(ending.conditions, stats, flags);
}

function matchesStateRequirements(
  requirements: NarrativeLifePrototypeData['endings'][number]['conditions'] | NarrativeLifePrototypeData['events'][number]['choices'][number]['requirements'],
  stats: Record<string, number>,
  flags: Set<string>,
): boolean {
  if (!requirements) return true;
  const { allFlags = [], anyFlags = [], noneFlags = [], stats: statConditions = {} } = requirements;
  if (!allFlags.every((flag) => flags.has(flag))) return false;
  if (anyFlags.length > 0 && !anyFlags.some((flag) => flags.has(flag))) return false;
  if (noneFlags.some((flag) => flags.has(flag))) return false;
  return Object.entries(statConditions).every(([statId, bounds]) => {
    const value = stats[statId];
    if (value === undefined) return false;
    if (bounds.min !== undefined && value < bounds.min) return false;
    return bounds.max === undefined || value <= bounds.max;
  });
}

function isNarrativeChoiceAvailableFromData(
  choice: NarrativeLifePrototypeData['events'][number]['choices'][number],
  stats: Record<string, number>,
  flags: Set<string>,
): boolean {
  return matchesStateRequirements(choice.requirements, stats, flags);
}

function resolveNarrativeEndingFromData(prototype: NarrativeLifePrototypeData, choiceIds: string[]) {
  if (choiceIds.length !== prototype.events.length) throw new Error('ending resolution requires one choice for every event');
  const stats = Object.fromEntries(prototype.stats.map(({ id, initial }) => [id, initial]));
  const statBounds = new Map<string, { min: number; max: number }>(prototype.stats.map(({ id, min, max }) => [id, { min, max }]));
  const flags = new Set<string>();
  const delayed: Array<{ due: number; effects: Record<string, number>; setFlags: string[] }> = [];

  const applyEffects = (effects: Record<string, number>) => {
    for (const [statId, change] of Object.entries(effects)) {
      const bounds = statBounds.get(statId);
      if (!bounds) throw new Error(`unknown stat effect reference: ${statId}`);
      stats[statId] = Math.max(bounds.min, Math.min(bounds.max, (stats[statId] ?? 0) + change));
    }
  };

  prototype.events.forEach((event, eventIndex) => {
    for (const echo of delayed.filter(({ due }) => due === eventIndex)) {
      applyEffects(echo.effects);
      echo.setFlags.forEach((flag) => flags.add(flag));
    }
    const choice = event.choices.find(({ id }) => id === choiceIds[eventIndex]);
    if (!choice) throw new Error(`choice ${String(choiceIds[eventIndex])} does not belong to event ${event.id}`);
    if (!isNarrativeChoiceAvailableFromData(choice, stats, flags)) {
      throw new Error(`choice ${choice.id} is unavailable because its state requirements are not met`);
    }
    applyEffects(choice.immediateEffects);
    choice.setFlags.forEach((flag) => flags.add(flag));
    const due = choice.delayedEcho.trigger === 'summary'
      ? prototype.events.length
      : Math.min(prototype.events.length, eventIndex + choice.delayedEcho.afterEvents);
    delayed.push({ due, effects: choice.delayedEcho.effects, setFlags: choice.delayedEcho.setFlags });
  });
  for (const echo of delayed.filter(({ due }) => due >= prototype.events.length)) {
    applyEffects(echo.effects);
    echo.setFlags.forEach((flag) => flags.add(flag));
  }

  const orderedEndings = [...prototype.endings].sort((left, right) => right.priority - left.priority);
  const ending = orderedEndings.find((candidate) => !candidate.fallback && matchesEnding(candidate, stats, flags))
    ?? orderedEndings.find((candidate) => candidate.fallback);
  if (!ending) throw new Error('no ending resolved and no fallback ending exists');
  return { ending, stats, flags: [...flags].sort() };
}

export const NarrativeLifePrototypeSchema = NarrativeLifePrototypeBaseSchema.superRefine((artifact, context) => {
  const requireUnique = (values: string[], label: string) => {
    const duplicates = duplicateIds(values);
    if (duplicates.length > 0) context.addIssue({ code: 'custom', message: `${label} IDs must be unique: ${duplicates.join(', ')}` });
  };
  requireUnique(artifact.sources.map(({ id }) => id), 'source');
  requireUnique(artifact.stats.map(({ id }) => id), 'stat');
  requireUnique(artifact.keepsakes.map(({ id }) => id), 'keepsake');
  requireUnique(artifact.chapters.map(({ id }) => id), 'chapter');
  requireUnique(artifact.events.map(({ id }) => id), 'event');
  requireUnique(artifact.events.flatMap(({ choices }) => choices.map(({ id }) => id)), 'choice');
  requireUnique(artifact.endings.map(({ id }) => id), 'ending');

  const expectedPlatforms = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'];
  if (new Set(artifact.targetPlatforms).size !== 3 || expectedPlatforms.some((platform) => !artifact.targetPlatforms.includes(platform as never))) {
    context.addIssue({ code: 'custom', message: 'all three target mini-game platforms are required' });
  }
  const expectedCompactStats = ['economy', 'skill', 'health', 'bonds'];
  if (artifact.stats.some(({ id }, index) => id !== expectedCompactStats[index])) {
    context.addIssue({ code: 'custom', message: 'mobile narrative prototypes must use exactly four ordered systems: economy, skill, health, bonds' });
  }

  const sourceIds = new Set(artifact.sources.map(({ id }) => id));
  const statIds = new Set<string>(artifact.stats.map(({ id }) => id));
  const chapterIds = new Set(artifact.chapters.map(({ id }) => id));
  const eventsById = new Map(artifact.events.map((event) => [event.id, event]));
  const endingsById = new Map(artifact.endings.map((ending) => [ending.id, ending]));
  const stringIds = new Set(Object.keys(artifact.strings));
  const textReferences: string[] = [];
  const effectReferences: string[] = [];
  const addEffects = (effects: Record<string, number>) => effectReferences.push(...Object.keys(effects));

  textReferences.push(...artifact.stats.map(({ labelTextId }) => labelTextId));
  for (const keepsake of artifact.keepsakes) {
    textReferences.push(keepsake.nameTextId, keepsake.descriptionTextId);
    addEffects(keepsake.effects);
  }
  for (const chapter of artifact.chapters) textReferences.push(chapter.titleTextId);
  for (const event of artifact.events) {
    textReferences.push(event.titleTextId, event.bodyTextId);
    if (!chapterIds.has(event.chapterId)) context.addIssue({ code: 'custom', message: `event ${event.id} has an unknown chapter reference` });
    if (event.year < artifact.historicalFrame.startYear || event.year > artifact.historicalFrame.endYear) context.addIssue({ code: 'custom', message: `event ${event.id} falls outside the historical frame` });
    if (event.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) context.addIssue({ code: 'custom', message: `event ${event.id} has an unknown source reference` });
    if (event.choices.every(({ requirements }) => requirements !== undefined)) {
      context.addIssue({ code: 'custom', message: `event ${event.id} requires one unconditional fallback choice for mobile play` });
    }
    for (const choice of event.choices) {
      textReferences.push(choice.labelTextId, choice.resultTextId, choice.delayedEcho.textId);
      if (choice.unavailableTextId) textReferences.push(choice.unavailableTextId);
      addEffects(choice.immediateEffects);
      addEffects(choice.delayedEcho.effects);
      effectReferences.push(...Object.keys(choice.requirements?.stats ?? {}));
    }
  }
  for (const ending of artifact.endings) {
    textReferences.push(ending.titleTextId, ending.summaryTextId, ending.reflectionTextId);
    effectReferences.push(...Object.keys(ending.conditions.stats ?? {}));
  }
  for (const path of artifact.reachability) textReferences.push(path.rationaleTextId);

  if (artifact.historicalFrame.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) context.addIssue({ code: 'custom', message: 'historical frame has an unknown source reference' });
  if (textReferences.some((textId) => !stringIds.has(textId))) context.addIssue({ code: 'custom', message: 'one or more string references are missing from the string table' });
  if (effectReferences.some((statId) => !statIds.has(statId))) context.addIssue({ code: 'custom', message: 'one or more effect or ending references use an unknown stat' });

  const assignedEventIds = artifact.chapters.flatMap(({ eventIds }) => eventIds);
  if (new Set(assignedEventIds).size !== artifact.events.length || assignedEventIds.some((eventId) => !eventsById.has(eventId))) {
    context.addIssue({ code: 'custom', message: 'chapters must assign all 24 events exactly once' });
  }
  for (const chapter of artifact.chapters) {
    for (const eventId of chapter.eventIds) {
      if (eventsById.get(eventId)?.chapterId !== chapter.id) context.addIssue({ code: 'custom', message: `chapter ${chapter.id} does not own event ${eventId}` });
    }
  }

  if (artifact.endings.filter(({ fallback }) => fallback).length !== 1) context.addIssue({ code: 'custom', message: 'exactly one fallback ending is required' });
  const reachabilityEndingIds = artifact.reachability.map(({ endingId }) => endingId);
  if (new Set(reachabilityEndingIds).size !== artifact.endings.length || reachabilityEndingIds.some((endingId) => !endingsById.has(endingId))) {
    context.addIssue({ code: 'custom', message: 'reachability evidence must cover every ending exactly once' });
  }
  for (const path of artifact.reachability) {
    const choicesFollowEventOrder = path.choiceIds.every((choiceId, index) => artifact.events[index]?.choices.some(({ id }) => id === choiceId));
    if (!choicesFollowEventOrder) {
      context.addIssue({ code: 'custom', message: `reachability path for ${path.endingId} does not select one choice from each event in order` });
      continue;
    }
    try {
      const resolved = resolveNarrativeEndingFromData(artifact, path.choiceIds);
      if (resolved.ending.id !== path.endingId) context.addIssue({ code: 'custom', message: `reachability path for ${path.endingId} resolves to ending ${resolved.ending.id}` });
    } catch (error) {
      context.addIssue({ code: 'custom', message: `reachability path could not resolve: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
});

export type NarrativeLifePrototype = z.infer<typeof NarrativeLifePrototypeSchema>;

export function resolveNarrativeEnding(prototype: NarrativeLifePrototype, choiceIds: string[]) {
  return resolveNarrativeEndingFromData(prototype, choiceIds);
}

export function isNarrativeChoiceAvailable(
  choice: NarrativeLifePrototype['events'][number]['choices'][number],
  stats: Record<string, number>,
  flags: Iterable<string>,
): boolean {
  return isNarrativeChoiceAvailableFromData(choice, stats, new Set(flags));
}
