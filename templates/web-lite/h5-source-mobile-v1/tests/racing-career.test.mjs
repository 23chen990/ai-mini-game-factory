import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, newCareer, loadCareer, localDayKey, dailyStage, careerStars, stageUnlocked, skinUnlocked, recordStage, gradeStage, stageFailureFeedback, validDrift, fractionPassed } from '../racing/career.mjs';
import { thinItemBoxes, installItemCleanup, itemDecision, AutoItems, OvertakeTracker, awardCornerPass, removeEliminatedAi } from '../racing/items.mjs';
import { RacingCareer } from '../racing/runtime.mjs';
import { COMPETITIVE_FIELD_V42 } from '../racing/rival-pressure.mjs';
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
test('淘汰可视提示显示真实赛段进度、末位危险；过点和换关清除，不改动比赛',()=>{
  const c=new RacingCareer(memory()),g=game();c.index=11;c.begin(g);
  g.racers[2].progress=300;
  assert.equal(typeof c.eliminationCue,'function');
  const snapshot=JSON.stringify(g.racers.map(r=>({progress:r.progress,finished:r.finished})));
  assert.deepEqual(c.eliminationCue(g),{fraction:300/350,remaining:50,near:true,atRisk:true,place:3,count:3,round:1});
  assert.equal(JSON.stringify(g.racers.map(r=>({progress:r.progress,finished:r.finished}))),snapshot);
  g.standings=[g.player,g.racers[2],g.racers[1]];
  assert.equal(c.eliminationCue(g).atRisk,false);
  c.metrics.checkpoints=1;g.racers[2].progress=400;
  assert.equal(c.eliminationCue(g).round,2);
  assert.equal(c.eliminationCue(g).fraction,50/350);
  c.metrics.checkpoints=2;assert.equal(c.eliminationCue(g),null);
  c.index=0;assert.equal(c.eliminationCue(g),null);
});

test('failure diagnosis distinguishes authentic rank, technique and boss losses without awarding a pass',()=> {
  const cases=[
    [STAGES[2],result(1),{cleanPasses:0},/有效弯道超车 0\/2/],
    [STAGES[6],{...result(6),time:97.3},{},/第6名，要求前3名/],
    [STAGES[10],result(6),{cleanPasses:2},/第6名，要求前2名/],
    [STAGES[15],result(2),{beatBoss:false},/未超过指定车神/],
    [STAGES[14],result(4),{pickups:1},/实际拾取道具 1\/4/],
  ];
  for(const [stage,r,stats,expected] of cases){
    const before=JSON.stringify({r,stats});
    assert.equal(gradeStage(stage,r,stats),0);
    const advice=stageFailureFeedback(stage,r,stats);
    assert.match(advice.reason,expected);
    assert.ok(advice.tip.length>8);
    assert.equal(JSON.stringify({r,stats}),before,'diagnosis is read-only');
  }
  assert.match(stageFailureFeedback(STAGES[11],result(6),{eliminated:true}).reason,/淘汰点/);
  assert.match(stageFailureFeedback(STAGES[6],{finished:false,completion:.4},{}).reason,/40%/);
  assert.match(stageFailureFeedback(STAGES[15],result(4),{beatBoss:false}).reason,/要求前1名.*未超过指定车神/);
});

