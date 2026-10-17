import test from 'node:test';
import assert from 'node:assert/strict';
import {RivalPressure,tuneOpponentField,seedCompetitiveField,OPPONENT_PACE_V39} from '../racing/rival-pressure.mjs';
import {STAGES,dailyStage} from '../racing/career.mjs';
import {roadHint} from '../racing/road-coach.mjs';
const race=()=>{
  const player={isPlayer:true,progress:140,s:45,spin:0,wrongWay:0,finished:false};
  const rival={name:'追风者',isPlayer:false,progress:90,dist:90,lat:0,s:37,nitroCd:5,
    nitroTime:0,spin:0,slowTime:0,drifting:false,finished:false};
  return {state:'race',raceTime:25,player,racers:[player,rival],standings:[player,rival],
    track:{length:500,curvAhead:()=>.018}};
};
const stage={diff:1,mode:'speed',map:'city',course:'race-02',kind:'speed'};
test('native AI earns an opportunity only after a physically clean corner exit',()=>{
  const d=new RivalPressure(),g=race(),r=g.racers[1],p=g.player;
  const positions=[r.progress,p.progress,r.dist,r.s,g.standings[0]];
  assert.equal(d.frame(g,stage),null,'no free nitro on corner entry');
  assert.equal(r.nitroCd,5);
  g.raceTime=26;g.track.curvAhead=()=>.003;
  assert.deepEqual(d.frame(g,stage),{name:'追风者',cornerExit:true});
  assert.equal(r.nitroCd,.85);
  assert.deepEqual([r.progress,p.progress,r.dist,r.s,g.standings[0]],positions);
  r.nitroCd=5;g.raceTime=27;
  assert.equal(d.frame(g,stage),null,'one physical exit cannot generate two boosts');
  g.raceTime=29;g.track.curvAhead=()=>.018;d.frame(g,stage);
  g.raceTime=30;g.track.curvAhead=()=>.003;
  assert.equal(d.frame(g,stage),null,'must wait >22s before another earned opportunity');
  assert.equal(r.nitroCd,5);
  g.raceTime=54;g.track.curvAhead=()=>.018;d.frame(g,stage);
  g.raceTime=55;g.track.curvAhead=()=>.003;
  assert.deepEqual(d.frame(g,stage),{name:'追风者',cornerExit:true});
  assert.equal(r.nitroCd,.85);
});
test('the same real corner produces the SAME AI capability whether player leads or trails',()=>{
  for(const playerProgress of [-300,0,140,300,1000]){
    const g=race(),d=new RivalPressure(),r=g.racers[1];
    g.player.progress=playerProgress;g.standings=playerProgress>r.progress?[g.player,r]:[r,g.player];
    d.frame(g,stage);g.raceTime=26;g.track.curvAhead=()=>.003;
    d.frame(g,stage);
    assert.equal(r.nitroCd,.85,'no catch-up/leader penalty: '+playerProgress);
  }
});
test('clean native corner boost works in every speed race, including former tutorial and bosses',()=>{
  for(const cfg of [{...stage,id:'01',course:'race-01'},
    {...stage,kind:'boss',id:'13',course:'race-13'},
    {...stage,kind:'elimination',id:'12',course:'race-12'},
    {...stage,kind:'relay',id:'09',course:'race-09'},
    {...stage,mode:'item',id:'06',course:'race-06'}]){
    const g=race(),d=new RivalPressure(),r=g.racers[1];
    d.frame(g,cfg);g.track.curvAhead=()=>.003;g.raceTime=26;
    const expected=cfg.mode==='item'?null:{name:'追风者',cornerExit:true};
    assert.deepEqual(d.frame(g,cfg),expected,JSON.stringify(cfg));
    assert.equal(r.nitroCd,cfg.mode==='item'?5:.85,JSON.stringify(cfg));
  }
});
test('all four biomes support clean corner-line decisions, but spins prevent rewards',()=>{
  for(const map of ['city','egypt','aegean','snow']){
    const g=race(),d=new RivalPressure(),r=g.racers[1];
    d.frame(g,{...stage,map});g.raceTime=26;g.track.curvAhead=()=>.003;
    r.spin=.6;assert.equal(d.frame(g,{...stage,map}),null);
    assert.equal(r.nitroCd,5);
  }
});
const hint=()=>({state:'race',map:{id:'city'},player:{d:100,s:40,wrongWay:0,airborne:false,finished:false},
  track:{length:2000,curvAhead:()=>0},itemMode:false});
test('sharp real corner warning beats speed reward; pad direction follows actual native lateral position',()=>{
  const g=hint();g.track.boostPads=[{d:170,lat:-6}];
  g.track.curvAhead=()=>.028;assert.match(roadHint(g),/左急弯/);
  g.track.curvAhead=()=>0;assert.match(roadHint(g),/右侧有加速带/);
  g.track.boostPads=[{d:170,lat:6}];assert.match(roadHint(g),/左侧有加速带/);
});
test('signed successive curves produce map-specific S warnings without any new driving controls',()=>{
  const g=hint();g.track.curvAhead=d=>d<160?.019:-.018;
  assert.match(roadHint(g),/城市连续S弯/);g.map.id='aegean';
  assert.match(roadHint(g),/海湾连续弯/);
});
test('random item cannot be announced as known; jump/bridge hints require actual native geometry',()=>{
  const g=hint();g.itemMode=true;g.items={boxes:[{}]};g.player.d=165;
  assert.match(roadHint(g),/随机道具.*左右选择车道/);
  g.itemMode=false;g.player.d=100;g.map.id='egypt';
  g.track.vcurv=Float32Array.from([0,-.029]);g.track.sample=()=>({i:1});
  assert.match(roadHint(g),/沙漠跳台/);
  g.map.id='snow';g.track.bridge=Uint8Array.from([0,1]);g.track.sample=d=>({i:d<120?0:1});
  assert.match(roadHint(g),/雪岭高架/);
});
test('hints are disabled when not racing, airborne or wrong way',()=>{
  const g=hint();g.track.curvAhead=()=>.02;
  g.state='paused';assert.equal(roadHint(g),'');g.state='race';
  g.player.airborne=true;assert.equal(roadHint(g),'');g.player.airborne=false;
  g.player.wrongWay=1;assert.equal(roadHint(g),'');
});


