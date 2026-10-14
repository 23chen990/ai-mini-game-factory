/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const api = await import('../racing-mobile-build.mjs').catch(() => ({}));
const patchFixture = `const fovT = 66 + Math.abs(P.s) * 0.12 + (P.nitroTime > 0 ? 9 : 0) + (P.smallBoost > 0 ? 4 : 0);
if (P.nitroTime > 0) {
      cam.position.x += jitter;
const k = this.shake * this.shake;
if (this.bloom) this.bloom.strength = (this.settings.quality === 'high' ? 0.75 : 0.6) + (P && P.nitroTime > 0 ? 0.3 : 0);
const inp = this.input.frame();
P.update(DT, first ? pin : noEdge, active, this.itemMode);
r.update(DT, aiActive, this.raceTime, this.rubber(r));`;
test('赛车源补丁保留原输入、物理和AI流程，只约束手机镜头与渲染', async () => {
  assert.equal(typeof api.patchRacingSource, 'function', '缺少隔离赛车构建');
  const source = await readFile(new URL('../../../runs/h5-qq-mobile-20261013/workspace/source/qq-speed/src/main.js', import.meta.url), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return patchFixture;
    throw error;
  });
  const output = api.patchRacingSource(source);
  assert.ok(output.includes('raceCameraFov(P.s'));
  assert.ok(output.includes('this.mobileMode ? raceBloomStrength('));
  for (const exact of ['const inp = this.input.frame();', 'P.update(DT, first ? pin : noEdge, active, this.itemMode);', 'r.update(DT, aiActive, this.raceTime, this.rubber(r));', 'if (r.half)']) {
    if (source.includes(exact)) assert.ok(output.includes(exact), exact);
  }
  assert.equal(api.patchRacingSource(output), output);
});
test('未知源版本不能静默套用补丁', () => {
  assert.equal(typeof api.patchRacingSource, 'function', '缺少隔离赛车构建');
  assert.throws(() => api.patchRacingSource('class OtherGame {}'), /anchor|锚点/u);
});
