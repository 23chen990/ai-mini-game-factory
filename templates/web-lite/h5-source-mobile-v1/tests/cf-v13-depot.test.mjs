import test from 'node:test';
import assert from 'node:assert/strict';
import {DEPOT_MAP_ID,DEPOT_PIECES,DEPOT_SPAWNS,DEPOT_OBJECTIVE_CANDIDATES,
  depotWalkable,depotReachable} from '../cf-depot-layout.mjs';

test('original depot is a distinct obstacle-based scene, not a ship map re-skin',()=>{
  assert.equal(DEPOT_MAP_ID,'depot');
  assert.ok(DEPOT_PIECES.length>=35);
  assert.equal(new Set(DEPOT_PIECES.map(p=>p.id)).size,DEPOT_PIECES.length);
  assert.ok(DEPOT_PIECES.some(p=>p.id==='depot-hub'&&p.h>4&&p.collision));
  assert.ok(DEPOT_PIECES.some(p=>p.id.startsWith('north-cover')));
  assert.ok(DEPOT_PIECES.some(p=>p.id.startsWith('south-cargo')));
  assert.ok(DEPOT_PIECES.every(p=>[p.x,p.y,p.z,p.w,p.h,p.d].every(Number.isFinite)&&
    p.w>0&&p.h>0&&p.d>0));
  assert.equal(depotWalkable(0,0),false,'central depot is a real collider');
  assert.equal(depotWalkable(-30,0),true,'west ingress stays open');
  assert.equal(depotWalkable(30,0),true,'east ingress stays open');
  assert.equal(depotWalkable(0,-6.5),true,'north bypass');
  assert.equal(depotWalkable(0,6.5),true,'south bypass');
});
test('all real spawn and chapter-two objective spots are walkable and connected',()=>{
  const all=[...DEPOT_SPAWNS.BL,...DEPOT_SPAWNS.GR];
  assert.ok(all.length>=8);
  for(const team of ['BL','GR']){
    assert.ok(DEPOT_SPAWNS[team].every(p=>depotWalkable(p.x,p.z)),team+' blocked spawn');
    for(const site of DEPOT_OBJECTIVE_CANDIDATES[team]){
      assert.ok(depotWalkable(site.x,site.z),team+' blocked objective '+JSON.stringify(site));
      assert.equal(depotReachable(DEPOT_SPAWNS[team][0],site),true,team+' player must reach '+JSON.stringify(site));
      assert.equal(depotReachable(DEPOT_SPAWNS[team==='BL'?'GR':'BL'][0],site),true,
        team+' real enemy must also be able to enter '+JSON.stringify(site));
    }
  }
  assert.equal(depotReachable(DEPOT_SPAWNS.BL[0],DEPOT_SPAWNS.GR[0]),true,
    'both native teams can rotate to the other spawn without wall clipping');
});
test('nav is floor-only: decorative roof, warning stripes do not block AI paths',()=>{
  assert.ok(DEPOT_PIECES.some(p=>p.id.startsWith('hood')&&p.collision===false));
  assert.ok(DEPOT_PIECES.some(p=>p.id.startsWith('stripe')&&p.collision===false));
  assert.equal(depotWalkable(0,5.9),true);
  assert.equal(depotWalkable(0,-5.9),true);
  assert.equal(depotWalkable(40,0),false);
  assert.equal(depotWalkable(0,14),false);
});
