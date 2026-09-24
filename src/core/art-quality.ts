import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { exists } from './files.js';
import { ArtQualityAuditSchema, type ArtQualityAsset, type ArtQualityAudit } from '../schemas/art-quality.js';
import type { AssetManifest } from '../schemas/index.js';

type AssetItem = AssetManifest['assets'][number];

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type PngAlphaMetrics = { supported: boolean; meaningful: boolean; minimum: number; maximum: number; transparentPixels: number; translucentPixels: number; opaquePixels: number; width: number; height: number };

function paeth(a: number, b: number, c: number) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

/** Decode the common 8-bit non-interlaced RGBA PNG form without an image dependency. */
export function inspectPngAlpha(input: Uint8Array): PngAlphaMetrics {
  const bytes = Buffer.from(input);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file');
  let offset = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0; const idat: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8); const data = bytes.subarray(offset + 8, offset + 8 + length); offset += 12 + length;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8] ?? 0; colorType = data[9] ?? 0; interlace = data[12] ?? 0; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6 || interlace !== 0) return { supported: false, meaningful: false, minimum: 255, maximum: 255, transparentPixels: 0, translucentPixels: 0, opaquePixels: 0, width, height };
  const raw = inflateSync(Buffer.concat(idat)); const stride = width * 4; const pixels = Buffer.alloc(stride * height); let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++] ?? 0;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0; const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0; const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0; const value = raw[source++] ?? 0;
      pixels[y * stride + x] = (filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + up : filter === 3 ? value + Math.floor((left + up) / 2) : value + paeth(left, up, upLeft)) & 0xff;
    }
  }
  let minimum = 255; let maximum = 0; let transparentPixels = 0; let translucentPixels = 0; let opaquePixels = 0;
  for (let index = 3; index < pixels.length; index += 4) { const alpha = pixels[index]!; minimum = Math.min(minimum, alpha); maximum = Math.max(maximum, alpha); if (alpha === 0) transparentPixels += 1; else if (alpha < 255) translucentPixels += 1; else opaquePixels += 1; }
  return { supported: true, meaningful: transparentPixels > 0 && opaquePixels + translucentPixels > 0 && minimum < 255, minimum, maximum, transparentPixels, translucentPixels, opaquePixels, width, height };
}

type DecodedRgba = { width: number; height: number; pixels: Buffer };

function decodeRgba(input: Uint8Array): DecodedRgba | undefined {
  const bytes = Buffer.from(input);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
  let offset = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0; const idat: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length; if (end > bytes.length) return undefined;
    const data = bytes.subarray(offset + 8, offset + 8 + length); offset = end;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8] ?? 0; colorType = data[9] ?? 0; interlace = data[12] ?? 0; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6 || interlace !== 0 || idat.length === 0) return undefined;
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return undefined; }
  const stride = width * 4; const pixels = Buffer.alloc(stride * height); let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++] ?? 0;
    if (![0, 1, 2, 3, 4].includes(filter)) return undefined;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0; const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0; const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0; const value = raw[source++] ?? 0;
      pixels[y * stride + x] = (filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + up : filter === 3 ? value + Math.floor((left + up) / 2) : value + paeth(left, up, upLeft)) & 0xff;
    }
  }
  return { width, height, pixels };
}

export type PngProgrammaticGeometryCheck = {
  detected: boolean;
  metadata: string[];
  lowColourCount: boolean;
  simpleGeometry: boolean;
  reason?: string;
};

/** Extract only untrusted PNG text metadata.  The parser is intentionally
 * bounded and never interprets metadata as instructions; it is used as a
 * provenance signal, not as proof by itself. */
function pngTextMetadata(input: Uint8Array): string[] {
  const bytes = Buffer.from(input);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return [];
  const metadata: string[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > bytes.length || end > bytes.length) break;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const separator = data.indexOf(0);
      if (separator > 0) metadata.push(`${data.subarray(0, separator).toString('latin1')}:${data.subarray(separator + 1).toString('utf8')}`);
    } else if (type === 'iTXt') {
      // keyword\0compressionFlag\0compressionMethod\0language\0translated\0text
      const first = data.indexOf(0);
      if (first > 0 && data.length > first + 5) {
        let cursor = first + 3;
        const languageEnd = data.indexOf(0, cursor);
        if (languageEnd >= 0) {
          cursor = languageEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0) metadata.push(`${data.subarray(0, first).toString('latin1')}:${data.subarray(translatedEnd + 1).toString('utf8')}`);
        }
      }
    } else if (type === 'zTXt') {
      // A compressed zTXt value is not needed for the heuristic; retain the
      // keyword so an explicit generator marker is still visible to an audit.
      const separator = data.indexOf(0);
      if (separator > 0) metadata.push(data.subarray(0, separator).toString('latin1'));
    }
    offset = end;
    if (type === 'IEND') break;
  }
  return metadata;
}

