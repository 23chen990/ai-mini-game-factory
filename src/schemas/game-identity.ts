import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

/** Identity supplied by the operator in a seed.  Display title is deliberately
 * kept outside this object so renaming a presentation cannot silently rename a
 * logical game. */
export const GameSeedIdentitySchema = z.object({
  canonicalGameId: Text,
  aliases: z.array(Text).default([]),
  variantId: Text.optional(),
  variantOf: Text.optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.aliases).size !== value.aliases.length) context.addIssue({ code: 'custom', path: ['aliases'], message: 'identity aliases must be unique' });
  if (value.aliases.includes(value.canonicalGameId)) context.addIssue({ code: 'custom', path: ['aliases'], message: 'canonical game id cannot also be an alias' });
  if (value.variantOf && !value.variantId) context.addIssue({ code: 'custom', path: ['variantId'], message: 'variantOf requires variantId' });
});
export type GameSeedIdentity = z.infer<typeof GameSeedIdentitySchema>;

/**
 * Optional run-scoped identity for new game runs.  It is deliberately kept
 * separate from RunStateSchema so old runs remain readable without an
 * in-place schema rewrite.
 */
export const GameRunIdentityManifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestType: z.literal('game-run-identity'),
  immutable: z.literal(true),
  runId: Text,
  canonicalGameId: Text,
  displayTitle: Text,
  aliases: z.array(Text).default([]),
  variantId: Text.optional(),
  variantOf: Text.optional(),
  seedSha256: Sha256,
  template: Text,
  runtime: Text,
  workspaceRelative: Text,
  createdAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (new Set(value.aliases).size !== value.aliases.length) context.addIssue({ code: 'custom', path: ['aliases'], message: 'identity aliases must be unique' });
  if (value.aliases.includes(value.canonicalGameId)) context.addIssue({ code: 'custom', path: ['aliases'], message: 'canonical game id cannot also be an alias' });
  if (value.variantOf && !value.variantId) context.addIssue({ code: 'custom', path: ['variantId'], message: 'variantOf requires variantId' });
  if (value.workspaceRelative.startsWith('/') || value.workspaceRelative.includes('\\') || value.workspaceRelative.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    context.addIssue({ code: 'custom', path: ['workspaceRelative'], message: 'workspaceRelative must be a normalized relative path' });
  }
});

export type GameRunIdentityManifest = z.infer<typeof GameRunIdentityManifestSchema>;
