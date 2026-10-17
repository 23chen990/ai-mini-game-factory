import test from 'node:test';
import assert from 'node:assert/strict';
import { teamSide, playerRelativeScore, enemyBadgeAllowed, createFpsMobileUx, mobileTouchAction, mobileChallengeCopy, mobileEnemyDifficulty, mobileAimCorrection, cfVisibleAimCoach, cfFireDragLookDelta, cfBeginTouchFire, cfReleaseTouchFire, selectMobileSpawn, firstEncounterDestination, routeArrow, cfLastSeenLookCue, cfFlankWaypoint, cfSeenLaneSight, cfReacquireLane, cfNativeShotAimError, mobileSimpleFireAllowed, cfIntroAssistCandidate, chooseFirstEncounterSpot, chooseMobileSniperLane, teammateTagOpacity, withinScopedLens, holdOpeningTeammateFire, blockMobileTouchMouse, sniperScopeLabel, mobileScoutHoldExpired, cfScoutHoldSeconds, cfTrainingRespawnSpots, cfStabilizeNoviceScout, cfNoviceScoutStrafe, cfHitCue, cfMissionDebrief, cfEliteUnlocked, cfAutoFireEligible, cfAdvanceDrill, cfTouchTutorial, cfMissionFacts, cfResultFacts } from '../fps-mobile-ux.mjs';

test('CF V18 dead-player touches cannot arm gun or buffered jump, but menus remain accessible',async()=>{
 const {cfIgnoreDeadCombatTouch}=await import('../fps-mobile-ux.mjs');
 assert.equal(cfIgnoreDeadCombatTouch({alive:false,nativeControl:true}),true);
 assert.equal(cfIgnoreDeadCombatTouch({alive:false,nativeControl:false}),false);
 assert.equal(cfIgnoreDeadCombatTouch({alive:true,nativeControl:true}),false);
 assert.equal(cfIgnoreDeadCombatTouch({alive:undefined,nativeControl:true}),true);
 assert.equal(cfIgnoreDeadCombatTouch(),false);
});

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


test('CF novice opening opponent returns fire from readable cover before a later real rush',()=>{
 const novice={kind:'hits',drill:'reposition',elite:false};
 assert.equal(cfScoutHoldSeconds(novice),10);
 assert.equal(cfScoutHoldSeconds({kind:'hits',elite:false}),7);
 assert.equal(cfScoutHoldSeconds({kind:'kills'}),15);
 assert.equal(cfScoutHoldSeconds({kind:'survive'}),7);
 assert.equal(cfScoutHoldSeconds({...novice,elite:true}),4);
 assert.equal(cfScoutHoldSeconds({kind:'kills',elite:true}),6);
 assert.equal(mobileScoutHoldExpired({__mobileTrainingScout:true,__mobileTrainingHoldUntil:10},9.99),false);
 assert.equal(mobileScoutHoldExpired({__mobileTrainingScout:true,__mobileTrainingHoldUntil:10},10),true);
 assert.equal(mobileScoutHoldExpired({__mobileTrainingScout:false,__mobileTrainingHoldUntil:18},22),false);
});


test('CF flank coach proposes a real reachable side route, never fabricates an obstacle-free lane',()=>{
 const player={pos:{x:0,z:0},yaw:0};
 const openWorld={blocked:()=>false};
 let pathCalls=0;
 const openNav={
  idx:(x,z)=>Math.abs(x)<=25&&Math.abs(z)<=25?0:-1,
  walkable:k=>k>=0,
  lineFree:()=>true,
  findPath:()=>{pathCalls++;throw Error('direct walkable lane needs no A-star');}
 };
 const selected=cfFlankWaypoint({player,world:openWorld,nav:openNav,minDistance:8});
 assert.ok(selected&&selected.x>=9.5);
 assert.equal(selected.side,1);
 assert.ok(Math.abs(selected.z)<=2);
 assert.equal(pathCalls,0,'straight accessible flank uses cheap direct walk path');
 assert.deepEqual(player,{pos:{x:0,z:0},yaw:0},'coach never teleports player');
 const leftNav={...openNav,idx:x=>x>0?-1:0};
 const left=cfFlankWaypoint({player,world:openWorld,nav:leftNav,minDistance:8});
 assert.ok(left&&left.x<-8);
 assert.equal(left.side,-1);
 assert.equal(cfFlankWaypoint({player,world:{blocked:()=>true},nav:openNav}),null);
 const badNav={...openNav,lineFree:()=>false,
  findPath:(x,z,tx,tz)=>[[x,z],[100,100],[tx,tz]]};
 assert.equal(cfFlankWaypoint({player,world:openWorld,nav:badNav}),null,
  'path requiring a huge detour is not advertised as safe');
 assert.equal(cfFlankWaypoint({player,nav:openNav}),null);
});


