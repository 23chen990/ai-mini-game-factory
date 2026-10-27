import { chromium, webkit } from '@playwright/test';
import { redactText } from '../core/redaction.js';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { sha256File } from '../core/files.js';
import { assertSafeContextInputPath } from '../core/execution-boundary.js';
import { NaturalFlowEvidenceSchema } from '../schemas/natural-flow.js';

export type QaObservationInput = { buildPath: string; buildSha256: string; tracePath: string; traceSha256: string };

/** Validate the existing natural-flow artifact, not a new acceptance schema.
 * Files and JSON cross a real external boundary. Host readiness alone did not
 * let the previous read-only QA session observe even one gameplay frame.
 */
export async function verifyQaObservation(runRoot: string, input: QaObservationInput) {
  const root = await realpath(runRoot);
  async function boundFile(relative: string): Promise<string> {
    const file = path.resolve(runRoot, assertSafeContextInputPath(relative));
    const actual = await realpath(file);
    const stat = await lstat(file);
    if (!actual.startsWith(`${root}${path.sep}`) || !stat.isFile() || stat.isSymbolicLink()) throw new Error('QA observation file escapes its run or is not a regular file');
    return file;
  }
  const buildPath = await boundFile(input.buildPath);
  const tracePath = await boundFile(input.tracePath);
  if (await sha256File(buildPath) !== input.buildSha256 || await sha256File(tracePath) !== input.traceSha256) throw new Error('QA observation build/trace hash mismatch');
  const trace = NaturalFlowEvidenceSchema.parse(JSON.parse(await readFile(tracePath, 'utf8')));
  if (trace.buildHash !== input.buildSha256 || !trace.startedFromReset || trace.actions.length === 0 || trace.forbiddenOperations.length > 0) throw new Error('QA observation requires build-bound normal input, not state injection');
  if (trace.screenshots.length === 0 || trace.screenshots.length > 8 || new Set(trace.screenshots).size !== trace.screenshots.length) throw new Error('QA observation requires 1–8 distinct selected gameplay screenshots');
  const images = await Promise.all(trace.screenshots.map(async (relative) => {
    const file = await boundFile(relative);
    const bytes = await readFile(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('QA screenshot is not a PNG capture');
    return { path: file, sha256: await sha256File(file) };
  }));
  return { scope: 'FROZEN_NATURAL_OBSERVATIONS_ONLY' as const, ...input, images, completion: trace.completion, replayObserved: trace.replayObserved };
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
