import { describe, expect, it } from 'vitest';
import { measureGridMove, hasGridMove } from '../../src/qa/grid-comparison-adapter.js';
import * as adapter from '../../src/qa/grid-comparison-adapter.js';
import { chromium } from '@playwright/test';

const board = (row: number[]) => [...row, ...Array<number>(12).fill(0)];
describe('independent DOM-observation grid comparator', () => {
  it('measures a single merge plus one spawn without assuming the same random board', () => {
    expect(measureGridMove({cells:board([2,2,2,0]),score:0}, {cells:board([4,2,0,2]),score:4}, 'left'))
      .toMatchObject({changed:true, movementError:0, scoreError:0});
    expect(measureGridMove({cells:board([2,2,2,0]),score:0}, {cells:board([4,2,0,2]),score:4}, 'left')).toHaveProperty('expectedScoreDelta',4);
  });
  it('rejects a second merge in one action and wrong score', () => {
    const result=measureGridMove({cells:board([2,2,4,0]),score:0}, {cells:board([8,2,0,0]),score:12}, 'left');
    expect(result.movementError).toBeGreaterThan(0);
    expect(result.scoreError).toBe(8);
  });
  it('rejects spawning on a no-op', () => {
    expect(measureGridMove({cells:board([2,4,0,0]),score:0}, {cells:board([2,4,2,0]),score:0}, 'left').movementError).toBeGreaterThan(0);
  });
  it('distinguishes full dead board from a full board with an available merge', () => {
    const dead=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
    expect(hasGridMove(dead)).toBe(false);
    expect(hasGridMove([4,...dead.slice(1)])).toBe(true);
  });
  it('waits for actually visible terminal feedback, not just an opacity-zero game-over element', async () => {
    expect(adapter).toHaveProperty('waitForGridTerminal');
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage();
      await page.setContent('<style>@keyframes reveal{from{opacity:0}to{opacity:1}}.game-message{animation:reveal 100ms linear 150ms both}</style><div class="game-message game-over">Game over</div>');
      expect(await page.locator('.game-message').isVisible()).toBe(true);
      expect(await page.locator('.game-message').evaluate(element=>getComputedStyle(element).opacity)).not.toBe('1');
      await adapter.waitForGridTerminal(page,'reference');
      expect(await page.locator('.game-message').evaluate(element=>getComputedStyle(element).opacity)).toBe('1');
    } finally { await browser.close(); }
  });
});