test('CF follow-up fire gets limited aim friction only when the novice actively shoots',()=>{
 const near={yawError:.17,pitchError:.12,distance:16,
   visible:true,firing:true,sniperReady:true};
 assert.deepEqual(mobileAimCorrection({...near,training:false}),{yaw:0,pitch:0});
 const assisted=mobileAimCorrection({...near,training:true});
 assert.ok(assisted.yaw>0&&assisted.yaw<=.025);
 assert.ok(assisted.pitch>0&&assisted.pitch<=.019);
 for(const value of [{firing:false},{visible:false},{distance:28},
  {yawError:.21},{pitchError:.15},{sniperReady:false}]){
  assert.deepEqual(mobileAimCorrection({...near,...value,training:true}),{yaw:0,pitch:0});
 }
 // This function changes only view angles; the original gun still requires
 // actual fire input, line-of-sight and a native bullet-hit callback.
 assert.ok(!('hit' in assisted) && !('fire' in assisted));
});


test('CF V14 temporary first-aim training ends before 12s, not at the match deadline',()=>{
 const c={kind:'hits',drill:'reposition',limitMs:60000,elite:false};
 assert.equal(cfScoutHoldSeconds(c),10);
 assert.equal(cfScoutHoldSeconds({...c,limitMs:45000}),10);
 assert.equal(cfScoutHoldSeconds({...c,elite:true}),4);
 assert.equal(mobileScoutHoldExpired({__mobileTrainingScout:true,__mobileTrainingHoldUntil:10},9.9),false);
 assert.equal(mobileScoutHoldExpired({__mobileTrainingScout:true,__mobileTrainingHoldUntil:10},12),true);
});


test('CF native tutorial respawn locations are authored original world spots, not fake actor hits',()=>{
 const first={x:-25,z:-4,yaw:Math.PI/2},second={x:-20,z:-4,yaw:Math.PI/2};
 const a=cfTrainingRespawnSpots(first,second);
 assert.deepEqual(a,[first,second]);
 assert.notEqual(a[0],first,'owned spawn records must not mutate frozen original');
 assert.equal(cfTrainingRespawnSpots(first,{x:-24,z:-4,yaw:0}).length,1,
  'overlapping enemy respawns must not spawn-camp');
 assert.equal(cfTrainingRespawnSpots(first,{x:5,z:-4,yaw:0}).length,1,
  'opposite-map spawn cannot be advertised as local training arena');
 assert.deepEqual(cfTrainingRespawnSpots({x:NaN,z:0,yaw:0}),[]);
 assert.deepEqual(cfTrainingRespawnSpots(null),[]);
});

