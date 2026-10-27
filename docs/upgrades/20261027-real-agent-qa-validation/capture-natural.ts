// Controller-authored normal-input evidence, NOT independent QA or autonomous repair.
// Serve exact historical HTTP response bytes recovered from Playwright traces.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { z } from 'zod';

const [runRoot, captureName, ...versions] = process.argv.slice(2);
assert(runRoot && captureName && versions.length, 'usage: tsx capture-natural.ts <original run root> <new capture name> <historical trace directory>...');
const outputRoot = path.join(runRoot, 'qa', captureName);
await mkdir(outputRoot); // Append-only: an existing capture name is an error.
const intents = process.env.CAPTURE_INTENT
  ? [z.enum(['single-launch-then-coast', 'sustained-flips', 'spaced-flips']).parse(process.env.CAPTURE_INTENT)]
  : ['single-launch-then-coast', 'sustained-flips'];
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
// The trace is an external ZIP/JSON boundary: validate fields used to recover exact bytes.
const network = z.object({ snapshot: z.object({ response: z.object({ content: z.object({ mimeType: z.string(), _sha1: z.string().optional() }) }) }) });
const builds = versions.map((version) => {
  const tracePath = path.join(runRoot, 'qa', version, 'trace.zip');
  const rows = execFileSync('unzip', ['-p', tracePath, 'trace.network'], { encoding: 'utf8' }).trim().split('\n').map((line) => network.parse(JSON.parse(line)));
  const document = rows.find((row) => row.snapshot.response.content.mimeType === 'text/html');
  assert(document);
  const resource = document.snapshot.response.content._sha1;
  assert(resource);
  const bytes = execFileSync('unzip', ['-p', tracePath, `resources/${resource}`], { maxBuffer: 8_000_000 });
  return { version, tracePath, resource, sha256: sha256(bytes), bytes };
});
const server = createServer((request, response) => {
  const build = builds.find((item) => `/${item.version}` === request.url);
  if (!build) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', 'text/html');
  response.setHeader('cache-control', 'no-store');
  response.end(build.bytes);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const build of builds) for (const viewport of [{ width: 390, height: 844 }, { width: 1100, height: 720 }]) for (const intent of intents) {
    const directory = path.join(outputRoot, `${build.version}-${viewport.width}-${intent}`);
    await mkdir(directory);
    const started = Date.now();
    const inputs: object[] = [];
    const screenshots: object[] = [];
    const errors: string[] = [];
    const context = await browser.newContext({ viewport, hasTouch: true, recordVideo: { dir: directory, size: viewport } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    async function shot(name: string) {
      const file = path.join(directory, `${name}.png`);
      const bytes = await page.screenshot({ path: file });
      screenshots.push({ file, sha256: sha256(bytes), elapsedMs: Date.now() - started });
    }
    async function tap(x: number, y: number) {
      const at = Date.now();
      await page.touchscreen.tap(x, y);
      inputs.push({ type: 'touchscreen.tap', x, y, at: new Date(at).toISOString(), elapsedMs: at - started, completedMs: Date.now() - started });
    }
    let blocked: string | null = null;
    let terminalText = '';
    let replayRestarted = false;
    let renewedVisibleText = '';
    try {
      await page.goto(`http://127.0.0.1:${address.port}/${build.version}`, { waitUntil: 'load' });
      await shot('startup');
      await tap(viewport.width * 0.5, viewport.height * 0.65);
      const gapMs = intent === 'spaced-flips' ? 1100 : 500;
      await page.waitForTimeout(gapMs);
      await shot('core');
      if (intent !== 'single-launch-then-coast') {
        for (let step = 0; step < 60 && !await page.locator('#terminal-actions').isVisible(); step++) {
          await tap(viewport.width * 0.5, viewport.height * 0.65);
          await page.waitForTimeout(gapMs);
        }
      }
      await page.locator('#terminal-actions').waitFor({ state: 'visible', timeout: 20000 });
      terminalText = await page.locator('#terminal-text').innerText();
      await shot('terminal');
      const box = await page.locator('#replay-button').boundingBox();
      assert(box, 'visible terminal must expose a replay control');
      await tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      replayRestarted = !await page.locator('#terminal-actions').isVisible();
      await shot('after-replay');
      await tap(viewport.width * 0.5, viewport.height * 0.65);
      await page.waitForTimeout(500);
      renewedVisibleText = await page.locator('#state-text').innerText();
      await shot('renewed-input');
    } catch (error) {
      // A real browser timeout/failure is evidence, never a fabricated PASS.
      blocked = error instanceof Error ? error.message : String(error);
      await shot('blocked');
    } finally {
      await writeFile(path.join(directory, 'inputs.json'), JSON.stringify(inputs, null, 2));
      await context.tracing.stop({ path: path.join(directory, 'trace.zip') });
      await context.close();
    }
    const result = { actor: 'controller-normal-input-capture', autonomousQa: false, version: build.version, viewport, intent, buildSha256: build.sha256, sourceTrace: build.tracePath, terminalText, replayRestarted, renewedVisibleText, blocked, errors, inputs, screenshots, directory, elapsedMs: Date.now() - started };
    results.push(result);
    await writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
    await writeFile(path.join(outputRoot, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ version: build.version, viewport, intent, terminalText, replayRestarted, blocked, errors }));
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
