import { BlindPlaytestSchema } from '../schemas/blind-playtest.js';

export function evaluateBlindPlaytest(value: unknown) {
  const parsed = BlindPlaytestSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'], test: value };
  const test = parsed.data;
  const blockers: string[] = [];
  if (test.outcome !== 'PASSED') blockers.push(`outcome:${test.outcome.toLowerCase()}`);
  if (test.taskCompletionRate < 0.8) blockers.push('task-completion-below-threshold');
  return { passed: blockers.length === 0, blockers, test };
}
