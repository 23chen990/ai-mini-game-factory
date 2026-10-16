import test from 'node:test';
import assert from 'node:assert/strict';
import { teamSide, playerRelativeScore, enemyBadgeAllowed, createFpsMobileUx, mobileTouchAction, mobileChallengeCopy, mobileEnemyDifficulty, mobileAimCorrection, selectMobileSpawn, firstEncounterDestination, routeArrow, mobileSimpleFireAllowed, chooseFirstEncounterSpot, chooseMobileSniperLane, teammateTagOpacity, withinScopedLens, holdOpeningTeammateFire, blockMobileTouchMouse, sniperScopeLabel, mobileScoutHoldExpired, cfHitCue, cfMissionDebrief, cfEliteUnlocked, cfAutoFireEligible, cfAdvanceDrill, cfTouchTutorial, cfMissionFacts, cfResultFacts } from '../fps-mobile-ux.mjs';

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
 assert.equal(routeArrow({...p,yaw:0},[-17.5,-7]).symbol,'→');
 assert.equal(routeArrow({...p,yaw:-Math.PI},[-17.5,-7]).symbol,'←');
 assert.equal(routeArrow(p,[-31,-7]),null);
});

test('simple fire is crosshair-driven with real bullets, never fires at teammates or behind cover',()=>{
 const base={kind:'hits',weapon:'m4a1',side:'enemy',alive:true,distance:17,
   blocked:false,heldSeconds:0.2,yawError:0.01,pitchError:0.01,engaged:true};
 assert.equal(mobileSimpleFireAllowed(base),true);
 for(const v of [
  {engaged:false},{kind:'kills'},{weapon:'awm'},{side:'ally'},{alive:false},{blocked:true},
  {distance:29},{distance:0},{heldSeconds:0.05},
  {yawError:0.10},{pitchError:0.15},{pitchError:NaN}
 ]) assert.equal(mobileSimpleFireAllowed({...base,...v}),false,JSON.stringify(v));
});

test('first M4 encounter places a normal rival on the visible clear route for both teams',()=>{
 const playerFor=team=>({pos:{x:team==='BL'?-31.5:31.5,y:0,z:-6.8},yaw:team==='BL'?-Math.PI/2:Math.PI/2,eyeH:1.6});
 const nav={idx(x,z){return Math.abs(x)<35&&Math.abs(z)<11?1:-1;},walkable(k){return k>=0;}};
 const world={blocked:()=>false,raycast:()=>null};
 for(const team of ['BL','GR']){
   const p=playerFor(team);
   const hit=chooseFirstEncounterSpot({player:p,world,nav,actors:[]});
   assert.ok(hit,team);assert.ok(hit.distance>=7&&hit.distance<=10);
   assert.ok((hit.x-p.pos.x)*(team==='BL'?1:-1)>6);
   assert.ok(Math.abs(hit.z-p.pos.z)<2);
 }
 const p=playerFor('BL');
 assert.equal(chooseFirstEncounterSpot({player:p,world:{...world,raycast:()=>({t:2})},nav}),null);
 assert.equal(chooseFirstEncounterSpot({player:p,world:{...world,blocked:()=>true},nav}),null);
 assert.equal(chooseFirstEncounterSpot({player:p,world,nav:{idx:()=>-1,walkable:()=>false}}),null);
});

test('friendly native sprites fade near the camera and disappear during results',()=>{
  assert.equal(teammateTagOpacity({active:false,alive:true,distance:12}),0);
  assert.equal(teammateTagOpacity({active:true,alive:false,distance:12}),0);
  assert.equal(teammateTagOpacity({active:true,alive:true,distance:2}),0);
  assert.ok(teammateTagOpacity({active:true,alive:true,distance:5})>0);
  assert.equal(teammateTagOpacity({active:true,alive:true,distance:13}),.85);
});
test('scope cannot display enemy badges beyond its round viewing lens',()=>{
  const input={x:0,y:0,width:844,height:390,scoped:true};
  assert.equal(withinScopedLens(input),true);
  assert.equal(withinScopedLens({...input,x:.92}),false);
  assert.equal(withinScopedLens({...input,x:.92,scoped:false}),true);
  assert.equal(withinScopedLens({...input,width:0}),false);
});
test('AWM gets a real nav/cover validated longer first sightline',()=>{
  const p={pos:{x:-31.5,y:0,z:-6.8},yaw:-Math.PI/2,eyeH:1.6};
  const nav={idx:(x,z)=>Math.abs(x)<35 && Math.abs(z)<11?1:-1,walkable:k=>k>0};
  const world={blocked:()=>false,raycast:()=>null};
  const spot=chooseFirstEncounterSpot({player:p,world,nav,distances:[18,16,14,12,10,8.5]});
  assert.ok(spot && spot.distance>=10 && spot.distance<=18);
  assert.equal(chooseFirstEncounterSpot({player:p,world:{...world,blocked:()=>true},nav,distances:[18,16]}),null);
});

