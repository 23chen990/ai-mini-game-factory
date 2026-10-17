import test from 'node:test';
import assert from 'node:assert/strict';
import {COAST_STYLES,newCollection,loadCollection,styleById,buyOrEquip,earnedCoastCoins,collectCoastResult} from './collection.mjs';

test('shop cannot spend unearned coins or buy unknown cosmetic',()=>{
 const p=newCollection();
 assert.equal(buyOrEquip(p,'gold').reason,'insufficient');
 assert.equal(buyOrEquip(p,'unknown').reason,'unknown');
 assert.deepEqual(p.owned,['classic']);
 assert.equal(buyOrEquip(p,'classic').action,'equipped');
});
test('genuine settled fish runs grant coins once; idempotent across repeated calls',()=>{
 const p=newCollection(),run={settled:true,level:{id:6,endless:true},
  distance:1642,count:30,gold:4,reason:'retired'};
 const n=earnedCoastCoins(run);
 assert.ok(n>20);
 assert.equal(collectCoastResult(p,run),n);
 assert.equal(collectCoastResult(p,run),0);
 assert.equal(p.coins,n);
 assert.equal(p.bestDistance,1642);
 assert.equal(p.endlessRuns,1);
 assert.equal(p.careerRuns,0);
 const failed={settled:false,distance:90,count:2,gold:1,level:{id:1}};
 assert.equal(collectCoastResult(p,failed),0);
 assert.equal(earnedCoastCoins({settled:true,distance:10,count:0,gold:0}),0);
});
test('earned cosmetics recolor helmet and persist as local-only progression',()=>{
 const p=newCollection();p.coins=300;
 const purchased=buyOrEquip(p,'lagoon');
 assert.equal(purchased.action,'purchased');
 assert.equal(p.coins,225);
 assert.equal(p.equipped,'lagoon');
 assert.equal(buyOrEquip(p,'lagoon').action,'equipped');
 assert.equal(p.coins,225);
 const loaded=loadCollection(JSON.stringify(p));
 assert.deepEqual(loaded.owned,['classic','lagoon']);
 assert.equal(styleById(loaded.equipped).color,'#78dbf6');
 assert.equal(COAST_STYLES.length,6);
 assert.equal(loadCollection(JSON.stringify({...p,coins:-1})),null);
 assert.equal(loadCollection('broken'),null);
});
