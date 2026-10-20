/* global document */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { minimapPolicy } from '../racing-minimap-observer.mjs';

test('visible arrow heading is observable across raster rotations, not mistaken for a yellow rival circle', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id="mm" width="420" height="420"></canvas>');
    const failed = [];
    for (let degrees = 0; degrees < 360; degrees += 3) {
      await page.evaluate(degrees => {
        const g = document.querySelector('#mm').getContext('2d');
        g.clearRect(0, 0, 420, 420);
        g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath();g.arc(210, 210, 21, 0, 2 * Math.PI);g.stroke();
        g.fillStyle = '#ffd23a';g.beginPath();g.arc(90, 90, 8, 0, 2 * Math.PI);g.fill();
        g.save();g.translate(210, 210);g.rotate(degrees * Math.PI / 180);
        g.fillStyle = '#ffd23a';g.strokeStyle = '#000';g.lineWidth = 3;
        g.beginPath();g.moveTo(0,16);g.lineTo(11,-11);g.lineTo(0,-5);g.lineTo(-11,-11);g.closePath();g.fill();g.stroke();g.restore();
      }, degrees);
      const observation = await page.evaluate(minimapPolicy, 21);
      const h = observation.heading;
      const theta = degrees * Math.PI / 180;
      if (!h || h[0] * -Math.sin(theta) + h[1] * Math.cos(theta) < .98) failed.push({ degrees, observation });
    }
    assert.deepEqual(failed, [], 'Arrow pixel observation must not lose rotational branches');
  } finally { await browser.close(); }
});
