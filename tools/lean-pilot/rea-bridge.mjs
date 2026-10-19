/* global Buffer */
import { safeRead, sha256 } from './policy.mjs';

/** Narrow bridge for a directly exported REA static JavaScript Evidence record.
 * This module does not run/install REA, access networks, write files or approve development.
 * Compatibility reviewed against morluto/rea 0485cd3b, not assumed from its version string.
 */
export const REA_SOURCE_REVISION = '0485cd3bce29c977bae05a4fdce5436f3e3d7913';
const MAX_BYTES = 2 * 1024 * 1024;
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\0');
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const minutes = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000;
const unique = a => new Set(a).size === a.length;
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const cleanPath = v => text(v, 300) && !v.startsWith('/') && !v.includes('\\') && !v.includes(':') &&
  !v.split('/').some(p => !p || p === '.' || p === '..' || p === 'node_modules' || p === '.git');
const timeKeys = ['setupMinutes', 'analysisMinutes', 'reviewMinutes', 'failedAttemptMinutes'];
const fields = ['evidence_id', 'subject', 'provider', 'analysis_profile', 'predicate_type', 'operation', 'parameters', 'raw_result',
  'normalized_result', 'confidence', 'authority', 'environment', 'limitations', 'locations', 'evidence_links'];

/** Canonical JSON for parsed JSON values, with upstream UTF-16 key ordering.
 * A matching hash is an integrity checksum, NOT a signature or origin authentication.
 */
export function canonicalJson(value) {
  const seen = new Set();
  function encode(v, depth) {
    assert(depth <= 32, 'json:depth');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') { assert(Number.isFinite(v), 'json:nonfinite'); return JSON.stringify(v); }
    assert(Array.isArray(v) || record(v), 'json:unsupported');
    assert(!seen.has(v), 'json:cycle'); seen.add(v);
    try {
      if (Array.isArray(v)) {
        assert(v.length <= 100000, 'json:collection-size');
        return '[' + Array.from(v, item => encode(item, depth + 1)).join(',') + ']';
      }
      const keys = Object.keys(v).sort(); assert(keys.length <= 100000, 'json:collection-size');
      return '{' + keys.map(k => {
        return JSON.stringify(k) + ':' + encode(v[k], depth + 1);
      }).join(',') + '}';
    } finally { seen.delete(v); }
  }
  const out = encode(value, 0); assert(Buffer.byteLength(out) <= MAX_BYTES, 'json:size'); return out;
}

/** Mirrors only the reviewed upstream semantic projection, not every REA operation schema. */
export function evidenceId(value) {
  const projection = Object.fromEntries(fields.filter(k => k !== 'evidence_id').map(k => [k, value[k]]));
  projection.subject = value.subject === null ? null : {
    digest: value.subject.digest, format: value.subject.format, architecture: value.subject.architecture,
  };
  return 'ev_' + sha256(canonicalJson(projection));
}

export function supportedReaNode(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major === 22 && minor >= 19 || major === 24 && minor >= 11 || major >= 26;
}

function validateJob(j) {
  assert(record(j) && j.schemaVersion === 1 && text(j.id, 100) && ['game', 'form'].includes(j.product), 'job:schema');
  assert(record(j.target) && text(j.target.id, 200) && text(j.target.version, 200) &&
    ['javascript-artifact', 'web', 'ios', 'android', 'source'].includes(j.target.kind) && typeof j.target.readableSource === 'boolean' &&
    (j.target.subjectSha256 === null || hash(j.target.subjectSha256)), 'job:target');
  assert(record(j.permission) && ['owned', 'licensed', 'written-permission', 'public-observation', 'unknown'].includes(j.permission.basis) &&
    text(j.permission.reference), 'job:permission');
  assert(Array.isArray(j.questions) && j.questions.length > 0 && j.questions.length <= 10 && j.questions.every(q =>
    record(q) && text(q.id, 100) && ['client-structure', 'visible-behavior', 'image-quality', 'commercial', 'server-secret'].includes(q.kind) &&
    text(q.question) && text(q.decision)) && unique(j.questions.map(q => q.id)), 'job:questions');
  const b = j.baseline;
  assert(record(b) && ['NOT_RUN', 'RECORDED'].includes(b.status) && minutes(b.minutes) &&
    (b.cashCents === null || integer(b.cashCents)) && Array.isArray(b.evidence) && b.evidence.length <= 20 &&
    b.evidence.every(e => record(e) && cleanPath(e.path) && hash(e.sha256)) && unique(b.evidence.map(e => e.path)) &&
    Array.isArray(b.resolvedIds) && unique(b.resolvedIds) && b.resolvedIds.every(id => j.questions.some(q => q.id === id)), 'job:baseline');
  assert(record(j.limits) && minutes(j.limits.maxAdditionalMinutes) && j.limits.maxAdditionalMinutes > 0 &&
    integer(j.limits.maxAdditionalCashCents) && integer(j.limits.maxAttempts) && j.limits.maxAttempts > 0 && j.limits.maxAttempts <= 10, 'job:limits');
  assert(Array.isArray(j.allowedFiles) && j.allowedFiles.length > 0 && j.allowedFiles.length <= 20 &&
    j.allowedFiles.every(cleanPath) && unique(j.allowedFiles), 'job:allowed-files');
  canonicalJson(j); return j;
}

