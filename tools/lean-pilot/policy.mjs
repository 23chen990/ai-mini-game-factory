/* global URL */
import { createHash } from 'node:crypto';
import { lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const hashLike = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 10000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Read an existing run-relative regular file without accepting symlinks or traversal. */
export async function safeRead(root, relative, maxBytes = 4 * 1024 * 1024) {
  if (!text(relative) || relative.includes('\\') || relative.includes('\0') || path.isAbsolute(relative) ||
    relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('unsafe-path');
  const rootPath = path.resolve(root); const rootStat = await lstat(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe-root');
  const canonicalRoot = await realpath(rootPath); let current = canonicalRoot;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]); const entry = await lstat(current);
    if (entry.isSymbolicLink() || (i < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())) throw new Error('unsafe-file');
  }
  const handle = await open(current, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat(); if (!stat.isFile() || stat.size > maxBytes) throw new Error('file-size-limit');
    const bytes = await handle.readFile(); if (bytes.length > maxBytes) throw new Error('file-size-limit'); return bytes;
  } finally { await handle.close(); }
}
function publicUrl(value) {
  try {
    const u = new URL(value); const host = u.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.+$/,'');
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') ||
      !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    // This validator does not fetch URLs or perform DNS. Literal IP targets are excluded altogether.
    return !isIP(host);
  } catch { return false; }
}

/** Integrity and attribution only: matching bytes do NOT establish factual truth. */
export async function verifyEvidence(root, manifest, now = Date.now()) {
  const blockers = []; const warnings = []; const verified = new Map();
  const result = () => ({ passed:blockers.length === 0, blockers:[...new Set(blockers)], warnings,
    integrityVerifiedSources:verified.size, gameplayObserved:false, semanticTruth:'NOT_AUTOMATICALLY_VERIFIED' });
  if (!record(manifest) || manifest.schemaVersion !== 1 || !text(manifest.targetId) ||
    !Array.isArray(manifest.sources) || manifest.sources.length < 1 || manifest.sources.length > 100 ||
    !Array.isArray(manifest.claims) || manifest.claims.length > 100 ||
    !Array.isArray(manifest.unknowns) || !Array.isArray(manifest.requiredClaimIds) || !manifest.requiredClaimIds.length) {
    blockers.push('evidence:schema-invalid'); return result();
  }
  const seenSources = new Set();
  for (const source of manifest.sources) {
    if (!record(source) || !text(source.id) || !hashLike(source.sha256) || !text(source.version) || !publicUrl(source.url) ||
      !['CODE_READ','DEVELOPER_PAGE','BROWSER_PLAY','USER_REVIEW','LICENSE'].includes(source.method) ||
      !text(source.collectedAt) || !Number.isFinite(Date.parse(source.collectedAt)) || Date.parse(source.collectedAt) > now + 300000) {
      blockers.push('source:metadata-invalid'); continue;
    }
    if (seenSources.has(source.id)) { blockers.push(`source:duplicate:${source.id}`); continue; }
    seenSources.add(source.id);
    try {
      const bytes = await safeRead(root,source.path);
      if (sha256(bytes) !== source.sha256) { blockers.push(`source:hash-mismatch:${source.id}`); continue; }
      verified.set(source.id,{...source,content:bytes.toString('utf8')});
    } catch { blockers.push(`source:unreadable:${source.id}`); }
  }
  const claims = new Map();
  for (const claim of manifest.claims) {
    if (!record(claim) || !text(claim.id) || !text(claim.text) || !Array.isArray(claim.evidence) ||
      !['SOURCE_CODE','OBSERVATION','DEVELOPER_CLAIM','REVIEW_SIGNAL','INFERENCE','UNKNOWN'].includes(claim.kind)) {
      blockers.push('claim:schema-invalid'); continue;
    }
    if (claims.has(claim.id)) blockers.push(`claim:duplicate:${claim.id}`);
    claims.set(claim.id,claim);
    if (claim.kind !== 'UNKNOWN' && !claim.evidence.length) blockers.push(`claim:unsupported:${claim.id}`);
    for (const anchor of claim.evidence) {
      const source = record(anchor) ? verified.get(anchor.sourceId) : undefined;
      if (!source) { blockers.push(`claim:unverified-source:${claim.id}`); continue; }
      if (claim.kind === 'OBSERVATION' && source.method !== 'BROWSER_PLAY') blockers.push(`claim:not-observed:${claim.id}`);
      if (claim.kind === 'SOURCE_CODE' && source.method !== 'CODE_READ') blockers.push(`claim:not-source-code:${claim.id}`);
      if (!text(anchor.quote) && !text(anchor.locator)) blockers.push(`claim:locator-missing:${claim.id}`);
      if (anchor.quote !== undefined && (!text(anchor.quote) || !source.content.includes(anchor.quote))) blockers.push(`claim:quote-mismatch:${claim.id}`);
    }
  }
  for (const id of manifest.requiredClaimIds) {
    const claim = claims.get(id);
    if (!claim || ['UNKNOWN','INFERENCE','REVIEW_SIGNAL','DEVELOPER_CLAIM'].includes(claim.kind)) blockers.push(`claim:required-unresolved:${id}`);
  }
  for (const item of manifest.unknowns) {
    if (!record(item) || !text(item.id) || !text(item.reason) || typeof item.blocking !== 'boolean') blockers.push('unknown:schema-invalid');
    else if (item.blocking) blockers.push(`unknown:blocking:${item.id}`);
    else warnings.push(`unknown:nonblocking:${item.id}`);
  }
  // Gameplay still needs human review; even BROWSER_PLAY is only a declared method here.
  return result();
}

