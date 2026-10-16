import test from 'node:test';
import assert from 'node:assert/strict';
import {RivalPressure} from '../racing/rival-pressure.mjs';
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
  assert.equal(r.nitroCd,1);
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
    assert.equal(r.nitroCd,1);
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
