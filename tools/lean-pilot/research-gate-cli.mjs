/* global process */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { auditResearchToBuild } from './research-to-build.mjs';
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node tools/lean-pilot/research-gate-cli.mjs PRIVATE_ROOT research-to-build.json');
  process.exitCode = 1;
} else {
  try {
    const report = await auditResearchToBuild(path.resolve(args[0]), args[1]);
    console.log(JSON.stringify(report, null, 2));
    if (!report.candidateBuildAllowed) process.exitCode = 2;
  } catch {
    // Private paths and reference text must not leak into stdout/logs.
    console.error('Research gate rejected malformed, missing, or unsafe research inputs.');
    process.exitCode = 1;
  }
}
