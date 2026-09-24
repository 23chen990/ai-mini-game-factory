import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.resolve('templates/web-lite/cut-stack-dodge-v1');

it('keeps the cut-stack template in the verified bright low-poly presentation family', async () => {
  const [css, main] = await Promise.all([
    readFile(path.join(root, 'src/style.css'), 'utf8'),
    readFile(path.join(root, 'src/main.ts'), 'utf8'),
  ]);
  expect(css).toContain('#f7fbff');
  expect(css).toContain('#dff2ff');
  expect(css).not.toContain('#07101d');
  expect(main).toContain('白色支撑面');
  expect(main).toContain('#7ec8ff');
  expect(main).toContain('#ff8ca8');
  expect(main).not.toContain("context.fillText(config.theme, WORLD.width / 2, 115)");
});

it('projects recording probes onto the locked reference lifecycle and checkpoint contract', async () => {
  const main = await readFile(path.join(root, 'src/main.ts'), 'utf8');
  expect(main).toContain("const prefix = LOADED_RUNTIME.runtimeBinding ? 'reference' : 'checkpoint'");
  expect(main).toContain("'reference-interaction'");
  expect(main).toContain("feedback-${phase}");
  expect(main).toContain("object.role === 'cuttable' && state.cuts > 0");
  expect(main).toContain("result: recording && state.phase === 'won' ? 'level-complete'");
  expect(main).toContain('Math.min(LEVEL.finishX - 300, state.player.x - 260)');
  expect(main).not.toContain('Math.min(LEVEL.finishX - 700, state.player.x - 260)');
});

it('clears terminal-only feedback on replay and keeps internal object ids out of player copy', async () => {
  const main = await readFile(path.join(root, 'src/main.ts'), 'utf8');
  expect(main).toContain('function failureCauseText(cause: string | null): string');
  expect(main).toContain("return cause === 'fall' ? '坠落出界' : '撞上粉色尖刺';");
  expect(main).toContain('impactUntil = 0;');
  expect(main).toContain("impact.textContent = '';");
  expect(main).not.toContain("${state.failureCause ?? '轨迹失控'}");
});
