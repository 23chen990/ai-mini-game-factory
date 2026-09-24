import { describe, expect, it } from 'vitest';
import { OpenSourceResearchArtifactSchema } from '../../src/schemas/open-source-research.js';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  name: 'Phaser',
  repositoryUrl: 'https://github.com/phaserjs/phaser',
  immutableRevision: 'a996562',
  version: 'v3.90.0',
  directLicenseEvidence: 'https://github.com/phaserjs/phaser/blob/v3.90.0/LICENSE.md',
  licenseSpdx: 'MIT',
  targetPlatformFit: {
    webLite: { verdict: 'APPROVED', evidence: 'Existing browser QA runtime.' },
    wechatMiniGame: { verdict: 'REJECTED', evidence: 'No validated Phaser 3 adapter.' },
    douyinMiniGame: { verdict: 'REJECTED', evidence: 'No validated Phaser 3 adapter.' },
    tapTapMiniGame: { verdict: 'REJECTED', evidence: 'No validated Phaser 3 adapter.' },
  },
  maintenanceRisk: 'MEDIUM',
  securityRisk: 'LOW',
  attributionDuties: ['Retain the MIT copyright and permission notice.'],
  decision: 'REUSE',
  approvedScope: ['web-lite development and browser QA only'],
  rationale: 'Reuse only the already-pinned browser renderer.',
  ...overrides,
});

function artifact() {
  return {
    schemaVersion: 1,
    researchId: 'lantern-action-open-source-v1',
    targetGame: '灯笼摆渡：夜市大逃亡',
    targetWorkspace: 'runs/example/workspace/action-{a,b,c}',
    researchedAt: '2026-08-30T13:20:00.000Z',
    candidates: [
      candidate(),
      candidate({ name: 'Archived Mini Game Adapter', repositoryUrl: 'https://github.com/wechat-miniprogram/minigame-adaptor', immutableRevision: 'master-archived-2024-10-11', version: 'archived', directLicenseEvidence: 'https://github.com/wechat-miniprogram/minigame-adaptor/blob/master/LICENSE', licenseSpdx: 'UNKNOWN', decision: 'REJECT', approvedScope: [], maintenanceRisk: 'HIGH', securityRisk: 'MEDIUM', rationale: 'Archived and Unity-specific.' }),
    ],
    conclusion: {
      approvedCandidateNames: ['Phaser'],
      rejectedCandidateNames: ['Archived Mini Game Adapter'],
      noSuitablePlatformAdapter: true,
      architectureDecision: 'Keep web-lite as QA evidence only; platform adapters remain a separate gated stage.',
    },
  };
}

describe('OpenSourceResearchArtifactSchema', () => {
  it('accepts immutable, licensed, platform-scoped reuse decisions', () => {
    expect(OpenSourceResearchArtifactSchema.parse(artifact()).conclusion.noSuitablePlatformAdapter).toBe(true);
  });

  it('rejects a reuse decision without license evidence or an approved scope', () => {
    const value = artifact();
    value.candidates[0] = candidate({ directLicenseEvidence: '', approvedScope: [] });
    expect(() => OpenSourceResearchArtifactSchema.parse(value)).toThrow();
  });

  it('rejects conclusion names that do not match candidate decisions', () => {
    const value = artifact();
    value.conclusion.approvedCandidateNames = ['Archived Mini Game Adapter'];
    expect(() => OpenSourceResearchArtifactSchema.parse(value)).toThrow(/approvedCandidateNames/i);
  });
});