test('CF holding a native bot lane never moves the actor or changes health/weapon',()=>{
 const novice={kind:'hits',drill:'reposition',elite:false};
 const actor={__mobileTrainingScout:true,alive:true,
  pos:{x:-23,z:1},role:'rush',goal:[30,10],path:[[0,0],[30,10]],
  pi:1,holdT:32,hp:64,stats:{d:1,hits:6},weapon:{id:'m4a1'}};
 const oldPosition={...actor.pos},weapon=actor.weapon,stats=actor.stats;
 assert.equal(cfStabilizeNoviceScout(actor,novice),true);
 assert.equal(actor.role,'hold');assert.deepEqual(actor.goal,[-23,1]);
 assert.equal(actor.path,null);assert.equal(actor.pi,0);assert.equal(actor.holdT,0);
 assert.deepEqual(actor.pos,oldPosition);assert.equal(actor.hp,64);
 assert.equal(actor.weapon,weapon);assert.equal(actor.stats,stats);
 assert.equal(cfStabilizeNoviceScout({...actor,alive:false},novice),false);
 assert.equal(cfStabilizeNoviceScout({...actor,__mobileTrainingScout:false},novice),false);
 assert.equal(cfStabilizeNoviceScout(actor,{...novice,elite:true}),false);
 assert.equal(cfStabilizeNoviceScout(actor,{kind:'survive'}),false);
});


test('CF visible-aim tutorial indicates only camera-confirmed on-screen swipe, never invisible tracking',()=>{
 assert.equal(cfVisibleAimCoach(-.65,0),'← 按住开火向左滑动');
 assert.equal(cfVisibleAimCoach(.65,0),'→ 按住开火向右滑动');
 assert.equal(cfVisibleAimCoach(0,.46),'↑ 按住开火向上滑动');
 assert.equal(cfVisibleAimCoach(0,-.46),'↓ 按住开火向下滑动');
 assert.equal(cfVisibleAimCoach(0,0),'◎ 准星接近敌人 · 按住开火');
 for(const a of [NaN,Infinity,-Infinity,undefined]){
  assert.equal(cfVisibleAimCoach(a,0),'');
  assert.equal(cfVisibleAimCoach(0,a),'');
 }
});


test('CF native fire-button gesture gives one right thumb both hold-fire and camera drag',()=>{
 assert.deepEqual(cfFireDragLookDelta(0,0),{x:0,y:0});
 const gesture=cfFireDragLookDelta(-30,20);
 assert.ok(gesture.x < -86.9 && gesture.x > -87.1);
 assert.ok(gesture.y > 57.9 && gesture.y < 58.1);
 assert.deepEqual(cfFireDragLookDelta(1000,-1000),{x:96,y:-96},
  'one outlier touchmove must not rotate the camera through multiple turns');
 for(const invalid of [NaN,Infinity,undefined]){
  assert.deepEqual(cfFireDragLookDelta(invalid,8),{x:0,y:0});
  assert.deepEqual(cfFireDragLookDelta(8,invalid),{x:0,y:0});
 }
 const a=cfFireDragLookDelta(20,0),b=cfFireDragLookDelta(-20,0);
 assert.ok(a.x>0&&b.x<0,'camera follows the same two swipe directions as native touch look');
 assert.equal('fire' in a,false,'input conversion cannot spawn bullets or award hits');
});


test('CF quick fire tap survives touchend but cancellation pause and teardown always stop native shots',()=>{
 const tap={fire:true,firePressed:true};
 cfReleaseTouchFire(tap);
 assert.deepEqual(tap,{fire:false,firePressed:true},
  'original native Player.update must see a quick-tap firePressed even if released first');
 const cancelled={fire:true,firePressed:true};
 cfReleaseTouchFire(cancelled,true);
 assert.deepEqual(cancelled,{fire:false,firePressed:false},
  'cancelled/restarted touch must never leave sticky gun fire');
 const paused={fire:true,firePressed:false};
 cfReleaseTouchFire(paused,true);
 assert.deepEqual(paused,{fire:false,firePressed:false});
 assert.equal(cfReleaseTouchFire(null,true),undefined);
});


