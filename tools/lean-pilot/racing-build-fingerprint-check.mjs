import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Factory-native tests intentionally run without dependencies or generated builds.
// The racing workflow runs this same test AGAIN after the actual H5 build, where
// zod, the pinned sources and the build manifest are available and mandatory.
test('actual built H5 fingerprint covers all ordered racing runtime sources',async t=>{
  let build;
  try {
    build=JSON.parse(await readFile('runs/h5-qq-mobile-20261013/artifacts/build-racing.json','utf8'));
  } catch(error) {
    if(error?.code === 'ENOENT') {
      t.skip('No H5 build in dependency-free native suite; required post-build racing workflow runs full fingerprint assertions');
      return;
    }
    throw error;
  }
  const [{ currentRacingInputHash },{ RACING_OWNED_NAMES }]=await Promise.all([
    import('../racing-delivery-verify.mjs'),
    import('../racing-mobile-build.mjs'),
  ]);
  assert.equal(RACING_OWNED_NAMES.length,16);
  assert.equal(new Set(RACING_OWNED_NAMES).size,RACING_OWNED_NAMES.length);
  for(const essential of ['recovery.mjs','rival-pressure.mjs','corner-speed.mjs','speed-hud.mjs','track-design.mjs','lane-design.mjs','item-visuals.mjs'])
    assert.ok(RACING_OWNED_NAMES.includes(essential),'Missing integrity input: '+essential);
  assert.match(build.inputHash,/^[0-9a-f]{64}$/u);
  assert.equal(await currentRacingInputHash(),build.inputHash);
});
