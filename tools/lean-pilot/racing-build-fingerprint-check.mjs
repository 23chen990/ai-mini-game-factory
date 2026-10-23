import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentRacingInputHash } from './racing-delivery-verify.mjs';
import { RACING_OWNED_NAMES, RACING_CAR_ASSET_PATHS, racingCarAssetHashes } from './racing-mobile-build.mjs';

// This test is run only after the real racing H5 build, never by the dependency-free factory suite.
test('actual built H5 fingerprint covers all ordered racing runtime sources',async()=>{
  const build=JSON.parse(await readFile('runs/h5-qq-mobile-20261013/artifacts/build-racing.json','utf8'));
  assert.equal(RACING_OWNED_NAMES.length,40);
  assert.equal(new Set(RACING_OWNED_NAMES).size,RACING_OWNED_NAMES.length);
  for(const essential of ['wheel-steering.mjs','generated-car.mjs','cosmetics.mjs','recovery.mjs','rival-pressure.mjs','corner-speed.mjs','speed-hud.mjs','track-design.mjs','lane-design.mjs','item-visuals.mjs','shortcut-network.mjs','presentation.mjs','joystick.mjs','trial-metrics.mjs','duel-loop.mjs','career-expansion.mjs','shortcut-decisions.mjs','v8-course-geometry.mjs','v9-course-director.mjs','v10-driving-feel.mjs','v10-course-director.mjs','v10-environment.mjs','v10-rival-racecraft.mjs','v11-course-director.mjs','v11-physical-ai.mjs','v8-rival-ai.mjs','v8-item-rules.mjs'])
    assert.ok(RACING_OWNED_NAMES.includes(essential),'Missing integrity input: '+essential);
  for(const essential of ['user-car.mjs','car-asset-cache.mjs','garage.mjs','car-thumbnails.mjs'])
    assert.ok(RACING_OWNED_NAMES.includes(essential),'Missing garage integrity input: '+essential);
  assert.equal(build.version,'V11.6'); assert.equal(build.uiRevision,'racing-v116-garage');
  assert.deepEqual(build.models.map(model=>model.carId),['starter','custom-01','custom-02','custom-03','custom-04','custom-05']);
  const assetHashes=await racingCarAssetHashes('templates/web-lite/h5-source-mobile-v1/racing');
  assert.equal(RACING_CAR_ASSET_PATHS.length,7);
  assert.deepEqual(build.models.map(model=>model.sha256),assetHashes.slice(0,6));
  assert.equal(build.userCarManifestSha256,assetHashes[6]);
  assert.match(build.inputHash,/^[0-9a-f]{64}$/u);
  assert.equal(await currentRacingInputHash(),build.inputHash);
  // The pinned native HUD initially knows five item IDs but ItemSystem
  // genuinely awards eight. Native browser simulation crashed on 'icon'
  // as soon as one of the new three entered the player's inventory.
  const hud=await readFile('runs/h5-qq-mobile-20261013/workspace/source/qq-speed/src/hud.js','utf8');
  const catalog=[
    ['nitro','氮气'],['missile','导弹'],['banana','香蕉皮'],
    ['shield','天使'],['magnet','磁铁'],['shockwave','近身冲击波'],
    ['thunder','雷电攻击'],['barricade','后方路障'],
  ];
  for(const [id,label] of catalog)
    assert.ok(hud.includes('  '+id+': { icon:')&&hud.includes("name: '"+label+"'"),
      'Actual generated native HUD missing pickup identity: '+id);
  assert.match(hud,/ITEM_INFO\[it\]\?\.icon/u,
    'An unknown pickup must not crash the original native HUD renderer');
});

// Post-build gate uses the exact generated native Track, not an independent spline approximation.
test('all 30 actual V11 courses have finish-bounded activity reports against an explicit historical V9 baseline',async()=>{
  const {runNativePacingAudit}=await import('./racing-pacing-native-audit.mjs');
  const report=await runNativePacingAudit();
  assert.equal(report.routeVersion,'v11');
  assert.equal(report.engineeringPassed,true);
});