test('CF post-cover reacquisition turns toward a previously seen location, never a hidden live target',()=>{
 const p={pos:{x:0,z:0},yaw:0};
 assert.match(cfLastSeenLookCue(p,{x:-10,z:-10}),/^← 向左转视角/u);
 assert.match(cfLastSeenLookCue(p,{x:10,z:-10}),/^→ 向右转视角/u);
 assert.match(cfLastSeenLookCue(p,{x:0,z:-10}),/^↔ 左右探身/u);
 assert.equal(cfLastSeenLookCue(p,{x:0,z:-.2}),null);
 assert.equal(cfLastSeenLookCue(p,null),null);
 assert.equal(cfLastSeenLookCue({...p,yaw:NaN},{x:10,z:10}),null);
 // No mutating the player's position, no output containing bot stats/coords.
 assert.deepEqual(p,{pos:{x:0,z:0},yaw:0});
});


test('CF first-shot camera assistance selects only a previously sighted, real line-of-sight enemy',()=>{
 const valid={side:'enemy',alive:true,visible:true,blocked:false,distance:10,
  yawError:.10,pitchError:.07};
 assert.equal(cfIntroAssistCandidate(valid),true);
 for(const bad of [
  {side:'ally'}, {side:'unknown'},{alive:false},{visible:false},
  {blocked:true},{distance:0},{distance:29},
  {yawError:.20},{pitchError:.14},{pitchError:NaN},{yawError:NaN}
 ]){
  assert.equal(cfIntroAssistCandidate({...valid,...bad}),false,
   'must reject every hidden, covered, invalid, dead or non-opponent candidate');
 }
 assert.equal(cfAutoFireEligible({kind:'hits',drill:'reposition',openingHits:1},1),false,
  'this slight first-shot assistance permanently ends after the first genuine hit');
});


test('CF novice returns precisely to player-proven shooting lane with a joystick navigation cue',()=>{
 const player={pos:{x:-33,z:-3.2},yaw:-Math.PI/2};
 // 1 meter is relevant in a narrow cargo doorway, though old generic
 // navigation stopped providing hints at 2.2 meters.
 const lane=[-34,-3.6];
 assert.equal(routeArrow(player,lane),null);
 const exact=routeArrow(player,lane,.6);
 assert.ok(exact&&['←','→','↑'].includes(exact.symbol));
 assert.ok(exact.distance>0);
 assert.equal(routeArrow({pos:{x:-34,z:-3.6},yaw:-Math.PI/2},lane,.6),null);
});
test('CF only genuine novice real scout reduces lateral drift without changing enemy guns or elite',()=>{
 const original={strafe:.34,turn:3.6,aimErr:.09};
 assert.equal(cfNoviceScoutStrafe(original,true),.07);
 assert.equal(cfNoviceScoutStrafe(original,false),.34);
 assert.equal(cfNoviceScoutStrafe({strafe:.04},true),.04);
 assert.deepEqual(original,{strafe:.34,turn:3.6,aimErr:.09},
  'never mutate input profile, health, damage or firing characteristics');
 assert.equal(cfNoviceScoutStrafe({},true),0);
});


test('CF one-thumb firing stays native through lost button events without inventing shots',()=>{
 const native={mx:.4,mz:-.2,fire:false,firePressed:false,shots:7,hits:1};
 assert.equal(cfBeginTouchFire(native),true);
 assert.equal(native.fire,true);assert.equal(native.firePressed,true);
 native.firePressed=false; // Original Player.update consumes the edge.
 assert.equal(cfBeginTouchFire(native),true);
 assert.equal(native.firePressed,false,
  'continued drag may hold native fire but cannot generate another press edge');
 assert.equal(native.shots,7);assert.equal(native.hits,1);
 assert.deepEqual({mx:native.mx,mz:native.mz},{mx:.4,mz:-.2},
  'the right fire finger must not steal the native left joystick');
 cfReleaseTouchFire(native);
 assert.equal(native.fire,false);assert.equal(native.firePressed,false);
 assert.equal(cfBeginTouchFire(null),false);
 const interrupted={fire:false,firePressed:false};
 cfBeginTouchFire(interrupted);
 cfReleaseTouchFire(interrupted,true);
 assert.deepEqual(interrupted,{fire:false,firePressed:false});
});


