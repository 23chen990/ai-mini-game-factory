import { z } from 'zod';

export const QaIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  evidence: z.string(),
  /** A hypothesis, not proof. Omitted on legacy engineering reports. */
  rootCause: z.enum(['implementation', 'research', 'design', 'evidence', 'unknown']).optional(),
  hypothesis: z.string().trim().min(1).optional(),
});