test('AWM opening preserves native 3v3 but leaves a fair player shot window',()=>{
 const players=[
   {team:'BL',isPlayer:true,alive:true,readyAt:0},
   {team:'BL',alive:true,readyAt:1},
   {team:'BL',alive:true,readyAt:20},
   {team:'GR',alive:true,readyAt:0},
   {team:'BL',alive:false,readyAt:0}
 ];
 assert.equal(holdOpeningTeammateFire(players,'BL',7),2);
 assert.deepEqual(players.map(x=>x.readyAt),[0,20,20,0,0]);
 assert.equal(holdOpeningTeammateFire(players,'BL',Infinity),0);
});

test('sniper intro searches only authored spawns, rejecting teammate overlap and blocked rays',()=>{
 const me={pos:{x:-34,y:0.02,z:-6.6},yaw:-Math.PI/2,eyeH:1.6,team:'BL',isPlayer:true};
 const spawns=[{x:-34,z:-6.6,yaw:-Math.PI/2},{x:-31.2,z:-6.6,yaw:-Math.PI/2}];
 const teammate={alive:true,team:'BL',pos:{x:-34,z:-6.6}};
 const nav={idx:()=>1,walkable:k=>k===1};
 const world={blocked:()=>false,raycast:()=>null};
 const lane=chooseMobileSniperLane({player:me,spawns,world,nav,actors:[me,teammate],distances:[9]});
 assert.equal(lane.spawn.x,-31.2);
 assert.equal(lane.spot.distance,9);
 assert.equal(chooseMobileSniperLane({player:me,spawns,world:{...world,raycast:()=>({t:3})},
   nav,actors:[me,teammate],distances:[9]}),null);
 assert.equal(chooseMobileSniperLane({player:me,spawns,world,nav:{idx:()=>-1,walkable:()=>false},
   actors:[me],distances:[9]}),null);
});

test('touch aim gestures cannot trigger compatibility mousedown shooting on mobile',()=>{
 assert.equal(blockMobileTouchMouse({touchMode:true,fromTouch:true,msSinceTouch:2000}),true);
 assert.equal(blockMobileTouchMouse({touchMode:true,fromTouch:false,msSinceTouch:300}),true);
 assert.equal(blockMobileTouchMouse({touchMode:true,fromTouch:false,msSinceTouch:1400}),true);
 assert.equal(blockMobileTouchMouse({touchMode:true,fromTouch:false,msSinceTouch:1500}),false);
 assert.equal(blockMobileTouchMouse({touchMode:true,fromTouch:false,msSinceTouch:Infinity}),false);
 assert.equal(blockMobileTouchMouse({touchMode:false,fromTouch:true,msSinceTouch:50}),false);
});
test('native sniper optic cycles through three clearly labelled touch actions',()=>{
 assert.equal(sniperScopeLabel(0),'开镜');
 assert.equal(sniperScopeLabel(1),'放大');
 assert.equal(sniperScopeLabel(2),'关镜');
});

test('scout stays in real sniper opening only briefly before native AI resumes',()=>{
 const sniper={__mobileSniperScout:true,__mobileTrainingHoldUntil:20};
 const rifle={__mobileTrainingScout:true,__mobileTrainingHoldUntil:7};
 assert.equal(mobileScoutHoldExpired(sniper,19.9),false);
 assert.equal(mobileScoutHoldExpired(sniper,20),true);
 assert.equal(mobileScoutHoldExpired(rifle,7),true);
 assert.equal(mobileScoutHoldExpired({},12),false);
});