test('CF flank prioritizes an authentic sightline over the nearer blocked side',()=>{
 const player={pos:{x:0,y:0,z:0},yaw:0,eyeH:1.6};
 const world={
   blocked:()=>false,
   raycast:(x)=>x>0?{t:2}:null
 };
 const nav={idx:()=>1,walkable:()=>true,lineFree:()=>true,
   findPath:()=>{throw Error('direct nav route should work');}};
 const lastSeen={x:0,z:-11,at:3};
 const goal=cfFlankWaypoint({player,world,nav,minDistance:8,lastSeen});
 assert.ok(goal,'an accessible flank must be found');
 assert.equal(goal.side,-1,'choose the genuinely exposed firing-side lane');
 assert.equal(goal.sightClear,true);
 assert.ok(goal.pathLength>=8);
 assert.equal(cfSeenLaneSight(world,{x:-8,z:0},lastSeen,1.6),true);
 assert.equal(cfSeenLaneSight(world,{x:8,z:0},lastSeen,1.6),false);
 assert.equal(cfSeenLaneSight(world,{x:0,z:0},null,1.6),null);
});

test('CF post-flank sight recovery stops at nearest visible legal lane rather than undoing 8m',()=>{
 const player={pos:{x:0,y:0,z:12},yaw:-Math.PI/2,eyeH:1.6};
 const firstHitSpot={x:0,z:0},lastSeen={x:10,z:0,at:5};
 const nav={idx:(x,z)=>Math.abs(x)<20&&Math.abs(z)<20?0:-1,
   walkable:id=>id>=0,lineFree:()=>true,
   findPath:()=>{throw Error('free direct route should bypass A-star');}};
 const world={blocked:()=>false,raycast:(x,y,z)=>z>5?{t:2}:null};
 const lane=cfReacquireLane({player,firstHitSpot,lastSeen,world,nav});
 assert.ok(lane,'nearby legal LOS lane must exist');
 assert.ok(lane.z>0&&lane.z<5,'recover a shorter shooting lane, not first-shot origin');
 assert.ok(lane.travel<12,'the player need not run all the way back');
 assert.equal(lane.seenOnly,true);
 assert.equal(cfReacquireLane({player,firstHitSpot,lastSeen,
   world:{...world,raycast:()=>null},nav}),null,
   'a clear new position needs only camera reacquisition, not navigation');
 const longPath={...nav,lineFree:()=>false,
   findPath:(x,z,tx,tz)=>[[x,z],[90,90],[tx,tz]]};
 assert.equal(cfReacquireLane({player,firstHitSpot,lastSeen,world,nav:longPath}),null,
   'a target across an unreasonable map detour must not be advertised as safe');
 assert.equal(cfReacquireLane({player,firstHitSpot,lastSeen:null,world,nav}),null);
});

test('CF firing-only aim assist compares target with REAL native recoil-adjusted bullet angle',()=>{
 const a=cfNativeShotAimError({targetYaw:-Math.PI/2,targetPitch:-.015,
   playerYaw:-Math.PI/2,playerPitch:0,recoilYaw:.026,recoilPitch:.055});
 assert.ok(Math.abs(a.yawError+.026)<1e-8);
 assert.ok(Math.abs(a.pitchError+.070)<1e-8);
 // Native Actor.forward() shoots at pitch + punchP; the model must not
 // accidentally align the camera while bullets keep climbing off target.
 const centered=cfNativeShotAimError({targetYaw:2.5,targetPitch:.1,
   playerYaw:2.5,playerPitch:.1});
 assert.deepEqual(centered,{yawError:0,pitchError:0});
 assert.equal(cfNativeShotAimError({targetYaw:Infinity,targetPitch:0,
   playerYaw:0,playerPitch:0}),null);
 assert.equal('hits' in a,false);
 assert.equal('fire' in a,false);
});