/** Routing suggestions are not permission to install or execute a tool. */
export function planResearch(value) {
  const j = validateJob(value);
  const unanswered = j.questions.filter(q => !j.baseline.resolvedIds.includes(q.id));
  let route; let eligible = [];
  if (j.baseline.status !== 'RECORDED') route = 'BASELINE_FIRST';
  else if (!unanswered.length) route = 'SKIP_REA';
  else if (!unanswered.some(q => q.kind === 'client-structure')) route = 'NORMAL_PLAY_OR_REAL_BENCHMARK';
  else if (['ios', 'android'].includes(j.target.kind)) route = 'SEPARATE_NATIVE_REVIEW';
  else if (j.target.readableSource) route = 'DIRECT_SOURCE_FIRST';
  else if (!['owned', 'licensed', 'written-permission'].includes(j.permission.basis)) route = 'PERMISSION_REQUIRED';
  else if (j.target.kind !== 'javascript-artifact') route = 'EXPORT_AUTHORIZED_ARTIFACT_FIRST';
  else { route = 'REA_STATIC_ON_DEMAND'; eligible = unanswered.filter(q => q.kind === 'client-structure').map(q => q.id); }
  const alternatives = {
    'visible-behavior': 'Normal input, recording and visible state changes.',
    'image-quality': 'Authorized paired images, all attempts and actual usable-result review.',
    commercial: 'Observed acquisition, retention, actual costs and receipts; not code inference.',
    'server-secret': 'Out of scope. Client evidence cannot establish an unobserved server prompt.',
  };
  return { schemaVersion: 1, researchId: j.id, route, eligibleQuestionIds: eligible,
    alternatives: unanswered.filter(q => q.kind !== 'client-structure').map(q => ({ questionId: q.id, method: alternatives[q.kind] })),
    commandTemplate: route === 'REA_STATIC_ON_DEMAND' ? ['rea', 'analyze-javascript-application', '<AUTHORIZED_ABSOLUTE_DIRECTORY_OR_ASAR>',
      '--integrity-policy', 'fail', '--max-heap-mb', '256', '--analysis-timeout-ms', '60000', '--json'] : null,
    executed: false, installationRequested: false, autoApply: false, limits: j.limits,
    caveat: 'CLI flags must match the installed release help. Its analysis timeout is per source, not the whole study. No installation or global spending limit is implemented here.',
  };
}

async function verifyBaseline(root, j) {
  assert(j.baseline.status === 'RECORDED' && j.baseline.evidence.length > 0, 'baseline:missing');
  for (const e of j.baseline.evidence) {
    let bytes;
    try { bytes = await safeRead(root, e.path, MAX_BYTES); } catch { throw new Error('baseline:unreadable'); }
    assert(sha256(bytes) === e.sha256, 'baseline:hash-mismatch');
  }
}

