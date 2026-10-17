import test from 'node:test';
import assert from 'node:assert/strict';
import {endlessRecordStory,reviveOpportunity} from './replay-value.mjs';
const make=(distance,elapsed,options={})=>({
 level:{id:6,endless:true,distance:100000000},phase:'finished',
 reason:'vehicle',distance,elapsed,settled:false,revives:0,...options,
});
test('near-record message is truthful about equal versus beating old record',()=>{
 const near=endlessRecordStory(make(680,67),700);
 assert.equal(near.kind,'close');
 assert.equal(near.gap,20);
 assert.match(near.detail,/还差 20 米就能追平上次的 700 米/);
 const equal=endlessRecordStory(make(700,71),700);
 assert.equal(equal.kind,'equal');
 assert.match(equal.detail,/多骑一米/);
 const broken=endlessRecordStory(make(721,74),700);
 assert.equal(broken.kind,'broken');
 assert.match(broken.detail,/21 米/);
 assert.equal(endlessRecordStory(make(110,11),0).kind,'first');
 assert.equal(endlessRecordStory(make(35,5),0).kind,'try-again');
 assert.equal(endlessRecordStory({...make(200,20),level:{id:1}},400),null);
});
test('qualified voluntary rescue follows real sunk progress, not artificial deaths',()=>{
 assert.deepEqual(reviveOpportunity(make(140,18),700),{eligible:false,reason:'short-session'});
 assert.equal(reviveOpportunity(make(310,37),0).eligible,false);
 assert.equal(reviveOpportunity(make(360,44),0).reason,'long-ride');
 const near=reviveOpportunity(make(670,69),700);
 assert.equal(near.reason,'near-record');
 assert.match(near.message,/还差 30 米/);
 assert.equal(reviveOpportunity(make(500,63,{settled:true}),700).eligible,false);
 assert.equal(reviveOpportunity(make(500,63,{revives:1}),700).eligible,false);
 assert.equal(reviveOpportunity(make(500,63,{reason:'retired'}),700).eligible,false);
 assert.equal(reviveOpportunity(make(500,63,{reason:'barrier'}),700).eligible,true);
});
test('career first-minute wipe encourages free replay, late wipe enables optional continue',()=>{
 const early=make(164,22,{level:{id:1,distance:300,endless:false}});
 assert.equal(reviveOpportunity(early,0).eligible,false);
 const late=make(245,37,{level:{id:1,distance:300,endless:false}});
 assert.equal(reviveOpportunity(late,0).reason,'near-finish');
 assert.match(reviveOpportunity(late,0).message,/55 米/);
 assert.equal(reviveOpportunity(make(260,32,{level:{id:4,distance:630}}),0).eligible,false);
});
