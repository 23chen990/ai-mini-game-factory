import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { buildCompletionGateReport, runVisualEvidenceGate } from '../../src/qa/experience-gates.js';

function png(width: number, height: number, pixels: Uint8Array) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Uint8Array) => {
    const typeBytes = Buffer.from(type);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    let crcValue = 0xffffffff;
    for (const byte of Buffer.concat([typeBytes, Buffer.from(data)])) {
      crcValue ^= byte;
      for (let bit = 0; bit < 8; bit++) crcValue = (crcValue >>> 1) ^ ((crcValue & 1) ? 0xedb88320 : 0);
    }
    const crc = Buffer.alloc(4); crc.writeUInt32BE((crcValue ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 4 + 1);
    scanlines[offset] = 0;
    Buffer.from(pixels).copy(scanlines, offset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', new Uint8Array())]);
}

it('automatically records visual, level-difference, and human gates without allowing missing evidence to pass', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'experience-gates-'));
  await mkdir(path.join(runRoot, 'screenshots'), { recursive: true });
  const pixels = new Uint8Array([24, 24, 24, 255, 240, 200, 80, 255, 24, 24, 24, 255, 255, 255, 255, 255]);
  const image = png(2, 2, pixels);
  await writeFile(path.join(runRoot, 'screenshots/a.png'), image);
  await writeFile(path.join(runRoot, 'screenshots/b.png'), image);
  const report = await buildCompletionGateReport({ runRoot, corePassed: true, normalFlowPassed: true, screenshots: ['screenshots/a.png', 'screenshots/b.png'] });
  expect(report.candidateReady).toBe(false);
  expect(report.blockers).toEqual(['levelDifference', 'humanPlaytest']);
});

it('rejects existing but visually blank PNG captures', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'experience-gates-'));
  const blank = Buffer.alloc(2 * 2 * 4, 24);
  await writeFile(path.join(runRoot, 'blank.png'), png(2, 2, blank));
  const result = await runVisualEvidenceGate(runRoot, ['blank.png', 'blank.png']);
  expect(result.passed).toBe(false);
  expect(result.evidence).toContain('screenshots:blank-or-unreadable');
});

it('accepts captures with visible pixel variation', async () => {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'experience-gates-'));
  const pixels = new Uint8Array([24, 24, 24, 255, 240, 200, 80, 255, 24, 24, 24, 255, 255, 255, 255, 255]);
  await writeFile(path.join(runRoot, 'visible.png'), png(2, 2, pixels));
  const result = await runVisualEvidenceGate(runRoot, ['visible.png', 'visible.png']);
  expect(result.passed).toBe(true);
});
