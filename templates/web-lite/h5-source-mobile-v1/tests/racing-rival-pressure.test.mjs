import test from 'node:test';
import assert from 'node:assert/strict';
import { RacingCareer } from '../racing/runtime.mjs';
import { configureRivalTactics, applyRivalTactics, tuneOpponentField, seedCompetitiveField, COMPETITIVE_FIELD_V42, careerPaceMultiplier } from '../racing/rival-pressure.mjs';

function rival(overrides = {}) {
  return {
    isPlayer: false, personal: 0, skill: .8, startDelay: .4, nitroCd: 5,
    progress: 70, dist: 500, s: 40, lat: 0, name: '测试对手',
    ...overrides,
  };
}

test('rivals receive distinct stable personalities without changing native physics fields', () => {
  const field = Array.from({ length: 6 }, (_, i) => rival({ personal: i % 2 ? .1 : -.1 }));
  const before = field.map(r => ({ skill: r.skill, personal: r.personal }));
  const result = configureRivalTactics(field, { diff: 1 });
  assert.equal(result.configured, 6);
  assert.equal(new Set(field.map(r => r.__RACE_TACTIC__.role)).size, 6);
  assert.equal(field[0].startDelay, .1);
  assert.equal(field[1].startDelay, .16);
  assert.equal(field[0].skill, before[0].skill);
  assert.ok(field.some((r, i) => r.personal !== before[i].personal));
});

test('a chasing rival moves toward an available passing side only on a readable straight', () => {
  const player = { isPlayer: true, progress: 100, lat: 2.8, s: 42 };
  const chaser = rival({ progress: 55, lat: 0 });
  const game = { state: 'race', player, racers: [player, chaser], track: {
    length: 1000, curvAhead: () => 0,
  }};
  configureRivalTactics([chaser], { diff: 1 });
  const base = chaser.personal;
  const changed = applyRivalTactics(game, { diff: 1 });
  assert.equal(changed, 1);
  assert.ok(chaser.personal < base, 'player on right should invite a left-side attack');
  assert.ok(Math.abs(chaser.personal - chaser.__RACE_TACTIC__.basePersonal) <= .42);
});

test('rival does not weave toward a pass through a sharp corner', () => {
  const player = { isPlayer: true, progress: 100, lat: 0, s: 40 };
  const chaser = rival({ progress: 55, lat: 0 });
  const game = { state: 'race', player, racers: [player, chaser], track: {
    length: 1000, curvAhead: () => .03,
  }};
  configureRivalTactics([chaser], { diff: 1 });
  const base = chaser.personal;
  const changed = applyRivalTactics(game, { diff: 1 });
  assert.equal(changed, 0);
  assert.equal(chaser.personal, base);
});

test('an ahead rival gets only a light inside-line defense, not a speed or progress change', () => {
  const player = { isPlayer: true, progress: 100, lat: 0, s: 40 };
  const leader = rival({ progress: 135, lat: 0, skill: 1.2, s: 40 });
  const game = { state: 'race', player, racers: [player, leader], track: {
    length: 1000, curvAhead: () => -.01,
  }};
  configureRivalTactics([leader], { diff: 1 });
  const before = { skill: leader.skill, progress: leader.progress, s: leader.s };
  const changed = applyRivalTactics(game, { diff: 1 });
  assert.equal(changed, 1);
  assert.ok(leader.personal > leader.__RACE_TACTIC__.basePersonal);
  assert.deepEqual({ skill: leader.skill, progress: leader.progress, s: leader.s }, before);
});

test('pace tuning remains bounded and never touches bosses or final item race', () => {
  const ordinary = Array.from({ length: 6 }, () => rival({ skill: .75 }));
  const tuned = tuneOpponentField(ordinary, { id: '02', course: 'race-02', diff: 0, kind: 'speed' });
  assert.equal(tuned.adjusted, 6);
  assert.ok(Math.max(...ordinary.map(r => r.skill)) <= .975);
  const boss = Array.from({ length: 6 }, () => rival({ skill: 1.3 }));
  assert.equal(tuneOpponentField(boss, { id: '13', course: 'race-13', diff: 2, kind: 'boss' }).adjusted, 0);
  const finalItem = Array.from({ length: 6 }, () => rival({ skill: 1.3 }));
  assert.equal(tuneOpponentField(finalItem, { id: '15', course: 'race-15', diff: 2, kind: 'item' }).adjusted, 0);
});

