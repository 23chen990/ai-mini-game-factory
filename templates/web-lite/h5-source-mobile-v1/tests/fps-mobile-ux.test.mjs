import test from 'node:test';
import assert from 'node:assert/strict';
import { teamSide, playerRelativeScore, enemyBadgeAllowed, createFpsMobileUx, mobileTouchAction, mobileChallengeCopy } from '../fps-mobile-ux.mjs';

test('team affiliation uses local player perspective, not globally red BL / blue GR', () => {
 assert.equal(teamSide('BL','BL'),'ally');
 assert.equal(teamSide('BL','GR'),'enemy');
 assert.equal(teamSide('GR','GR'),'ally');
 assert.equal(teamSide('GR','BL'),'enemy');
 assert.equal(teamSide('bad','BL'),'unknown');
 assert.deepEqual(playerRelativeScore({BL:7,GR:4},'BL'),{ally:7,enemy:4});
 assert.deepEqual(playerRelativeScore({BL:7,GR:4},'GR'),{ally:4,enemy:7});
});
test('enemy marker blocks allies, hidden or dead enemies, offscreen and wall-occluded enemies', () => {
 const base={side:'enemy',alive:true,distance:12,x:0,y:0,z:0.5,coverDistance:null};
 assert.equal(enemyBadgeAllowed(base),true);
 for(const c of [
 {side:'ally'}, {alive:false}, {distance:35}, {x:1.1}, {y:0.91},
 {z:1.2},{coverDistance:7},{distance:Infinity},{x:NaN}
 ]) assert.equal(enemyBadgeAllowed({...base,...c}),false,JSON.stringify(c));
 assert.equal(enemyBadgeAllowed({...base,coverDistance:11.8}),true);
});
test('standalone runtime import is owned, not an external fetched plugin', () => {
 assert.equal(typeof createFpsMobileUx,'function');
});

test('mobile touch uses one fire, no desktop control labels and hides unused actions', () => {
 const names=Array.from({length:7},(_,i)=>mobileTouchAction(i));
 assert.deepEqual(names,['fire','duplicate-fire','jump','crouch','reload','switch','scope']);
 assert.equal(names.filter(v=>v==='fire').length,1);
 assert.equal(mobileTouchAction(99),'unknown');
});
test('mobile challenge instructions are short and use touch mechanics not PC keys', () => {
 const inputs=[{kind:'hits'},{kind:'kills'},{kind:'survive'}];
 for(const input of inputs){
   const text=mobileChallengeCopy(input);
   assert.ok(text.length>=5&&text.length<=40,text);
   assert.equal(/WASD|Esc|Tab|鼠标|键盘|按 R/.test(text),false,text);
 }
 assert.match(mobileChallengeCopy({kind:'survive'}),/45秒/);
});
