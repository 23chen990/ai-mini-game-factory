import {
  HumanApprovalEvaluationSchema,
  HumanApprovalLedgerSchema,
  HumanApprovalPlanSchema,
  HumanApprovalRecordSchema,
  type HumanApprovalEvaluation,
  type HumanApprovalLedger,
  type HumanApprovalPlan,
  type HumanApprovalRecord,
  type HumanApprovalSessionId,
} from '../schemas/human-approval.js';

export function buildHumanApprovalPlan(designMode: HumanApprovalPlan['designMode']): HumanApprovalPlan {
  // Required references are evaluated at the moment a session is signed. Do
  // not require artifacts that are only produced by a later stage (for
  // example a release manifest cannot be evidence for the playtest that
  // precedes RELEASE). The two design entrances have different core-demo
  // evidence, so the plan records that difference explicitly.
  const goNoGoArtifacts = [
    'artifacts/factory-profile.json',
    'artifacts/business-preflight.json',
  ];
  const coreDemoArtifacts = [
    'artifacts/game-blueprint.json',
    'artifacts/experience-contract.json',
    'artifacts/art-directions.json',
    'human/art-approval.yaml',
  ];
  const finalReleaseArtifacts = [
    'artifacts/release-candidate.json',
    'artifacts/completion-gates.json',
    'artifacts/platform-release-matrix.json',
  ];
  const sessions = [
      { id: 'GO_NO_GO' as const, purpose: 'Confirm business readiness and the human-locked core premise before spending production effort.', requiredArtifacts: goNoGoArtifacts, allowedDecisions: ['APPROVE', 'REVISE', 'KILL'] as const, approvalClass: 'scheduled' as const, owner: 'HumanReviewer' as const, countsTowardScheduledSession: true as const },
      { id: 'CORE_DEMO' as const, purpose: 'Approve the core mechanic/demo lock before full content production.', requiredArtifacts: coreDemoArtifacts, allowedDecisions: ['APPROVE', 'REVISE', 'KILL'] as const, approvalClass: 'scheduled' as const, owner: 'HumanReviewer' as const, countsTowardScheduledSession: true as const },
      { id: 'FINAL_RELEASE' as const, purpose: 'Play the immutable candidate naturally and sign the release decision.', requiredArtifacts: finalReleaseArtifacts, allowedDecisions: ['APPROVE', 'KILL'] as const, approvalClass: 'scheduled' as const, owner: 'HumanReviewer' as const, countsTowardScheduledSession: true as const },
    ];
  return HumanApprovalPlanSchema.parse({
    schemaVersion: 1,
    designMode,
    sessions,
    scheduledSessions: sessions,
    exceptionGates: ['reference-conflict', 'rights-unknown', 'platform-unknown', 'differentiation-review', 'waiver', 'manual-dispute'],
    conditionalGates: [
      { id: 'reference-conflict', trigger: 'Research and the human reference lock disagree on a core mechanic.', owner: 'HumanReviewer', blocking: true, requiredEvidence: ['artifacts/reference-evidence.json', 'human/reference-decision.yaml'], approvalClass: 'conditional', countsTowardScheduledSession: false },
      { id: 'rights-unknown', trigger: 'Source, license or asset provenance cannot be verified.', owner: 'HumanReviewer', blocking: true, requiredEvidence: ['artifacts/open-source-research.json', 'artifacts/supply-chain.json'], approvalClass: 'conditional', countsTowardScheduledSession: false },
      { id: 'platform-unknown', trigger: 'A target platform lacks account, package or device evidence.', owner: 'HumanReviewer', blocking: true, requiredEvidence: ['artifacts/platform-release-matrix.json', 'artifacts/platform-package-set.json'], approvalClass: 'conditional', countsTowardScheduledSession: false },
      { id: 'differentiation-review', trigger: 'The game does not demonstrate meaningful structural differentiation from its reference.', owner: 'HumanReviewer', blocking: true, requiredEvidence: ['artifacts/differentiation-contract.json'], approvalClass: 'conditional', countsTowardScheduledSession: false },
      { id: 'waiver', trigger: 'A non-critical unknown is explicitly waived with an expiry.', owner: 'HumanReviewer', blocking: true, requiredEvidence: ['artifacts/unknown-register.json'], approvalClass: 'conditional', countsTowardScheduledSession: false },
      { id: 'manual-dispute', trigger: 'Independent reviewers disagree on a release-critical finding.', owner: 'HumanReviewer', blocking: true, requiredEvidence: ['artifacts/failure-report.json'], approvalClass: 'conditional', countsTowardScheduledSession: false },
    ],
    asyncRecords: [
      { id: 'platform-paperwork', purpose: 'Record account, certification and submission receipts without adding a scheduled play session.', owner: 'HumanReviewer', requiredEvidence: ['artifacts/certification-checklist.json'], approvalClass: 'async', countsTowardScheduledSession: false },
      { id: 'release-promotion', purpose: 'Record an external platform submission or live verification event against the frozen hash.', owner: 'ReleaseAgent', requiredEvidence: ['artifacts/live-verification/'], approvalClass: 'async', countsTowardScheduledSession: false },
    ],
    rule: 'three-scheduled-sessions-plus-exceptions',
  });
}

