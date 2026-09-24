import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { auditAssetFiles, evaluateArtQualityGate, inspectPngAlpha, inspectPngProgrammaticGeometry, inspectPngVisualChecks } from '../../src/core/art-quality.js';

function pngRgba(width: number, height: number, pixels: number[]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Buffer) => {
    const typeBytes = Buffer.from(type);
    const crc = Buffer.alloc(4);
    const value = crc32(Buffer.concat([typeBytes, data]));
    crc.writeUInt32BE(value >>> 0, 0);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
    return Buffer.concat([length, typeBytes, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (width * 4 + 1)] = 0; for (let x = 0; x < width * 4; x += 1) raw[y * (width * 4 + 1) + 1 + x] = pixels[y * width * 4 + x] ?? 0; }
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function withTextChunk(png: Buffer, keyword: string, value: string) {
  const type = Buffer.from('tEXt');
  const data = Buffer.concat([Buffer.from(keyword), Buffer.from([0]), Buffer.from(value)]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  // Insert metadata immediately before IEND so the image bytes stay intact.
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), length, type, data, crc, png.subarray(iend)]);
}

describe('asset mechanical quality gate', () => {
  it('blocks a required art gate when its audit artifact is missing or invalid', () => {
    expect(evaluateArtQualityGate({ required: true }).passed).toBe(false);
    expect(evaluateArtQualityGate({ required: true }).blockers).toContain('art-quality:artifact-missing');
    expect(evaluateArtQualityGate({ required: false }).passed).toBe(true);
  });

  it('measures meaningful alpha instead of trusting an RGBA extension', () => {
    const result = inspectPngAlpha(pngRgba(2, 1, [255, 0, 0, 0, 255, 0, 0, 255]));
    expect(result.meaningful).toBe(true);
    expect(result.transparentPixels).toBe(1);
    expect(result.opaquePixels).toBe(1);
  });

  it('detects a checkerboard baked into an otherwise transparent PNG', () => {
    const pixels = [
      238, 238, 238, 255, 180, 180, 180, 255, 238, 238, 238, 255, 180, 180, 180, 255,
      180, 180, 180, 255, 238, 238, 238, 255, 180, 180, 180, 255, 238, 238, 238, 255,
    ];
    const checks = inspectPngVisualChecks(pngRgba(4, 2, pixels));
    expect(checks.noBakedGrid).toBe(false);
    expect(checks.issues).toContain('baked-grid');
  });

  it('detects a matte-colored translucent fringe around an opaque sprite', () => {
    const width = 5;
    const height = 5;
    const pixels: number[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = x >= 2 && x <= 2 && y >= 2 && y <= 2;
        const fringe = (x === 1 || x === 3 || y === 1 || y === 3) && x >= 1 && x <= 3 && y >= 1 && y <= 3;
        if (inside) pixels.push(20, 80, 220, 255);
        else if (fringe) pixels.push(210, 210, 210, 96);
        else pixels.push(0, 0, 0, 0);
      }
    }
    const checks = inspectPngVisualChecks(pngRgba(width, height, pixels));
    expect(checks.noEdgeFringing).toBe(false);
    expect(checks.issues).toContain('edge-fringing');
  });

  it('flags an explicitly programmatic, low-colour PNG but does not guess from pixels alone', () => {
    const simple = pngRgba(4, 4, [
      ...Array.from({ length: 16 }, (_, index) => (index >= 5 && index <= 10 ? [220, 40, 80, 255] : [0, 0, 0, 0])).flat(),
    ]);
    expect(inspectPngProgrammaticGeometry(simple).detected).toBe(false);
    const marked = withTextChunk(simple, 'Software', 'Pillow 10.0.0');
    const result = inspectPngProgrammaticGeometry(marked);
    expect(result.detected).toBe(true);
    expect(result.metadata.join(' ')).toMatch(/pillow/i);
  });

  it('rejects an opaque PNG and programmatic geometry in strict production mode', async () => {
    const root = '/tmp/art-quality-run';
    const fs = await import('node:fs/promises');
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(`${root}/workspace/generated-assets`, { recursive: true });
    await fs.writeFile(`${root}/workspace/generated-assets/ui.png`, pngRgba(1, 1, [255, 0, 0, 255]));
    await fs.writeFile(`${root}/workspace/generated-assets/icon.svg`, '<svg><rect width="10" height="10"/></svg>');
    const report = await auditAssetFiles({ runRoot: root, targetGame: 'g', assetRoot: 'workspace/generated-assets', strict: true, assets: [
      { id: 'ui', kind: 'ui', path: 'assets/ui.png', prompt: 'ui', status: 'generated', sha256: 'wrong' },
      { id: 'icon', kind: 'marketing', path: 'assets/icon.svg', prompt: 'icon', status: 'generated', sha256: 'wrong' },
    ] });
    expect(report.passed).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining(['ui:alpha-not-meaningful', 'ui:hash-mismatch', 'icon:programmatic-geometry']));
    await fs.rm(root, { recursive: true, force: true });
  });

  it('requires provenance evidence for licensed or placeholder UI/marketing assets in strict mode', async () => {
    const root = '/tmp/art-quality-provenance-run';
    const fs = await import('node:fs/promises');
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(`${root}/workspace/generated-assets`, { recursive: true });
    await fs.writeFile(`${root}/workspace/generated-assets/icon.svg`, '<svg><image href="data:image/png;base64,AA=="/></svg>');
    const report = await auditAssetFiles({ runRoot: root, targetGame: 'g', assetRoot: 'workspace/generated-assets', strict: true, assets: [
      { id: 'icon', kind: 'marketing', path: 'assets/icon.svg', prompt: 'icon', status: 'generated', sha256: 'wrong', generationMethod: 'licensed' },
    ] });
    expect(report.blockers).toContain('icon:license-evidence-missing');
    await fs.rm(root, { recursive: true, force: true });
  });
});