export const DEFAULT_BUDGET = Object.freeze({ maxCashCents:0, maxCandidateBuilds:3, maxElapsedMs:600000, maxAttemptMs:90000 });
/** Fail before executing. Cash estimates and unknown usage must never silently become zero. */
export function evaluateBudget(policy, ledger, request) {
  const blockers = [];
  if (!record(policy) || !record(ledger) || !record(request) ||
    !['maxCashCents','maxCandidateBuilds','maxElapsedMs','maxAttemptMs'].every(k => integer(policy[k])) ||
    policy.maxCandidateBuilds < 1 || !integer(ledger.cashCents) || !integer(ledger.elapsedMs) ||
    !Array.isArray(ledger.buildHashes) || typeof ledger.pending !== 'boolean' || !hashLike(request.buildHash) ||
    !integer(request.cashCents) || !integer(request.timeoutMs) || request.timeoutMs < 1) return {passed:false,blockers:['budget:invalid-or-unknown']};
  if (ledger.pending) blockers.push('budget:interrupted-attempt-needs-review');
  if (ledger.cashCents + request.cashCents > policy.maxCashCents) blockers.push('budget:cash-cap');
  if (request.timeoutMs > policy.maxAttemptMs || ledger.elapsedMs + request.timeoutMs > policy.maxElapsedMs) blockers.push('budget:time-cap');
  if (!ledger.buildHashes.includes(request.buildHash) && new Set(ledger.buildHashes).size >= policy.maxCandidateBuilds) blockers.push('budget:revision-cap');
  return {passed:blockers.length === 0,blockers};
}

/** A small-sample screening decision, never a retention or profitability claim. */
export async function evaluatePlaytest(root, review, expected) {
  if (!review || review.status === 'NOT_RUN') return {passed:false,status:'NOT_RUN',blockers:['human:not-run']};
  const blockers = [];
  if (!record(review) || review.status !== 'RECORDED' || review.runId !== expected.runId || review.buildHash !== expected.buildHash ||
    !text(review.reviewer) || !Array.isArray(review.participants) || review.participants.length < 5 || review.participants.length > 50) {
    return {passed:false,status:'BLOCKED',blockers:['human:invalid-or-stale']};
  }
  const ids = new Set(); let understood = 0; let continued = 0;
  for (const p of review.participants) {
    if (!record(p) || !text(p.id) || ids.has(p.id) || p.source !== 'HUMAN' || p.consent !== true || p.uncoached !== true ||
      typeof p.priorExperience !== 'boolean' || typeof p.willinglyContinued !== 'boolean' ||
      !integer(p.durationMs) || p.durationMs < 1 || !hashLike(p.evidenceHash) ||
      (p.firstMergeMs !== null && (!integer(p.firstMergeMs) || p.firstMergeMs > p.durationMs))) { blockers.push('human:invalid-session'); continue; }
    ids.add(p.id);
    try { if (sha256(await safeRead(root,p.evidencePath)) !== p.evidenceHash) blockers.push(`human:evidence-mismatch:${p.id}`); }
    catch { blockers.push(`human:evidence-missing:${p.id}`); }
    if (p.firstMergeMs !== null && p.firstMergeMs <= 30000) understood++;
    if (p.willinglyContinued) continued++;
  }
  const n = review.participants.length;
  if (understood / n < 0.8) blockers.push('human:first-merge-below-threshold');
  if (continued / n < 0.6) blockers.push('human:voluntary-continuation-below-threshold');
  return {passed:blockers.length === 0,status:blockers.length ? 'BLOCKED' : 'SCREEN_PASSED',blockers:[...new Set(blockers)],
    sampleSize:n,understood,continued,origin:'DECLARED_HUMAN_REVIEW',commercial:'NOT_RUN',
    limitation:'The reviewer attests human origin and consent. File integrity cannot prove this automatically. Small samples are not population retention estimates.'};
}