test('CF hit confirmation is native-counter driven and never fabricates a hit',()=>{
 const rifle={kind:'hits',target:3},sniper={kind:'kills',target:1};
 assert.equal(cfHitCue(rifle,1,1),'✓ 命中 1/3');
 assert.equal(cfHitCue(rifle,3,2),'✓ 命中 3/3');
 assert.equal(cfHitCue(sniper,1,1),'✓ 有效命中 +1');
 for(const n of [0,-1,Infinity,NaN])assert.equal(cfHitCue(rifle,n,1),'');
 for(const n of [0,-1,Infinity,NaN])assert.equal(cfHitCue(rifle,1,n),'');
 assert.equal(cfHitCue(null,1,1),'');
});

test('CF debrief explains the actual failure branch, without crediting AI frags',()=>{
 const rifle={kind:'hits',target:3},sniper={kind:'kills',target:1};
 const survive={kind:'survive',target:2,minTravel:20};
 assert.match(cfMissionDebrief(rifle,{hits:0},'lost'),/自动开火/);
 assert.match(cfMissionDebrief(rifle,{hits:2},'lost'),/还差 1 次/);
 assert.doesNotMatch(cfMissionDebrief(rifle,{hits:2},'lost'),/点射/);
 assert.match(cfMissionDebrief(sniper,{hits:2,kills:5,awmKills:0},'lost'),/命中 2 次，但 AWM 击杀仍为 0\/1/);
 assert.match(cfMissionDebrief(sniper,{hits:0,awmKills:0},'lost'),/开镜瞄准胸部/);
 assert.match(cfMissionDebrief(survive,{deaths:3,travel:55},'lost'),/超过最多 2 次/);
 assert.match(cfMissionDebrief(survive,{deaths:0,travel:9.9},'lost'),/还差 11 米/);
 assert.match(cfMissionDebrief(survive,{deaths:1,travel:24},'lost'),/倒计时结束/);
 assert.match(cfMissionDebrief(survive,{deaths:0,travel:24},'won'),/零死亡/);
 assert.match(cfMissionDebrief(sniper,{awmKills:1},'won'),/AWM 真实击杀 1 人/);
 assert.equal(cfMissionDebrief(null,{},'lost'),'');
});


test('elite replay requires a genuine completed mission and never silently enables beginner auto-fire',()=>{
 assert.equal(cfEliteUnlocked({wins:1,attempts:2}),true);
 assert.equal(cfEliteUnlocked({wins:0,attempts:2}),false);
 assert.equal(cfEliteUnlocked({wins:1.5}),false);
 assert.equal(cfEliteUnlocked({wins:-1}),false);
 assert.equal(cfEliteUnlocked(undefined),false);
 assert.equal(cfAutoFireEligible({kind:'hits',elite:false}),true);
 assert.equal(cfAutoFireEligible({kind:'hits'}),true);
 assert.equal(cfAutoFireEligible({kind:'hits',elite:true}),false);
 assert.equal(cfAutoFireEligible({kind:'kills'}),false);
 assert.equal(cfAutoFireEligible({kind:'survive',elite:false}),false);
 assert.equal(cfAutoFireEligible(null),false);
 assert.match(mobileChallengeCopy({kind:'hits',elite:true}),/自己瞄准并按开火/);
 assert.doesNotMatch(mobileChallengeCopy({kind:'hits',elite:true}),/自动开火/);
 assert.match(mobileChallengeCopy({kind:'kills',elite:true}),/精英狙击/);
 assert.match(mobileChallengeCopy({kind:'survive',elite:true}),/精英生存/);
});

