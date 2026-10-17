import test from 'node:test';
import assert from 'node:assert/strict';
import {
  challengesFor,challengeResult,cfEliteChallenge,cfAdvanceAssault,
  cfStartExtraction,cfStepExtraction,cfCanOfferRevive
} from '../engine.mjs';
import {cfChooseDefenseSites,cfMissionDebrief,cfMissionFacts,
  cfResultFacts,mobileChallengeCopy} from '../fps-mobile-ux.mjs';

const challenges=challengesFor('cf-transport-ship');
const assault=challenges.find(x=>x.id==='assault');
const evac=challenges.find(x=>x.id==='evac');
const point={id:'B',x:-8,z:6.8},atPoint={alive:true,team:'BL',pos:{...point}};
const enemies=[{alive:true,team:'GR',pos:{x:15,z:7}}];
const hold=(state,t,{player=atPoint,bots=enemies,travel=35,kills=1,challenge=evac}={})=>
  cfStepExtraction(state,{gameTime:t,player,actors:bots,team:'BL',travel,kills,
    minTravel:challenge.minTravel,minKills:challenge.minKills,
    seconds:challenge.extractSeconds,radius:challenge.extractRadius});
function repeat(state,start,end,options={}){
 for(let x=start;x<=end+1e-7;x=+(x+.1).toFixed(3))state=hold(state,x,options);
 return state;
}

test('actual first A-attack location is required in addition to walked meters and displacement',()=>{
 const site={id:'A',x:-22,z:-6.8};
 let a=cfAdvanceAssault(assault,null,{
   kills:0,travel:0,x:-31,z:-6.8,alive:true,checkpoint:site});
 assert.equal(a.checkpointValid,true);
 assert.equal(a.checkpoint.id,'A','Authored navigable site identity preserved');
 a=cfAdvanceAssault(assault,a,{kills:3,travel:13,x:-20,z:7,alive:true});
 assert.equal(a.stage,0,'Long real walk away from site is not a capture');
 assert.equal(a.postKills,0);
 a=cfAdvanceAssault(assault,a,{kills:4,travel:18,x:-22,z:-6.8,alive:false});
 assert.equal(a.stage,0,'Dead body in checkpoint is not valid');
 a=cfAdvanceAssault(assault,a,{kills:5,travel:19,x:-22,z:-6.8,alive:true});
 assert.equal(a.stage,1);
 assert.equal(a.killBaseline,5,'Kills before checkpoint do not count');
 a=cfAdvanceAssault(assault,a,{kills:7,travel:20,x:-19,z:-6.5,alive:true});
 const m={assaultSiteValid:true,assaultStage:a.stage,
   assaultTravel:a.travel,assaultKills:a.postKills,deaths:1};
 assert.equal(challengeResult(assault,m,false).outcome,'won');
 assert.equal(challengeResult(assault,{...m,assaultSiteValid:false},false).outcome,'lost');
 assert.equal(challengeResult(assault,{...m,assaultStage:0},true).outcome,'lost');
 assert.equal(challengeResult(cfEliteChallenge(assault),
   {...m,assaultTravel:17},true).outcome,'lost');
 assert.match(mobileChallengeCopy(assault),/进攻位/);
 assert.match(cfMissionFacts(assault)[1].value,/攻坚位/);
 assert.match(cfMissionDebrief(assault,m,'won'),/真实走到进攻位/);
 const broken=cfAdvanceAssault(assault,null,{kills:0,travel:0,
   x:-31,z:-6.8,alive:true,checkpoint:{x:Infinity,z:-6.8}});
 assert.equal(broken.checkpointValid,false);
 assert.equal(challengeResult(assault,{
   assaultSiteValid:broken.checkpointValid,assaultStage:1,
   assaultTravel:100,assaultKills:99,deaths:0},false).outcome,'lost');
});

