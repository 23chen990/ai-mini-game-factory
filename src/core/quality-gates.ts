import { QUALITY_DIMENSIONS, QualityGateMatrixSchema, QualityGateRecordSchema, type QualityDimensionId, type QualityGateMatrix, type QualityGateRecord } from '../schemas/quality-gates.js';

type GateInput = {
  status: QualityGateRecord['status'];
  evidence?: string[];
  blockers?: string[];
  waiver?: QualityGateRecord['waiver'];
};

export type QualityGateMatrixInput = {
  gates: Partial<Record<QualityDimensionId, GateInput>>;
  candidateHash?: string;
  requireCandidateHash?: boolean;
  now?: Date;
};

export type QualityGateSignal = {
  /** `undefined` means the evidence has not been produced yet. */
  passed?: boolean;
  evidence?: string[];
  blockers?: string[];
};

/**
 * Adapt the two profile-QA artifacts used by the pipeline to the canonical
 * quality-matrix signal.  Older runs only contain `final-profile-qa.json`
 * (whose result is expressed as a `decision`), while newer runs also persist
 * `profile-qa-evidence.json` (whose result is a boolean).  Keeping this
 * normalisation in one pure helper prevents the control plane from checking a
 * non-existent `passed` field and silently turning an approved profile into
 * UNKNOWN.
 *
 * A disagreement between the two artifacts is deliberately a failure rather
 * than a pass: it usually means that one report is stale or was edited after
 * the other.  Missing evidence remains UNKNOWN so fast/legacy runs can show a
 * useful status without inventing approval.
 */
export function profileQaSignal(finalProfileValue: unknown, profileEvidenceValue?: unknown): QualityGateSignal {
  const finalProfile = finalProfileValue && typeof finalProfileValue === 'object' && !Array.isArray(finalProfileValue)
    ? finalProfileValue as Record<string, unknown>
    : undefined;
  const profileEvidence = profileEvidenceValue && typeof profileEvidenceValue === 'object' && !Array.isArray(profileEvidenceValue)
    ? profileEvidenceValue as Record<string, unknown>
    : undefined;
  const decision = finalProfile?.decision;
  const decisionPassed = decision === 'APPROVED' ? true : decision === 'FEEL_REPAIR_REQUIRED' ? false : undefined;
  const evidencePassed = typeof profileEvidence?.passed === 'boolean' ? profileEvidence.passed : undefined;
  const evidence = [
    finalProfileValue !== undefined ? 'artifacts/final-profile-qa.json' : '',
    profileEvidenceValue !== undefined ? 'artifacts/profile-qa-evidence.json' : '',
  ].filter(Boolean);

  if (decisionPassed === undefined && evidencePassed === undefined) {
    return { passed: undefined, evidence, blockers: ['profile-qa-missing-or-invalid'] };
  }
  if (decisionPassed !== undefined && evidencePassed !== undefined && decisionPassed !== evidencePassed) {
    return { passed: false, evidence, blockers: ['profile-qa-artifacts-disagree'] };
  }
  const passed = decisionPassed ?? evidencePassed;
  return {
    passed,
    evidence,
    blockers: passed === true ? [] : ['profile-qa-failed'],
  };
}

/** Build one canonical status matrix from independently produced evidence.
 * Missing evidence is UNKNOWN (never an implicit pass), and only an explicit
 * human waiver can clear a known non-blocking exception. */
