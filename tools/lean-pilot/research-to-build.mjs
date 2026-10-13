/**
 * Evidence-first gate before a prototype is built. This never runs REA, never
 * executes untrusted reference code, and never certifies fun or publication.
 */
import { safeRead, sha256, verifyEvidence } from './policy.mjs';
import { reviewExport } from './rea-bridge.mjs';
import { auditContract, canonical } from '../../.agents/skills/gameplay-loop-review/scripts/workflow.mjs';

const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonblank = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000;
const safeId = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v);
const hex40 = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const distinct = values => new Set(values).size === values.length;
const keys = (value, required, optional = []) => isRecord(value) &&
  required.every(k => Object.hasOwn(value, k)) &&
  Object.keys(value).every(k => required.includes(k) || optional.includes(k));
const fail = code => { throw new Error('reverse-gate:' + code); };

function validatePacket(p) {
  if (!keys(p, ['schemaVersion', 'gameId', 'referenceId', 'sourceRevision', 'sourcePermission',
    'inputs', 'mechanisms', 'counterfactual', 'rea']) ||
    p.schemaVersion !== 1 || !safeId(p.gameId) || !nonblank(p.referenceId) ||
    !hex40(p.sourceRevision)) fail('packet');
  if (!keys(p.sourcePermission, ['basis', 'notes']) ||
    !['OPEN_SOURCE_CODE_REVIEW', 'OWNED', 'WRITTEN_PERMISSION'].includes(p.sourcePermission.basis) ||
    !nonblank(p.sourcePermission.notes)) fail('permission');
  if (!keys(p.inputs, ['request', 'research', 'contract']) ||
    ![p.inputs.request, p.inputs.research, p.inputs.contract].every(safeIdFile)) fail('inputs');
  if (!Array.isArray(p.mechanisms) || p.mechanisms.length < 2 || p.mechanisms.length > 12 ||
    !distinct(p.mechanisms.map(x => x?.id))) fail('mechanisms');
  for (const m of p.mechanisms) {
    if (!keys(m, ['id', 'claimIds', 'loopId', 'caseIds', 'originalDesign', 'playerVisibleFeedback', 'failureRecovery']) ||
      !safeId(m.id) || !safeId(m.loopId) ||
      !Array.isArray(m.claimIds) || m.claimIds.length < 1 || m.claimIds.length > 8 ||
      !m.claimIds.every(safeId) || !distinct(m.claimIds) ||
      !Array.isArray(m.caseIds) || m.caseIds.length < 1 ||
      !m.caseIds.every(safeId) || !distinct(m.caseIds) ||
      !['originalDesign', 'playerVisibleFeedback', 'failureRecovery'].every(k => nonblank(m[k]))) fail('mechanism');
  }
  const c = p.counterfactual;
  if (!keys(c, ['seed', 'initialState', 'timeLimitSeconds', 'visibleMetrics', 'scenarios']) ||
    !safeId(c.seed) || !safeId(c.initialState) || c.timeLimitSeconds !== 180 ||
    !Array.isArray(c.visibleMetrics) || c.visibleMetrics.length < 2 || c.visibleMetrics.length > 10 ||
    !c.visibleMetrics.every(safeId) || !distinct(c.visibleMetrics) ||
    !Array.isArray(c.scenarios) || c.scenarios.length !== 3 ||
    !distinct(c.scenarios.map(x => x?.id))) fail('counterfactual');
  const roles = c.scenarios.map(x => x?.role);
  if (!['no-action', 'single-action', 'adaptive'].every(r => roles.includes(r))) fail('scenario-roles');
  for (const s of c.scenarios) {
    if (!keys(s, ['id', 'role', 'inputMode', 'actions', 'expectedVisibleDifference']) ||
      !safeId(s.id) || !['no-action', 'single-action', 'adaptive'].includes(s.role) ||
      s.inputMode !== 'NORMAL_VISIBLE_INPUT' ||
      !Array.isArray(s.actions) || s.actions.length > 30 ||
      !nonblank(s.expectedVisibleDifference) ||
      s.actions.some(a => !keys(a, ['atSeconds', 'input', 'target']) ||
        !Number.isFinite(a.atSeconds) || a.atSeconds < 0 ||
        a.atSeconds > c.timeLimitSeconds || !['tap', 'swipe', 'hold', 'choice'].includes(a.input) ||
        !nonblank(a.target))) fail('scenario');
    if (s.role === 'no-action' && s.actions.length !== 0 ||
      s.role === 'single-action' && s.actions.length !== 1 ||
      s.role === 'adaptive' && s.actions.length < 2) fail('scenario-actions');
    if (s.actions.some((a, i) => i > 0 && a.atSeconds < s.actions[i - 1].atSeconds)) fail('scenario-order');
  }
  if (!keys(p.rea, ['status', 'job', 'export', 'review']) ||
    !['NOT_RUN', 'REVIEWED_STATIC'].includes(p.rea.status) ||
    (p.rea.status === 'NOT_RUN' && [p.rea.job, p.rea.export, p.rea.review].some(x => x !== null)) ||
    (p.rea.status === 'REVIEWED_STATIC' && ![p.rea.job, p.rea.export, p.rea.review].every(safeIdFile))) fail('rea');
  return p;
}