test('CF V18 real swipe gain is symmetric and only slows under a real aligned target',()=>{
 const free=cfFireDragLookDelta(25,-12);
 const opposite=cfFireDragLookDelta(-25,12);
 assert.deepEqual(free,{x:-opposite.x,y:-opposite.y});
 assert.deepEqual(free,{x:72.5,y:-34.8});
 const friction=cfFireDragLookDelta(25,-12,.65);
 assert.ok(friction.x>0&&friction.x<free.x);
 assert.ok(friction.y<0&&friction.y>free.y);
 assert.deepEqual(cfFireDragLookDelta(25,0,0),{x:39.875,y:0},
   'clamp prevents frozen aim even with accidental zero friction');
 assert.deepEqual(cfFireDragLookDelta(25,0,Infinity),{x:72.5,y:0});
 assert.deepEqual(cfFireDragLookDelta(0,0,.65),{x:0,y:0});
 const lite={id:'tags',kind:'hits',lite:true,drill:'reposition',openingHits:1};
 assert.equal(cfAutoFireEligible(lite,0),false);
 assert.equal(cfAutoFireEligible(lite,20),false);
 assert.match(cfTouchTutorial(lite),/按住开火/);
 assert.doesNotMatch(mobileChallengeCopy({...lite,limitMs:75000,objective:'亲手击倒2名敌人'}),/换位/);
});

test('CF V18 opponent pressure is native-difficulty only and mode-dependent',async()=>{
 const {cfLiteEnemyProfile,mobileEnemyDifficulty}=await import('../fps-mobile-ux.mjs');
 const base=mobileEnemyDifficulty('hits',5,{hits:0,k:0,d:0});
 const profile=cfLiteEnemyProfile(base,{id:'tags',lite:true},5);
 assert.notStrictEqual(profile,base);
 assert.ok(profile.react[0]<base.react[0]&&profile.react[0]>=.22);
 assert.ok(profile.aimErr<base.aimErr&&profile.aimErr>=.038);
 assert.equal(profile.headP,base.headP,'headshot odds unchanged');
 assert.equal(profile.bunny,base.bunny,'original movement and weapon physics unchanged');
 const late=cfLiteEnemyProfile(base,{id:'counter',lite:true},30);
 assert.ok(late.react[0]<profile.react[0]);
 assert.ok(late.strafe>profile.strafe);
 assert.strictEqual(cfLiteEnemyProfile(base,{id:'counter',lite:false},50),base);
 assert.strictEqual(cfLiteEnemyProfile(null,{id:'counter',lite:true},50),null);
});

test('CF H5 opening lane chooses real unobstructed sightlines, never a wall',async()=>{
 const {cfChooseVisibleOpeningLane}=await import('../fps-mobile-ux.mjs');
 const spawns=[{x:-30,z:0,yaw:-Math.PI/2},{x:-30,z:6,yaw:-Math.PI/2}];
 const originals=JSON.stringify(spawns);
 const world={
   blocked:()=>false,
   raycast:(x,y,z,dx,dy,dz,maxDistance)=>{
     // The first corridor ends at an opaque container 8m away.
     if(Math.abs(z)<.2&&Math.abs(dz)<.01&&dx>.9&&maxDistance>8)
       return {t:8};
     return null;
   }
 };
 const nav={idx:()=>1,walkable:()=>true,
   findPath:(sx,sz,dx,dz)=>[[sx,sz],[dx,dz]]};
 const lane=cfChooseVisibleOpeningLane({
   spawns,world,nav,actors:[],team:'BL'
 });
 assert.ok(lane?.spot&&lane?.spawn,'must find a real corridor');
 assert.ok(lane.distance>=7&&lane.distance<=10.1,
  'small lateral aiming offsets slightly increase physical ray distance');
 assert.ok(lane.backstop>=.8);
 assert.equal(JSON.stringify(spawns),originals,
   'candidate selection must never modify authored map starts');
 assert.ok(lane.spawn.yaw!==undefined);
 assert.equal(cfChooseVisibleOpeningLane({
   spawns,world:{...world,raycast:()=>({t:.5})},nav,actors:[],team:'BL'
 }),null,'opaque walls make a target ineligible');
 assert.equal(cfChooseVisibleOpeningLane({spawns:[],world,nav}),null);
});