const grid=(lo,hi)=>Array.from({length:5},(_,i)=>({
  isPlayer:false,name:'rival'+i,skill:lo+(hi-lo)*i/4,
  progress:123+i*7,dist:123+i*7,s:38,
  nitroCd:6,stats:{crash:i},finished:false
}));
test('V3.9 AI is one measured notch stronger in early real races, without an overpowered field',()=>{
  const p={isPlayer:true,skill:1,progress:20,stats:{crash:3}};
  const tutorial=[p,...grid(.55,.75)],initial=tutorial.map(r=>r.skill);
  assert.deepEqual(tuneOpponentField(tutorial,STAGES[0]),{adjusted:0,ace:false});
  assert.deepEqual(tutorial.map(r=>r.skill),initial,'legacy tune step alone must not mutate the player or grid');
  assert.equal(seedCompetitiveField(tutorial,STAGES[0]).adjusted,5,'stage01 gets a real hard grid');
  assert.ok(tutorial[5].skill>=1.60,'stage01 fastest opponent cannot remain at rookie pace');
  for(const id of ['02','04','05']) {
    const stage=STAGES.find(s=>s.id===id);
    const racers=[p,...grid(.55,.75)];
    const original=racers.map(r=>({progress:r.progress,dist:r.dist,stats:r.stats,skill:r.skill}));
    const report=tuneOpponentField(racers,stage);
    assert.equal(report.adjusted,5);
    assert.equal(report.ace,true);
    assert.ok(racers[1].skill>=.62&&racers[1].skill<.7,'all early rivals become meaningfully competent');
    assert.ok(racers[5].skill<=.9,'rookie ace cannot become a boss');
    assert.deepEqual(racers.map(r=>({progress:r.progress,dist:r.dist,stats:r.stats})),
      original.map(({progress,dist,stats})=>({progress,dist,stats})),'no synthetic rank/progress/crash edits');
    assert.equal(racers[0].skill,p.skill,'never adjust player skill');
    const first=racers.map(r=>r.skill);
    tuneOpponentField(racers,stage);
    assert.deepEqual(racers.map(r=>r.skill),first,'idempotent even if race begin is accidentally called twice');
  }
});
test('V3.9 boosts selected regular rivals but protects fragile goals, experts and bosses',()=>{
  const cases=[
    ['03',1.385,true],['06',1.215,true],['08',1.385,true],
    ['10',1.22,true],['11',1.405,true],['14',1.41,true],
    ['07',1.34,false],['09',1.34,false],['12',1.34,false],
  ];
  for(const [id,max,ace] of cases){
    const stage=STAGES.find(s=>s.id===id),lo=stage.diff===1?.85:1.2,
      hi=stage.diff===1?1.05:1.38,rivals=grid(lo,hi);
    const p=tuneOpponentField(rivals,stage);
    assert.equal(p.ace,ace,id);
    assert.ok(p.maximum<=max+.001,'no disproportionate difficulty spike stage '+id);
    assert.ok(p.maximum>=hi-.001,id+' original AI must not get weaker');
  }
  for(const id of ['13','15','16']){
    const stage=STAGES.find(s=>s.id===id);
    const rivals=grid(1.2,1.38),original=rivals.map(r=>r.skill);
    assert.equal(tuneOpponentField(rivals,stage).adjusted,0);
    assert.deepEqual(rivals.map(r=>r.skill),original,'protected '+id+' unchanged');
  }
  assert.equal(Object.keys(OPPONENT_PACE_V39).length,12);
});
test('Daily challenge uses the original course difficulty, never an arbitrary harder daily ID',()=>{
  const stage=dailyStage(new Date(2026,9,16,12));
  const base=STAGES.find(s=>s.course===stage.course);
  assert.ok(base);
  const [lo,hi]=base.diff===0?[.55,.75]:base.diff===1?[.85,1.05]:[1.2,1.38];
  const field=grid(lo,hi),result=tuneOpponentField(field,stage);
  if(['01','12','13','15','16'].includes(base.id))assert.equal(result.adjusted,0);
  else assert.equal(result.adjusted,5);
  const wrong=grid(.55,.75);
  assert.equal(tuneOpponentField(wrong,{id:'daily-odd',course:'invalid',diff:0}).adjusted,0);
});
test('skill-based exit decision cannot be triggered by a stationary enemy or by a straight-only map',()=>{
  const g=race(),r=g.racers[1],d=new RivalPressure();
  g.track.curvAhead=()=>0;
  d.frame(g,stage);
  assert.equal(r.nitroCd,5);
  g.track.curvAhead=()=>.019;g.raceTime=30;r.s=12;d.frame(g,stage);
  g.track.curvAhead=()=>0;g.raceTime=31;r.s=37;d.frame(g,stage);
  assert.equal(r.nitroCd,5,'must enter the curve at real driving speed');
});
