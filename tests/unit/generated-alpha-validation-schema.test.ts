import { describe, expect, it } from 'vitest';
import { GeneratedAlphaValidationArtifactSchema } from '../../src/schemas/generated-alpha-validation.js';

const valid = () => ({
  schemaVersion: 1,
  targetGame: '玩具工厂直营店 3D',
  validatedAt: '2026-08-31T01:00:00.000+08:00',
  assets: [{
    id: 'toy-car-box-cutout',
    path: 'artifacts/generated-cutouts/toy-car-box-cutout.png',
    sha256: 'a'.repeat(64),
    width: 1536,
    height: 1024,
    alpha: { minimum: 0, maximum: 254, transparentPixels: 1, translucentPixels: 2, opaquePixels: 0 },
    composites: {
      light: 'artifacts/alpha-validation/toy-car-box-cutout-composite.png',
      dark: 'artifacts/alpha-validation/toy-car-box-cutout-composite.png',
      saturated: 'artifacts/alpha-validation/toy-car-box-cutout-composite.png',
    },
    inspection: { bakedGrid: false, matteColor: false, halo: false, edgeFringing: false, passed: true },
  }],
});

describe('GeneratedAlphaValidationArtifactSchema', () => {
  it('accepts meaningful alpha plus three-background visual inspection', () => {
    expect(GeneratedAlphaValidationArtifactSchema.parse(valid()).assets[0]?.inspection.passed).toBe(true);
  });

  it('rejects fully opaque assets', () => {
    const value = valid();
    value.assets[0]!.alpha = { minimum: 255, maximum: 255, transparentPixels: 0, translucentPixels: 0, opaquePixels: 10 };
    expect(() => GeneratedAlphaValidationArtifactSchema.parse(value)).toThrow(/meaningful alpha/i);
  });

  it('rejects approval when any visual defect is present', () => {
    const value = valid();
    value.assets[0]!.inspection.halo = true;
    expect(() => GeneratedAlphaValidationArtifactSchema.parse(value)).toThrow(/inspection/i);
  });
});
