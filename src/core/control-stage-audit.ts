import type { StageName } from '../schemas/index.js';
import { StageContractAuditSchema, type StageContract, type StageContractAudit } from '../schemas/stage-contracts.js';
import { contractPathMatches, evaluateStageContract, getStageContract } from './stage-contracts.js';

export type ControlStageObservation = {
  inputs: string[];
  artifacts: string[];
  evidence: string[];
};

export type ControlStageAuditOptions = {
  /** Require one or more concrete files for a wildcard output declaration. */
  minimumArtifacts?: Record<string, number>;
  /** Require every declared output to carry its schema version. */
  strictVersions?: boolean;
  /** Allow a lane-specific control contract while retaining the same audit shape. */
  contract?: StageContract;
};

/**
 * Build the same durable contract audit used by provider-backed stages for
 * control-plane stages (visual/variation/baseline/etc.). Keeping this pure
 * means a caller can write the audit and transition state atomically, while a
 * waiting stage remains visibly incomplete instead of being treated as pass.
 */
export function buildControlStageAudit(stageValue: StageName, observed: ControlStageObservation, options: ControlStageAuditOptions = {}): StageContractAudit {
  const stage = options.contract ?? getStageContract(stageValue);
  const base = evaluateStageContract(stage, {
    inputs: observed.inputs,
    artifacts: observed.artifacts,
    evidence: observed.evidence,
    strictVersions: options.strictVersions === true,
    artifactVersions: Object.fromEntries([
      ...stage.outputs
        .filter((output) => output.required)
        .flatMap((output) => observed.artifacts
          .filter((artifact) => contractPathMatches(output.path, artifact))
          .map((artifact) => [artifact, output.artifactVersion] as const)),
      ...stage.inputs
        .filter((input) => input.required)
        .flatMap((input) => observed.inputs
          .filter((artifact) => contractPathMatches(input.path, artifact))
          .map((artifact) => [artifact, input.artifactVersion] as const)),
    ]),
  });
  const missing = [...base.missing];
  for (const [pattern, minimum] of Object.entries(options.minimumArtifacts ?? {})) {
    if (!Number.isInteger(minimum) || minimum < 1) {
      missing.push(`artifact-count:${pattern}:invalid-minimum`);
      continue;
    }
    const count = observed.artifacts.filter((artifact) => contractPathMatches(pattern, artifact)).length;
    if (count < minimum) missing.push(`artifact-count:${pattern}:${minimum}`);
  }
  const uniqueMissing = [...new Set(missing)];
  return StageContractAuditSchema.parse({ ...base, passed: uniqueMissing.length === 0, missing: uniqueMissing });
}
