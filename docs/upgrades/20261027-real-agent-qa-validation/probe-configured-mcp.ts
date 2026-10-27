// Diagnostic only: zero model calls; no factory stage or permission policy changes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { z } from 'zod';
import { buildCodexProcessEnv } from '../../../src/providers/codex-cli.js';

const [reaExecutable, outputDirectory] = process.argv.slice(2);
assert(reaExecutable && outputDirectory, 'usage: tsx probe-configured-mcp.ts <configured rea executable> <new output directory>');
await mkdir(outputDirectory); // Refuse overwriting earlier probe evidence.
const require = createRequire(await realpath(reaExecutable));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')).href);
const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')).href);
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end('<!doctype html><button id="tap">Tap</button><output id="status">idle</output><script>document.querySelector("#tap").onclick=()=>document.querySelector("#status").textContent="clicked"</script>');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
// Read the actual configured transport instead of inventing a tool grant.
const config = JSON.parse(execFileSync('codex', ['mcp', 'get', 'rea', '--json'], { encoding: 'utf8' }));
assert.equal(config.enabled, true);
assert.equal(config.transport.command, reaExecutable);
const environment = { ...buildCodexProcessEnv(), ...config.transport.env };
const client = new Client({ name: 'factory-zero-model-mcp-probe', version: '1.0.0' });
const transport = new StdioClientTransport({ command: reaExecutable, args: ['mcp'], env: environment, stderr: 'pipe' });
const stderr: string[] = [];
transport.stderr.on('data', (data: Buffer) => stderr.push(data.toString()));
try {
  await client.connect(transport);
  const inventory = await client.listTools();
  const tool = inventory.tools.find((item: { name: string }) => item.name === 'capture_browser_scenario');
  assert(tool, 'configured MCP must advertise the actual browser action tool');
  await writeFile(path.join(outputDirectory, 'advertised-tool.json'), JSON.stringify(tool, null, 2));
  const request = {
    browser: { mode: 'launch', executable_path: chromium.executablePath(), headless: true },
    start_url: { url: `http://127.0.0.1:${address.port}` },
    environment: { viewport: { width: 390, height: 844 } },
    actions: [{ step_id: 'tap', action: 'click', locator: { kind: 'css', selector: '#tap' }, timeout_ms: 5000 }],
    capture: { at_end: ['screenshot', 'dom'], events: ['page-errors', 'console'] },
  };
  await writeFile(path.join(outputDirectory, 'request.json'), JSON.stringify(request, null, 2));
  const result = await client.callTool({ name: tool.name, arguments: request }, undefined, { timeout: 20000 });
  await writeFile(path.join(outputDirectory, 'response.json'), JSON.stringify(result, null, 2));
  assert.notEqual(result.isError, true, 'MCP browser action must succeed');
  // MCP is an external dependency: validate returned structure before interpreting it.
  const step = z.object({
    step_id: z.string(), status: z.literal('completed'),
    artifacts: z.object({
      screenshot: z.object({ state: z.literal('captured'), value: z.object({ sha256: z.string(), data_base64: z.string() }) }),
      dom: z.object({ state: z.literal('captured'), value: z.object({ text: z.string() }) }),
    }),
  });
  const envelope = z.object({ normalized_result: z.object({ completeness: z.object({ status: z.literal('complete') }), steps: z.array(z.unknown()) }) });
  const raw = result.structuredContent ?? JSON.parse(result.content.find((item: { type: string }) => item.type === 'text').text);
  const parsed = envelope.parse(raw);
  const click = step.parse(parsed.normalized_result.steps.at(-1));
  assert.equal(click.step_id, 'tap');
  assert(click.artifacts.dom.value.text.includes('<output id="status">clicked</output>'));
  const screenshot = Buffer.from(click.artifacts.screenshot.value.data_base64, 'base64');
  assert(screenshot.byteLength > 0);
  const screenshotSha256 = createHash('sha256').update(screenshot).digest('hex');
  assert.equal(screenshotSha256, click.artifacts.screenshot.value.sha256);
  await writeFile(path.join(outputDirectory, 'clicked.png'), screenshot);
  await writeFile(path.join(outputDirectory, 'summary.json'), JSON.stringify({
    schemaVersion: 1, scope: 'CONFIGURED_MCP_TRANSPORT_NO_MODEL', modelCalls: 0,
    configuredExecutable: reaExecutable, environmentKeys: Object.keys(environment).sort(),
    tool: tool.name, fixtureOnly: true, actualAgentSessionTested: false,
    clickedDomVerified: true, screenshotSha256,
    responseBytes: (await readFile(path.join(outputDirectory, 'response.json'))).byteLength,
  }, null, 2));
} finally {
  await client.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await writeFile(path.join(outputDirectory, 'stderr.txt'), stderr.join(''));
}
