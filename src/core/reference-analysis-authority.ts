import { ReferenceBehaviorAnalysisSchema, type ReferenceBehaviorAnalysis } from '../schemas/reference-evidence.js';

export const NON_AUTHORITATIVE_RECORDING_PROVIDER = 'recording-level:non-authoritative-provider:mock';

export function enforceRecordingAnalysisAuthority(input: {
  analysis: ReferenceBehaviorAnalysis;
  provider: string;
  recordingDeclared: boolean;
  allowSyntheticForTests?: boolean;
}): ReferenceBehaviorAnalysis {
  const analysis = ReferenceBehaviorAnalysisSchema.parse(input.analysis);
  if (!input.recordingDeclared || input.allowSyntheticForTests || input.provider !== 'mock') return analysis;

  const unknowns = [...new Set([...analysis.unknowns, NON_AUTHORITATIVE_RECORDING_PROVIDER])];
  const levelReconstruction = analysis.levelReconstruction
    ? {
        ...analysis.levelReconstruction,
        unknowns: [...new Set([...analysis.levelReconstruction.unknowns])],
        blockers: [...new Set([...analysis.levelReconstruction.blockers, NON_AUTHORITATIVE_RECORDING_PROVIDER])],
        status: 'BLOCKED' as const,
      }
    : analysis.levelReconstruction;

  return ReferenceBehaviorAnalysisSchema.parse({
    ...analysis,
    unknowns,
    levelReconstruction,
    status: 'BLOCKED',
  });
}
