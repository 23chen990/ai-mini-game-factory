import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, newCareer, loadCareer, localDayKey, dailyStage, careerStars, stageUnlocked, skinUnlocked, recordStage, gradeStage, validDrift, fractionPassed } from '../racing/career.mjs';
import { thinItemBoxes, installItemCleanup, itemDecision, AutoItems, OvertakeTracker, awardCornerPass, removeEliminatedAi } from '../racing/items.mjs';
import { RacingCareer } from '../racing/runtime.mjs';
const result=(n=1)=>({finished:true,place:n,time:90,stats:{crash:1}});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const racer=(player,progress)=>({isPlayer:player,progress,stats:{crash:0},s:35,d:20,items:[],spin:0,impact:0,airborne:false,slowTime:0,model:{traverse(){}},finished:false});
const game=()=>{
  const p=racer(true,50),a=racer(false,100),b=racer(false,120);
  return {player:p,track:{length:500,curvAhead:()=>.008},settings:{laps:2,diff:0,map:'city',mode:'speed',skin:0},
    save(){},state:'race',raceTime:10,firstFinish:-1,hud:{finalCount(){}},showResults(){this.resultShown=true},
    racers:[p,a,b],standings:[b,a,p],items:null,itemMode:false,scene:{remove(){}},racerAhead(){return a},
    checkRaceEnd(){this.nativeEndCalls=(this.nativeEndCalls||0)+1;},onItemGet(){}};
};
test('16 staged challenges use four original layouts and eight distinct objectives',()=>{
  assert.equal(STAGES.length,16);assert.equal(new Set(STAGES.map(s=>s.map)).size,4);
  assert.ok(new Set(STAGES.map(s=>s.kind)).size>=8);assert.ok(STAGES.filter(s=>s.laps>1).length>=12);
  assert.equal(STAGES[0].laps,1);
});
test('unlock is linear, rank alone cannot pass an objective',()=>{
  let c=newCareer();assert.equal(stageUnlocked(c,1),false);
  c=recordStage(c,STAGES[0],result(),{}).career;
  assert.equal(stageUnlocked(c,1),true);assert.equal(stageUnlocked(c,2),false);
  assert.equal(gradeStage(STAGES[2],result(),{cleanPasses:0}),0);
  assert.ok(gradeStage(STAGES[2],result(),{cleanPasses:1}));
});
test('valid drift counts real driftEnd above .22 seconds',()=>{
  assert.equal(validDrift({type:'driftStart',data:{time:5}}),false);
  assert.equal(validDrift({type:'driftEnd',data:{time:.19,clean:true}}),false);
  assert.equal(validDrift({type:'driftEnd',data:{time:.4,clean:false}}),false);
  assert.equal(validDrift({type:'driftEnd',data:{time:.4}}),false);
  assert.equal(validDrift({type:'driftEnd',data:{time:.4,clean:true}}),true);
});
test('time / relay / boss / elimination gates never auto-pass',()=>{
  assert.ok(gradeStage(STAGES[6],result(),{}));
  assert.equal(gradeStage(STAGES[6],{...result(),time:150},{}),0);
  assert.equal(gradeStage(STAGES[8],result(),{padCount:0}),0);
  assert.ok(gradeStage(STAGES[8],result(),{padCount:1}));
  assert.equal(gradeStage(STAGES[11],result(),{survived:1}),0);
  assert.ok(gradeStage(STAGES[11],result(),{survived:2}));
  assert.equal(gradeStage(STAGES[12],result(),{beatBoss:false}),0);
  assert.ok(gradeStage(STAGES[12],result(),{beatBoss:true}));
});
test('career persistence and skins depend only on earned stars',()=>{
  const c=newCareer();c.stars={'01':3,'02':3};c.rounds=2;c.skin=2;
  const saved=loadCareer(JSON.stringify(c));assert.equal(saved.skin,2);assert.equal(careerStars(saved),6);
  assert.equal(skinUnlocked(saved,3),false);assert.equal(loadCareer('{').rounds,0);
  assert.equal(loadCareer(JSON.stringify({...c,stars:{'01':8}})).stars['01'],undefined);
});
test('checkpoints only activate when crossing real multi-lap progress',()=>{
  assert.equal(fractionPassed(90,110,200,.5),true);
  assert.equal(fractionPassed(110,130,200,.5),false);
  assert.equal(fractionPassed(90,110,0,.5),false);
});
test('item box thinning creates real lateral steering choices',()=>{
  const removed=[],system={boxes:Array.from({length:20},(_,i)=>({g:{i}})),group:{remove:b=>removed.push(b)}};
  assert.equal(thinItemBoxes(system),12);assert.equal(system.boxes.length,8);assert.equal(removed.length,12);
});
test('automatic item use waits for relevant player context and cooldown',()=>{
  const other={progress:40,isPlayer:false},p={items:['missile'],s:35,progress:0,spin:0,d:1,drifting:false};
  const g={state:'race',itemMode:true,player:p,items:{},track:{curvAhead:()=>0},racers:[p,other],racerAhead:()=>other,raceTime:5};
  assert.equal(itemDecision(g),true);
  const auto=new AutoItems();assert.equal(auto.frame(g),true);assert.equal(auto.frame(g),false);
  g.raceTime=7;assert.equal(auto.frame(g),true);
  p.items=['nitro'];p.drifting=true;assert.equal(auto.frame(g),false);
});
test('real corner overtakes need rank gains and curvature, cannot award repeated rewards',()=>{
  const p={s:40,d:20,progress:99,impact:0,airborne:false,stats:{crash:0},isPlayer:true};
  const other={progress:100,isPlayer:false},g={player:p,state:'race',raceTime:4,standings:[other,p],racers:[p,other],track:{curvAhead:()=>.008}};
  const t=new OvertakeTracker();assert.equal(t.frame(g),false);
  g.raceTime=5;p.progress=101;g.standings=[p,other];assert.equal(t.frame(g),true);assert.equal(t.frame(g),false);
  g.player.smallBoost=0;g.player.smallBoostPower=0;g.player.slowTime=0;g.player.spin=0;g.itemMode=false;
  assert.equal(awardCornerPass(g),'boost');assert.ok(p.smallBoost>0);
  t.reset();g.raceTime=6;p.progress=99;g.standings=[other,p];t.frame(g);
  g.raceTime=7;g.standings=[p,other];assert.equal(t.frame(g),false, 'rank-only improvement cannot grant a real overtake');
});
test('elimination removes AI model and stands but never removes the player',()=>{
  const ai={isPlayer:false,model:{traverse(){}}},p={isPlayer:true},gone=[];
  const g={racers:[p,ai],standings:[p,ai],scene:{remove:r=>gone.push(r)}};
  assert.equal(removeEliminatedAi(g,p),false);assert.equal(removeEliminatedAi(g,ai),true);
  assert.equal(g.racers.length,1);assert.equal(gone.length,1);
});
test('career starts on first available stage without fuel paywall if ad slot missing',()=>{
  const c=new RacingCareer(memory());assert.equal(c.stage.id,'01');assert.equal(c.setStage(1),false);
  c.setupAd({status:'PENDING'},null);assert.equal(c.fuelEnabled,false);assert.equal(c.canStart(),true);
  c.configure(game());const g=game();c.begin(g);assert.equal(c.fuel.amount,10);
});
test('AI reaching finish first does not end a two-lap race after 10 seconds',()=>{
  const c=new RacingCareer(memory()),g=game();c.patchNative(g);g.firstFinish=0;g.raceTime=20;
  g.checkRaceEnd(.02);assert.equal(g.nativeEndCalls,undefined);assert.equal(g.resultShown,undefined);
  g.raceTime=320;g.checkRaceEnd(.02);assert.equal(g.resultShown,true);
});
test('relay pads are counted only when spaced and give real clock extension',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<8;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  assert.equal(c.setStage(8),true);c.begin(g);c.onEvent({type:'pad'},g);
  assert.equal(c.metrics.timeAllowance,102);g.raceTime=11;c.onEvent({type:'pad'},g);
  assert.equal(c.metrics.padCount,1);g.raceTime=15;c.onEvent({type:'pad'},g);
  assert.equal(c.metrics.padCount,2);
});
test('each race clears telemetry; a loss does not unlock another stage',()=>{
  const c=new RacingCareer(memory()),g=game();c.begin(g);c.onEvent({type:'driftEnd',data:{time:.35,clean:true}},g);
  assert.equal(c.metrics.cleanDrifts,1);
  const o=c.finalize(g,{finished:false,place:6,time:null,stats:{crash:0}});
  assert.equal(o.stars,0);assert.equal(c.progress.rounds,1);c.begin(g);assert.equal(c.metrics.cleanDrifts,0);
});

