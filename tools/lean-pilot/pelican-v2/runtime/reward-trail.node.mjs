import test from 'node:test';
import assert from 'node:assert/strict';
import * as engagement from './engagement.mjs';
const ordinary={id:'ordinary',x:143,lane:2,caught:false},prize={id:'prize',x:149,lane:1,caught:false,bonus:true,sourceObstacleId:'barrier'};
const run=(obstacle,extra={})=>({distance:141,fishes:[{...ordinary},{...prize}],obstacles:[{id:'barrier',...obstacle}],...extra});
test('a genuinely cleared barrier keeps its prize cue ahead of a nearer side fish',()=>{
 assert.equal(typeof engagement.selectFishCue,'function');
 assert.equal(engagement.selectFishCue(run({jumped:true,passed:true})).id,'prize');
});
test('ordinary detour or an unpassed barrier never creates a jump-prize cue',()=>{
 for(const flags of [{jumped:false,passed:true},{jumped:true,passed:false}])assert.equal(engagement.selectFishCue(run(flags)).id,'ordinary');
});
test('caught, missed, or unrelated barrier prizes cannot displace the next real fish',()=>{
 const a=run({jumped:true,passed:true});a.fishes[1].caught=true;assert.equal(engagement.selectFishCue(a).id,'ordinary');
 const b=run({jumped:true,passed:true},{distance:149});b.fishes.push({id:'next',x:159});assert.equal(engagement.selectFishCue(b).id,'next');
 const c=run({jumped:true,passed:true});c.obstacles[0].id='different';assert.equal(engagement.selectFishCue(c).id,'ordinary');
});
test('no available fish yields no fabricated target',()=>{
 assert.equal(engagement.selectFishCue({distance:100,fishes:[{x:99},{x:160},{x:110,caught:true}],obstacles:[]}),undefined);
});
