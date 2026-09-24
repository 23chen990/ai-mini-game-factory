import { sha256Text } from './files.js';
import type { DistributionPlatform, ReleaseChildStatus } from '../schemas/factory-operating.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  // JSON.stringify(undefined) returns undefined, which cannot be passed to
  // crypto.Hash.update(). Keep a stable explicit sentinel for omitted
  // optional evidence so non-strict/legacy runs can still be packaged and
  // hashed without weakening strict release gates.
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'undefined' : encoded;
}

export function buildReleaseIntegrity(input: {
  coreHash: string;
  platformChildren: Array<{ platform: DistributionPlatform; status: ReleaseChildStatus; artifactHash: string | null }>;
  acceptance: unknown;
}): { coreHash: string; platformHash: string; acceptanceHash: string } {
  const children = [...input.platformChildren].sort((a, b) => a.platform.localeCompare(b.platform)).map((child) => ({ platform: child.platform, status: child.status, artifactHash: child.artifactHash }));
  return {
    coreHash: input.coreHash,
    platformHash: sha256Text(stable(children)),
    acceptanceHash: sha256Text(stable(input.acceptance)),
  };
}
