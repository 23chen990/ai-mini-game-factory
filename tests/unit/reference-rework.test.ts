import { describe, expect, it } from 'vitest';
import { ReferenceFidelityReviewSchema } from '../../src/schemas/reference-fidelity.js';

const evidence = { path: 'screenshots/normal-input.png', sha256: 'a'.repeat(64) };
export const discovery = {
  id: 'unplanned-pressure-gap', severity: 'error', rootCause: 'design',
  evidence: 'logs/natural.json', message: 'The normal action can bypass every meaningful obstacle.',
  hypothesis: 'The specification omitted an avoid-versus-contact decision; implementation follows the specification.',
  objectType: 'obstacle cluster', stateBranch: 'approach -> avoid -> continue',
  viewport: { width: 390, height: 844 }, screenshots: [evidence], trace: { ...evidence, path: 'logs/natural.json' },
};

describe('independent discoveries beyond the Builder contract', () => {
  it('preserves a source/build-bound discovery even when every declared check passed', () => {
    const review = { schemaVersion: 1, targetRunId: 'run-1', workspace: '/tmp/run-1/workspace/game', contractHash: 'b'.repeat(64), buildHash: 'c'.repeat(64), reviewer: 'QAAgent', authorIndependent: true, cases: [], discoveries: [discovery] };
    const parsed = ReferenceFidelityReviewSchema.safeParse(review);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data).toHaveProperty('discoveries', [discovery]);
  });
});

// Production routing must not guess an upstream cause from issue wording.
import * as routing from '../../src/core/failure-routing.js';
it('exposes explicit QA root-cause routing on the existing failure router', () => {
  expect(routing).toHaveProperty('routeQaIssues');
});

it('can repair an independently evidenced implementation issue while retaining unrelated evidence gaps', () => {
 const finding={id:'input',severity:'error',message:'Visible control has no response',evidence:'logs/input.json',hypothesis:'The runtime omitted its declared input listener.'};
 expect(routing.routeQaIssues([{...finding,rootCause:'implementation'},{...finding,id:'source-timing',rootCause:'evidence'}]).stage).toBe('FIX');
});