test('invalid drift endings, including wall collisions, cannot unlock the drift challenge', () => {
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<3;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  assert.equal(c.setStage(3),true);c.begin(g);
  c.onEvent({type:'driftEnd',data:{time:.8,clean:false}},g);
  c.onEvent({type:'driftEnd',data:{time:.5}},g);
  assert.equal(c.metrics.cleanDrifts,0);
  c.onEvent({type:'driftEnd',data:{time:.4,clean:true}},g);
  assert.equal(c.metrics.cleanDrifts,1);
  assert.match(c.objectiveLabel(g),/1\/3/);
  assert.equal(gradeStage(c.stage,result(),c.metrics),0);
});
test('career UI objectives reflect real progress, not dummy counters',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<2;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(2);c.begin(g);
  assert.match(c.objectiveLabel(g),/0\/1/);
  c.metrics.cleanPasses=1;assert.match(c.objectiveLabel(g),/1\/1/);
  assert.ok(gradeStage(c.stage,result(),c.metrics));
});
test('advertising cannot be offered before tutorial is actually completed',()=>{
  const c=new RacingCareer(memory());
  c.fuelEnabled=true;c.progress.rounds=12;c.startedAt=Date.now()-900000;
  c.fuel.amount=2;
  assert.equal(c.canOfferAd(),false);
  c.progress.stars['01']=1;
  assert.equal(c.canOfferAd(),true);
});