/**
 * Conservative PNG geometry heuristic.  Raster pixels alone cannot reveal
 * whether an artist or a script drew an image, so this check only reports a
 * finding when explicit generator metadata (for example `Software:Pillow`)
 * is combined with a very small colour palette and low edge complexity.  A
 * normal raster with no provenance marker is therefore never rejected merely
 * because it happens to be simple.
 */
export function inspectPngProgrammaticGeometry(input: Uint8Array): PngProgrammaticGeometryCheck {
  const metadata = pngTextMetadata(input);
  const decoded = decodeRgba(input);
  if (!decoded) return { detected: false, metadata, lowColourCount: false, simpleGeometry: false };
  const { width, height, pixels } = decoded;
  const colours = new Set<string>();
  for (let index = 0; index < pixels.length; index += 4) {
    colours.add(`${pixels[index]}:${pixels[index + 1]}:${pixels[index + 2]}:${pixels[index + 3]}`);
    if (colours.size > 32) break;
  }
  const lowColourCount = colours.size <= 16;
  let transitions = 0;
  let comparisons = 0;
  const differs = (left: number, right: number) => Math.abs(left - right) > 12;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    if (x + 1 < width) {
      const next = index + 4;
      comparisons += 1;
      if (differs(pixels[index]!, pixels[next]!) || differs(pixels[index + 1]!, pixels[next + 1]!) || differs(pixels[index + 2]!, pixels[next + 2]!) || differs(pixels[index + 3]!, pixels[next + 3]!)) transitions += 1;
    }
    if (y + 1 < height) {
      const next = index + width * 4;
      comparisons += 1;
      if (differs(pixels[index]!, pixels[next]!) || differs(pixels[index + 1]!, pixels[next + 1]!) || differs(pixels[index + 2]!, pixels[next + 2]!) || differs(pixels[index + 3]!, pixels[next + 3]!)) transitions += 1;
    }
  }
  const simpleGeometry = comparisons > 0 && transitions / comparisons < 0.55;
  const explicitGenerator = metadata.some((item) => /(pillow|matplotlib|cairo|skia|sharp|canvas|python|svg|generated\s+by|programmatic|software|creator|generator)/iu.test(item));
  const detected = explicitGenerator && lowColourCount && simpleGeometry;
  return {
    detected,
    metadata,
    lowColourCount,
    simpleGeometry,
    ...(detected ? { reason: 'explicit-generator-metadata-with-low-colour-simple-geometry' } : {}),
  };
}

export type PngVisualChecks = { noBakedGrid: boolean; noMatte: boolean; noHalo: boolean; noEdgeFringing: boolean; issues: string[] };

