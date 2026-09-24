import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

/**
 * Durable, non-content evidence emitted by the research boundary.  The
 * report deliberately stores only identifiers/counts and a hash of the
 * parsed research artifact; raw pages and model transcripts never cross into
 * this artifact or into a mutating role.
 */
export const CompetitorResearchEvidenceReportSchema = z.object({
  schemaVersion: z.literal(1),
  passed: z.boolean(),
  legacy: z.boolean(),
  blockers: z.array(Text),
  researchHash: Sha256,
  sourceCount: z.number().int().nonnegative(),
  verifiedSourceCount: z.number().int().nonnegative(),
  claimCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  sourceIds: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict().superRefine((report, context) => {
  if (report.verifiedSourceCount > report.sourceCount) context.addIssue({ code: 'custom', path: ['verifiedSourceCount'], message: 'verified source count cannot exceed source count' });
  if (report.legacy !== (report.sourceCount === 0)) context.addIssue({ code: 'custom', path: ['legacy'], message: 'legacy must reflect an empty source record set' });
  if (report.passed !== (report.blockers.length === 0)) context.addIssue({ code: 'custom', path: ['passed'], message: 'passed must be derived from blockers' });
  if (new Set(report.sourceIds).size !== report.sourceIds.length) context.addIssue({ code: 'custom', path: ['sourceIds'], message: 'source ids must be unique' });
  if (report.sourceIds.length !== report.sourceCount) context.addIssue({ code: 'custom', path: ['sourceIds'], message: 'source id count must match source count' });
});

export type CompetitorResearchEvidenceReport = z.infer<typeof CompetitorResearchEvidenceReportSchema>;
