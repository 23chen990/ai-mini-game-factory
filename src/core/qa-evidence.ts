import { QaEvidenceSchema, type QaEvidence } from '../schemas/factory-operating.js';
import { NaturalFlowEvidenceSchema, type NaturalFlowEvidence, type NaturalFlowTransition } from '../schemas/natural-flow.js';
import { evaluateNaturalFlowAgainstPolicy } from './natural-input-policy.js';

export function bindQaEvidence(values: QaEvidence[] | undefined, provenance: { buildHash: string; runtime: string; device: { width: number; height: number; label: string }; seed: number | string; runner?: string }): QaEvidence[] {
  return (values ?? []).map((item) => QaEvidenceSchema.parse({ ...item, buildHash: provenance.buildHash, runtime: provenance.runtime, device: provenance.device, seed: provenance.seed, runner: provenance.runner ?? 'trusted-qa-runner' }));
}

export function bindNaturalFlowEvidence(value: NaturalFlowEvidence | undefined, provenance: { buildHash: string; runtime: string; device: { width: number; height: number; label: string }; seed: number | string; runner?: string }): NaturalFlowEvidence | undefined {
  if (value === undefined) return undefined;
  return NaturalFlowEvidenceSchema.parse({ ...value, buildHash: provenance.buildHash, runtime: provenance.runtime, device: provenance.device, seed: provenance.seed, runner: provenance.runner ?? value.runner ?? 'trusted-qa-runner' });
}

export type NaturalFlowEvaluationInput = {
  line?: NaturalFlowEvidence['line'];
  startedFromReset: boolean;
  actions: string[];
  transitions: Pick<NaturalFlowTransition, 'name' | 'changed' | 'evidence'>[];
  completion: NaturalFlowEvidence['completion'];
  replayObserved: boolean;
  forbiddenOperations: string[];
  screenshots: string[];
};

/**
 * Evaluate a player-driven representative loop without relying on the test
 * API to manufacture progress.  The fast lane may accept an
 * `automatic-progress` product as a diagnostic candidate; strict release
 * callers separately require a settlement or terminal outcome.
 */
export function evaluateNaturalFlow(input: NaturalFlowEvaluationInput, options: { requireSettlement?: boolean; requireReplay?: boolean } = {}): NaturalFlowEvidence {
  const blockers: string[] = [];
  if (!input.startedFromReset) blockers.push('natural-reset-missing');
  if (input.actions.length < 2) blockers.push('natural-action-trace-too-short');
  if (input.transitions.length === 0 || !input.transitions.some((transition) => transition.changed)) blockers.push('natural-state-transition-missing');
  if ((options.requireSettlement ?? true) && !['settlement', 'terminal', 'automatic-progress'].includes(input.completion)) blockers.push('natural-settlement-missing');
  if ((options.requireReplay ?? true) && !input.replayObserved) blockers.push('natural-replay-missing');
  if (input.forbiddenOperations.length > 0) blockers.push('natural-e2e-contains-state-forcing-operation');
  if (input.screenshots.length === 0) blockers.push('natural-screenshot-missing');
  return NaturalFlowEvidenceSchema.parse({
    schemaVersion: 1,
    ...(input.line ? { line: input.line } : {}),
    startedFromReset: input.startedFromReset,
    actions: input.actions,
    transitions: input.transitions,
    completion: input.completion,
    replayObserved: input.replayObserved,
    forbiddenOperations: input.forbiddenOperations,
    screenshots: input.screenshots,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    runner: 'trusted-qa-runner',
    observedAt: new Date().toISOString(),
  });
}