/** Deterministic visual sanity checks for transparent raster assets. */
export function inspectPngVisualChecks(input: Uint8Array): PngVisualChecks {
  const decoded = decodeRgba(input);
  if (!decoded) return { noBakedGrid: true, noMatte: true, noHalo: true, noEdgeFringing: true, issues: [] };
  const { width, height, pixels } = decoded;
  const color = (x: number, y: number) => { const i = (y * width + x) * 4; return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, pixels[i + 3]!] as const; };
  const neutral = (rgb: readonly number[]) => Math.max(...rgb) - Math.min(...rgb) < 18;
  const close = (a: readonly number[], b: readonly number[], tolerance: number) => Math.max(Math.abs(a[0]! - b[0]!), Math.abs(a[1]! - b[1]!), Math.abs(a[2]! - b[2]!)) <= tolerance;
  let alternating = 0; let candidates = 0;
  for (let y = 0; y < height - 1; y += 1) for (let x = 0; x < width - 1; x += 1) {
    const a = color(x, y); const b = color(x + 1, y); const c = color(x, y + 1); const d = color(x + 1, y + 1);
    if ([a, b, c, d].every((item) => item[3] >= 245 && neutral(item.slice(0, 3)))) {
      const contrast = Math.abs(a[0] - b[0]) > 24 && Math.abs(a[0] - c[0]) > 24;
      candidates += 1; if (contrast && close(a, d, 12) && close(b, c, 12)) alternating += 1;
    }
  }
  const noBakedGrid = candidates < 2 || alternating / candidates < 0.35;
  const transparent: number[][] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const item = color(x, y); if (item[3] === 0) transparent.push(item.slice(0, 3)); }
  const matteColor = transparent.length > 3 ? transparent[0]! : undefined;
  const noMatte = !matteColor || !neutral(matteColor) || matteColor.some((item) => item < 8 || item > 247);
  // A conservative fringe check: a large population of near-opaque neutral
  // pixels directly bordering transparency is usually a baked matte/halo.
  let edgePixels = 0; let suspiciousEdges = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const item = color(x, y); if (item[3] < 32 || item[3] >= 255) continue;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([nx = -1, ny = -1]) => nx >= 0 && ny >= 0 && nx < width && ny < height).map(([nx = 0, ny = 0]) => color(nx, ny));
    if (neighbors.some((neighbor) => neighbor[3] === 0)) { edgePixels += 1; if (neutral(item.slice(0, 3)) && item[0] > 180) suspiciousEdges += 1; }
  }
  const noHalo = edgePixels === 0 || suspiciousEdges / edgePixels < 0.65;
  // Distinguish ordinary anti-aliasing from a baked matte fringe.  An
  // anti-aliased edge generally keeps the foreground hue and is close to a
  // nearby opaque pixel.  A composited/checkerboard export instead leaves a
  // translucent neutral/bright pixel whose RGB is far from the foreground.
  // Compare only pixels that border transparency and have a nearby opaque
  // neighbour; this keeps soft shadows and fully transparent padding out of
  // the denominator.
  let fringeCandidates = 0;
  let suspiciousFringe = 0;
  const rgbDistance = (a: readonly number[], b: readonly number[]) => Math.max(
    Math.abs(a[0]! - b[0]!),
    Math.abs(a[1]! - b[1]!),
    Math.abs(a[2]! - b[2]!),
  );
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const item = color(x, y);
    if (item[3] === 0 || item[3] >= 245) continue;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .filter(([nx = -1, ny = -1]) => nx >= 0 && ny >= 0 && nx < width && ny < height)
      .map(([nx = 0, ny = 0]) => color(nx, ny));
    if (!neighbors.some((neighbor) => neighbor[3] === 0)) continue;
    const opaque: Array<readonly number[]> = [];
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) === 0 || Math.abs(dx) + Math.abs(dy) > 3) continue;
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nearby = color(nx, ny);
      if (nearby[3] >= 245) opaque.push(nearby.slice(0, 3));
    }
    if (opaque.length === 0) continue;
    fringeCandidates += 1;
    const foreground = opaque[0]!;
    const edgeRgb = item.slice(0, 3);
    const brightNeutralMatte = neutral(edgeRgb) && Math.max(...edgeRgb) >= 170 && Math.min(...edgeRgb) >= 110;
    const foregroundHasHue = Math.max(...foreground) - Math.min(...foreground) >= 32;
    const stronglyDifferent = rgbDistance(edgeRgb, foreground) >= 88;
    if (stronglyDifferent && (brightNeutralMatte || foregroundHasHue)) suspiciousFringe += 1;
  }
  const noEdgeFringing = fringeCandidates === 0 || suspiciousFringe / fringeCandidates < 0.5;
  const issues: string[] = [];
  if (!noBakedGrid) issues.push('baked-grid');
  if (!noMatte) issues.push('matte-background');
  if (!noHalo) issues.push('halo');
  if (!noEdgeFringing) issues.push('edge-fringing');
  return { noBakedGrid, noMatte, noHalo, noEdgeFringing, issues };
}

function formatOf(file: string): ArtQualityAsset['format'] { const ext = path.extname(file).toLowerCase(); return ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : ext === '.svg' ? 'svg' : 'other'; }

