import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
it('automatically validates a PR targeting a stacked codex branch, once through pull_request', () => {
  const workflow = parse(readFileSync('.github/workflows/factory-health.yml', 'utf8'));
  expect(workflow.on.pull_request?.branches, 'PR80 previously required manual dispatch').toBeUndefined();
  expect(Object.keys(workflow.on)).toContain('pull_request');
  expect(workflow.on.push.branches).toEqual(['main']);
});
