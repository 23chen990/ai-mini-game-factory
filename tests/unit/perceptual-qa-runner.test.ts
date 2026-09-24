import { describe, expect, it } from 'vitest';
import { buildPerceptualQaReport } from '../../src/providers/runtime-qa.js';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { sha256Text } from '../../src/core/files.js';

describe('perceptual QA runner', () => {
  const contract = buildProductExperienceContract({
    targetGame: 'demo', targetRunId: 'run-1', targetWorkspace: '/tmp/run-1/workspace/game', runtime: 'web-lite',
    sourceArtifact: { kind: 'experience-contract', path: 'artifacts/experience-contract.json', sha256: sha256Text('source') },
    experiencePillars: [{ id: 'combo', name: 'combo', observable: 'Combo x3 appears beside the cut object' }],
    deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }],
  });
  const feature = contract.features[0]!;
  const observation = {
    featureId: feature.id, sourceCheckIds: feature.sourceCheckIds, objectType: feature.objectType, stateBranch: feature.stateBranch,
    viewport: feature.requiredViewports[0]!, playerVisible: true, naturalTriggerVerified: true, eventOrderVerified: true,
    negativeAssertionsPassed: true, perceptualPassed: true, observedSignal: feature.visibleSignal,
    observedEventOrder: feature.expectedEventOrder, screenshots: [{ path: 'screenshots/combo.png', sha256: sha256Text('png') }],
    trace: { path: 'logs/combo.json', sha256: sha256Text('trace') }, evidence: ['natural input observed'], notes: [],
  };

  it('fails missing exact feature observations', () => {
    const report = buildPerceptualQaReport(contract, [], {
      buildHash: sha256Text('build'), runtime: 'web-lite', reviewer: 'QAAgent', authorIndependent: true,
    });
    expect(report.passed).toBe(false);
    expect(report.blockers).toContain('perceptual:case-missing:combo@phone-portrait');
  });

  it('never lets deterministic capture self-approve perceptual quality', () => {
    const report = buildPerceptualQaReport(contract, [observation], {
      buildHash: sha256Text('build'), runtime: 'web-lite', reviewer: 'DeterministicCapture', authorIndependent: false,
    });
    expect(report.passed).toBe(false);
    expect(report.blockers).toContain('perceptual:independent-review-required');
  });

  it('can represent an independent pass, pending file/hash verification by the gate', () => {
    const report = buildPerceptualQaReport(contract, [observation], {
      buildHash: sha256Text('build'), runtime: 'web-lite', reviewer: 'QAAgent', authorIndependent: true,
    });
    expect(report.passed).toBe(true);
    expect(report.cases[0]?.perceptualPassed).toBe(true);
  });
});
