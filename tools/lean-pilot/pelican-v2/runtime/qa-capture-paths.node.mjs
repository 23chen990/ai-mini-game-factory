import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePath } from '../qa-capture-paths.mjs';

test('campaign hazard evidence survives later safety capture of the same stage and name', () => {
 assert.equal(capturePath('campaign','level-3-hazard'),'campaign/level-3-hazard.png');
 assert.equal(capturePath('safety','level-3-hazard'),'safety/level-3-hazard.png');
 assert.notEqual(capturePath('campaign','level-3-hazard'),capturePath('safety','level-3-hazard'));
});

test('capture paths reject arbitrary branches and path traversal', () => {
 assert.throws(()=>capturePath('other-game','hazard'),/Unsafe/u);
 assert.throws(()=>capturePath('campaign','../hazard'),/Unsafe/u);
 assert.equal(capturePath('collisions','vehicle-accident'),'collisions/vehicle-accident.png');
});