test('elite enemy pressure is stronger than ordinary while maintaining bounded native behavior',()=>{
 for(const kind of ['hits','kills','survive']){
   const regular=mobileEnemyDifficulty(kind,0,{hits:0,k:0,d:0});
   const explicitRegular=mobileEnemyDifficulty(kind,0,{hits:0,k:0,d:0},false);
   assert.deepEqual(regular,explicitRegular);
   const elite=mobileEnemyDifficulty(kind,0,{hits:0,k:0,d:0},true);
   const late=mobileEnemyDifficulty(kind,60,{hits:3,k:1,d:0},true);
   assert.ok(elite.react[0]<regular.react[0],kind);
   assert.ok(elite.react[1]<regular.react[1],kind);
   assert.ok(elite.aimErr<regular.aimErr,kind);
   assert.ok(elite.strafe>regular.strafe,kind);
   assert.ok(late.track>elite.track,kind);
   assert.ok(late.react[0]>=0.40 && late.react[1]>=0.7,kind);
   assert.ok(late.headP>0 && late.headP<=0.15,kind);
   assert.ok(late.aimErr>=0.045,kind);
   assert.equal(elite.bunny,0.015);
 }
});


test('CF expert copy matches actual shorter deadlines and lower death budgets',()=>{
 assert.match(mobileChallengeCopy({kind:'hits',elite:true}),/45秒/);
 assert.match(mobileChallengeCopy({kind:'kills',elite:true}),/75秒/);
 assert.match(mobileChallengeCopy({kind:'survive',elite:true}),/30米/);
 assert.match(mobileChallengeCopy({kind:'survive',elite:true}),/阵亡1次/);
 assert.match(cfMissionDebrief({kind:'hits',target:3,maxDeaths:1,elite:true},{hits:0,deaths:0},'lost'),/手动点按开火/);
 assert.match(cfMissionDebrief({kind:'hits',target:3,maxDeaths:1,elite:true},{hits:3,deaths:2},'lost'),/最多允许 1 次/);
 assert.match(cfMissionDebrief({kind:'kills',target:1,maxDeaths:1,elite:true},{hits:2,awmKills:1,deaths:2},'lost'),/被击倒 2 次/);
});


test('CF V6 mission brief reflects current actual selectable objective and weapon',()=>{
 const rifle={kind:'hits',weapon:'m4a1',target:3,limitMs:60000};
 const sniper={kind:'kills',weapon:'awm',target:1,limitMs:75000,elite:true};
 const survive={kind:'survive',weapon:'mp5',minTravel:30,target:1,limitMs:45000};
 assert.deepEqual(cfMissionFacts(rifle),[
  {label:'装备',value:'M4A1'},{label:'目标',value:'命中 3 次'},{label:'限时',value:'60 s'}]);
 assert.deepEqual(cfMissionFacts(sniper),[
  {label:'装备',value:'AWM'},{label:'目标',value:'击杀 1 人'},{label:'限时',value:'75 s'}]);
 assert.deepEqual(cfMissionFacts(survive),[
  {label:'装备',value:'MP5'},{label:'目标',value:'移动 30 m'},{label:'限时',value:'45 s'}]);
 assert.deepEqual(cfMissionFacts(null),[]);
});

test('CF V6 results display strictly native player measurements, not simulated team scores',()=>{
 const rifle={kind:'hits',weapon:'m4a1',target:3,limitMs:60000};
 const sniper={kind:'kills',weapon:'awm',target:1,limitMs:75000};
 const survive={kind:'survive',weapon:'mp5',target:1,minTravel:30,limitMs:45000};
 assert.deepEqual(cfResultFacts(rifle,{hits:2,deaths:1,kills:99},10900),[
  {label:'命中',value:'2 / 3'},{label:'阵亡',value:'1'},{label:'耗时',value:'11 s'}]);
 assert.deepEqual(cfResultFacts(sniper,{hits:3,awmKills:0,kills:99,deaths:1},34000),[
  {label:'狙杀',value:'0 / 1'},{label:'命中',value:'3'},{label:'阵亡',value:'1'}]);
 assert.deepEqual(cfResultFacts(survive,{travel:29.9,deaths:0},44999),[
  {label:'生存',value:'44 / 45 s'},{label:'移动',value:'29 / 30 m'},{label:'阵亡',value:'0 / 1'}]);
 assert.deepEqual(cfResultFacts(survive,{travel:39.1,deaths:1},45000),[
  {label:'生存',value:'45 / 45 s'},{label:'移动',value:'39 / 30 m'},{label:'阵亡',value:'1 / 1'}]);
 const bad=cfResultFacts(rifle,{hits:NaN,deaths:-5},NaN);
 assert.equal(bad[0].value,'0 / 3');
 assert.equal(bad[1].value,'0');
 assert.equal(bad[2].value,'0 s');
 assert.deepEqual(cfResultFacts(null,{}),[]);
});