test('evac requires genuine personal kill, movement, uncontested checkpoint and 6 native seconds',()=>{
 assert.equal(cfStartExtraction(null).valid,false);
 assert.equal(cfStartExtraction({x:NaN,z:2}).valid,false);
 let x=cfStartExtraction(point);
 assert.equal(x.valid,true);
 assert.equal(x.site.id,'B','The real original-world extraction marker stays B');
 x=repeat(x,0,7,{travel:35,kills:0});
 assert.equal(x.extracted,false);
 assert.equal(x.held,0,'Teammate kills cannot substitute native own kill');
 x=repeat(x,7.1,13,{travel:34.9,kills:1});
 assert.equal(x.held,0,'Must actually walk 35m');
 x=repeat(x,13.1,16,{travel:35,kills:1,player:{...atPoint,alive:false}});
 assert.equal(x.held,0,'Dead player cannot hold extraction');
 const contestedBot={alive:true,team:'GR',pos:{x:-8,z:6.8}};
 x=repeat(x,16.1,25,{bots:[contestedBot]});
 assert.equal(x.held,0);
 assert.equal(x.contested,true,'Enemy actually in circle blocks extraction');
 x=repeat(x,25.1,31.8);
 assert.equal(x.extracted,true);
 assert.ok(x.held>=evac.extractSeconds);
 const full={kills:1,deaths:1,travel:35,evacSiteValid:x.valid,
   evacExtracted:x.extracted,evacHeldSec:x.held};
 assert.equal(challengeResult(evac,full,true,70000).outcome,'won');
 assert.equal(challengeResult(evac,{...full,evacExtracted:false},true,70000).outcome,'lost');
 assert.equal(challengeResult(evac,{...full,evacSiteValid:false},false).outcome,'lost');
 assert.equal(challengeResult(evac,full,true,69999).outcome,'lost');
 assert.equal(challengeResult(evac,{...full,kills:0},true,70000).outcome,'lost');
 assert.match(cfResultFacts(evac,full)[0].value,/已完成/);
 assert.match(cfMissionDebrief(evac,{...full,evacExtracted:false},'lost'),/坚守/);
});

test('no phantom capture from browser pause or a large native-time jump',()=>{
 let s=cfStartExtraction(point);
 s=hold(s,0);
 const jump=hold(s,1000);
 assert.ok(jump.held<=.25,'A throttled frame must not earn 1000 seconds');
 assert.equal(jump.extracted,false);
 assert.equal(hold(jump,500),jump,'Native simulation time cannot go backwards');
 let t=repeat(cfStartExtraction(point),0,3);
 const earlier=t.held;
 t=hold(t,3.1,{player:{alive:true,team:'BL',pos:{x:31,z:-6.8}}});
 assert.ok(t.held<earlier,'Leaving point loses control progress');
 const teamOnly=repeat(cfStartExtraction(point),0,9,{
   player:{alive:true,team:'BL',pos:{x:-31,z:-6.8}},
   bots:[{alive:true,team:'BL',pos:{...point}}]});
 assert.equal(teamOnly.held,0,'Team AI does not generate player-owned control');
});

test('extraction elite is genuinely tighter and requires independent eight-second hold',()=>{
 const elite=cfEliteChallenge(evac);
 assert.equal(elite.extractSeconds,8);
 assert.equal(elite.extractRadius,4.2);
 const borderline={alive:true,team:'BL',pos:{x:point.x+4.6,z:point.z}};
 let s=repeat(cfStartExtraction(point),0,9,{player:borderline,challenge:elite,travel:50,kills:2});
 assert.equal(s.extracted,false,'The more difficult elite radius stays 4.2m');
 s=repeat(s,9.1,17.6,{player:atPoint,challenge:elite,travel:50,kills:2});
 assert.equal(s.extracted,true);
 assert.equal(challengeResult(elite,{travel:50,kills:2,deaths:0,
   evacSiteValid:true,evacExtracted:true,evacHeldSec:s.held},true,80000).outcome,'won');
});

test('native route validation remains source-first, never a phantom A/B waypoint',()=>{
 const nav={idx:()=>2,walkable:()=>true,findPath:(x,z,tx,tz)=>[[x,z],[tx,tz]]};
 const player={pos:{x:-31,z:-7},team:'BL'};
 const bots=[{alive:true,team:'GR',pos:{x:30,z:6}}];
 const sites=cfChooseDefenseSites({player,nav,world:{blocked:()=>false},actors:bots});
 assert.deepEqual(sites?.map(s=>s.id),['A','B']);
 assert.ok(Math.hypot(sites[0].x-sites[1].x,sites[0].z-sites[1].z)>8);
 const badNav={...nav,findPath:()=>null};
 assert.equal(cfChooseDefenseSites({player,nav:badNav,world:{blocked:()=>false},actors:bots}),null);
 assert.equal(cfChooseDefenseSites({player,nav,world:{blocked:()=>true},actors:bots}),null);
});

test('no ad at impossible mission locations even on authentic death',()=>{
 const eligible={round:{phase:'running'},progress:{rounds:2},
   config:{status:1,source:'check_ads_status',appId:'FIXTURE',spaceId:'TEST',screenOrientation:1},
   sinceStartupMs:70000,sdkReady:true};
 assert.equal(cfCanOfferRevive({...eligible,challenge:assault,
   metrics:{deaths:3,assaultSiteValid:false}}),false);
 assert.equal(cfCanOfferRevive({...eligible,challenge:evac,
   metrics:{deaths:2,evacSiteValid:false}}),false);
 assert.equal(cfCanOfferRevive({...eligible,challenge:assault,
   metrics:{deaths:3,assaultSiteValid:true}}),true);
 assert.equal(cfCanOfferRevive({...eligible,challenge:evac,
   metrics:{deaths:2,evacSiteValid:true}}),true);
});
