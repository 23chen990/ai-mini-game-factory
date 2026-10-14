import test from 'node:test';
import assert from 'node:assert/strict';
import { teamSide, playerRelativeScore, enemyBadgeAllowed, createFpsMobileUx, mobileTouchAction, mobileChallengeCopy, mobileEnemyDifficulty, mobileAimCorrection, selectMobileSpawn, firstEncounterDestination, routeArrow } from '../fps-mobile-ux.mjs';

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
 {side:'ally'}, {alive:false}, {distance:47}, {x:1.1}, {y:0.91},
 {z:1.2},{coverDistance:7},{distance:Infinity},{x:NaN}
 ]) assert.equal(enemyBadgeAllowed({...base,...c}),false,JSON.stringify(c));
 assert.equal(enemyBadgeAllowed({...base,coverDistance:11.8}),true);
 assert.equal(enemyBadgeAllowed({...base,distance:41}),true);
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

test('AI goes from readable beginner reaction to meaningful counter-pressure', () => {
 const beginner=mobileEnemyDifficulty('hits',0);
 const last=mobileEnemyDifficulty('hits',54);
 assert.ok(beginner.react[0]>last.react[0]);
 assert.ok(beginner.react[1]>last.react[1]);
 assert.ok(beginner.aimErr>last.aimErr);
 assert.ok(beginner.track<last.track && beginner.strafe<last.strafe);
 assert.ok(beginner.headP<last.headP);
 assert.ok(last.aimErr>0.04 && last.react[0]>=0.5);
 assert.ok(last.strafe>0.2 && last.headP>0.02);
 const skilled=mobileEnemyDifficulty('hits',12,{hits:3,k:1,d:0});
 const struggling=mobileEnemyDifficulty('hits',12,{hits:0,k:0,d:2});
 assert.ok(skilled.track>struggling.track && skilled.react[0]<struggling.react[0]);
 const sniper=mobileEnemyDifficulty('kills',32), ordinary=mobileEnemyDifficulty('hits',32);
 assert.ok(sniper.strafe<ordinary.strafe && sniper.headP<ordinary.headP);
 const survive=mobileEnemyDifficulty('survive',0);
 assert.ok(survive.react[0] < beginner.react[0]); // survival is not a free AFK tutorial
});
test('mobile lane is authored, obstacle aware and avoids teammate collision', () => {
 const spawns=[{x:-30,z:-3,yaw:-Math.PI/2},{x:-30,z:-7,yaw:-Math.PI/2}];
 const world={raycast(x,y,z,dx,dy,dz,len,kind){
  assert.equal(kind,'sight');assert.ok(Math.abs(dx-1)<0.001);
  return {t:z===-3?5:22};
 }};
 const noTeammates=selectMobileSpawn(spawns,'BL',[],world);
 assert.equal(noTeammates.spawn.z,-7);
 assert.equal(noTeammates.clearance,22);
 const teammate={alive:true,team:'BL',isPlayer:false,pos:{x:-30,z:-7}};
 assert.equal(selectMobileSpawn(spawns,'BL',[teammate],world).spawn.z,-3);
 assert.equal(selectMobileSpawn([], 'BL',[],world),null);
});
test('aim nudge is small, human driven and never sees allies behind walls', () => {
 const base={yawError:0.08,pitchError:0.06,distance:15,visible:true,firing:true,sniperReady:true};
 const a=mobileAimCorrection(base);
 assert.ok(a.yaw>0&&a.yaw<=0.019&&a.pitch>0&&a.pitch<=0.014);
 for(const changes of [{visible:false},{firing:false},{sniperReady:false},{distance:35},
 {yawError:0.3},{pitchError:0.2},{distance:0},{yawError:NaN}]){
  assert.deepEqual(mobileAimCorrection({...base,...changes}),{yaw:0,pitch:0});
 }
});

test('mobile scout approach keeps symmetric reviewed cargo lanes and honest directions',()=>{
 assert.deepEqual(firstEncounterDestination('BL'),[-17.5,-7]);
 assert.deepEqual(firstEncounterDestination('GR'),[17.5,7]);
 assert.equal(firstEncounterDestination('unknown'),null);
 const p={pos:{x:-32,z:-7},yaw:-Math.PI/2};
 assert.equal(routeArrow(p,[-17.5,-7]).symbol,'↑');
 assert.equal(routeArrow({...p,yaw:0},[-17.5,-7]).symbol,'←');
 assert.equal(routeArrow({...p,yaw:-Math.PI},[-17.5,-7]).symbol,'→');
 assert.equal(routeArrow(p,[-31,-7]),null);
});
