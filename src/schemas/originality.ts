import { z } from 'zod';

const Text = z.string().trim().min(1);
const OriginalElementsSchema = z.object({
  code: z.boolean(),
  assets: z.boolean(),
  namesAndText: z.boolean(),
  uiLayout: z.boolean(),
  audio: z.boolean(),
  tuningValues: z.boolean(),
}).strict();

export const OriginalityDeclarationSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(['PASS', 'BLOCKED']),
  mechanicsOnlyReference: z.boolean(),
  referenceSources: z.array(Text),
  originalElements: OriginalElementsSchema,
  evidence: z.array(Text).min(1),
  unknowns: z.array(Text),
  reviewedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === 'PASS' && !value.mechanicsOnlyReference) context.addIssue({ code: 'custom', path: ['mechanicsOnlyReference'], message: 'only generic mechanics may be referenced' });
  if (value.status === 'PASS' && Object.values(value.originalElements).some((item) => item !== true)) context.addIssue({ code: 'custom', path: ['originalElements'], message: 'all expression elements must be original' });
  if (value.status === 'PASS' && value.unknowns.length > 0) context.addIssue({ code: 'custom', path: ['unknowns'], message: 'PASS cannot retain originality unknowns' });
});
export type OriginalityDeclaration = z.infer<typeof OriginalityDeclarationSchema>;