test('a full item queue eventually resolves instead of blocking future pickups',()=>{
  const p={isPlayer:true,s:35,d:100,progress:100,spin:0,items:['shield','banana'],drifting:false};
  const g={state:'race',itemMode:true,player:p,items:{swap:r=>r.items.reverse()},raceTime:5,
    track:{curvAhead:()=>0},racerAhead:()=>null,racers:[p]};
  const auto=new AutoItems();assert.equal(auto.frame(g),false);
  g.raceTime=18;assert.equal(auto.frame(g),true);
  assert.equal(auto.frame(g),false);
});

test('real corner-exit pass is accepted but late straight or AI ranking changes are rejected',()=>{
  const p={isPlayer:true,progress:99,s:39,d:10,impact:0,airborne:false,stats:{crash:0}};
  const o={isPlayer:false,progress:100};
  let curve=.008;
  const g={state:'race',raceTime:5,player:p,racers:[p,o],standings:[o,p],track:{curvAhead:()=>curve}};
  const pass=new OvertakeTracker();pass.frame(g);
  curve=0;g.raceTime=6;p.progress=101;g.standings=[p,o];
  assert.equal(pass.frame(g),true);
  pass.reset();g.raceTime=10;p.progress=99;g.standings=[o,p];curve=.008;pass.frame(g);
  curve=0;g.raceTime=13;p.progress=101;g.standings=[p,o];
  assert.equal(pass.frame(g),false);
});


test('corner-pass gift cannot counterfeit a required physical item-box pickup',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<4;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  assert.equal(c.setStage(4),true);c.begin(g);
  c.onItemGet('nitro','overtake');
  assert.equal(c.metrics.bonusItems,1);assert.equal(c.metrics.pickups,0);
  assert.equal(gradeStage(c.stage,result(),c.metrics),0);
  c.onItemGet('shield','box');
  assert.equal(c.metrics.pickups,1);
  assert.ok(gradeStage(c.stage,result(),c.metrics)>0);
});

