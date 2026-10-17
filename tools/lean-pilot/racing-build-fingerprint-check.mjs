import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentRacingInputHash } from './racing-delivery-verify.mjs';
import { RACING_OWNED_NAMES } from './racing-mobile-build.mjs';

// This test is run only after the real racing H5 build, never by the dependency-free factory suite.
test('actual built H5 fingerprint covers all ordered racing runtime sources',async()=>{
  const build=JSON.parse(await readFile('runs/h5-qq-mobile-20261013/artifacts/build-racing.json','utf8'));
  assert.equal(RACING_OWNED_NAMES.length,23);
  assert.equal(new Set(RACING_OWNED_NAMES).size,RACING_OWNED_NAMES.length);
  for(const essential of ['recovery.mjs','rival-pressure.mjs','corner-speed.mjs','speed-hud.mjs','track-design.mjs','lane-design.mjs','item-visuals.mjs','shortcut-network.mjs','presentation.mjs','joystick.mjs','control-lab.mjs','trial-metrics.mjs','duel-loop.mjs','career-expansion.mjs'])
    assert.ok(RACING_OWNED_NAMES.includes(essential),'Missing integrity input: '+essential);
  assert.match(build.inputHash,/^[0-9a-f]{64}$/u);
  assert.equal(await currentRacingInputHash(),build.inputHash);
});
