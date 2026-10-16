/** V4.0: make rivals race like rivals, not six identical rails.
 * Pace remains native AICar skill. This layer adds bounded driver personality:
 * different lateral preferences, safe straight-line passing attempts and light
 * corner defense. It never teleports cars, edits progress, edits speed directly,
 * changes collision results or rubber-bands the field to the player.
 */
export const OPPONENT_PACE_V40=Object.freeze({
  // Beginner stages get a real contest without turning the first race into a wall.
  '02':{from:[.55,.75],to:[.67,.86],ace:.03},
  '04':{from:[.55,.75],to:[.67,.86],ace:.03},
  '05':{from:[.55,.75],to:[.62,.81],ace:.02},
  // Mid-game opponents now live much closer to the native "熟练/车神" band.
  '03':{from:[.85,1.05],to:[1.20,1.36],ace:.025},
  '06':{from:[.85,1.05],to:[1.05,1.20],ace:.015},
  '07':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '08':{from:[.85,1.05],to:[1.20,1.36],ace:.025},
  '09':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '10':{from:[.85,1.05],to:[1.05,1.20],ace:.02},
  '12':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  // Hard stages already have the native top skill range; only personality changes.
  '11':{from:[1.20,1.38],to:[1.20,1.38],ace:.025},
  '14':{from:[1.20,1.38],to:[1.20,1.38],ace:.03},
});

export const OPPONENT_PACE_V39=OPPONENT_PACE_V40;

/** V4.2 fixed entry strengths after observing a real user still wins too easily.
 * The native "rubber" formula used to slow a leader the farther they got ahead.
 * These ranges are chosen *before* the green light, not from the player's
 * performance or lap gap. Mix a fast rival, a solid pack and beatable cars,
 * so late passes remain earned and overtaking objectives remain possible.
 * Stage 01 remains a teaching race; boss stages use their own named rival.
 */
export const COMPETITIVE_FIELD_V42=Object.freeze({
  '02':[.78,1.16], '03':[1.02,1.46], '04':[.76,1.13],
  '05':[.77,1.12], '06':[.99,1.38], '07':[1.06,1.40],
  '08':[1.09,1.45], '09':[1.03,1.38], '10':[1.08,1.48],
  '11':[1.13,1.52], '12':[1.08,1.44],
  '14':[1.17,1.51], '15':[1.12,1.49],
});
const stageNumber=stage=>typeof stage?.course==='string'&&/^race-[0-9]{2}$/.test(stage.course)
  ? stage.course.slice(5) : /^[0-9]{2}$/.test(stage?.id??'')?stage.id:null;

/** Deterministic per-race field. No adaptation after the start, no direct
 * speed/progress updates, and no free nitro. AICar.update still runs unchanged.
 */
export function seedCompetitiveField(racers,stage){
  const id=stageNumber(stage);
  const band=COMPETITIVE_FIELD_V42[id];
  if(!band||!Array.isArray(racers))return {adjusted:0,ace:false};
  const field=racers.filter(r=>r&&!r.isPlayer&&Number.isFinite(r.skill));
  if(!field.length)return {adjusted:0,ace:false};
  const sorted=[...field].sort((a,b)=>a.skill-b.skill);
  // From stage 06 onward, one easy rival and one approachable rival stay
  // available, while the upper pack clusters closer to the fastest car.
  // Rank 3 is now contested by multiple actual native AI drivers, not one
  // super-fast leader above an otherwise passive queue. No rubber banding.
  const tightPack=Number(id)>=6&&sorted.length>=3;
  for(let index=0;index<sorted.length;index++){
    const fraction=sorted.length===1?1:index/(sorted.length-1);
    const upperPressure=tightPack ? .24*Math.sin(Math.PI*fraction) : 0;
    const weight=Math.min(1,fraction+upperPressure);
    const skill=band[0]+(band[1]-band[0])*weight;
    sorted[index].skill=+skill.toFixed(4);
  }
  return {adjusted:sorted.length,ace:true,minimum:band[0],maximum:band[1]};
}

/** No gap-dependent pace changes in career races. The unchanged native AI
 * motor receives rubber=1; its skill is the fixed pre-race value instead.
 * In menus or unrelated game modes the original native behavior is retained.
 */
