import { ArtifactVersionEnvelopeSchema } from '../schemas/schema-migrations.js';

export type ArtifactMigration = (value: unknown) => unknown;
export type ArtifactMigrationOptions = {
  artifact: string;
  currentVersion: number;
  migrations: Record<number, ArtifactMigration>;
};

export class ArtifactVersionError extends Error {
  constructor(message: string) {
    super(`artifact version rejected: ${message}`);
    this.name = 'ArtifactVersionError';
  }
}

export function assertCurrentArtifactVersion(value: unknown, currentVersion: number, artifact: string): void {
  const parsed = ArtifactVersionEnvelopeSchema.safeParse(value);
  if (!parsed.success || parsed.data.schemaVersion !== currentVersion) {
    const actual = parsed.success ? parsed.data.schemaVersion : 'invalid';
    throw new ArtifactVersionError(`${artifact} is schema ${String(actual)}; expected ${currentVersion}`);
  }
}

/** Apply one-step-at-a-time migrations; missing links are a hard error. */
export function migrateArtifact(value: unknown, options: ArtifactMigrationOptions): unknown {
  if (!Number.isInteger(options.currentVersion) || options.currentVersion < 1) throw new ArtifactVersionError(`${options.artifact} has an invalid current version`);
  let current = ArtifactVersionEnvelopeSchema.parse(value) as unknown;
  while (true) {
    const parsed = ArtifactVersionEnvelopeSchema.parse(current);
    if (parsed.schemaVersion === options.currentVersion) return current;
    if (parsed.schemaVersion > options.currentVersion) throw new ArtifactVersionError(`${options.artifact} is newer than supported schema ${options.currentVersion}`);
    const migration = options.migrations[parsed.schemaVersion];
    if (!migration) throw new ArtifactVersionError(`no migration from schema ${parsed.schemaVersion} for ${options.artifact}`);
    const next = migration(current);
    const nextParsed = ArtifactVersionEnvelopeSchema.safeParse(next);
    if (!nextParsed.success || nextParsed.data.schemaVersion <= parsed.schemaVersion) throw new ArtifactVersionError(`migration for ${options.artifact} did not advance schema version`);
    current = next;
  }
}