/**
 * Construct one of the three canonical human approvals from a single,
 * schema-checked input.  The deterministic record id makes repeated resume
 * operations idempotent; the factory may explicitly replace it when a human
 * submits a revised decision with `force`.
 */
export function buildScheduledApprovalRecord(input: {
  sessionId: HumanApprovalSessionId;
  decision: 'APPROVE' | 'REVISE' | 'KILL';
  artifactRefs: string[];
  reviewer?: string;
  candidateHash?: string;
  notes?: string[];
  recordId?: string;
  recordedAt?: string;
}): HumanApprovalRecord {
  const artifactRefs = [...new Set(input.artifactRefs.map((value) => value.trim()).filter(Boolean))];
  const notes = (input.notes ?? []).map((value) => value.trim()).filter(Boolean);
  return HumanApprovalRecordSchema.parse({
    schemaVersion: 1,
    recordId: input.recordId ?? `scheduled:${input.sessionId}`,
    sessionId: input.sessionId,
    approvalClass: 'scheduled',
    decision: input.decision,
    reviewer: input.reviewer?.trim() || 'HumanReviewer',
    artifactRefs,
    ...(input.candidateHash ? { candidateHash: input.candidateHash } : {}),
    notes,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  });
}

export type HumanApprovalEvaluationOptions = {
  runId?: string;
  /** The immutable candidate hash required by FINAL_RELEASE, when available. */
  candidateHash?: string;
  /** Conditional gates that are actually triggered by the current run. */
  triggeredConditionalGates?: string[];
  /**
   * Optional inventory of files that really exist in the run.  Supplying an
   * inventory turns a reviewer-provided path into a verifiable claim; without
   * it we retain the legacy/reference-only behavior for old ledgers.
   */
  availableArtifacts?: string[];
};

function hasRequiredArtifact(refs: string[], required: string): boolean {
  return refs.some((ref) => ref === required || ref.startsWith(required) || required.startsWith(ref));
}

function hasAvailableArtifact(inventory: string[], required: string): boolean {
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//u, '').trim();
  const expected = normalize(required);
  return inventory.some((raw) => {
    const actual = normalize(raw);
    if (!actual || !expected) return false;
    // Batch artifacts use a stable name prefix (for example
    // `winner-selection.batch-1.json` / `batch-2.json`). A trailing hyphen is
    // an explicit prefix marker; do not treat arbitrary `foo`/`foobar`
    // similarities as a match.
    if (expected.endsWith('-') && actual.startsWith(expected)) return true;
    return actual === expected
      || actual.startsWith(expected.endsWith('/') ? expected : `${expected}/`)
      || expected.startsWith(actual.endsWith('/') ? actual : `${actual}/`);
  });
}

/**
 * Evaluate actual human records against the canonical three-session plan.
 * Conditional and asynchronous records are deliberately represented in the
 * result but can never satisfy a missing scheduled session.
 */