function parseExport(raw, j) {
  assert(typeof raw === 'string' || Buffer.isBuffer(raw), 'rea:export-type');
  assert(Buffer.byteLength(raw) <= MAX_BYTES, 'rea:export-size');
  let e; try { e = JSON.parse(raw.toString()); } catch { throw new Error('rea:json-required'); }
  canonicalJson(e);
  assert(record(e) && fields.every(k => Object.hasOwn(e, k)) && Object.keys(e).every(k => fields.includes(k)), 'rea:envelope');
  assert(e.operation === 'analyze_javascript_application' && e.predicate_type === 'rea.javascript-application-analysis', 'rea:unsupported-operation');
  assert(e.confidence === 'derived' && e.authority === 'shipped-artifact' && e.environment === null && e.analysis_profile === null, 'rea:static-contract');
  assert(record(e.provider) && text(e.provider.id) && text(e.provider.name) && (e.provider.version === null || text(e.provider.version)), 'rea:provider');
  assert(record(e.subject) && text(e.subject.name) && text(e.subject.local_path, 4096) && e.subject.architecture === null &&
    ['directory', 'asar'].includes(e.subject.format) && record(e.subject.digest) && hash(e.subject.digest.sha256), 'rea:subject');
  assert(hash(j.target.subjectSha256), 'rea:subject-not-bound');
  assert(e.subject.digest.sha256 === j.target.subjectSha256, 'rea:subject-mismatch');
  assert(record(e.parameters) && ['auto','directory','asar'].includes(e.parameters.format) && e.parameters.integrity_policy === 'fail', 'rea:parameters');
  assert(e.raw_result === null && record(e.normalized_result) && e.normalized_result.input_path === e.subject.local_path, 'rea:normalized-result');
  assert(e.normalized_result.root_artifact_sha256 === e.subject.digest.sha256 && e.normalized_result.format === e.subject.format, 'rea:inner-subject-mismatch');
  assert(Array.isArray(e.limitations) && e.limitations.length <= 200 && e.limitations.every(v => typeof v === 'string') &&
    Array.isArray(e.normalized_result.limitations) && canonicalJson(e.normalized_result.limitations) === canonicalJson(e.limitations), 'rea:limitations');
  assert(Array.isArray(e.locations) && e.locations.length === 1 && record(e.locations[0]) && e.locations[0].kind === 'artifact-path' && e.locations[0].path === 'artifact-root' &&
    Array.isArray(e.evidence_links) && e.evidence_links.every(v => typeof v === 'string' && /^ev_[a-f0-9]{64}$/.test(v)), 'rea:locations');
  assert(typeof e.evidence_id === 'string' && /^ev_[a-f0-9]{64}$/.test(e.evidence_id) && evidenceId(e) === e.evidence_id, 'rea:semantic-id-mismatch');
  return e;
}

export async function inspectExport(root, job, raw) {
  const j = validateJob(job); const plan = planResearch(j);
  assert(plan.route === 'REA_STATIC_ON_DEMAND', 'rea:route-not-eligible');
  await verifyBaseline(root, j); const e = parseExport(raw, j);
  return { status: 'INTEGRITY_CHECKED', researchId: j.id, targetId: j.target.id, targetVersion: j.target.version,
    jobHash: sha256(canonicalJson(j)), reportSha256: sha256(raw), evidenceId: e.evidence_id, subjectSha256: e.subject.digest.sha256,
    confidence: e.confidence, limitations: [...e.limitations], packageExecutionVerified: false, gameplayObserved: false,
    autoApply: false, privateByDefault: true,
    warning: 'Checksum consistency is not a signature, complete schema validation, legal permission, factual truth or proof this REA binary actually ran. Target scope needs independent reviewer verification.',
  };
}

function readPointer(e, pointer) {
  assert(text(pointer, 500) && pointer.startsWith('/normalized_result/') && !/~(?![01])/u.test(pointer), 'review:pointer');
  let value = e;
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), 'review:pointer');
    if (Array.isArray(value)) assert(/^(0|[1-9][0-9]*)$/.test(key), 'review:pointer');
    value = value[key];
  }
  return value;
}

/** Obtain an exact anchor without asking a model to fabricate a digest or echo raw code. */
export async function anchorExport(root, job, raw, pointer) {
  const inspected = await inspectExport(root, job, raw);
  const value = readPointer(parseExport(raw, job), pointer);
  return { researchId: job.id, jobHash: inspected.jobHash, reportSha256: inspected.reportSha256,
    pointer, valueSha256: sha256(canonicalJson(value)),
    valueType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    rawValueIncluded: false, privateByDefault: true, autoApply: false };
}

