/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cfArenaForLevel} from '../cf-player-loop.mjs';

test('only second chapter uses original depot arena; no game types are silently retargeted',()=>{
 for(let i=0;i<4;i++)assert.equal(cfArenaForLevel(i),'ship');
 for(let i=4;i<8;i++)assert.equal(cfArenaForLevel(i),'depot');
 assert.equal(cfArenaForLevel(-1),'ship');
 assert.equal(cfArenaForLevel(NaN),'ship');
 assert.equal(cfArenaForLevel(40),'ship');
});
test('arena change is a real source-level map before 3D nav build, not a backdrop swap',()=>{
 const build=readFileSync(new URL('../../../../../tools/lean-pilot/h5-mobile-build.mjs',import.meta.url),'utf8');
 const native=readFileSync(new URL('../cf-depot-source.js',import.meta.url),'utf8');
 assert.match(build,/src\/cf-depot-source\.js/);
 assert.match(build,/this\.qs\.get\('arena'\)/);
 assert.match(build,/buildDepotMap\(this\.renderer\.scene, this\.world\)/);
 assert.match(native,/world\.add\(/);
 assert.match(native,/world\.build\(\)/);
 assert.match(native,/new THREE\.InstancedMesh/);
});
test('start and chapter switch use authenticated saved selection before native game boot',()=>{
 const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
 assert.match(main,/cfArenaForLevel/);
 assert.match(main,/location\.replace/);
 assert.match(main,/location\.assign/);
 assert.match(main,/arenaForSelected/);
});
