import { describe, expect, it } from 'vitest';
import { ExperienceComplaintTriageSchema, ExperienceReproductionMatrixSchema } from '../../src/schemas/experience-complaint.js';

const evidence = { path: '/run/capture.png', sha256: 'a'.repeat(64), kind: 'runtime-capture' as const, provenance: 'verified-run-artifact' as const };

describe('experience complaint artifacts', () => {
  it('binds a complaint to one exact game, workspace, route and acceptance list', () => {
    expect(ExperienceComplaintTriageSchema.parse({
      schemaVersion: 1, artifactType: 'experience-complaint-triage', targetGame: 'slice', workspace: '/runs/slice/workspace/prototype-a', report: 'The result remains poor.',
      classification: ['core-experience', 'reference-fidelity'], scope: { route: 'shared-factory', rationale: 'The same weak gate can affect future runs.', generatedWorkspaceModified: false, contextIntentionallyOmitted: ['unrelated run history'] },
      reproduction: { status: 'REPRODUCED', steps: ['Open the default route.'], observed: ['The controllable object is occluded.'], evidence: [evidence] },
      acceptanceCriteria: ['The default route starts readable.'], status: 'OPEN', createdAt: new Date(0).toISOString(),
    }).targetGame).toBe('slice');
  });

  it('rejects matrix cells whose viewport is not declared by the matrix', () => {
    expect(() => ExperienceReproductionMatrixSchema.parse({
      schemaVersion: 1, artifactType: 'experience-reproduction-matrix', targetGame: 'slice', workspace: '/runs/slice/workspace/prototype-a',
      axes: { objectTypes: ['knife'], lifecycleStateBranches: ['ready'], rendererPaths: ['world'], viewports: [{ label: 'phone', width: 390, height: 844 }] },
      cells: [{ id: 'knife-ready-tablet', objectType: 'knife', lifecycleStateBranch: 'ready', rendererPath: 'world', viewport: { label: 'tablet', width: 768, height: 1024 }, status: 'BLOCKED', expected: 'Visible', observed: 'Unobserved', evidence: [] }],
      confirmedFindings: [], remainingGaps: ['Tablet is unobserved.'], createdAt: new Date(0).toISOString(),
    })).toThrow(/viewport/i);
  });
});
