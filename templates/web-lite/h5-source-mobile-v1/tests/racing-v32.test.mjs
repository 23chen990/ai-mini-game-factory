import test from 'node:test';
import assert from 'node:assert/strict';
import {RivalPressure,tuneOpponentField,OPPONENT_PACE_V39} from '../racing/rival-pressure.mjs';
import {STAGES,dailyStage} from '../racing/career.mjs';
import {roadHint} from '../racing/road-coach.mjs';
const race=()=>{
  const player={isPlayer:true,progress:140,s:45,spin:0,wrongWay:0,finished:false};
  const rival={name:'追风者',isPlayer:false,progress:90,dist:90,s:37,nitroCd:5,nitroTime:0,spin:0,finished:false};
  return {state:'race',raceTime:25,player,racers:[player,rival],standings:[player,rival],
    track:{length:500,curvAhead:()=>.003}};
};
const stage={diff:1,mode:'speed',map:'city'};
test('AI native-nitro chase respects true leader, cooldown and one per lap without fake progress',()=>{
  const d=new RivalPressure(),g=race(),r=g.racers[1],p=g.player;
  const positions=[r.progress,p.progress,r.dist,r.s,g.standings[0]];
  assert.deepEqual(d.frame(g,stage),{name:'追风者',gap:50});
  assert.equal(r.nitroCd,.65);
  assert.deepEqual([r.progress,p.progress,r.dist,r.s,g.standings[0]],positions);
  r.nitroCd=5;g.raceTime=50;assert.equal(d.frame(g,stage),null);
  r.progress=550;r.dist=50;p.progress=600;g.raceTime=51;
  assert.deepEqual(d.frame(g,stage),{name:'追风者',gap:50});
});
test('AI nitro duels never punish last-place players, item races or any boss; no corners/spins',()=>{
  const d=new RivalPressure(),g=race(),r=g.racers[1];
  g.standings=[r,g.player];assert.equal(d.frame(g,stage),null);g.standings=[g.player,r];
  for(const cfg of [{...stage,kind:'boss',id:'16'},{...stage,kind:'boss',id:'13'},
    {...stage,id:'01'},{...stage,mode:'item'}])
    assert.equal(d.frame(g,cfg),null);
  g.track.curvAhead=()=>.02;assert.equal(d.frame(g,stage),null);
  g.track.curvAhead=()=>0;g.player.spin=1;assert.equal(d.frame(g,stage),null);
  assert.equal(r.nitroCd,5);
});
test('all four course themes can produce a close battle, but only with native AI cooldown',()=>{
  for(const map of ['city','egypt','aegean','snow']){
    const d=new RivalPressure(),g=race(),r=g.racers[1];
    g.raceTime=25;
    const result=d.frame(g,{...stage,map,diff:0,id:'02'});
    assert.deepEqual(result,{name:'追风者',gap:50});
    assert.equal(r.nitroCd,.65);
    r.nitroCd=5;g.raceTime=28;
    assert.equal(d.frame(g,{...stage,map,id:'02'}),null,'per-race chase cooldown');
  }
  const d=new RivalPressure(),g=race(),r=g.racers[1];
  const other={isPlayer:false,progress:170,dist:170,s:37,nitroCd:5,nitroTime:0,spin:0,finished:false};
  g.racers.push(other);g.standings=[other,g.player,r];
  assert.ok(d.frame(g,{...stage,id:'02'}),'second-place player may face a fair chase');
  const g2=race();g2.standings=[{},{},{},g2.player,g2.racers[1]];
  assert.equal(new RivalPressure().frame(g2,{...stage,id:'02'}),null,'rear field gets no added challenge');
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
  assert.deepEqual(tutorial.map(r=>r.skill),initial,'first race keeps generous tutorial AI');
  for(const id of ['02','04','05']) {
    const stage=STAGES.find(s=>s.id===id);
    const racers=[p,...grid(.55,.75)];
    const original=racers.map(r=>({progress:r.progress,dist:r.dist,stats:r.stats,skill:r.skill}));
    const report=tuneOpponentField(racers,stage);
    assert.equal(report.adjusted,5);
    assert.equal(report.ace,true);
    assert.ok(racers[1].skill>=.83&&racers[1].skill<=.87,'early field must no longer be passive');
    assert.ok(racers[5].skill>=1.30&&racers[5].skill<=1.40,'one credible early ace, still catchable');
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
    ['03',1.61,true],['06',1.54,true],['08',1.62,true],
    ['10',1.58,true],['11',1.62,true],['14',1.66,true],
    ['07',1.34,false],['09',1.34,false],['12',1.34,false],
  ];
  for(const [id,max,ace] of cases){
    const stage=STAGES.find(s=>s.id===id),lo=stage.diff===1?.85:1.2,
      hi=stage.diff===1?1.05:1.38,rivals=grid(lo,hi);
    const p=tuneOpponentField(rivals,stage);
    assert.equal(p.ace,ace,id);
    assert.ok(p.maximum<=max+.001,'no disproportionate difficulty spike stage '+id);
    assert.ok(p.maximum>=hi-.001,id+' original AI must not get weaker');
    assert.ok(p.maximum<=1.7,'AI hard safety bound '+id);
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
test('V3.9 nearby native chase uses actual nitro only once per lap with vulnerable stages protected',()=>{
  const stage={...STAGES[1]},g=race(),r=g.racers[1],p=g.player;
  r.nitroCd=9;
  const before=[r.progress,r.dist,r.s,p.progress,g.standings[0]];
  assert.deepEqual(new RivalPressure().frame(g,stage),{name:'追风者',gap:50});
  assert.equal(r.nitroCd,.65);
  assert.deepEqual([r.progress,r.dist,r.s,p.progress,g.standings[0]],before);
  for(const id of ['09','12','13','16']){
    const protectedStage=STAGES.find(s=>s.id===id);
    r.nitroCd=9;
    assert.equal(new RivalPressure().frame(g,protectedStage),null);
    assert.equal(r.nitroCd,9);
  }
  const p1=new RivalPressure();g.player.spin=2;assert.equal(p1.frame(g,stage),null);
  g.player.spin=0;g.player.wrongWay=.9;assert.equal(p1.frame(g,stage),null);
  g.player.wrongWay=0;g.standings=[r,g.player];
  assert.equal(p1.frame(g,stage),null,'falling last must never trigger a new chase');
});
