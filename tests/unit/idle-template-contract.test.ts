import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const templateRoot = path.join(process.cwd(), 'templates/web-lite/idle-shop-v1');

describe('idle-shop-v1 production contract', () => {
  it('ships local test/typecheck scripts and a pure deterministic simulation module', async () => {
    const packageJson = JSON.parse(await readFile(path.join(templateRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts).toMatchObject({ test: 'vitest run', typecheck: 'tsc --noEmit' });

    const simulation = await readFile(path.join(templateRoot, 'src/simulation.ts'), 'utf8');
    expect(simulation).toMatch(/createInitialState/);
    expect(simulation).toMatch(/completeOrder/);
    expect(simulation).toMatch(/upgradeStation/);

    const main = await readFile(path.join(templateRoot, 'src/main.ts'), 'utf8');
    expect(main).toMatch(/palette\[1\].*\?\?/s);
    expect(main).toMatch(/palette\[0\].*\?\?/s);
  });
});
