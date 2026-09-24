import { describe, expect, it } from 'vitest';
import { buildPreviewPresentationDisclosure, PreviewPresentationDisclosureSchema } from '../../src/core/preview-presentation-disclosure.js';

describe('preview presentation disclosure', () => {
  it('marks replica mechanics previews as non-visual candidates', () => {
    const disclosure = buildPreviewPresentationDisclosure({
      targetRunId: 'run-1',
      targetGame: 'blade',
      targetWorkspace: '/tmp/run/workspace/game',
      buildHash: 'a'.repeat(64),
      mode: 'mechanics-preview',
    });
    expect(disclosure).toMatchObject({
      status: 'MECHANICS_ONLY',
      visualFidelityValidated: false,
      visualClaimsAllowed: false,
      deferredGates: expect.arrayContaining(['ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK', 'ASSETS', 'PRESENTATION_QA']),
    });
    expect(() => PreviewPresentationDisclosureSchema.parse(disclosure)).not.toThrow();
  });

  it('does not mark a formal visual-fit candidate as mechanics-only', () => {
    const disclosure = buildPreviewPresentationDisclosure({
      targetRunId: 'run-1',
      targetGame: 'blade',
      targetWorkspace: '/tmp/run/workspace/game',
      buildHash: 'b'.repeat(64),
      mode: 'formal',
    });
    expect(disclosure.status).toBe('FORMAL_VISUAL_CANDIDATE');
    expect(disclosure.visualClaimsAllowed).toBe(true);
    expect(disclosure.deferredGates).toEqual([]);
  });
});
