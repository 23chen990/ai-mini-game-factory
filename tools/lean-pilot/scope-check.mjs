/* global process, console */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const BASE_COMMIT = 'f38d9955575db5561eba40007640c00094add885';
const PREFIXES = ['tools/lean-pilot/', 'templates/web-lite/grid-merge-v1/', 'templates/web-lite/clinic-queue-v1/', 'templates/web-lite/h5-source-mobile-v1/', 'examples/lean-pilot/', 'docs/lean-pilot/', '.agents/skills/gameplay-loop-review/', 'docs/race-two-button-20261014/', 'docs/race-career-20261014/'];
const EXACT = ['PILOT_START.md', 'package.json', 'eslint.config.js', '.github/workflows/lean-pilot.yml', '.github/workflows/racing-v3-smoke.yml', 'src/cli/factory.ts',
  '.agents/skills/seed-to-game-blueprint/SKILL.md', '.agents/skills/game-playtest/SKILL.md'];

/** A narrow PR scope check. It is not permission to weaken frozen acceptance. */
export function evaluateScope(paths, before, after) {
  const blockers = [];
  for (const name of paths) {
    if ((!EXACT.includes(name) && !PREFIXES.some(prefix => name.startsWith(prefix))) ||
      name.includes('..') || name.includes('\\') || name.includes('node_modules/')) blockers.push(`scope:${name}`);
  }
  const { scripts: oldScripts = {}, ...oldFields } = before;
  const { scripts: newScripts = {}, ...newFields } = after;
  if (!isDeepStrictEqual(oldFields, newFields)) blockers.push('package:non-script-fields-changed');
  for (const [name, command] of Object.entries(oldScripts)) {
    if (newScripts[name] !== command) blockers.push(`package:legacy-script:${name}`);
  }
  for (const name of Object.keys(newScripts)) {
    if (!(name in oldScripts) && name !== 'pilot' && !name.startsWith('pilot:')) blockers.push(`package:out-of-scope-script:${name}`);
  }
  return { passed: blockers.length === 0, blockers };
}
export function checkScope(root = process.cwd(), base = BASE_COMMIT) {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Scope base must be an immutable commit');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  const changed = git(['diff', '--name-only', '-z', base, '--']).split('\0').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const before = JSON.parse(git(['show', `${base}:package.json`]));
  const after = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const result = evaluateScope([...new Set([...changed, ...untracked])], before, after);
  return { ...result, base, changedFiles: changed.length, untrackedFiles: untracked.length,
    limitation: 'Scope only. Includes the shared runner and explicitly registered private H5 recipe. Generated source/builds remain excluded. Review content and run tests separately.' };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { const result = checkScope(); console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