test('CF V6 start-screen touch instructions match the selected actual fire behavior',()=>{
 assert.match(cfTouchTutorial({kind:'hits'}),/自动开火/);
 assert.doesNotMatch(cfTouchTutorial({kind:'hits',elite:true}),/自动开火/);
 assert.match(cfTouchTutorial({kind:'hits',elite:true}),/手动按开火/);
 assert.match(cfTouchTutorial({kind:'kills'}),/先开镜/);
 assert.match(cfTouchTutorial({kind:'survive'}),/边移动/);
 assert.match(cfTouchTutorial({kind:'survive'}),/开火/);
 assert.match(cfTouchTutorial({}),/开火/);
});


test('CF v7 drill counts only native hits AFTER a real 12m reposition',()=>{
 const c={kind:'hits',drill:'reposition',openingHits:1,minTravel:12,target:3,elite:false};
 let s=cfAdvanceDrill(c);
 assert.deepEqual(s,{stage:0,startTravel:0,hitBaseline:null,anchorX:null,anchorZ:null,
   lastX:null,lastZ:null,lastTravel:0,earnedDistance:0,peakDistance:0,
   distance:0,follow:0,firstHit:false});
 assert.equal(cfAutoFireEligible(c,0),true);
 s=cfAdvanceDrill(c,s,{hits:0,travel:25});
 assert.equal(s.stage,0,'moving without first hit does not bypass first stage');
 s=cfAdvanceDrill(c,s,{hits:1,travel:25});
 assert.equal(s.stage,1);assert.equal(s.startTravel,25);
 assert.equal(cfAutoFireEligible(c,1),false,'first hit disables auto-fire');
 s=cfAdvanceDrill(c,s,{hits:13,travel:36.99});
 assert.equal(s.stage,1,'all premovement hits must be discarded');
 assert.equal(s.follow,0);assert.ok(s.distance<12);
 s=cfAdvanceDrill(c,s,{hits:14,travel:37});
 assert.equal(s.stage,2);assert.equal(s.hitBaseline,14);assert.equal(s.follow,0);
 s=cfAdvanceDrill(c,s,{hits:16,travel:38});
 assert.equal(s.follow,2);assert.equal(s.firstHit,true);
 s=cfAdvanceDrill(c,s,{hits:17,travel:42});
 assert.equal(s.follow,3);assert.ok(s.distance>=12);
 assert.equal(cfAdvanceDrill({kind:'kills'}),null);
});

test('CF v7 first hit is an assisted tutorial, then mission requires real manual aiming',()=>{
 const c={kind:'hits',drill:'reposition',openingHits:1,minTravel:12,target:3,maxDeaths:1};
 assert.equal(cfAutoFireEligible(c,0),true);
 assert.equal(cfAutoFireEligible(c,1),false);
 assert.equal(cfAutoFireEligible({...c,elite:true},0),false);
 assert.equal(cfAutoFireEligible({...c,elite:true},8),false);
 assert.match(cfTouchTutorial(c),/自动开火/);
 assert.match(cfTouchTutorial({...c,elite:true}),/手动/);
 assert.match(mobileChallengeCopy(c),/换位12米/);
 assert.match(mobileChallengeCopy({...c,elite:true,minTravel:18,target:4,maxDeaths:0}),/零阵亡/);
 assert.equal(cfHitCue(c,1,1,{stage:1,follow:0}),'✓ 首枪命中 · 向掩体换位');
 assert.equal(cfHitCue(c,4,1,{stage:2,follow:2}),'✓ 追击命中 2/3');
 assert.deepEqual(cfMissionFacts({...c,limitMs:60000}),[
  {label:'装备',value:'M4A1'},{label:'目标',value:'1枪→12m→3枪'},{label:'限时',value:'60 s'}]);
 assert.deepEqual(cfResultFacts(c,{hits:99,drillFollowUpHits:2,drillTravel:12.6,deaths:1}),[
  {label:'追击',value:'2 / 3'},{label:'换位',value:'12 / 12 m'},
  {label:'阵亡',value:'1 / 1'}]);
 assert.match(cfMissionDebrief(c,{hits:0,drillFirstHit:false},'lost'),/第一次真实命中/);
 assert.match(cfMissionDebrief(c,{hits:5,drillFirstHit:true,drillStage:1,drillTravel:9},'lost'),/9\/12/);
 assert.match(cfMissionDebrief(c,{hits:9,drillFirstHit:true,drillStage:2,drillTravel:12,drillFollowUpHits:2},'lost'),/2\/3/);
 assert.match(cfMissionDebrief(c,{hits:9,deaths:2,drillFirstHit:true,drillStage:2,drillTravel:12,drillFollowUpHits:3},'lost'),/最多允许 1 次/);
 assert.match(cfMissionDebrief(c,{hits:9,deaths:0,drillFirstHit:true,drillStage:2,drillTravel:12,drillFollowUpHits:3},'won'),/手动追击 3 次/);
});