test('offline daily stage rotates by local date and stays locked until chapter one is complete',()=>{
  const a=new Date(2026,9,14,12),b=new Date(2026,9,15,12);
  assert.equal(localDayKey(a),'2026-10-14');
  assert.equal(dailyStage(a).id,'daily-2026-10-14');
  assert.equal(dailyStage(a).map,dailyStage(new Date(2026,9,14,18)).map);
  assert.notEqual(dailyStage(a).id,dailyStage(b).id);
  const c=new RacingCareer(memory());
  assert.equal(c.canDaily(),false);assert.equal(c.setDaily(a),false);
  for(let i=0;i<4;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  assert.equal(c.canDaily(),true);assert.equal(c.setDaily(a),true);
  assert.equal(c.stage.id,'daily-2026-10-14');assert.equal(c.nextStage(),c.index);
  c.setStage(3);assert.equal(c.dailySnapshot,null);
});
test('daily wins update best and streak once per day but never grant story stars or skins',()=>{
  const c=new RacingCareer(memory());
  for(let i=0;i<4;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  const before=careerStars(c.progress);
  const pass=date=>{
    const g=game();g.standings=[g.player,...g.racers.filter(x=>!x.isPlayer)];
    assert.equal(c.setDaily(date),true);c.begin(g);
    Object.assign(c.metrics,{pickups:9,cleanDrifts:9,cleanPasses:9,padCount:9,gateSpeed:250,survived:2,beatBoss:true});
    const out=c.finalize(g,{finished:true,place:1,time:80,stats:{crash:0}});
    assert.ok(out.stars>0);return out;
  };
  pass(new Date(2026,9,14,12));
  assert.equal(c.progress.daily.streak,1);assert.equal(c.progress.daily.best,80);
  assert.equal(careerStars(c.progress),before);
  pass(new Date(2026,9,14,18));assert.equal(c.progress.daily.streak,1);
  pass(new Date(2026,9,15,12));assert.equal(c.progress.daily.streak,2);
  const restored=loadCareer(JSON.stringify(c.progress));
  assert.equal(restored.daily.streak,2);assert.equal(restored.daily.lastWonDate,'2026-10-15');
  assert.equal(careerStars(restored),before);
});


test('雪地末位淘汰：正常赛道进度触发一次预警，末位淘汰不会悄悄发生',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<11;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  assert.equal(c.setStage(11),true);
  c.begin(g);
  const first=c.frame(g);
  assert.equal(first,null);
  assert.match(c.objectiveLabel(g),/末位|淘汰/);
  assert.equal(c.metrics.knockoutWarnings,1);
  assert.ok(c.drainNotices().some(x=>x.includes('警告')));
  c.frame(g);
  assert.equal(c.metrics.knockoutWarnings,1,'同一个淘汰点不能每帧重复弹出');
  assert.equal(c.drainNotices().length,0);
  g.racers[1].progress=360;g.racers[2].progress=405;
  g.standings=[g.racers[2],g.racers[1],g.player];
  assert.match(c.frame(g),/末位/);
  assert.equal(c.metrics.eliminated,true);
});


test('完整奖励视频后发生存档故障：临时补油但不虚报永久保存，玩家本次可自由参赛',async()=>{
  const rows=new Map();let failWrite=false;
  const store={getItem:k=>rows.get(k)??null,
    setItem(k,value){if(failWrite)throw Error('Storage quota exceeded');rows.set(k,value);}};
  const c=new RacingCareer(store);
  c.progress.stars['01']=1;c.progress.rounds=4;c.startedAt=Date.now()-120000;
  c.fuel.amount=2;
  const ad={
    closed:null,
    onClose(fn){this.closed=fn;},offClose(){},onError(){},offError(){},
    load(){return Promise.resolve();},
    show(){this.closed({isEnded:true});return Promise.resolve();},
  };
  c.setupAd({status:1,source:'check_ads_status',appId:'qa-app',
    screenOrientation:1,spaceId:'qa-slot'}, {createRewardedVideoAd(){return ad;}});
  assert.equal(c.canOfferAd(),true);
  failWrite=true;
  const out=await c.watchFuelAd();
  assert.equal(out.status,'session-credit');
  assert.equal(out.fuel,4);
  assert.equal(c.storageOK,false);assert.equal(c.fuelEnabled,false);
  assert.equal(c.canStart(),true,'do not punish user who fully watched the ad');
});


test('replaying item mode disposes unique item GPUs exactly once without double-disposing shared materials',()=>{
  const records={geometry:0,material:0,texture:0,missile:0,detach:0};
  const g={dispose(){records.geometry++;}},
    tex={dispose(){records.texture++;}},
    m={map:tex,dispose(){records.material++;}},
    missile={dispose(){records.missile++;}};
  const system={missileGeo:missile,
    group:{traverse(fn){fn({geometry:g,material:m});fn({geometry:g,material:m});}},
    dispose(){records.detach++;}};
  assert.equal(installItemCleanup(system),true);
  assert.equal(installItemCleanup(system),false);
  system.dispose();system.dispose();
  assert.deepEqual(records,{geometry:1,material:1,texture:1,missile:1,detach:1});
});
test('thinned native item routes dispose deleted box geometries, leave shared skins intact',()=>{
  let meshClean=0,materialClean=0;
  const removed=[],boxes=Array.from({length:20},(_,i)=>({g:{
    i,traverse(fn){fn({geometry:{dispose(){meshClean++;}},
      material:{dispose(){materialClean++;}}});}}}));
  const system={boxes,group:{remove(g){removed.push(g);}}};
  assert.equal(thinItemBoxes(system),12);
  assert.equal(meshClean,12);assert.equal(materialClean,0);
  assert.equal(system.boxes.length,8);
});

test('career skilled opponents stay competitive after repeated player crashes without changing grid or progress',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<5;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(5);g.racers[1].skill=.85;g.racers[2].skill=1.05;
  const before=g.racers.map(r=>r.progress);c.begin(g);
  assert.ok(Math.abs(g.racers[1].skill-1.18)<1e-9);
  assert.ok(Math.abs(g.racers[2].skill-1.34)<1e-9);
  assert.deepEqual(g.racers.map(r=>r.progress),before);
  assert.equal(g.player.skill,undefined);
});
test('career expert skill band and named boss escalate while tutorial difficulty stays native',()=>{
  const c=new RacingCareer(memory()),g=game();g.racers[1].skill=.55;g.racers[2].skill=.75;
  c.begin(g);assert.equal(g.racers[1].skill,.55);assert.equal(g.racers[2].skill,.75);
  for(let i=0;i<12;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(12);g.racers[1].skill=1.2;g.racers[2].skill=1.38;c.begin(g);
  assert.equal(c.boss.skill,1.58);
  assert.ok(Math.abs(g.racers[2].skill-1.54)<1e-9);
});
