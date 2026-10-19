/* global process, console */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeRead } from './policy.mjs';
import { canonicalJson, planResearch, inspectExport, reviewExport, anchorExport } from './rea-bridge.mjs';

/** Read-only, offline bridge. Never executes the command contained in a plan. */
export async function main(args) {
  const [mode, root, jobPath, reportPath, reviewPath] = args;
  const expectedArgs = { plan: 3, inspect: 4, anchor: 5, review: 5 };
  if (!Object.hasOwn(expectedArgs, mode) || args.length !== expectedArgs[mode] || !root) throw new Error('cli:usage');
  const readJson = async relative => {
    const bytes = await safeRead(root, relative, 2 * 1024 * 1024);
    let value; try { value = JSON.parse(bytes.toString()); } catch { throw new Error('cli:json-required'); }
    canonicalJson(value); return value;
  };
  const job = await readJson(jobPath);
  if (mode === 'plan') return planResearch(job);
  const raw = await safeRead(root, reportPath, 2 * 1024 * 1024);
  if (mode === 'inspect') return inspectExport(root, job, raw);
  if (mode === 'anchor') return anchorExport(root, job, raw, reviewPath);
  return reviewExport(root, job, raw, await readJson(reviewPath));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await main(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (['REVIEW_REQUIRED','OVER_BUDGET_STOP','COST_UNKNOWN_STOP','NO_INCREMENTAL_VALUE'].includes(result.status)) process.exitCode = 2;
  } catch (error) {
    // Do not echo private paths, snippets, malformed reports or OS error messages.
    const message = error instanceof Error && /^(rea|job|json|baseline|review|cli):[a-z-]+$/.test(error.message)
      ? error.message : 'cli:unreadable-or-invalid-input';
    console.error(message); process.exitCode = 1;
  }
}