test('CF reposition cannot be cheesed by stepping back and forth or respawn teleport',()=>{
 const c={kind:'hits',drill:'reposition',openingHits:1,minTravel:12,target:3};
 let d=cfAdvanceDrill(c,null,{hits:0,travel:0,x:-30,z:-7});
 d=cfAdvanceDrill(c,d,{hits:1,travel:1,x:-29,z:-7});
 assert.equal(d.stage,1);assert.equal(d.anchorX,-29);
 assert.equal(d.anchorZ,-7);
 // 28m accumulated on a tiny loop still is not a real displacement.
 d=cfAdvanceDrill(c,d,{hits:9,travel:29,x:-28,z:-7});
 assert.equal(d.stage,1);assert.equal(d.distance,1);assert.equal(d.follow,0);
 // A native respawn teleport is not itself recorded in walk distance.
 d=cfAdvanceDrill(c,d,{hits:9,travel:29.1,x:12,z:7});
 assert.equal(d.stage,1);assert.equal(d.distance,1);
 assert.equal(d.anchorX,12);assert.equal(d.anchorZ,7);
 // A true 14m walk away from the post-respawn anchor is now valid.
 d=cfAdvanceDrill(c,d,{hits:9,travel:43.1,x:-2,z:7});
 assert.equal(d.stage,2);assert.ok(d.distance>=12);
 assert.equal(d.hitBaseline,9);
 d=cfAdvanceDrill(c,d,{hits:11,travel:43.1,x:-15,z:-7});
 assert.equal(d.follow,2);
 // Once the position checkpoint is earned, chasing backward doesn't revoke it.
 d=cfAdvanceDrill(c,d,{hits:11,travel:57.1,x:12,z:7});
 assert.equal(d.stage,2);assert.ok(d.distance>=12);
});


test('CF v7 retains genuine partial move across native respawns but never credits teleport',()=>{
 const c={kind:'hits',drill:'reposition',openingHits:1,minTravel:8,target:3};
 let d=cfAdvanceDrill(c,null,{hits:1,travel:0,x:0,z:0});
 d=cfAdvanceDrill(c,d,{hits:1,travel:5,x:5,z:0});
 assert.equal(d.stage,1);assert.equal(d.distance,5);assert.equal(d.peakDistance,5);
 d=cfAdvanceDrill(c,d,{hits:1,travel:5,x:30,z:5});
 assert.equal(d.stage,1);assert.equal(d.distance,5);
 assert.equal(d.earnedDistance,5);assert.equal(d.peakDistance,0);
 assert.equal(d.startTravel,5);
 d=cfAdvanceDrill(c,d,{hits:1,travel:8,x:33,z:5});
 assert.equal(d.stage,2);assert.equal(d.distance,8);
 assert.equal(d.hitBaseline,1);
 d=cfAdvanceDrill(c,d,{hits:3,travel:9,x:34,z:5});
 assert.equal(d.follow,2);assert.ok(d.distance>=8);
 assert.equal(cfAdvanceDrill(c,d,{hits:4,travel:15,x:30,z:5}).follow,3);
});
