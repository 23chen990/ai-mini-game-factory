import { isIP } from 'node:net';
import { CompetitorResearchEvidenceReportSchema, CompetitorResearchSchema, FailurePressureContractSchema, type CompetitorResearch } from '../schemas/index.js';
import { sha256Text } from './files.js';

const instructionPattern = /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?|system\s*prompt|developer\s+message|read\s+\/etc|rm\s+-rf|curl\s+|wget\s+|download\s+(?:the\s+)?secrets?|读取密钥|下载并执行|运行命令)/iu;

export function isInstructionShapedResearchText(value: string): boolean {
  return instructionPattern.test(String(value));
}

export function isPrivateResearchHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.+$/u, '');
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
  const kind = isIP(normalized);
  if (kind === 4) {
    const [a = -1, b = -1] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (kind === 6) return normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd');
  return false;
}

function normalizeAllowedHost(value: string): string | undefined {
  const host = value.trim().toLowerCase().replace(/\.+$/u, '');
  if (!host || host.includes('/') || host.includes('@') || host.includes(':') || isPrivateResearchHost(host)) return undefined;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(host)) return undefined;
  return host;
}

export function isSafeExternalResearchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !isPrivateResearchHost(url.hostname) && (url.port === '' || url.port === '443');
  } catch {
    return false;
  }
}