export function evaluateQualityGateMatrix(input: QualityGateMatrixInput): QualityGateMatrix {
  const now = input.now ?? new Date();
  const dimensions = QUALITY_DIMENSIONS.map((id) => {
    const raw = input.gates[id];
    const record = QualityGateRecordSchema.parse({
      id,
      status: raw?.status ?? 'UNKNOWN',
      evidence: raw?.evidence ?? [],
      blockers: raw?.blockers ?? (raw ? [] : [`missing:${id}`]),
      ...(raw?.waiver ? { waiver: raw.waiver } : {}),
    });
    if (record.status === 'WAIVED' && record.waiver?.expiresAt && Date.parse(record.waiver.expiresAt) <= now.getTime()) {
      return QualityGateRecordSchema.parse({ ...record, status: 'UNKNOWN', blockers: [...record.blockers, 'waiver-expired'], waiver: undefined });
    }
    return record;
  });
  const blockers = dimensions.filter((item) => item.status !== 'PASS' && item.status !== 'WAIVED').map((item) => item.id);
  const candidateHash = input.candidateHash?.trim();
  if (input.requireCandidateHash === true && !/^[a-f0-9]{64}$/iu.test(candidateHash ?? '')) {
    // Candidate identity is release engineering evidence; keep it as a
    // dimension blocker rather than throwing away the useful matrix.
    const index = dimensions.findIndex((item) => item.id === 'releaseEngineering');
    if (index >= 0 && dimensions[index]!.status === 'PASS') {
      dimensions[index] = QualityGateRecordSchema.parse({ ...dimensions[index], status: 'UNKNOWN', blockers: ['candidate-hash-missing'] });
      blockers.push('releaseEngineering');
    }
  }
  return QualityGateMatrixSchema.parse({
    schemaVersion: 1,
    ...(candidateHash ? { candidateHash } : {}),
    dimensions,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    evaluatedAt: now.toISOString(),
    evaluator: 'FactoryControlPlane',
  });
}

/** Convenience adapter for control-plane artifacts.  It intentionally keeps
 * three states (pass/fail/unknown) instead of coercing missing booleans to a
 * pass, which is the common source of phantom release approvals. */
export function buildQualityGateMatrix(signals: Partial<Record<QualityDimensionId, QualityGateSignal>>, options: Omit<QualityGateMatrixInput, 'gates'> = {}): QualityGateMatrix {
  const gates = Object.fromEntries(QUALITY_DIMENSIONS.map((id) => {
    const signal = signals[id];
    const status: QualityGateRecord['status'] = signal?.passed === true ? 'PASS' : signal?.passed === false ? 'FAIL' : 'UNKNOWN';
    const blockers = signal?.blockers ?? (status === 'PASS' ? [] : [`missing-or-failed:${id}`]);
    return [id, { status, evidence: signal?.evidence ?? [], blockers }];
  })) as QualityGateMatrixInput['gates'];
  return evaluateQualityGateMatrix({ ...options, gates });
}

export function qualityGateRecord(id: QualityDimensionId, status: QualityGateRecord['status'], evidence: string[], blockers: string[] = [], waiver?: QualityGateRecord['waiver']): QualityGateRecord {
  return QualityGateRecordSchema.parse({ id, status, evidence, blockers, ...(waiver ? { waiver } : {}) });
}

/** Re-evaluate a matrix after the exact release-candidate hash is known. A
 * matrix produced before freezing is useful evidence, but it is not release
 * evidence until this binding step has run. */
export function bindQualityGateMatrix(value: unknown, candidateHash: string, now = new Date()): QualityGateMatrix {
  if (!/^[a-f0-9]{64}$/iu.test(candidateHash.trim())) throw new Error('candidate hash must be a SHA-256 digest');
  const parsed = QualityGateMatrixSchema.parse(value);
  if (parsed.candidateHash && parsed.candidateHash !== candidateHash) throw new Error('quality matrix is already bound to a different candidate hash');
  const gates = Object.fromEntries(parsed.dimensions.map((item) => [item.id, { status: item.status, evidence: item.evidence, blockers: item.blockers, ...(item.waiver ? { waiver: item.waiver } : {}) }])) as QualityGateMatrixInput['gates'];
  return evaluateQualityGateMatrix({ gates, candidateHash: candidateHash.trim(), requireCandidateHash: true, now });
}

export function assertQualityGateCandidateBinding(value: unknown, candidateHash: string): QualityGateMatrix {
  const matrix = QualityGateMatrixSchema.parse(value);
  if (matrix.candidateHash !== candidateHash) throw new Error('quality gate matrix candidate hash does not match release candidate');
  return matrix;
}
