/* global process, console, window */
// Presentation-only A/B diagnosis, explicitly NOT natural-play acceptance.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
const run = path.resolve('runs/h5-qq-mobile-20261013');
const out = run + '/artifacts/internal-experience-20261020/' + (process.env.RACE_MATERIAL_LABEL ?? 'material-diagnostic17');
const finishPass = process.env.RACE_MATERIAL_LABEL === 'finish-diagnostic17';
await mkdir(out, { recursive: true });
const game = run + '/workspace/game';
const files = new Map();
for (const file of await readdir(game, { withFileTypes: true }))
  if (file.isFile()) files.set('/' + file.name, await readFile(game + '/' + file.name));
// Requests are external input: serve only this exact artifact's top-level files.
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const name = pathname === '/' ? '/index.html' : pathname;
  if (!files.has(name)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.mjs') ? 'application/javascript' : 'text/html');
  res.end(files.get(name));
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const report = { classification: 'RENDER_PROPERTY_FIXTURE_DIAGNOSIS_ONLY', build: JSON.parse(await readFile(run + '/artifacts/build-racing.json')), rows: [] };
try {
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  for (const id of finishPass ? ['starter', 'custom-01', 'custom-02', 'custom-03', 'custom-04', 'custom-05'] : ['custom-01', 'custom-02', 'custom-05']) {
    await page.locator(`button[data-car-id="${id}"]`).click();
    await page.waitForFunction(id => window.__RACE_EVIDENCE__.displayedCar === id && !window.__RACE_EVIDENCE__.garage.busy, id);
    const original = await page.evaluate(() => {
      const found = new Set();
      window.game.racers[0].model.traverse(o => {
        if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m.isMeshStandardMaterial && m.map) found.add(m);
      });
      window.__MATERIAL_DIAG__ = [...found].map(m => ({
        m, roughness: m.roughness, metalness: m.metalness, normalMap: m.normalMap,
        roughnessMap: m.roughnessMap, envMapIntensity: m.envMapIntensity, color: m.color.clone(),
        onBeforeCompile: m.onBeforeCompile, customProgramCacheKey: m.customProgramCacheKey,
      }));
      return window.__MATERIAL_DIAG__.map(({ m }) => ({
        name: m.name, roughness: m.roughness, metalness: m.metalness, normalScale: m.normalScale.toArray(),
        normalMap: !!m.normalMap, roughnessMap: !!m.roughnessMap, envMapIntensity: m.envMapIntensity,
      }));
    });
    for (const variant of finishPass ? ['candidate17', 'bounded-finish'] : ['candidate17', 'normal-off', 'satin', 'normal-off-satin']) {
      await page.evaluate(({ variant, id }) => {
        for (const saved of window.__MATERIAL_DIAG__) {
          const { m, color, ...properties } = saved;
          Object.assign(m, properties);
          m.color.copy(color);
          if (variant.includes('normal-off')) m.normalMap = null;
          if (variant.includes('satin')) { m.roughnessMap = null; m.roughness = .48; m.metalness *= .55; }
          if (variant === 'bounded-finish') {
            if (id === 'starter') {
              if (m.name === 'BodyPaint') {
                const paint = saved.onBeforeCompile;
                m.onBeforeCompile = shader => { paint(shader); shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.30);'); };
                m.customProgramCacheKey = () => 'diagnostic-bounded-paint';
              }
            } else {
              m.metalness *= .55;
              m.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.38);'); };
              m.customProgramCacheKey = () => 'diagnostic-bounded-finish';
            }
          }
          m.needsUpdate = true;
        }
      }, { variant, id });
      await page.waitForTimeout(150);
      const screenshot = `${id}-${variant}.png`;
      await page.screenshot({ path: out + '/' + screenshot });
      report.rows.push({ id, variant, original, screenshot });
    }
  }
} finally {
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close(); server.close();
}
console.log('Material render diagnostic captured; not a natural or release pass.');