export function careerPaceMultiplier(isCareerRace) {
  return isCareerRace ? 1 : null;
}

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
    const base=clamp(t.basePersonal+t.laneBias,-.42,.42);
    const curvature=Math.abs(track.curvAhead(rival.dist,90));
    let target=base;
    // Unlike the first draft (which noticed only the player), scan the real
    // physical traffic. An AI car in front can block another AI as well.
    // Side changes stay cosmetic-to-collision: native lateral acceleration
    // gradually moves the car and real Game.collide still handles contact.
    let blocker=null,blockerGap=Infinity;
    for(const car of game.racers) {
      if(car===rival||car.finished||!Number.isFinite(car.progress)||
         !Number.isFinite(car.lat)||!Number.isFinite(car.s))continue;
      const ahead=car.progress-rival.progress;
      if(ahead>7&&ahead<80&&ahead<blockerGap&&car.s>=20&&
         Math.abs(car.lat-rival.lat)<5.2&&rival.s>=car.s-3){
        blocker=car;blockerGap=ahead;
      }
    }
    if(blocker&&curvature<=.010&&rival.s>27) {
      const side=blocker.lat>rival.lat+.3?-1:blocker.lat<rival.lat-.3?1:t.passSide;
      target=clamp(t.basePersonal+side*t.passBias,-.42,.42);
    // A gentle, real inside-line defense when the player is genuinely behind.
    } else if(gap>=7&&gap<=55&&curvature>.005&&curvature<.018) {
      const curve=track.curvAhead(rival.dist,65);
      target=clamp(t.basePersonal-Math.sign(curve)*t.defendBias,-.42,.42);
    }
    if(Math.abs(rival.personal-target)>.015){rival.personal=target;changed++;}
  }
  return changed;
}

/** V4.2 native corner-exit planning.
 * A skilled opponent can recover an ordinary native nitro opportunity only
 * AFTER crossing a real medium/sharp bend cleanly and reaching a straight.
 * This never compares with player position to decide AI capability; if the
 * player leads, trails or drives badly, the same rival makes the same choice.
 * AICar.update still decides whether to accelerate and how fast to drive.
 */
export class RivalPressure {
  constructor() { this.reset(); }
  reset() { this.corners=new WeakMap(); }
  frame(game,stage) {
    applyRivalTactics(game,stage);
    if(!game||game.state!=='race'||!game.track||!game.player||
       !Array.isArray(game.racers)||!Number.isFinite(game.raceTime)||
       game.raceTime<12||stage?.mode!=='speed'||
       ['boss','elimination','relay'].includes(stage?.kind)||
       stageNumber(stage)==='01'||typeof game.track.curvAhead!=='function')
      return null;
    let observed=null;
    for(const rival of game.racers) {
      if(!rival||rival.isPlayer||rival.finished||!Number.isFinite(rival.dist)||
         !Number.isFinite(rival.s)||!Number.isFinite(rival.nitroCd))continue;
      const state=this.corners.get(rival)??{armed:false,last:-1e5};
      const bend=Math.abs(game.track.curvAhead(rival.dist,55));
      if(rival.s>=27&&bend>=.011&&!rival.airborne&&(rival.spin??0)<=0)
        state.armed=true;
      else if(bend<=.0055 && state.armed) {
        // Resolve the physical arc, not a clock-based or player-gap trigger.
        state.armed=false;
        if(rival.s>=32 && !rival.drifting && !rival.airborne &&
          (rival.spin??0)<=0 && (rival.slowTime??0)<=0 &&
          (rival.nitroTime??0)<=0 && rival.nitroCd>2.5 &&
          game.raceTime-state.last>=22){
          rival.nitroCd=Math.min(rival.nitroCd,.85);
          state.last=game.raceTime;
          if(!observed&&Number.isFinite(rival.progress)&&
            Number.isFinite(game.player.progress)&&
            Math.abs(rival.progress-game.player.progress)<=100)
            observed={name:rival.name||'对手',cornerExit:true};
        }
      }
      this.corners.set(rival,state);
    }
    return observed;
  }
}