function safeAssetPath(root: string, relative: string) {
  const normalized = relative.replaceAll('\\', '/').replace(/^assets\//u, '');
  const resolved = path.resolve(root, normalized);
  const rel = path.relative(path.resolve(root), resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`asset path escapes asset root: ${relative}`);
  return resolved;
}

export async function auditAssetFiles(input: { runRoot: string; targetGame: string; assetRoot: string; assets: AssetItem[]; strict?: boolean }): Promise<ArtQualityAudit> {
  const strict = input.strict === true; const root = path.resolve(input.runRoot, input.assetRoot); const audited: ArtQualityAsset[] = []; const blockers: string[] = [];
  for (const item of input.assets) {
    const file = safeAssetPath(root, item.path); const format = formatOf(file); const issues: string[] = []; let bytes = Buffer.alloc(0); let present = false;
    try { bytes = await readFile(file); present = true; } catch { issues.push('missing'); }
    const digest = createHash('sha256').update(bytes).digest('hex'); const hashMatches = present && digest === item.sha256;
    if (present && !hashMatches) issues.push('hash-mismatch');
    const alphaRequired = item.kind !== 'background'; let alpha: PngAlphaMetrics = { supported: false, meaningful: !alphaRequired, minimum: 255, maximum: 255, transparentPixels: 0, translucentPixels: 0, opaquePixels: 0, width: 0, height: 0 };
    let visualChecks: PngVisualChecks = { noBakedGrid: true, noMatte: true, noHalo: true, noEdgeFringing: true, issues: [] };
    let programmaticGeometryOnly = false;
    if (format === 'png' && present) {
      try {
        alpha = inspectPngAlpha(bytes);
        visualChecks = inspectPngVisualChecks(bytes);
        issues.push(...visualChecks.issues);
        programmaticGeometryOnly = inspectPngProgrammaticGeometry(bytes).detected;
      } catch { issues.push('png-parse-failed'); }
    }
    if (alphaRequired && format === 'png' && (!alpha.supported || !alpha.meaningful)) issues.push('alpha-not-meaningful');
    if (strict && alphaRequired && format === 'webp') issues.push('alpha-not-verified');
    if (alphaRequired && format === 'other' && present) issues.push('alpha-format-unsupported');
    const generationMethod = item.generationMethod ?? 'imagegen';
    if (strict && generationMethod === 'licensed' && (item.sourceEvidence?.length ?? 0) === 0) issues.push('license-evidence-missing');
    if (strict && generationMethod === 'procedural-placeholder' && (item.kind === 'ui' || item.kind === 'marketing')) issues.push('placeholder-not-production');
    if (format === 'svg' && present) { const text = bytes.toString('utf8'); programmaticGeometryOnly = /<svg\b/iu.test(text) && !/<(?:image|filter|linearGradient|radialGradient)\b/iu.test(text) && (text.match(/<(?:rect|circle|ellipse|path|polygon|line)\b/giu)?.length ?? 0) >= 1; if (strict && programmaticGeometryOnly && (item.kind === 'ui' || item.kind === 'marketing')) issues.push('programmatic-geometry'); }
    if (strict && programmaticGeometryOnly && format === 'png' && (item.kind === 'ui' || item.kind === 'marketing')) issues.push('programmatic-geometry');
    if (issues.length > 0) for (const issue of issues) blockers.push(`${item.id}:${issue}`);
    const passed = issues.length === 0;
    const provenance = generationMethod === 'licensed' ? 'licensed' : generationMethod === 'original' ? 'original' : generationMethod === 'procedural-placeholder' ? 'procedural-placeholder' : 'generated';
    audited.push({ id: item.id, kind: item.kind, path: item.path, format, sha256: digest, bytes: bytes.length, provenance, licenseEvidence: item.sourceEvidence?.[0] ?? null, alpha: { required: alphaRequired, supported: alpha.supported, meaningful: alpha.meaningful, minimum: alpha.minimum, maximum: alpha.maximum, transparentPixels: alpha.transparentPixels, translucentPixels: alpha.translucentPixels, opaquePixels: alpha.opaquePixels }, composites: { light: `composite:light:${item.id}`, dark: `composite:dark:${item.id}`, saturated: `composite:saturated:${item.id}` }, checks: { exists: present, hashMatches, noBakedGrid: visualChecks.noBakedGrid, noMatte: visualChecks.noMatte, noHalo: visualChecks.noHalo, noEdgeFringing: visualChecks.noEdgeFringing, programmaticGeometryOnly }, issues, passed });
  }
  return ArtQualityAuditSchema.parse({ schemaVersion: 1, targetGame: input.targetGame, assetRoot: input.assetRoot, strict, assets: audited, blockers: [...new Set(blockers)], passed: blockers.length === 0 && audited.every((asset) => asset.passed), checkedAt: new Date().toISOString() });
}

/**
 * Evaluate the release-facing art gate from its durable audit artifact.  A
 * required gate must fail closed when the artifact is absent, malformed or
 * contains no audited assets; otherwise a deleted/stale report could let a
 * production run proceed as if visual provenance had been checked.
 */
export function evaluateArtQualityGate(input: { required: boolean; artifact?: unknown }) {
  if (!input.required) return { passed: true, blockers: [] as string[] };
  if (input.artifact === undefined) return { passed: false, blockers: ['art-quality:artifact-missing'] };
  const parsed = ArtQualityAuditSchema.safeParse(input.artifact);
  if (!parsed.success) return { passed: false, blockers: ['art-quality:artifact-invalid'] };
  const blockers = [...parsed.data.blockers];
  if (parsed.data.assets.length === 0) blockers.push('art-quality:no-assets-audited');
  if (parsed.data.passed !== (blockers.length === 0 && parsed.data.assets.every((asset) => asset.passed))) blockers.push('art-quality:derived-status-mismatch');
  return { passed: blockers.length === 0 && parsed.data.passed, blockers: [...new Set(blockers)], audit: parsed.data };
}

export async function assetRootExists(runRoot: string, assetRoot: string) { return exists(path.resolve(runRoot, assetRoot)); }
