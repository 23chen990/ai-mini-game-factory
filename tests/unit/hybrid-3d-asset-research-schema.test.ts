import { describe, expect, it } from 'vitest';
import { Hybrid3dAssetResearchArtifactSchema } from '../../src/schemas/hybrid-3d-assets.js';

const approvedSource = {
  id: 'kenney-factory-kit-3',
  name: 'Kenney Factory Kit',
  sourcePageUrl: 'https://kenney.nl/assets/factory-kit',
  downloadUrl: 'https://kenney.nl/media/pages/assets/factory-kit/revision/kenney_factory-kit_3.0.zip',
  immutableRevision: 'factory-kit-3.0-archive-sha256',
  version: '3.0',
  archiveSha256: 'a'.repeat(64),
  licenseSpdx: 'CC0-1.0',
  licenseEvidenceUrl: 'https://kenney.nl/support',
  embeddedLicensePath: 'License.txt',
  selectedFilePatterns: ['Models/GLB/structure_*.glb'],
  targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
  cocosImport: {
    formats: ['glb'],
    unitScale: 1,
    materialPolicy: 'Import geometry and base-color materials; replace expensive shaders.',
  },
  attributionDuties: [],
  redistributionPolicy: 'Distribute only selected assets embedded in the completed game build.',
  maintenanceRisk: 'LOW',
  securityRisk: 'LOW',
  decision: 'APPROVE',
  approvedUses: ['gameplay-geometry', 'animated-character'],
  rationale: 'Use a small curated subset for objects that require real depth or animation.',
};

const artifact = () => ({
  schemaVersion: 1,
  researchId: 'toy-factory-hybrid-3d-assets-v1',
  targetGame: '玩具工厂直营店 3D',
  targetWorkspace: 'runs/example/workspace/game',
  researchedAt: '2026-08-31T00:00:00.000+08:00',
  visualStrategy: {
    camera: 'fixed-three-quarter',
    gameplayGeometry: 'true-3d',
    generatedImageUsage: ['billboard', 'decal', 'ui', 'distant-backdrop'],
    forbiddenGeneratedImageUsage: ['collision-shape', 'navigation-obstacle', 'rotating-core-prop', 'animated-character'],
    alphaValidation: {
      required: true,
      meaningfulAlpha: true,
      compositeBackgrounds: ['light', 'dark', 'saturated'],
    },
  },
  sources: [approvedSource],
  selectedSourceIds: ['kenney-factory-kit-3'],
  generatedCutouts: [
    {
      id: 'toy-car-box-cutout',
      usage: 'billboard',
      view: 'three-quarter-isometric',
      background: 'transparent',
      alphaRequired: true,
      purpose: 'High-detail shelf product appearance with no gameplay collision.',
    },
  ],
  architectureDecision: 'Use true 3D for gameplay and generated transparent renders for fixed-view visual detail.',
});

describe('Hybrid3dAssetResearchArtifactSchema', () => {
  it('accepts a hash-locked licensed mixed 3D/2D asset strategy', () => {
    expect(Hybrid3dAssetResearchArtifactSchema.parse(artifact()).selectedSourceIds).toEqual(['kenney-factory-kit-3']);
  });

  it('rejects approved archives without an immutable sha256', () => {
    const value = artifact();
    value.sources[0] = { ...approvedSource, archiveSha256: '' };
    expect(() => Hybrid3dAssetResearchArtifactSchema.parse(value)).toThrow(/sha256/i);
  });

  it('requires selected ids to exactly match approved sources', () => {
    const value = artifact();
    value.selectedSourceIds = [];
    expect(() => Hybrid3dAssetResearchArtifactSchema.parse(value)).toThrow(/selectedSourceIds/i);
  });

  it('requires meaningful alpha checks over three contrasting backgrounds', () => {
    const value = artifact();
    value.visualStrategy.alphaValidation.meaningfulAlpha = false;
    expect(() => Hybrid3dAssetResearchArtifactSchema.parse(value)).toThrow(/alpha/i);
  });
});
