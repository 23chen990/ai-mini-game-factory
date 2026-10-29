import { z } from 'zod';
import { expect, type Page } from '@playwright/test';

export type GridDirection = 'left' | 'right' | 'up' | 'down';
export const GridSnapshotSchema = z.object({
  cells: z.array(z.number().int().nonnegative()).length(16), score: z.number().int().nonnegative(), lost: z.boolean(),
}).strict();
type Board = { cells: number[]; score: number };

/** Generic rule oracle, independent of either game's engine and RNG. */
export function measureGridMove(before: Board, after: Board, direction: GridDirection) {
  const projected = Array<number>(16).fill(0);
  let score = 0;
  for (let lane = 0; lane < 4; lane++) {
    const indices = Array.from({length:4}, (_, step) => {
      const offset = direction === 'right' || direction === 'down' ? 3 - step : step;
      return direction === 'left' || direction === 'right' ? lane * 4 + offset : offset * 4 + lane;
    });
    const values = indices.map((index) => before.cells[index]!).filter((value) => value !== 0);
    const output: number[] = [];
    let pending = 0;
    for (const value of values) {
      if (pending === 0) pending = value;
      else if (pending === value) { output.push(value * 2); score += value * 2; pending = 0; }
      else { output.push(pending); pending = value; }
    }
    if (pending !== 0) output.push(pending);
    output.forEach((value, index) => { projected[indices[index]!] = value; });
  }
  const changed = projected.some((value, index) => value !== before.cells[index]);
  const mismatches = projected.flatMap((value, index) => value === after.cells[index] ? [] : [index]);
  const oneSpawn = mismatches.length === 1 && projected[mismatches[0]!] === 0 && [2, 4].includes(after.cells[mismatches[0]!]!);
  return { changed, expectedScoreDelta: score, movementError: changed ? Number(!oneSpawn) : mismatches.length, scoreError: Math.abs(after.score - before.score - score) };
}

export function hasGridMove(cells: number[]) {
  return cells.includes(0) || cells.some((value, index) =>
    (index % 4 < 3 && value === cells[index + 1]) || (index < 12 && value === cells[index + 4]));
}

export async function waitForGridTerminal(page: Page, target: 'reference' | 'candidate') {
  // Playwright visibility ignores opacity. The reference delays its failure overlay by two seconds.
  await expect(page.locator(target === 'reference' ? '.game-message.game-over' : '#dialog')).toHaveCSS('opacity', '1');
}

/** DOM is external evidence: reject an unexpected layout rather than manufacture zeros. */
export async function readGridDom(page: Page, target: 'reference' | 'candidate') {
  const tiles = await page.locator(target === 'reference' ? '.tile-container .tile' : '#tiles .tile').evaluateAll((elements, kind) => elements.map((tile) => {
    if (kind === 'candidate') return { position: tile.getAttribute('data-index'), value: tile.textContent };
    const position = /tile-position-(\d)-(\d)/u.exec(tile.className);
    if (!position) throw new Error('reference tile has no grid position');
    return { position: String((Number(position[2]) - 1) * 4 + Number(position[1]) - 1), value: tile.textContent };
  }), target);
  const parsed = z.array(z.object({position: z.string().regex(/^\d+$/u), value: z.string().regex(/^\d+$/u)})).min(1).parse(tiles);
  const cells = Array<number>(16).fill(0);
  // The reference app appends the merged tile after its animation ancestors.
  for (const tile of parsed) cells[Number(tile.position)] = Number(tile.value);
  const score = target === 'reference'
    ? await page.locator('.score-container').evaluate((element) => element.childNodes[0]!.textContent)
    : await page.locator('#score').textContent();
  const lost = target === 'reference' ? await page.locator('.game-message.game-over').isVisible() : await page.locator('#board-state').textContent() === 'NO MOVES LEFT';
  return GridSnapshotSchema.parse({cells, score: Number(z.string().regex(/^\d+$/u).parse(score)), lost});
}
