/** V4.0: make rivals race like rivals, not six identical rails.
 * Pace remains native AICar skill. This layer adds bounded driver personality:
 * different lateral preferences, safe straight-line passing attempts and light
 * corner defense. It never teleports cars, edits progress, edits speed directly,
 * changes collision results or rubber-bands the field to the player.
 */
export const OPPONENT_PACE_V40=Object.freeze({
  // Beginner stages get a real contest without turning the first race into a wall.
  '02':{from:[.55,.75],to:[.72,.94],ace:.035},
  '04':{from:[.55,.75],to:[.72,.94],ace:.035},
  '05':{from:[.55,.75],to:[.67,.87],ace:.025},
  // Mid-game opponents now live much closer to the native "熟练/车神" band.
  '03':{from:[.85,1.05],to:[1.20,1.36],ace:.035},
  '06':{from:[.85,1.05],to:[1.08,1.24],ace:.025},
  '07':{from:[.85,1.05],to:[1.20,1.36],ace:.02},
  '08':{from:[.85,1.05],to:[1.20,1.36],ace:.035},
  '09':{from:[.85,1.05],to:[1.20,1.36],ace:.02},
  '10':{from:[.85,1.05],to:[1.08,1.24],ace:.025},
  '12':{from:[.85,1.05],to:[1.20,1.36],ace:.02},
  // Hard stages already have the native top skill range; only personality changes.
  '11':{from:[1.20,1.38],to:[1.20,1.38],ace:.025},
  '14':{from:[1.20,1.38],to:[1.20,1.38],ace:.03},
});

const RIVAL_TACTICS_V40=Object.freeze([
  {role:'冲刺手',laneBias:-.08,passBias:.27,defendBias:.11,passSide:1},
  {role:'卡位手',laneBias:.09,passBias:.23,defendBias:.15,passSide:-1},
  {role:'追击手',laneBias:.04,passBias:.29,defendBias:.09,passSide:1},
  {role:'外线手',laneBias:-.13,passBias:.20,defendBias:.10,passSide:-1},
  {role:'内线手',laneBias:.13,passBias:.19,defendBias:.12,passSide:1},
  {role:'跟车手',laneBias:0,passBias:.16,defendBias:.08,passSide:-1},
]);

const nativeSkillByCar=new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function tuneOpponentField(racers,stage) {
  const id=typeof stage?.course==='string'&&/^race-\d{2}$/.test(stage.course)
    ? stage.course.slice(5)
    : typeof stage?.id==='string'&&/^\d{2}$/.test(stage.id) ? stage.id : null;
  if(!id||id==='01'||(stage.kind==='item'&&stage.diff===2)||
     !Array.isArray(racers))return {adjusted:0,ace:false};
  const config=OPPONENT_PACE_V40[id];
  if(!config||!Number.isInteger(stage.diff)||
    (stage.diff===0&&config.from[0]!==.55)||
    (stage.diff===1&&config.from[0]!==.85)||
    (stage.diff===2&&config.from[0]!==1.20))
    return {adjusted:0,ace:false};
  const field=racers.filter(r=>r&&!r.isPlayer&&Number.isFinite(r.skill));
  if(!field.length)return {adjusted:0,ace:false};
  const [srcLow,srcHigh]=config.from,[dstLow,dstHigh]=config.to;
  let leader=null,leaderBase=-Infinity;
  for(const rival of field) {
    if(!nativeSkillByCar.has(rival))nativeSkillByCar.set(rival,rival.skill);
    const base=nativeSkillByCar.get(rival);
    const q=clamp((base-srcLow)/(srcHigh-srcLow),0,1);
    rival.skill=+(dstLow+(dstHigh-dstLow)*q).toFixed(4);
    if(base>leaderBase){leader=rival;leaderBase=base;}
  }
  if(leader&&config.ace>0)
    leader.skill=+Math.min(dstHigh+.035,leader.skill+config.ace).toFixed(4);
  return {adjusted:field.length,ace:!!leader&&config.ace>0,
    maximum:Math.max(...field.map(r=>r.skill))};
}

/** Give each native AICar a stable driving personality.
 * 'personal' already exists in the pinned AI and is consumed by its native
 * racing-line calculation, so this changes line choice rather than physics.
 */
export function configureRivalTactics(racers,stage) {
  if(!Array.isArray(racers))return {configured:0};
  const field=racers.filter(r=>r&&!r.isPlayer&&Number.isFinite(r.personal));
  for(const [index,rival] of field.entries()) {
    const profile=RIVAL_TACTICS_V40[index%RIVAL_TACTICS_V40.length];
    if(!rival.__RACE_TACTIC__) {
      rival.__RACE_TACTIC__={
        role:profile.role,
        basePersonal:rival.personal,
        laneBias:profile.laneBias,
        passBias:profile.passBias,
        defendBias:profile.defendBias,
        passSide:profile.passSide,
      };
    }
    const t=rival.__RACE_TACTIC__;
    rival.personal=clamp(t.basePersonal+t.laneBias,-.42,.42);
    // The first two cars should form a visible front pack, not start miles behind.
    if(index===0)rival.startDelay=Math.min(rival.startDelay??0,.10);
    if(index===1)rival.startDelay=Math.min(rival.startDelay??0,.16);
    if(stage?.diff>=1&&index===0&&Number.isFinite(rival.nitroCd))
      rival.nitroCd=Math.min(rival.nitroCd,3.2);
  }
  return {configured:field.length};
}