test('16 staged challenges use four biome worlds and eight distinct objectives',()=>{
  assert.equal(STAGES.length,16);assert.equal(new Set(STAGES.map(s=>s.map)).size,4);
  assert.ok(new Set(STAGES.map(s=>s.kind)).size>=8);assert.ok(STAGES.filter(s=>s.laps>1).length>=12);
  assert.equal(STAGES[0].laps,2);
});
test('overtake briefing explains how a genuine corner pass works, but still rejects rank-only wins',()=>{
  assert.match(STAGES[2].goal,/弯道或出弯.*超过对手 2 次/);
  assert.match(STAGES[10].goal,/弯道或出弯.*超过对手 3 次/);
  assert.equal(gradeStage(STAGES[2],result(1),{cleanPasses:0}),0);
  assert.equal(gradeStage(STAGES[10],result(1),{cleanPasses:1}),0);
});
test('unlock is linear, rank alone cannot pass an objective',()=>{
  let c=newCareer();assert.equal(stageUnlocked(c,1),false);
  c=recordStage(c,STAGES[0],result(),{}).career;
  assert.equal(stageUnlocked(c,1),true);assert.equal(stageUnlocked(c,2),false);
  assert.equal(gradeStage(STAGES[2],result(),{cleanPasses:0}),0);
  assert.ok(gradeStage(STAGES[2],result(),{cleanPasses:2}));
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
  assert.match(c.objectiveLabel(g),/1\/5/);
  assert.equal(gradeStage(c.stage,result(),c.metrics),0);
});
test('career UI objectives reflect real progress, not dummy counters',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<2;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(2);c.begin(g);
  assert.match(c.objectiveLabel(g),/0\/2/);
  c.metrics.cleanPasses=1;assert.match(c.objectiveLabel(g),/1\/2/);
  assert.equal(gradeStage(c.stage,result(),c.metrics),0);
  c.metrics.cleanPasses=2;
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
  assert.equal(gradeStage(c.stage,result(),c.metrics),0);
  c.onItemGet('nitro','box');
  assert.equal(c.metrics.pickups,2);
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

test('V4.6 native item rivals hold the fixed pre-race pace band without faking progress',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<5;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(5);g.racers[1].skill=.85;g.racers[2].skill=1.05;
  const before=g.racers.map(r=>r.progress);c.begin(g);
  assert.deepEqual(g.racers.slice(1).map(r=>r.skill),COMPETITIVE_FIELD_V42['06']);
  assert.ok(g.racers[2].skill-g.racers[1].skill >= .3,'a real strong rival contests a catchable pack');
  assert.deepEqual(g.racers.map(r=>r.progress),before);
  assert.equal(g.player.skill,undefined);
});
test('V4.6 overtaking rivals form a varied field with a contesting ace',()=>{
  const c=new RacingCareer(memory()),g=game();
  c.progress.stars['02']=1;c.setStage(2);g.racers[1].skill=.85;g.racers[2].skill=1.05;c.begin(g);
  assert.deepEqual(g.racers.slice(1).map(r=>r.skill),COMPETITIVE_FIELD_V42['03']);
  assert.ok(g.racers[2].skill>=1.4,'strongest opponent is no longer a passive road marker');
});
test('career retains the submitted expert field speeds while boss and middle field still escalate',()=>{
  const c=new RacingCareer(memory()),g=game();g.racers[1].skill=.55;g.racers[2].skill=.75;
  c.begin(g);assert.equal(g.racers[1].skill,1.16);assert.equal(g.racers[2].skill,1.60);
  for(let i=0;i<12;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(12);g.racers[1].skill=1.2;g.racers[2].skill=1.38;c.begin(g);
  assert.equal(c.boss.skill,2.04);
  assert.ok(Math.abs(g.racers[2].skill-1.92)<1e-9);
});
test('V4.6 expert opponent remains a physical ace with no progress edits',()=>{
  const c=new RacingCareer(memory()),g=game();
  for(let i=0;i<10;i++)c.progress.stars[String(i+1).padStart(2,'0')]=1;
  c.setStage(10);g.racers[1].skill=1.2;g.racers[2].skill=1.38;
  const before=g.racers.map(r=>r.progress);c.begin(g);
  assert.deepEqual(g.racers.slice(1).map(r=>r.skill),COMPETITIVE_FIELD_V42['11']);
  assert.ok(g.racers[2].skill>=1.5,'expert still has a meaningful native pace advantage');
  assert.deepEqual(g.racers.map(r=>r.progress),before);
  assert.equal(g.player.skill,undefined);
});

test('自动救援只影响完美三星，不额外扣油，不会误判为过弯超车',()=>{
  const s=STAGES[0];
  const normal=gradeStage(s,{finished:true,place:1,time:70,stats:{crash:0}},{rescues:0});
  const rescued=gradeStage(s,{finished:true,place:1,time:70,stats:{crash:0}},{rescues:1});
  assert.equal(normal,3);
  assert.equal(rescued,2);
  const c=new RacingCareer(memory()),g=game();
  let count=0;
  g.player.h=Math.PI;g.player.wrongWay=3;g.track.sample=()=>({hd:0});
  g.resetPlayer=()=>{count++;g.player.wrongWay=0;};
  c.begin(g);
  assert.equal(c.frame(g),null);
  assert.equal(count,1);assert.equal(c.metrics.rescues,1);
  assert.equal(c.metrics.cleanPasses,0);
});


test('双键道具：背包只剩一件没有目标的护盾，超过18秒自动使用而非一直闲置',()=>{
  const player={isPlayer:true,progress:100,d:100,s:35,spin:0,items:['shield'],drifting:false,finished:false};
  const g={state:'race',itemMode:true,player,raceTime:3,racers:[player],standings:[player],
    missileWarn:0,track:{curvAhead:()=>.01},items:{swap(){}}};
  const auto=new AutoItems();
  assert.equal(auto.frame(g),false);
  g.raceTime=19;assert.equal(auto.frame(g),false,'preserve item for a useful moment');
  g.raceTime=22;assert.equal(auto.frame(g),true,'eventual auto-use frees the only slot');
  assert.equal(auto.frame(g),false,'cannot auto-use twice in same instant');
});

test('boss goals disclose rank + opponent gates; beating rival at sixth is not victory',()=>{
  assert.match(STAGES[12].goal,/前二名/);
  assert.match(STAGES[15].goal,/第一名/);
  assert.equal(gradeStage(STAGES[15],{finished:true,place:6,time:130,stats:{crash:1}},{beatBoss:true}),0);
  const c=new RacingCareer(memory()),g=game();c.index=15;c.begin(g);
  assert.match(c.objectiveLabel(g),/须前1名/);
  assert.match(c.objectiveLabel(g),/未超越/);
  g.standings=[g.player,g.racers[1],g.racers[2]];
  assert.match(c.objectiveLabel(g),/已超越/);
});

test('V4.8 hard time/drift gates reject previous relaxed objectives',()=>{
  assert.equal(STAGES[6].target,105);
  const ok={finished:true,place:3,time:104,stats:{crash:1}};
  assert.ok(gradeStage(STAGES[6],ok,{}));
  assert.equal(gradeStage(STAGES[6],{...ok,time:106},{}),0);
  assert.equal(STAGES[3].target,5,'opening chapter demands proper technical drifting');
  const drive={finished:true,place:1,time:95,stats:{crash:0}};
  assert.equal(gradeStage(STAGES[3],drive,{cleanDrifts:5}),2);
  assert.equal(gradeStage(STAGES[3],drive,{cleanDrifts:6}),3);
});
test('V4.8 final boss and podium become significantly harder without touching race results',()=>{
  const career=new RacingCareer(memory()),g=game();
  career.index=15;
  g.racers[1].skill=1.38;g.racers[2].skill=1.32;
  const original=g.racers.map(x=>({progress:x.progress,s:x.s,d:x.d}));
  career.begin(g);
  assert.equal(career.boss.skill,2.10);
  assert.equal(g.racers[2].skill,1.52);
  assert.deepEqual(g.racers.map(x=>({progress:x.progress,s:x.s,d:x.d})),original);
  assert.equal(STAGES[15].rank,1);
  assert.equal(gradeStage(STAGES[15],{finished:true,place:2,time:130,stats:{crash:2}},{beatBoss:false}),0);
  assert.ok(gradeStage(STAGES[15],{finished:true,place:1,time:130,stats:{crash:2}},{beatBoss:true})>0);
});

test('V4.8 stage01 is NOT a tutorial pass: demands two full laps, rank and a true strong AI',()=>{
  const s=STAGES[0],c=new RacingCareer(memory()),g=game();
  // Real native AICars always have a .skill; the basic mock racer does not.
  g.racers[1].skill=.55;g.racers[2].skill=.75;
  assert.equal(s.laps,2);assert.equal(s.rank,3);assert.equal(s.diff,1);
  assert.equal(gradeStage(s,{...result(4),time:86},{}),0);
  assert.ok(gradeStage(s,{...result(3),time:86},{}));
  const snapshot=g.racers.map(x=>({s:x.s,progress:x.progress,d:x.d}));
  c.begin(g);
  assert.ok(g.racers[1].skill>=1.16);
  assert.ok(g.racers[2].skill>=1.60);
  assert.deepEqual(g.racers.map(x=>({s:x.s,progress:x.progress,d:x.d})),snapshot);
});
test('V4.8 no easy rank gates remain across the sixteen stages',()=>{
  assert.equal(STAGES.length,16);
  for(const stage of STAGES){
    assert.ok(stage.rank<=3,'hard rank on stage '+stage.id);
    assert.ok(stage.laps>=2,'no one-lap novice tutorial '+stage.id);
    assert.equal(gradeStage(stage,{finished:true,place:4,time:1,stats:{crash:0}},
      {gateSpeed:300,cleanDrifts:100,cleanPasses:100,pickups:100,survived:2,beatBoss:true,padCount:10}),0,
      'fourth place is never a pass: '+stage.id);
  }
});
