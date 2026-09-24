import { chromium, type Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import * as runtimeQa from '../../src/providers/runtime-qa.js';
import { choosePrototypeControl, isPrototypeTerminalState, repeatedPrototypeActions } from '../../src/providers/runtime-qa.js';

describe('prototype tournament browser controls', () => {
  it('plays action and lantern contracts without assuming data-choice buttons', () => {
    const controls = [
      { kind: 'action' as const, value: 'reset', label: '重来' },
      { kind: 'action' as const, value: 'follow', label: '跟拍' },
      { kind: 'action' as const, value: 'counter', label: '逆拍' },
      { kind: 'lantern' as const, value: 'A', label: '灯笼 A' },
    ];

    expect(choosePrototypeControl(controls, 0)).toMatchObject({ kind: 'action', value: 'follow' });
    expect(choosePrototypeControl(controls, 1)).toMatchObject({ kind: 'action', value: 'counter' });
    expect(choosePrototypeControl(controls, 2)).toMatchObject({ kind: 'lantern', value: 'A' });
  });

  it('still supports the generic data-choice contract', () => {
    const controls = [
      { kind: 'choice' as const, value: '0', label: '安全选择' },
      { kind: 'choice' as const, value: '1', label: '冒险选择' },
    ];
    expect(choosePrototypeControl(controls, 3)).toEqual(controls[1]);
  });

  it('recognizes terminal states before an end-card can block the next input', () => {
    expect(isPrototypeTerminalState({ phase: 'playing', failed: false })).toBe(false);
    expect(isPrototypeTerminalState({ phase: 'won' })).toBe(true);
    expect(isPrototypeTerminalState({ failed: true })).toBe(true);
  });

  it('uses one identical core input for the five-repeat check', () => {
    expect(repeatedPrototypeActions('repair')).toEqual(['repair', 'repair', 'repair', 'repair', 'repair']);
  });

  it('atomically skips a prototype control that becomes disabled before click', async () => {
    const clickPrototypeControl = (runtimeQa as unknown as {
      clickPrototypeControl?: (page: Page, turn: number) => Promise<{ kind: string; value: string; label: string }>;
    }).clickPrototypeControl;
    expect(clickPrototypeControl).toBeTypeOf('function');
    if (!clickPrototypeControl) return;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent('<button data-action="comfort">Comfort</button><button data-action="calibrate">Calibrate</button>');
      await page.evaluate(() => {
        const comfort = document.querySelector<HTMLButtonElement>('[data-action="comfort"]')!;
        let reads = 0;
        Object.defineProperty(comfort, 'disabled', { configurable: true, get: () => reads++ > 0 });
        document.querySelector('[data-action="calibrate"]')!.addEventListener('click', () => { document.body.dataset.clicked = 'calibrate'; });
      });

      const control = await clickPrototypeControl(page, 0);

      expect(control).toMatchObject({ kind: 'action', value: 'calibrate' });
      expect(await page.getAttribute('body', 'data-clicked')).toBe('calibrate');
    } finally {
      await page.close();
      await browser.close();
    }
  });

  it('waits for an automatic prototype phase to enable a playable control', async () => {
    const clickPrototypeControl = (runtimeQa as unknown as {
      clickPrototypeControl?: (page: Page, turn: number) => Promise<{ kind: string; value: string; label: string }>;
    }).clickPrototypeControl;
    expect(clickPrototypeControl).toBeTypeOf('function');
    if (!clickPrototypeControl) return;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent('<button data-action="decide" disabled>Decide</button><script>setTimeout(() => { document.querySelector("button").disabled = false }, 50)</script>');

      const control = await clickPrototypeControl(page, 0);

      expect(control).toMatchObject({ kind: 'action', value: 'decide' });
    } finally {
      await page.close();
      await browser.close();
    }
  });
});