test('V4.2 sends five genuine opponents into a fixed, varied contest; never touches player state',()=>{
  const stage={id:'02',course:'race-02',diff:0,kind:'speed'};
  const player={isPlayer:true,skill:999,progress:55,s:55};
  const field=[player,...Array.from({length:5},(_,i)=>rival({skill:.55+.05*i,progress:5+i*8}))];
  const original=field.map(x=>({progress:x.progress,s:x.s}));
  const configured=seedCompetitiveField(field,stage);
  assert.deepEqual(configured,{adjusted:5,ace:true,minimum:.78,maximum:1.16});
  assert.deepEqual(field.slice(1).map(x=>x.skill),[.78,.875,.97,1.065,1.16]);
  assert.equal(player.skill,999);
  assert.deepEqual(field.map(x=>({progress:x.progress,s:x.s})),original,
    'must not teleport opponents or change physics velocity');
  const again=field.slice(1).map(x=>x.skill);
  seedCompetitiveField(field,stage);
  assert.deepEqual(field.slice(1).map(x=>x.skill),again,'fixed setup must be idempotent');
});

test('all 16 stages have intentional bands or an explicitly protected tutorial/boss',()=>{
  const expected=['02','03','04','05','06','07','08','09','10','11','12','14','15'];
  assert.deepEqual(Object.keys(COMPETITIVE_FIELD_V42).sort(),expected);
  for(const [id,band] of Object.entries(COMPETITIVE_FIELD_V42)){
    assert.ok(band[0]>.7&&band[1]<=1.55&&band[0]<band[1],id);
    const seed=seedCompetitiveField(Array.from({length:5},()=>rival({skill:.85})),
      {id,course:'race-'+id});
    assert.equal(seed.adjusted,5);
    assert.equal(seed.maximum,band[1]);
  }
  for(const id of ['01','13','16']){
    const rivals=[rival({skill:1.29})];
    assert.deepEqual(seedCompetitiveField(rivals,{id,course:'race-'+id}),{adjusted:0,ace:false});
    assert.equal(rivals[0].skill,1.29);
  }
});

test('daily racing strength follows underlying course; original native menu rubber stays separate',()=>{
  const stage={id:'daily-2026-10-17',course:'race-08',kind:'race',mode:'speed',diff:1};
  const one=[rival({skill:.9})];
  assert.equal(seedCompetitiveField(one,stage).maximum,1.45);
  assert.equal(one[0].skill,1.45);
  assert.equal(seedCompetitiveField([rival()],{id:'daily-2026-10-17',course:'invalid'}).adjusted,0);
  assert.equal(careerPaceMultiplier(true),1);
  assert.equal(careerPaceMultiplier(false),null);
});

test('rivals look for a safe pass around an ACTUAL other-AI blocker, not just the player',()=>{
  const player={isPlayer:true,progress:300,lat:0,s:39};
  const chaser=rival({progress:120,dist:200,lat:1,s:41});
  const blocker=rival({progress:150,dist:230,lat:4,s:39});
  const g={state:'race',player,racers:[player,chaser,blocker],track:{length:900,curvAhead:()=>0}};
  configureRivalTactics([chaser,blocker],{id:'08'});
  const base=chaser.personal;
  const changed=applyRivalTactics(g,{id:'08'});
  assert.ok(changed>=1);
  assert.ok(chaser.personal<base,
    'AI chaser should plan the open left side of the other AI, even if player is far away');
  assert.equal(chaser.progress,120);
  assert.equal(blocker.progress,150);
});

test('actual RacingCareer bridge removes leader slowdown but restores native behavior outside races',()=>{
  const storage={getItem:()=>null,setItem:()=>{}};
  const career=new RacingCareer(storage);
  const nativeCalls=[];
  const game={state:'menu',rubber:r=>{nativeCalls.push(r);return .88;},
    checkRaceEnd:()=>{},onItemGet:()=>{}};
  career.patchNative(game);
  const opponent={isPlayer:false},player={isPlayer:true};
  assert.equal(game.rubber(opponent),.88,'pre-race demo keeps native behavior');
  career.active=true;game.state='race';
  assert.equal(game.rubber(opponent),1,'career leader must never be artificially slowed');
  assert.equal(game.rubber(player),.88,'player is not an AICar');
  assert.equal(game.rubber(opponent),1,'a trailing rival also gets no artificial catch-up');
  career.active=false;
  assert.equal(game.rubber(opponent),.88,'outside the race the original function is restored');
  assert.equal(nativeCalls.length,3,'native callable is preserved and only bypassed during career AI updates');
});
