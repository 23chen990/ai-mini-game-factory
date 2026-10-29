import { EvidenceProvenanceManifestSchema } from '../schemas/evidence-provenance.js';
import { ReferenceFrameManifestSchema } from '../schemas/reference-recording.js';
import { verifyEvidenceFileBindings } from '../core/evidence-provenance.js';
import { chromium, webkit } from '@playwright/test';
import { redactText } from '../core/redaction.js';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { listFiles, sha256Text, sha256File } from '../core/files.js';
import { assertSafeContextInputPath } from '../core/execution-boundary.js';
import { NaturalFlowEvidenceSchema } from '../schemas/natural-flow.js';

export type QaObservationInput = { buildPath: string; buildSha256: string; tracePath: string; traceSha256: string; screenshots?: Array<{path:string;sha256:string}>; referenceImages?: Array<{path:string;sha256:string}> };

/** Validate the existing natural-flow artifact, not a new acceptance schema.
 * Files and JSON cross a real external boundary. Host readiness alone did not
 * let the previous read-only QA session observe even one gameplay frame.
 */
export async function verifyQaObservation(runRoot: string, input: QaObservationInput) {
  const root = await realpath(runRoot);
  async function boundFile(relative: string, directory = false): Promise<string> {
    const file = path.resolve(runRoot, assertSafeContextInputPath(relative));
    const actual = await realpath(file);
    const stat = await lstat(file);
    if (!actual.startsWith(`${root}${path.sep}`) || !(directory ? stat.isDirectory() : stat.isFile()) || stat.isSymbolicLink()) throw new Error('QA observation file escapes its run or is not a regular file');
    return file;
  }
  const isDirectory = (await lstat(path.resolve(runRoot, assertSafeContextInputPath(input.buildPath)))).isDirectory();
  const buildPath = await boundFile(input.buildPath, isDirectory);
  const buildHash = isDirectory
    ? sha256Text((await Promise.all((await listFiles(buildPath)).map(async file => `${file}:${await sha256File(await boundFile(path.join(input.buildPath, file)))}`))).join('\n'))
    : await sha256File(buildPath);
  const tracePath = await boundFile(input.tracePath);
  if (buildHash !== input.buildSha256 || await sha256File(tracePath) !== input.traceSha256) throw new Error('QA observation build/trace hash mismatch');
  const trace = NaturalFlowEvidenceSchema.parse(JSON.parse(await readFile(tracePath, 'utf8')));
  if (trace.buildHash !== input.buildSha256 || !trace.startedFromReset || trace.actions.length === 0 || trace.forbiddenOperations.length > 0) throw new Error('QA observation requires build-bound normal input, not state injection');
  if (trace.screenshots.length === 0 || trace.screenshots.length > 8 || new Set(trace.screenshots).size !== trace.screenshots.length) throw new Error('QA observation requires 1–8 distinct selected gameplay screenshots');
  const images = await Promise.all(trace.screenshots.map(async (relative) => {
    const file = await boundFile(relative);
    const bytes = await readFile(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('QA screenshot is not a PNG capture');
    const sha256 = await sha256File(file);
    if (input.screenshots !== undefined && !input.screenshots.some(image => image.path === relative && image.sha256 === sha256)) throw new Error('QA screenshot hash mismatch');
    return { path: file, sha256 };
  }));
  const approvedReferences: Array<{path:string;sha256:string|null}> = [];
  if (input.referenceImages !== undefined && input.referenceImages.length > 0) {
    if (input.referenceImages.length > 8) throw new Error('QA reference visual input exceeds bounded sample');
    const provenance = EvidenceProvenanceManifestSchema.parse(JSON.parse(await readFile(await boundFile('reference-evidence/manifest.json'), 'utf8')));
    if (!buildPath.startsWith(`${provenance.workspace}${path.sep}`)) throw new Error('QA reference/candidate workspace mismatch');
    const binding = await verifyEvidenceFileBindings(provenance, {targetGame:provenance.targetGame,workspace:provenance.workspace}, {runRoot,requireRunLocal:true,purposes:['gameplay-reference']});
    if (!binding.passed) throw new Error(`QA reference provenance failed: ${binding.blockers.join(', ')}`);
    const entries = provenance.entries.filter(entry=>entry.usableAsEvidence && entry.purpose==='gameplay-reference');
    approvedReferences.push(...entries.map(entry=>({path:entry.storedPath!,sha256:entry.sha256})));
    if (input.referenceImages.some(ref=>ref.path.startsWith('reference-evidence/derived/'))) {
      const frames=ReferenceFrameManifestSchema.parse(JSON.parse(await readFile(await boundFile('artifacts/reference-frame-manifest.json'),'utf8')));
      if (frames.targetRunId!==path.basename(runRoot) || frames.targetGame!==provenance.targetGame || frames.workspace!==provenance.workspace || !entries.some(entry=>entry.storedPath===frames.source.path && entry.sha256===frames.source.sha256)) throw new Error('QA reference frame identity mismatch');
      approvedReferences.push(...frames.frames,...frames.contactSheets);
    }
  }
  const referenceImages = await Promise.all((input.referenceImages ?? []).map(async ref => {
    if (!approvedReferences.some(approved=>approved.path===ref.path && approved.sha256===ref.sha256)) throw new Error('QA reference image is not identity-verified evidence');
    const file = await boundFile(ref.path);
    if (await sha256File(file) !== ref.sha256) throw new Error('QA reference image hash mismatch');
    return {path: file, sha256: ref.sha256};
  }));
  return { scope: 'FROZEN_NATURAL_OBSERVATIONS_ONLY' as const, ...input, images, referenceImages, trace, completion: trace.completion, replayObserved: trace.replayObserved };
}

/**
 * A no-model, same-host browser capability test. This is NOT product QA:
 * no game behavior, defect detection or independent Agent judgment is scored.
 */
export const QA_BROWSER_TARGETS = [
  { engine: 'chromium', viewport: { width: 390, height: 844 }, label: 'mobile' },
  { engine: 'chromium', viewport: { width: 1280, height: 800 }, label: 'desktop' },
  { engine: 'webkit', viewport: { width: 390, height: 844 }, label: 'mobile' },
  { engine: 'webkit', viewport: { width: 1280, height: 800 }, label: 'desktop' },
] as const;

export type QaBrowserTarget = (typeof QA_BROWSER_TARGETS)[number];
export type QaBrowserPreflightCheck = {
  engine: QaBrowserTarget['engine'];
  label: QaBrowserTarget['label'];
  viewport: { width: number; height: number };
  passed: boolean;
  screenshotBytes: number | null;
  blocker: string | null;
};
export type QaBrowserPreflightReport = {
  schemaVersion: 1;
  scope: 'HOST_BROWSER_SMOKE_ONLY';
  ready: boolean;
  checkedAt: string;
  checks: QaBrowserPreflightCheck[];
};

type BrowserProbe = (target: QaBrowserTarget) => Promise<number>;

/** The test page is local/in-memory; it does not visit external websites. */
async function realBrowserProbe(target: QaBrowserTarget): Promise<number> {
  const engine = target.engine === 'chromium' ? chromium : webkit;
  const browser = await engine.launch({ headless: true, timeout: 8_000 });
  try {
    const context = await browser.newContext({ viewport: target.viewport });
    try {
      const page = await context.newPage();
      await page.setContent(
        '<!doctype html><html><body><button id="qa-preflight-button">Tap</button><output id="qa-preflight-result">idle</output><script>document.getElementById("qa-preflight-button").addEventListener("click",()=>document.getElementById("qa-preflight-result").textContent="clicked")</script></body></html>',
        { timeout: 5_000 },
      );
      await page.locator('#qa-preflight-button').click({ timeout: 5_000 });
      const updated = await page.locator('#qa-preflight-result').textContent({ timeout: 5_000 });
      if (updated !== 'clicked') throw new Error('DOM click did not update the page');
      const screenshot = await page.screenshot({ timeout: 5_000 });
      if (screenshot.byteLength === 0) throw new Error('browser screenshot was empty');
      return screenshot.byteLength;
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export async function runQaBrowserPreflight(
  options: { probe?: BrowserProbe; targets?: readonly QaBrowserTarget[] } = {},
): Promise<QaBrowserPreflightReport> {
  const probe = options.probe ?? realBrowserProbe;
  const checks: QaBrowserPreflightCheck[] = [];
  for (const target of options.targets ?? QA_BROWSER_TARGETS) {
    try {
      const bytes = await probe(target);
      if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('no verified screenshot');
      checks.push({ ...target, passed: true, screenshotBytes: bytes, blocker: null });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      checks.push({
        ...target, passed: false, screenshotBytes: null,
        blocker: redactText(detail).slice(0, 240),
      });
    }
  }
  return {
    schemaVersion: 1,
    scope: 'HOST_BROWSER_SMOKE_ONLY',
    ready: checks.length === QA_BROWSER_TARGETS.length && checks.every((item) => item.passed),
    checkedAt: new Date().toISOString(),
    checks,
  };
}

/** Fail before any model/credit call if browser launch, input or pixels are unavailable. */
export function assertQaBrowserPreflight(report: QaBrowserPreflightReport): void {
  if (report.scope !== 'HOST_BROWSER_SMOKE_ONLY' || !report.ready
    || report.checks.length !== QA_BROWSER_TARGETS.length
    || report.checks.some((item, index) => {
      const target = QA_BROWSER_TARGETS[index]!;
      return item.engine !== target.engine || item.label !== target.label
        || item.viewport.width !== target.viewport.width || item.viewport.height !== target.viewport.height
        || !item.passed || item.screenshotBytes === null || item.screenshotBytes <= 0;
    })) {
    throw new Error('QA_BROWSER_UNAVAILABLE: local Chromium/WebKit playtest preflight failed or was incomplete. No model call made. Run pnpm factory qa-preflight.');
  }
}