export function evaluateQaEvidence(values: QaEvidence[] | undefined, options: {
  requireNatural?: boolean;
  requireStateCoverage?: boolean;
  requireNaturalComplete?: boolean;
  naturalFlow?: unknown;
  /** Require every evidence item to identify the exact tested build and
   * trusted runner. Keep opt-in for legacy/local diagnostic reports. */
  requireProvenance?: boolean;
  expectedBuildHash?: string;
  expectedRuntime?: string;
  expectedDevice?: { width: number; height: number; label: string };
  expectedSeed?: number | string;
  /** Optional production-line policy. When supplied, natural evidence must
   * exercise the line's representative verbs, not merely change any state. */
  naturalPolicy?: unknown;
} = {}) {
  const evidence = (values ?? []).map((item) => QaEvidenceSchema.parse(item));
  const modes = new Set(evidence.map((item) => item.mode));
  const blockers: string[] = [];
  if (options.requireNatural && !modes.has('NATURAL_E2E')) blockers.push('natural-e2e-missing');
  if (options.requireStateCoverage && !modes.has('STATE_COVERAGE')) blockers.push('state-coverage-missing');
  if (evidence.some((item) => item.mode === 'NATURAL_E2E' && item.forbiddenOperations.length > 0)) blockers.push('natural-e2e-contains-state-forcing-operation');
  for (const item of evidence) {
    const missingProvenance = item.buildHash === undefined || item.runtime === undefined || item.device === undefined || item.seed === undefined || item.runner === undefined;
    if (options.requireProvenance && missingProvenance) blockers.push('qa-provenance-missing');
    if (options.expectedBuildHash !== undefined && item.buildHash !== options.expectedBuildHash) blockers.push('qa-build-hash-mismatch');
    if (options.expectedRuntime !== undefined && item.runtime !== options.expectedRuntime) blockers.push('qa-runtime-mismatch');
    if (options.expectedDevice !== undefined && (item.device?.width !== options.expectedDevice.width || item.device?.height !== options.expectedDevice.height || item.device?.label !== options.expectedDevice.label)) blockers.push('qa-device-mismatch');
    if (options.expectedSeed !== undefined && item.seed !== options.expectedSeed) blockers.push('qa-seed-mismatch');
  }
  if (options.requireNaturalComplete) {
    const parsed = NaturalFlowEvidenceSchema.safeParse(options.naturalFlow);
    if (!parsed.success) blockers.push('natural-flow-trace-missing');
    else {
      if (!parsed.data.passed) blockers.push(...parsed.data.blockers);
      if (!['settlement', 'terminal'].includes(parsed.data.completion)) blockers.push('natural-flow-terminal-missing');
      if (!parsed.data.replayObserved) blockers.push('natural-replay-missing');
      const missingProvenance = parsed.data.buildHash === undefined || parsed.data.runtime === undefined || parsed.data.device === undefined || parsed.data.seed === undefined || parsed.data.runner === undefined;
      if (options.requireProvenance && missingProvenance) blockers.push('qa-natural-flow-provenance-missing');
      if (options.expectedBuildHash !== undefined && parsed.data.buildHash !== options.expectedBuildHash) blockers.push('qa-build-hash-mismatch');
      if (options.expectedRuntime !== undefined && parsed.data.runtime !== options.expectedRuntime) blockers.push('qa-runtime-mismatch');
      if (options.expectedDevice !== undefined && (parsed.data.device?.width !== options.expectedDevice.width || parsed.data.device?.height !== options.expectedDevice.height || parsed.data.device?.label !== options.expectedDevice.label)) blockers.push('qa-device-mismatch');
      if (options.expectedSeed !== undefined && parsed.data.seed !== options.expectedSeed) blockers.push('qa-seed-mismatch');
      if (options.naturalPolicy !== undefined) {
        try {
          const policyResult = evaluateNaturalFlowAgainstPolicy(parsed.data, options.naturalPolicy, {
            expectedBuildHash: options.expectedBuildHash,
            expectedRuntime: options.expectedRuntime,
          });
          if (!policyResult.passed) blockers.push(...policyResult.blockers.map((item) => `natural-policy:${item}`));
        } catch {
          blockers.push('natural-policy-invalid');
        }
      }
    }
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], modes: [...modes], evidence };
}
