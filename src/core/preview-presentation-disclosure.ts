import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const PreviewPresentationDisclosureSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  targetGame: Text,
  targetWorkspace: Text.refine((value) => value.startsWith('/'), 'target workspace must be absolute'),
  buildHash: Sha256,
  status: z.enum(['MECHANICS_ONLY', 'FORMAL_VISUAL_CANDIDATE']),
  visualFidelityValidated: z.boolean(),
  visualClaimsAllowed: z.boolean(),
  deferredGates: z.array(Text),
  reasons: z.array(Text).min(1),
  generatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === 'MECHANICS_ONLY' && (value.visualFidelityValidated || value.visualClaimsAllowed === true)) {
    context.addIssue({ code: 'custom', path: ['visualClaimsAllowed'], message: 'mechanics-only previews cannot make visual claims' });
  }
  if (value.status === 'FORMAL_VISUAL_CANDIDATE' && value.deferredGates.length > 0) {
    context.addIssue({ code: 'custom', path: ['deferredGates'], message: 'formal visual candidates cannot retain deferred visual gates' });
  }
});
export type PreviewPresentationDisclosure = z.infer<typeof PreviewPresentationDisclosureSchema>;

export function buildPreviewPresentationDisclosure(input: {
  targetRunId: string;
  targetGame: string;
  targetWorkspace: string;
  buildHash: string;
  mode: 'mechanics-preview' | 'formal';
  generatedAt?: string;
}): PreviewPresentationDisclosure {
  const mechanicsOnly = input.mode === 'mechanics-preview';
  return PreviewPresentationDisclosureSchema.parse({
    schemaVersion: 1,
    targetRunId: input.targetRunId,
    targetGame: input.targetGame,
    targetWorkspace: input.targetWorkspace,
    buildHash: input.buildHash,
    status: mechanicsOnly ? 'MECHANICS_ONLY' : 'FORMAL_VISUAL_CANDIDATE',
    visualFidelityValidated: !mechanicsOnly,
    visualClaimsAllowed: !mechanicsOnly,
    deferredGates: mechanicsOnly ? ['ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK', 'ASSETS', 'PRESENTATION_QA'] : [],
    reasons: mechanicsOnly
      ? ['preview:procedural-placeholders-only', 'reference-reskin:camera-and-material-presentation-unvalidated', 'reference-fidelity:perceptual-review-required']
      : ['formal-style-lock-and-visual-fit-review-present'],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  });
}
