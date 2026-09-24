import { describe, expect, it } from 'vitest';
import { buildControlStageAudit } from '../../src/core/control-stage-audit.js';

describe('control stage audit', () => {
  it('requires the declared visual evidence and records artifact versions', () => {
    const failed = buildControlStageAudit('VISUAL_EVIDENCE_QA', {
      inputs: ['artifacts/qa-report.json'],
      artifacts: ['screenshots/only.png'],
      evidence: ['visual:trusted-runner-evidence'],
    }, { minimumArtifacts: { 'screenshots/*': 2 }, strictVersions: true });
    expect(failed.passed).toBe(false);
    expect(failed.missing).toContain('artifact-count:screenshots/*:2');

    const passed = buildControlStageAudit('VISUAL_EVIDENCE_QA', {
      inputs: ['artifacts/qa-report.json'],
      artifacts: ['screenshots/one.png', 'screenshots/two.png'],
      evidence: ['visual:at-least-two-screenshots', 'visual:trusted-runner-evidence'],
    }, { minimumArtifacts: { 'screenshots/*': 2 }, strictVersions: true });
    expect(passed.passed).toBe(true);
    expect(passed.artifactVersions['screenshots/one.png']).toBe(1);
  });

  it('keeps a waiting audit explicit instead of treating incomplete evidence as success', () => {
    const audit = buildControlStageAudit('CONTENT_VARIATION_QA', {
      inputs: ['artifacts/game-blueprint.json'],
      artifacts: ['artifacts/content-variation.json'],
      evidence: [],
    }, { strictVersions: true });
    expect(audit.passed).toBe(false);
    expect(audit.missing).toContain('variation:run-a-vs-b');
  });
});