/** Tactical line choice only. Native AICar still owns steering, speed, collision
 * and progress. Lane changes happen only on readable straight/medium-speed
 * sections, and return to the driver's baseline when no attack/defence exists.
 */
export function applyRivalTactics(game,stage) {
  if(!game||game.state!=='race'||!game.player||!game.track||!stage||
     !Array.isArray(game.racers)||typeof game.track.curvAhead!=='function')return 0;
  const {player,track}=game;
  let changed=0;
  for(const rival of game.racers) {
    const t=rival?.__RACE_TACTIC__;
    if(!t||rival.isPlayer||rival.finished||!Number.isFinite(rival.progress)||
       !Number.isFinite(rival.dist)||!Number.isFinite(rival.s))continue;
    const gap=rival.progress-player.progress; // + = rival ahead
    if(!Number.isFinite(gap)||Math.abs(gap)>90||Math.abs((rival.s??0)-(player.s??0))>28) {
      const base=clamp(t.basePersonal+t.laneBias,-.42,.42);
      if(Math.abs(rival.personal-base)>.015){rival.personal=base;changed++;}
      continue;
    }
    const curvature=Math.abs(track.curvAhead(rival.dist,90));
    let target=clamp(t.basePersonal+t.laneBias,-.42,.42);
    // Attack: only when the road is readable and the rival is genuinely behind.
    if(gap<=-8&&gap>=-90&&curvature<=.012&&rival.s>25&&player.s>25) {
      const side=player.lat>1.5?-1:player.lat< -1.5?1:
        (Math.floor(Math.max(0,player.progress)/track.length)+t.passSide)%2?1:-1;
      target=clamp(t.basePersonal+side*t.passBias,-.42,.42);
    // Defend: only a light inside-line preference as a corner approaches.
    } else if(gap>=7&&gap<=55&&curvature>.005&&curvature<.018) {
      const curve=track.curvAhead(rival.dist,65);
      target=clamp(t.basePersonal-Math.sign(curve)*t.defendBias,-.42,.42);
    }
    if(Math.abs(rival.personal-target)>.015){rival.personal=target;changed++;}
  }
  return changed;
}

/** Close-race native nitro: no progress/teleport/rubber-band hacks.
 * Only nudges an existing native cooldown; AICar still decides whether boost is legal.
 */
export class RivalPressure {
  constructor() { this.reset(); }
  reset() { this.lastAt=-Infinity; this.lastLap=new WeakMap(); }
  frame(game,stage) {
    applyRivalTactics(game,stage);
    if(!game||game.state!=='race'||!game.player||!game.track||
        !stage||stage.mode!=='speed'||['boss','elimination','relay'].includes(stage.kind)||
        stage.course==='race-01'||stage.id==='01')return null;
    const {player,track}=game;
    if(!Array.isArray(game.racers)||!Array.isArray(game.standings)||
        game.standings.indexOf(player)<0||game.standings.indexOf(player)>2||
        game.standings.at(-1)===player||!Number.isFinite(game.raceTime)||
        game.raceTime<17||game.raceTime-this.lastAt<19||player.finished||
        player.spin>0||player.wrongWay>.4||player.s<27||
        !Number.isFinite(track.length)||track.length<=0||
        typeof track.curvAhead!=='function')return null;
    let chosen=null;
    for(const rival of game.racers) {
      if(!rival||rival.isPlayer||rival.finished||
          !Number.isFinite(rival.progress)||!Number.isFinite(rival.dist)||
          !Number.isFinite(rival.nitroCd)||rival.nitroCd<2.5||rival.nitroCd>10||
          (rival.nitroTime??0)>0||(rival.spin??0)>0||rival.s<30)continue;
      const gap=player.progress-rival.progress;
      if(!Number.isFinite(gap)||gap<9||gap>115)continue;
      const lap=Math.floor(Math.max(0,rival.progress)/track.length);
      if(this.lastLap.get(rival)===lap)continue;
      if(Math.abs(track.curvAhead(rival.dist,120))>.006)continue;
      if(!chosen||gap<chosen.gap)chosen={rival,gap,lap};
    }
    if(!chosen)return null;
    chosen.rival.nitroCd=.65;
    this.lastLap.set(chosen.rival,chosen.lap);this.lastAt=game.raceTime;
    return {name:chosen.rival.name||'对手',gap:Math.round(chosen.gap)};
  }
}
