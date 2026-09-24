import { describe, expect, it } from 'vitest';
import { buildProductEvidenceInstruction } from '../../src/core/profile-contract.js';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { sha256Text } from '../../src/core/files.js';
import { routeExperienceSkills } from '../../src/core/agent-routing.js';

describe('product experience handoff', () => {
  it('requires player-visible and natural-trigger evidence separately from implementation evidence', () => {
    const contract = buildProductExperienceContract({
      targetGame: 'demo', targetRunId: 'run-1', targetWorkspace: '/tmp/run-1/workspace/game', runtime: 'web-lite',
      sourceArtifact: { kind: 'experience-contract', path: 'artifacts/experience-contract.json', sha256: sha256Text('source') },
      experiencePillars: [{ id: 'combo', name: 'combo', observable: 'combo HUD increments and rope changes color' }],
      deviceBaselines: [{ width: 390, height: 844, label: 'phone' }],
    });
    expect(contract.features[0]?.visibleSignal).toMatch(/combo HUD/i);
    expect(contract.features[0]?.requiredViewports).toHaveLength(1);
    expect(buildProductEvidenceInstruction()).toMatch(/player-visible product evidence/i);
    expect(buildProductEvidenceInstruction()).toMatch(/natural trigger/i);
  });

  it('routes experience work to complementary skills without forcing one model', () => {
    expect(routeExperienceSkills({ stage: 'FULL_BUILD', request: 'implement combo HUD and satisfying release feedback' })).toEqual(
      expect.arrayContaining(['game-feel', 'game-ui-ux']),
    );
    expect(routeExperienceSkills({ stage: 'QA', request: 'verify the default journey and screenshot visible state' })).toEqual(
      expect.arrayContaining(['game-playtest', 'critique', 'game-ui-ux']),
    );
  });
});
