import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS} from './levels.mjs';
import {campaignWallBudgetMs,MIN_WALL_BUDGET_MS,MAX_WALL_BUDGET_MS} from './qa-budget.mjs';

test('five natural levels have increasing but bounded non-gameplay wall budgets',()=>{
 const times=LEVELS.map(l=>campaignWallBudgetMs(l.id));
 for(const [i,t] of times.entries()){
  assert.ok(t>=MIN_WALL_BUDGET_MS&&t<=MAX_WALL_BUDGET_MS);
  assert.ok(t>=Math.ceil(LEVELS[i].distance/LEVELS[i].speed*3000));
  if(i>0)assert.ok(t>times[i-1]);
 }
 assert.ok(campaignWallBudgetMs(2)>135000);
});
test('legacy utility routes and deliberate overrides remain exact and finite',()=>{
 assert.equal(campaignWallBudgetMs(0),MIN_WALL_BUDGET_MS);
 assert.equal(campaignWallBudgetMs(-1),MIN_WALL_BUDGET_MS);
 assert.equal(campaignWallBudgetMs(1,70000),70000);
 assert.equal(campaignWallBudgetMs(5,120000),120000);
 assert.throws(()=>campaignWallBudgetMs(2,NaN),/Invalid/);
 assert.throws(()=>campaignWallBudgetMs(2,-1),/Invalid/);
});
