import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const status = new Set(['passed', 'failed', 'pending', 'unverified']);
const proof = new Set(['passed', 'failed', 'unverified']);

export function validateRegistry(data) {
  const errors = [];
  if (data?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(data?.games) || data.games.length === 0) {
    errors.push('games must be a nonempty array');
    return errors;
  }
  const ids = new Set();
  for (const game of data.games) {
    const id = game?.id ?? '?';
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) errors.push(`${id}: invalid id`);
    if (ids.has(id)) errors.push(`${id}: duplicate id`);
    ids.add(id);
    if (typeof game.name !== 'string' || !game.name.trim()) errors.push(`${id}: missing name`);
    if (!Number.isInteger(game.pullRequest) || game.pullRequest < 1) errors.push(`${id}: invalid pullRequest`);
    if (typeof game.branch !== 'string' || !game.branch) errors.push(`${id}: missing branch`);
    if (typeof game.inspectedSha !== 'string' || !/^[0-9a-f]{40}$/.test(game.inspectedSha)) errors.push(`${id}: inspectedSha must be a 40-char commit`);
    if (!status.has(game.ci)) errors.push(`${id}: invalid ci status`);
    for (const axis of ['realDevice', 'humanPlaytest', 'realRewardAds', 'platformPackage']) {
      if (!proof.has(game[axis])) errors.push(`${id}: invalid ${axis} status`);
    }
    if (typeof game.publicLaunchReady !== 'boolean') errors.push(`${id}: publicLaunchReady must be boolean`);
    if (game.publicLaunchReady && (game.ci !== 'passed' ||
      ['realDevice', 'humanPlaytest', 'realRewardAds', 'platformPackage'].some(axis => game[axis] !== 'passed'))) {
      errors.push(`${id}: launch-ready requires all five verified passes`);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = new URL('../../release-status/games.json', import.meta.url);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const errors = validateRegistry(data);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Release registry valid: ${data.games.length} games; launch-ready ${data.games.filter(g => g.publicLaunchReady).length}.`);
  }
}