function safeIdFile(s) {
  return nonblank(s) && !s.includes('\\') && !s.includes('\0') && !s.startsWith('/') &&
    s.split('/').every(part => part && part !== '.' && part !== '..' &&
      part !== '.git' && part !== 'node_modules');
}

async function readJson(root, name, maxBytes = 2 * 1024 * 1024) {
  const bytes = await safeRead(root, name, maxBytes);
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); }
  catch { fail('json'); }
  return { data, hash: sha256(bytes) };
}

/**
 * A source-backed *prototype* receipt. Missing/mismatched evidence blocks
 * prototype entry; a valid receipt does not imply observed reference runtime.
 */
export async function auditResearchToBuild(root, packetFile) {
  const packetRef = await readJson(root, packetFile);
  const p = validatePacket(packetRef.data);
  const [requestRef, researchRef, contractRef] = await Promise.all([
    readJson(root, p.inputs.request), readJson(root, p.inputs.research), readJson(root, p.inputs.contract),
  ]);
  const request = requestRef.data, research = researchRef.data, contract = contractRef.data;
  const blockers = [];
  if (request.gameId !== p.gameId || contract.gameId !== p.gameId ||
    research.targetId !== p.referenceId) blockers.push('TARGET_IDENTITY_MISMATCH');
  if (!Array.isArray(research.sources) || research.sources.some(s => s.version !== p.sourceRevision)) {
    blockers.push('REFERENCE_REVISION_MISMATCH');
  }
  const sourceAudit = await verifyEvidence(root, research);
  if (!sourceAudit.passed) blockers.push(...sourceAudit.blockers.map(code => 'SOURCE_' + code));
  const contractAudit = await auditContract(request, contract, root);
  if (contractAudit.status !== 'SPEC_READY_FOR_PROTOTYPE_REVIEW') {
    blockers.push('SPEC_NOT_READY', ...contractAudit.blockers.map(code => 'SPEC_' + code));
  }
  const claimById = new Map(Array.isArray(research.claims) ?
    research.claims.map(c => [c.id, c]) : []);
  const loopIds = new Set(Array.isArray(contract.loops) ? contract.loops.map(l => l.id) : []);
  const caseIds = new Set(Array.isArray(contract.cases) ? contract.cases.map(c => c.id) : []);
  const required = new Set(Array.isArray(research.requiredClaimIds) ? research.requiredClaimIds : []);
  for (const m of p.mechanisms) {
    if (!loopIds.has(m.loopId)) blockers.push('UNKNOWN_LOOP:' + m.id);
    if (m.caseIds.some(id => !caseIds.has(id))) blockers.push('UNKNOWN_QA_CASE:' + m.id);
    for (const id of m.claimIds) {
      const c = claimById.get(id);
      if (!c || !required.has(id) || !['SOURCE_CODE', 'OBSERVATION'].includes(c.kind)) {
        blockers.push('UNVERIFIED_MECHANISM_CLAIM:' + m.id + ':' + id);
      }
    }
  }
  for (const id of required) {
    if (!p.mechanisms.some(m => m.claimIds.includes(id))) blockers.push('REQUIRED_CLAIM_UNMAPPED:' + id);
  }
  let reaStatus = 'NOT_RUN', reaEvidenceId = null, reaReviewHash = null;
  if (p.rea.status === 'REVIEWED_STATIC') {
    const [job, exp, review] = await Promise.all([
      readJson(root, p.rea.job), safeRead(root, p.rea.export, 2 * 1024 * 1024), readJson(root, p.rea.review),
    ]);
    const outcome = await reviewExport(root, job.data, exp, review.data);
    reaStatus = outcome.status;
    reaEvidenceId = outcome.evidenceId ?? null;
    reaReviewHash = review.hash;
    if (outcome.status !== 'ONE_TRIAL_USEFUL_NOT_PROVEN' ||
      outcome.targetId !== p.referenceId || outcome.targetVersion !== p.sourceRevision ||
      outcome.destination !== 'GAME_PRODUCT_REVIEW_ONLY' || outcome.autoApply !== false) {
      blockers.push('REA_REVIEW_NOT_ACCEPTABLE');
    }
    // The existing bridge cannot prove the REA process ran or its report is genuine.
  }
  const uniqueBlockers = [...new Set(blockers)];
  return {
    schemaVersion: 1,
    status: uniqueBlockers.length ? 'BLOCKED' : 'SOURCE_BOUND_PROTOTYPE_HYPOTHESIS',
    candidateBuildAllowed: uniqueBlockers.length === 0,
    releaseAllowed: false,
    referenceRuntimeObserved: false,
    referenceFidelityProven: false,
    reaExecutedVerified: false,
    humanFunValidated: false,
    commercialValidated: false,
    gameId: p.gameId, referenceId: p.referenceId, sourceRevision: p.sourceRevision,
    sourcePermissionBasisDeclared: p.sourcePermission.basis,
    inputs: {
      packetSha256: packetRef.hash, requestSha256: requestRef.hash,
      researchSha256: researchRef.hash, contractSha256: contractRef.hash,
      frozenContractCanonicalSha256: sha256(canonical(contract)),
    },
    verifiedEvidenceFiles: sourceAudit.integrityVerifiedSources,
    mechanismCount: p.mechanisms.length,
    mechanisms: p.mechanisms.map(m => ({
      id: m.id, evidenceClaimIds: m.claimIds, implementationLoopId: m.loopId,
      acceptanceCaseIds: m.caseIds, originalDesign: m.originalDesign,
      playerVisibleFeedback: m.playerVisibleFeedback, failureRecovery: m.failureRecovery,
      basis: 'SOURCE_OR_OBSERVATION_LINKED_DESIGN_HYPOTHESIS',
    })),
    counterfactual: p.counterfactual,
    rea: { status: reaStatus, evidenceId: reaEvidenceId, reviewSha256: reaReviewHash },
    qaStatus: 'NOT_RUN', humanStatus: 'NOT_RUN',
    blockers: uniqueBlockers,
    warnings: [...sourceAudit.warnings,
      'Hash integrity cannot establish factual truth, legal permission or reviewer independence.',
      'Reference gameplay has not been observed or mechanically compared by this gate.',
      'No release, copying third-party expression, REA execution or auto-apply is authorized.'],
    nextStage: uniqueBlockers.length ? 'RESEARCH_FIX' : 'CORE_SLICE_BUILD_WITH_INDEPENDENT_QA',
  };
}