/** Export reviewed, bounded proposals, not raw target code or auto-approved tasks. */
export async function reviewExport(root, job, raw, review) {
  const inspected = await inspectExport(root, job, raw);
  if (review?.status === 'NOT_RUN') return { status: 'REVIEW_REQUIRED', autoApply: false, researchId: job.id };
  assert(record(review) && review.schemaVersion === 1 && review.status === 'RECORDED', 'review:schema');
  assert(review.jobHash === inspected.jobHash && review.reportSha256 === inspected.reportSha256, 'review:stale');
  assert(text(review.reviewer, 200) && review.publicSafe === true && review.targetScopeVerified === true &&
    typeof review.executedPackageVersion === 'string' && /^\d+\.\d+\.\d+$/.test(review.executedPackageVersion), 'review:attestation');
  const m = review.measured;
  assert(record(m) && timeKeys.every(k => minutes(m[k])) && (m.cashCents === null || integer(m.cashCents)) &&
    integer(m.attempts) && m.attempts >= 1 && timeKeys.reduce((n,k) => n + m[k], 0) > 0, 'review:measurement');
  assert(Array.isArray(review.findings) && review.findings.length <= 3 && unique(review.findings.map(f => f?.questionId)), 'review:findings');
  const eligible = new Set(planResearch(job).eligibleQuestionIds); const e = parseExport(raw, job);
  const proposals = review.findings.map(f => {
    assert(record(f) && eligible.has(f.questionId), 'review:ineligible-question');
    assert(hash(f.valueSha256) && f.valueSha256 === sha256(canonicalJson(readPointer(e, f.pointer))), 'review:value-mismatch');
    assert(text(f.summary) && text(f.proposedChange) && Array.isArray(f.files) && f.files.length > 0 && unique(f.files) &&
      f.files.every(file => job.allowedFiles.includes(file)), 'review:proposal-scope');
    assert(record(f.state) && ['before','action','after','feedback','recovery'].every(k => text(f.state[k])) &&
      record(f.acceptance) && ['given','when','then'].every(k => text(f.acceptance[k])), 'review:executable-acceptance');
    return { questionId: f.questionId, evidencePointer: f.pointer, valueSha256: f.valueSha256,
      summary: f.summary, proposedChange: f.proposedChange, files: [...f.files],
      state: Object.fromEntries(['before','action','after','feedback','recovery'].map(k => [k,f.state[k]])),
      acceptance: Object.fromEntries(['given','when','then'].map(k => [k,f.acceptance[k]])),
      sourceClassification: 'STATIC_DERIVED_ANALYST_REVIEWED', approval: 'RESEARCH_PROPOSAL_ONLY' };
  });
  const additionalMinutes = timeKeys.reduce((n,k) => n + m[k], 0);
  const overBudget = additionalMinutes > job.limits.maxAdditionalMinutes || m.attempts > job.limits.maxAttempts ||
    m.cashCents !== null && m.cashCents > job.limits.maxAdditionalCashCents;
  const status = m.cashCents === null ? 'COST_UNKNOWN_STOP' : overBudget ? 'OVER_BUDGET_STOP' :
    proposals.length ? 'ONE_TRIAL_USEFUL_NOT_PROVEN' : 'NO_INCREMENTAL_VALUE';
  return { schemaVersion: 1, status, researchId: job.id, targetId: job.target.id, targetVersion: job.target.version,
    jobHash: inspected.jobHash, reportSha256: inspected.reportSha256, evidenceId: inspected.evidenceId,
    destination: job.product === 'form' ? 'FORM_NEXT_VERSION_REVIEW_ONLY' : 'GAME_PRODUCT_REVIEW_ONLY',
    baselineMinutes: job.baseline.minutes, baselineCashCents: job.baseline.cashCents, additionalMinutes,
    additionalCashCents: m.cashCents, attemptsIncludingFailures: m.attempts, newActionableDecisions: proposals.length,
    minutesPerDecision: proposals.length ? additionalMinutes / proposals.length : null, speedupClaim: null,
    packageVersionDeclaredByReviewer: review.executedPackageVersion, packageExecutionVerified: false,
    limitationsCount: e.limitations.length, limitationsSha256: sha256(canonicalJson(e.limitations)),
    proposals, autoApply: false, humanPlaytest: 'NOT_RUN', commercialValidation: 'NOT_RUN',
    note: 'Measured costs and semantic conclusions are reviewer declarations. No equal-task timing experiment or downstream product benefit is proven. Raw report and paths are not included; review all output before any public upload.',
  };
}
