import { EvidenceClaimSetSchema, type EvidenceClaimSet } from '../schemas/evidence-claims.js';

export { EvidenceClaimSetSchema } from '../schemas/evidence-claims.js';

function makeClaim(statement: string, status: 'OBSERVED' | 'INFERRED' | 'UNKNOWN', source: string, index: number, sourceHashes: string[]) {
  const now = new Date().toISOString();
  return {
    id: `claim-${index + 1}`,
    statement,
    status,
    sourceRefs: status === 'UNKNOWN' ? [] : [source],
    // A claim may cite one or more immutable local captures.  Legacy callers
    // can omit hashes, but new research paths should always provide them.
    sourceHashes: status === 'UNKNOWN' ? [] : [...sourceHashes],
    confidence: status === 'OBSERVED' ? 1 : status === 'INFERRED' ? 0.5 : 0,
    evidence: status === 'OBSERVED' ? [source] : [],
    createdAt: now,
  };
}

/** Convert loose research buckets into a claim-level, auditable handoff. */
export function buildEvidenceClaimSet(input: {
  source: string;
  sourceHashes?: string[];
  observations: string[];
  inferences: string[];
  unknowns: string[];
}): EvidenceClaimSet {
  const claims = [
    ...input.observations.map((item) => makeClaim(item, 'OBSERVED', input.source, 0, input.sourceHashes ?? [])),
    ...input.inferences.map((item) => makeClaim(item, 'INFERRED', input.source, 0, input.sourceHashes ?? [])),
    ...input.unknowns.map((item) => makeClaim(item, 'UNKNOWN', input.source, 0, input.sourceHashes ?? [])),
  ].map((claim, index) => ({ ...claim, id: `claim-${index + 1}` }));
  return EvidenceClaimSetSchema.parse({ schemaVersion: 1, source: input.source, claims, generatedAt: new Date().toISOString() });
}

export function evaluateEvidenceClaims(value: unknown) {
  const set = EvidenceClaimSetSchema.parse(value);
  const blockers = set.claims.filter((claim) => claim.status === 'UNKNOWN').map((claim) => claim.id);
  return { passed: blockers.length === 0, blockers, set };
}
