import test from 'node:test';
import assert from 'node:assert/strict';
import {
 cfV20CoverEnabled,cfCoverSteering,cfCoverPath,
 cfCoverValidPoint,cfCoverCandidates,cfCoverShieldSpec,
 cfCoverBlocksShot,cfCoverCanPlace
} from '../cf-cover-assault.mjs';

test('V20 only enables authored cover vertical slices and leaves V19 intact',()=>{
 assert.equal(cfV20CoverEnabled({lite:true,id:'tags'}),true);
 assert.equal(cfV20CoverEnabled({lite:true,id:'survive'}),true);
 for(const id of ['precision','defense','assault','marksman','evac','counter']){
   assert.equal(cfV20CoverEnabled({lite:true,id}),false,id);
 }
 assert.equal(cfV20CoverEnabled({lite:false,id:'tags'}),false);
 assert.equal(cfV20CoverEnabled(null),false);
});

test('Cover route uses native player-local movement, not setting x/z instantly',()=>{
 const player={pos:{x:0,z:0},yaw:-Math.PI/2};
 const ahead=cfCoverSteering(player,{x:4,z:0});
 assert.ok(ahead.mz>.99&&Math.abs(ahead.mx)<1e-12);
 const reverse=cfCoverSteering(player,{x:-4,z:0});
 assert.ok(reverse.mz<-.99);
 const side=cfCoverSteering(player,{x:0,z:4});
 assert.ok(side.mx>.99&&Math.abs(side.mz)<1e-12);
 assert.deepEqual(cfCoverSteering(player,{x:.08,z:0}),{
  mx:0,mz:0,arrived:true
 });
 assert.deepEqual(player.pos,{x:0,z:0});
 assert.deepEqual(cfCoverSteering(null,{x:4,z:0}),{
  mx:0,mz:0,arrived:false
 });
});

test('Cover candidates demand walkable native nav path and intact native wall collision',()=>{
 const world={blocked:(x,y,z)=>x<0};
 const nav={idx:()=>4,walkable:i=>i===4,
  findPath:(ax,az,bx,bz)=>[[ax,az],[bx,bz]]};
 const player={pos:{x:3,z:0},yaw:0};
 const sides=cfCoverCandidates({world,nav,player});
 assert.ok(sides.right);
 assert.equal(sides.left,null,'physical wall rejects the left destination');
 assert.equal(cfCoverValidPoint(world,nav,sides.right),true);
 assert.equal(cfCoverValidPoint(world,{...nav,walkable:()=>false},sides.right),false);
 assert.ok(cfCoverPath(nav,player.pos,sides.right)?.length>=2);
 assert.equal(cfCoverPath({...nav,findPath:()=>null},player.pos,sides.right),null);
 const noPaths=cfCoverCandidates({world,nav:{...nav,findPath:()=>null},player});
 assert.equal(noPaths.left,null);assert.equal(noPaths.right,null);
});

test('Waist-high 3D cover has real bullet-blocking collider and no fake hp protection',()=>{
 const spec=cfCoverShieldSpec({x:0,z:0},-Math.PI/2);
 assert.ok(Math.abs(spec.x-1.06)<1e-9);
 assert.equal(spec.sy,1.30);
 assert.equal(spec.y,.65);
 assert.ok(spec.y+spec.sy/2>1.05&&spec.y+spec.sy/2<1.62,
  'original crouch eye must hide and original standing eye must clear steel');
 assert.equal(spec.mat,'metal');
 assert.equal(spec.solid,true);assert.equal(spec.sight,true);
 assert.equal(spec.bullet,'block');
 assert.equal(cfCoverCanPlace({blocked:()=>false},spec,{x:0,z:0}),true);
 assert.equal(cfCoverCanPlace({blocked:()=>true},spec,{x:0,z:0}),false);
 const rayHits={raycast:(x,y,z,dx,dy,dz,dist)=>({t:dist/2})};
 assert.equal(cfCoverBlocksShot(rayHits,{x:0,z:0},{x:9,z:0}),true);
 assert.equal(cfCoverBlocksShot({raycast:()=>null},
   {x:0,z:0},{x:9,z:0}),false,
   'UI must not claim a nonexistent collider blocked enemy bullet');
 assert.equal(cfCoverBlocksShot(rayHits,{x:0,z:0},{x:0,z:.1}),false);
});