export function isResearchHostAllowed(value: string, allowedHosts: readonly string[]): boolean {
  if (!isSafeExternalResearchUrl(value)) return false;
  let host: string;
  try { host = new URL(value).hostname.toLowerCase().replace(/\.+$/u, ''); } catch { return false; }
  const allowed = new Set(allowedHosts.map(normalizeAllowedHost).filter((item): item is string => Boolean(item)));
  if (allowed.size === 0) return false;
  return [...allowed].some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function safeLocator(record: CompetitorResearch['sourceRecords'][number]): boolean {
  if (isInstructionShapedResearchText(record.locator) || isInstructionShapedResearchText(record.title) || record.notes.some((note) => isInstructionShapedResearchText(note))) return false;
  if (record.kind === 'file') {
    const normalized = record.locator.replaceAll('\\', '/');
    return (normalized.startsWith('input/reference-research/') || normalized.startsWith('artifacts/research-sources/'))
      && !normalized.startsWith('/')
      && !normalized.split('/').some((part) => part === '..');
  }
  try {
    return isSafeExternalResearchUrl(record.locator);
  } catch {
    return false;
  }
}

export type CompetitorResearchEvidenceOptions = {
  /** Production requires attributable source metadata; fast fixtures may use
   * legacy research while the missing evidence remains visible. */
  requireSources?: boolean;
  minimumSources?: number;
  /** In browser-read-only mode, restrict every external source to these
   * normalized DNS suffixes. Run-relative files do not need a host entry. */
  requireHostAllowlist?: boolean;
  allowedHosts?: readonly string[];
};

/**
 * Some research failures are quality debt that a fast fixture may carry as a
 * visible legacy marker (for example, a missing source list).  Other failures
 * indicate that untrusted data crossed the read-only boundary or that a
 * claim cannot be attributed at all.  Those are security/provenance failures
 * and must stop the pipeline in every lane, including fast/mock runs.
 */
export function researchBlockersRequirePause(blockers: readonly string[]): boolean {
  return blockers.some((blocker) => blocker === 'research:schema-invalid'
    || blocker === 'research:unsafe-source-locator'
    || blocker === 'research:source-host-not-allowlisted'
    || blocker === 'research:duplicate-source-id'
    || blocker === 'research:source-hash-missing'
    || blocker === 'research:failure-pressure-contract-missing'
    || blocker.startsWith('research:instruction-shaped')
    || blocker.startsWith('research:claim-source-')
    || blocker.startsWith('research:failure-pressure-source-')
    || blocker.startsWith('research:claim-hash-count:'));
}

/**
 * Validate the research boundary before a mutating role sees a competitor
 * report.  This checks provenance metadata and claim references, never the
 * untrusted source contents themselves.  A malformed report is a blocking
 * result rather than an opportunity for a downstream model to guess.
 */
export function evaluateCompetitorResearchEvidence(value: unknown, options: CompetitorResearchEvidenceOptions = {}) {
  const parsed = CompetitorResearchSchema.safeParse(value);
  if (!parsed.success) {
    const report = CompetitorResearchEvidenceReportSchema.parse({
      schemaVersion: 1,
      passed: false,
      legacy: true,
      blockers: ['research:schema-invalid'],
      researchHash: sha256Text(JSON.stringify(value)),
      sourceCount: 0,
      verifiedSourceCount: 0,
      claimCount: 0,
      unknownCount: 0,
      sourceIds: [],
      checkedAt: new Date().toISOString(),
    });
    return { passed: false, blockers: ['research:schema-invalid'] as string[], research: value, report };
  }
  const research = parsed.data;
  const blockers: string[] = [];
  const minimumSources = Math.max(1, Math.trunc(options.minimumSources ?? 3));
  if (options.requireSources === true && research.sourceRecords.length < minimumSources) blockers.push('research:sources-missing');
  if (options.requireSources === true) {
    const pressure = FailurePressureContractSchema.safeParse(research.failurePressureContract);
    if (!pressure.success) blockers.push('research:failure-pressure-contract-missing');
  }
  if (new Set(research.sourceRecords.map((source) => source.sourceId)).size !== research.sourceRecords.length) blockers.push('research:duplicate-source-id');
  if (research.sourceRecords.some((source) => !safeLocator(source))) blockers.push('research:unsafe-source-locator');
  const allowedHosts = new Set((options.allowedHosts ?? []).map(normalizeAllowedHost).filter((host): host is string => Boolean(host)));
  if (options.requireHostAllowlist === true) {
    for (const source of research.sourceRecords) {
      if (source.kind === 'file') continue;
      try {
        if (!isResearchHostAllowed(source.locator, [...allowedHosts])) blockers.push('research:source-host-not-allowlisted');
      } catch { /* safeLocator already reports malformed URLs */ }
    }
  }
  if (options.requireSources === true && research.sourceRecords.some((source) => !source.contentHash)) blockers.push('research:source-hash-missing');
  const sourceIds = new Set(research.sourceRecords.map((source) => source.sourceId));
  if (research.failurePressureContract) {
    for (const evidence of research.failurePressureContract.evidence) {
      if (evidence.sourceRefs.some((sourceId) => !sourceIds.has(sourceId))) blockers.push(`research:failure-pressure-source-unknown:${evidence.id}`);
    }
  }
  for (const claim of research.claims) {
    if (claim.status !== 'UNKNOWN' && claim.sourceRefs.length === 0) blockers.push(`research:claim-source-missing:${claim.id}`);
    if (claim.sourceRefs.some((sourceId) => !sourceIds.has(sourceId))) blockers.push(`research:claim-source-unknown:${claim.id}`);
    if (claim.sourceHashes.length !== claim.sourceRefs.length && claim.sourceRefs.length > 0) blockers.push(`research:claim-hash-count:${claim.id}`);
  }
  if (research.unknowns.length === 0) blockers.push('research:unknowns-not-explicit');
  if (research.observations.some(isInstructionShapedResearchText) || research.inferences.some(isInstructionShapedResearchText)) blockers.push('research:instruction-shaped-claim');
  if (research.sourceRecords.some((source) => isInstructionShapedResearchText(source.title) || source.notes.some(isInstructionShapedResearchText))) blockers.push('research:instruction-shaped-source');
  const uniqueBlockers = [...new Set(blockers)];
  const report = CompetitorResearchEvidenceReportSchema.parse({
    schemaVersion: 1,
    passed: uniqueBlockers.length === 0,
    legacy: research.sourceRecords.length === 0,
    blockers: uniqueBlockers,
    researchHash: sha256Text(JSON.stringify(research)),
    sourceCount: research.sourceRecords.length,
    verifiedSourceCount: research.sourceRecords.filter((source) => Boolean(source.contentHash)).length,
    claimCount: research.claims.length,
    unknownCount: research.unknowns.length,
    sourceIds: research.sourceRecords.map((source) => source.sourceId),
    checkedAt: new Date().toISOString(),
  });
  return { passed: report.passed, blockers: report.blockers, research, report };
}
