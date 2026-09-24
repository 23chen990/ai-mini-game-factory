import { GameRunIdentityManifestSchema, type GameRunIdentityManifest } from '../schemas/game-identity.js';
import type { Seed } from '../schemas/index.js';

export const GAME_RUN_IDENTITY_ARTIFACT = 'game-run-identity.json' as const;

const BOUND_FIELDS = ['runId', 'canonicalGameId', 'seedSha256', 'template', 'runtime', 'workspaceRelative'] as const;
const IMMUTABLE_FIELDS: (keyof GameRunIdentityManifest)[] = [
  'schemaVersion',
  'manifestType',
  'immutable',
  'runId',
  'canonicalGameId',
  'displayTitle',
  'aliases',
  'variantId',
  'variantOf',
  'seedSha256',
  'template',
  'runtime',
  'workspaceRelative',
  'createdAt',
];

export type GameRunIdentityInput = {
  runId: string;
  seed: Pick<Seed, 'title' | 'template' | 'runtime'>;
  seedSha256: string;
  createdAt: string;
  canonicalGameId?: string;
  displayTitle?: string;
  aliases?: string[];
  variantId?: string;
  variantOf?: string;
  workspaceRelative?: string;
};

export type GameRunIdentityBindingExpectation = Partial<Pick<GameRunIdentityManifest, typeof BOUND_FIELDS[number]>>;
export type GameRunIdentityValidation = { passed: boolean; blockers: string[] };

/** Derive a stable id once at run creation; later stages must consume the manifest. */
export function canonicalGameIdFromTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/giu, '-').replace(/^-|-$/gu, '') || 'game';
}

export function buildGameRunIdentityManifest(input: GameRunIdentityInput): GameRunIdentityManifest {
  const displayTitle = (input.displayTitle ?? input.seed.title).trim();
  return GameRunIdentityManifestSchema.parse({
    schemaVersion: 1,
    manifestType: 'game-run-identity',
    immutable: true,
    runId: input.runId,
    canonicalGameId: (input.canonicalGameId ?? canonicalGameIdFromTitle(displayTitle)).trim(),
    displayTitle,
    aliases: input.aliases ?? [],
    ...(input.variantId ? { variantId: input.variantId } : {}),
    ...(input.variantOf ? { variantOf: input.variantOf } : {}),
    seedSha256: input.seedSha256,
    template: input.seed.template,
    runtime: input.seed.runtime,
    workspaceRelative: input.workspaceRelative ?? 'workspace/game',
    createdAt: input.createdAt,
  });
}

export function validateGameRunIdentityBinding(value: unknown, expected: GameRunIdentityBindingExpectation = {}): GameRunIdentityValidation {
  const parsed = GameRunIdentityManifestSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['identity:schema-invalid'] };
  const blockers = BOUND_FIELDS.flatMap((field) => expected[field] !== undefined && parsed.data[field] !== expected[field]
    ? [`identity:${field}-mismatch`]
    : []);
  return { passed: blockers.length === 0, blockers };
}

/** Pure write-once comparison used by the run store before any replacement. */
export function validateGameRunIdentityImmutability(previous: unknown, next: unknown): GameRunIdentityValidation {
  const previousParsed = GameRunIdentityManifestSchema.safeParse(previous);
  const nextParsed = GameRunIdentityManifestSchema.safeParse(next);
  if (!previousParsed.success || !nextParsed.success) return { passed: false, blockers: ['identity:schema-invalid'] };
  const blockers = IMMUTABLE_FIELDS.flatMap((field) => JSON.stringify(previousParsed.data[field]) === JSON.stringify(nextParsed.data[field])
    ? []
    : [`identity:immutable-field-changed:${field}`]);
  return { passed: blockers.length === 0, blockers };
}
