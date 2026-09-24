import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('factory board script', () => {
  it('passes the repository ESLint configuration', () => {
    expect(() => execFileSync('pnpm', ['exec', 'eslint', 'tools/board.mjs'], {
      cwd: process.cwd(),
      stdio: 'pipe',
    })).not.toThrow();
  });
});