export function evaluateHumanApprovalRecords(
  planValue: unknown,
  recordsValue: unknown,
  options: HumanApprovalEvaluationOptions = {},
): HumanApprovalEvaluation {
  const plan = HumanApprovalPlanSchema.parse(planValue);
  const blockers: string[] = [];
  const parsedRecords: HumanApprovalRecord[] = [];
  if (!Array.isArray(recordsValue)) {
    blockers.push('records:missing');
  } else {
    for (const value of recordsValue) {
      const parsed = HumanApprovalRecordSchema.safeParse(value);
      if (!parsed.success) {
        blockers.push('record:schema-invalid');
        continue;
      }
      parsedRecords.push(parsed.data);
    }
  }

  const scheduled = plan.sessions.map((session) => {
    const matches = parsedRecords.filter((record) => record.approvalClass === 'scheduled' && record.sessionId === session.id);
    if (matches.length === 0) {
      blockers.push(`scheduled:${session.id}:missing`);
      return { id: session.id, status: 'MISSING' as const };
    }
    if (matches.length > 1) {
      blockers.push(`scheduled:${session.id}:duplicate`);
      return { id: session.id, status: 'DUPLICATE' as const, recordId: matches[0]!.recordId };
    }
    const record = matches[0]!;
    if (record.decision !== 'APPROVE') {
      blockers.push(`scheduled:${session.id}:rejected`);
      return { id: session.id, status: 'REJECTED' as const, recordId: record.recordId };
    }
    if (session.requiredArtifacts.some((required) => !hasRequiredArtifact(record.artifactRefs, required))) {
      for (const required of session.requiredArtifacts) if (!hasRequiredArtifact(record.artifactRefs, required)) blockers.push(`scheduled:${session.id}:artifact-missing:${required}`);
    }
    if (options.availableArtifacts) {
      for (const required of session.requiredArtifacts) {
        if (hasRequiredArtifact(record.artifactRefs, required) && !hasAvailableArtifact(options.availableArtifacts, required)) {
          blockers.push(`scheduled:${session.id}:artifact-unavailable:${required}`);
        }
      }
    }
    if (session.id === 'FINAL_RELEASE' && options.candidateHash) {
      if (!record.candidateHash) {
        blockers.push('scheduled:FINAL_RELEASE:candidate-hash-missing');
        return { id: session.id, status: 'HASH_MISMATCH' as const, recordId: record.recordId };
      }
      if (record.candidateHash !== options.candidateHash) {
        blockers.push('scheduled:FINAL_RELEASE:candidate-hash-mismatch');
        return { id: session.id, status: 'HASH_MISMATCH' as const, recordId: record.recordId };
      }
    }
    return { id: session.id, status: 'APPROVED' as const, recordId: record.recordId };
  });

  // A scheduled-looking record with a non-canonical id, and a canonical id
  // recorded under another class, are both explicit audit failures.
  for (const record of parsedRecords.filter((item) => item.approvalClass === 'scheduled')) {
    if (!plan.sessions.some((session) => session.id === record.sessionId)) blockers.push(`scheduled:${record.sessionId}:unknown`);
  }
  for (const session of plan.sessions) {
    if (parsedRecords.some((record) => record.sessionId === session.id && record.approvalClass !== 'scheduled')) blockers.push(`scheduled:${session.id}:wrong-class`);
  }

  const triggered = new Set(options.triggeredConditionalGates ?? []);
  const conditional = plan.conditionalGates.map((gate) => {
    const matches = parsedRecords.filter((record) => record.approvalClass === 'conditional' && record.sessionId === gate.id);
    if (!triggered.has(gate.id)) return { id: gate.id, status: 'NOT_TRIGGERED' as const };
    if (matches.length === 0) {
      blockers.push(`conditional:${gate.id}:missing`);
      return { id: gate.id, status: 'MISSING' as const };
    }
    if (matches.length > 1) {
      blockers.push(`conditional:${gate.id}:duplicate`);
      return { id: gate.id, status: 'DUPLICATE' as const };
    }
    if (matches[0]!.decision !== 'APPROVE') {
      blockers.push(`conditional:${gate.id}:rejected`);
      return { id: gate.id, status: 'REJECTED' as const };
    }
    return { id: gate.id, status: 'APPROVED' as const };
  });

  const asyncRecords = plan.asyncRecords.map((expected) => {
    const matches = parsedRecords.filter((record) => record.approvalClass === 'async' && record.sessionId === expected.id);
    if (matches.length > 1) {
      blockers.push(`async:${expected.id}:duplicate`);
      return { id: expected.id, status: 'DUPLICATE' as const };
    }
    return { id: expected.id, status: matches.length === 1 ? 'RECORDED' as const : 'MISSING' as const };
  });

  return HumanApprovalEvaluationSchema.parse({
    schemaVersion: 1,
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.candidateHash ? { candidateHash: options.candidateHash } : {}),
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    scheduled,
    conditional,
    asyncRecords,
    evaluatedAt: new Date().toISOString(),
  });
}

export function buildHumanApprovalLedger(runId: string, records: unknown[] = []): HumanApprovalLedger {
  return HumanApprovalLedgerSchema.parse({ schemaVersion: 1, runId, records, updatedAt: new Date().toISOString() });
}

/**
 * Validate a persisted approval ledger before evaluating its records.
 *
 * A malformed or foreign ledger must never be silently replaced with an empty
 * ledger: doing that makes a tampered approval look exactly like an ordinary
 * “no approvals yet” state and weakens the audit trail.  We still return the
 * normal scheduled/conditional/async matrix so operators can see what is
 * missing, while adding an explicit immutable blocker for the ledger failure.
 */
export function evaluateHumanApprovalLedgerArtifact(
  planValue: unknown,
  ledgerValue: unknown,
  options: HumanApprovalEvaluationOptions = {},
): HumanApprovalEvaluation {
  const parsedLedger = HumanApprovalLedgerSchema.safeParse(ledgerValue);
  const ledgerRecords = parsedLedger.success ? parsedLedger.data.records : ledgerValue;
  const evaluation = evaluateHumanApprovalRecords(planValue, ledgerRecords, options);
  const ledgerBlocker = !parsedLedger.success
    ? 'ledger:schema-invalid'
    : options.runId && parsedLedger.data.runId !== options.runId
      ? 'ledger:run-id-mismatch'
      : undefined;
  if (!ledgerBlocker) return evaluation;
  return HumanApprovalEvaluationSchema.parse({
    ...evaluation,
    passed: false,
    blockers: [...new Set([...evaluation.blockers, ledgerBlocker])],
  });
}
