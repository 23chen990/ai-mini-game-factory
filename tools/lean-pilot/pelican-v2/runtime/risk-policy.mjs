// Enough time to physically reach the real +9m fish at the slowest level,
// without forcing a rider to wait into the next close barrier.
export const CAPTURE_HOLD_MS = 1200;
// Match the real 2.25s mobile jump buffer and visible READY button, rather
// than waiting until a software-rendered HUD is only 0.5s from collision.
export const JUMP_WINDOW_SECONDS = 2.25;
export const TARGET_WINDOW_LEAD_METERS = 48;
export const TARGET_WINDOW_TRAIL_METERS = 10;

export const RISK_LEVELS = Object.freeze([
 {id:1,name:'海岸出发',weather:'clear',speed:7.5,targets:[['l1-o4',75],['l1-o1',140],['l1-o7',205],['l1-o3',233]]},
 {id:2,name:'行人出没',weather:'clear',speed:8,targets:[['l2-o3',246],['l2-o5',356]]},
 {id:3,name:'危险公路',weather:'clear',speed:8.8,targets:[['l3-o3',222],['l3-o5',360]]},
 {id:4,name:'雨中骑行',weather:'rain',speed:9.2,targets:[['l4-o3',225],['l4-o5',350],['l4-o10',593]]},
 {id:5,name:'夜间赶海',weather:'dusk',speed:9.6,targets:[['l5-o3',210],['l5-o5',334],['l5-o10',584]]},
].map(level=>Object.freeze({
 ...level,
 targets:Object.freeze(level.targets.map(([barrierId,distance])=>Object.freeze({barrierId,distance,goldFishId:`l${level.id}-jump-${barrierId}`}))),
})));

const VEHICLES = new Set(['car','van','vehicle']);
const VEHICLE_ICONS = ['🚗','🚐','🚙','🚕','🚚','🚘'];
const laneIsVehicle = lane => lane?.danger === true && VEHICLES.has(lane.kind);
const laneIsImminent = lane => lane?.danger === true && Number.isFinite(lane.seconds) && lane.seconds <= 3;
const laneIsBlocked = (lane,{allowReward=false}={})=>{
 if(laneIsVehicle(lane))return true;
 if(lane?.jumpReward===true&&allowReward)return false;
 return lane?.danger===true&&(lane.kind==='barrier'||laneIsImminent(lane));
};
const laneIndex = n => Math.max(0,Math.min(2,Number.isInteger(n)?n:1));
// A prize radar shows the nearest barrier on a lane, which may be a V5
// pressure gate rather than the *intended* earned jump 20-25m farther out.
// Honor only the actual player-visible seconds + HUD distance, with generous
// time-rounding tolerance; never use a hidden obstacle ID to steer a bot.
export function radarIsExpectedBarrier(view,lane,target,levelId){
 if(!lane?.danger||lane?.kind!=='barrier'||!Number.isFinite(lane.seconds)||
    !Number.isFinite(view?.distance)||!Number.isFinite(target?.distance))return false;
 const level=RISK_LEVELS.find(item=>item.id===levelId);
 if(!level)return false;
 const forecastX=view.distance+lane.seconds*level.speed;
 return Math.abs(forecastX-target.distance)<=level.speed+2.5;
}
const decision = (action,state,reason,toLane=null,countdown=null)=>({action,state,reason,toLane,countdown});

export function visibleLaneFromHud({className='',text=''}={}){
 const classes=new Set(String(className).split(/\s+/));
 const danger=classes.has('danger'),fish=classes.has('fish'),jumpReward=classes.has('jump-reward');
 const countdown=String(text).match(/(\d+(?:\.\d+)?)\s*s/)?.[1];
 const kind=jumpReward||text.includes('↟')?'barrier'
  :VEHICLE_ICONS.some(icon=>text.includes(icon))?'vehicle'
  :text.includes('🚶')?'pedestrian'
  :fish?'fish':'clear';
 return {danger,fish,jumpReward,kind,seconds:countdown===undefined?null:Number(countdown),text};
}

export function authoredGoldenFishByBarrier(levels){
 const index=Object.create(null);
 for(const level of Array.isArray(levels)?levels:[]){
  for(const fish of Array.isArray(level.fish)?level.fish:[]){
   if(fish.golden===true&&fish.bonus===true&&typeof fish.sourceObstacleId==='string'&&typeof fish.id==='string'){
    index[`${level.id}:${fish.sourceObstacleId}`]=fish.id;
   }
  }
 }
 return Object.freeze(index);
}

export function createRiskPolicyState(levelId,target){
 if(!Number.isInteger(levelId)||levelId<1||levelId>5)throw Error('Unknown risk level '+levelId);
 if(!target||typeof target.barrierId!=='string'||!Number.isFinite(target.distance))throw Error('Risk target requires barrierId and visible distance');
 return {levelId,target:{barrierId:target.barrierId,distance:target.distance},stage:'approach',jumpIssued:false,jumpAtMs:null,lastJumpCountdown:null,goldAtJump:null,committedRewardLane:null};
}

function moveOneLane(view,state,wantedLane,reason,allowRewardLane=null){
 const current=laneIndex(view.laneIndex);
 if(wantedLane===current)return decision('wait',state,reason,current);
 const next=current+Math.sign(wantedLane-current),allowReward=next===allowRewardLane;
 // If two future vehicles will close both the current and middle lanes,
 // immediately CROSS the middle lane while their public countdown is still
 // comfortably ahead. Otherwise "middle is red" prevents any two-lane escape
 // and traps a legitimate rider in the closing outside lane (rain 499m gate).
 // This is two ordinary adjacent taps, not teleportation or collision immunity.
 // Public HUD: an imminent pedestrian crossing can trap the rider on the
 // right directly before the rain 499m two-vehicle gate. Crossing a far-away
 // van is legitimate only while its visible countdown leaves a 3.5s buffer.
 // This still requires TWO normal adjacent touches, never teleportation.
 const currentVehicleEarly=laneIsVehicle(view.lanes[current])&&
  Number.isFinite(view.lanes[current].seconds)&&view.lanes[current].seconds>=3.5;
 const pedestrianEarlyExit=view.lanes[current]?.kind==='pedestrian'&&
  view.lanes[current]?.danger===true&&
  Number.isFinite(view.lanes[current].seconds)&&view.lanes[current].seconds>=1.5&&
  view.lanes[current].seconds<=4;
 const transitEarly=Math.abs(wantedLane-current)===2&&
  (currentVehicleEarly||pedestrianEarlyExit)&&laneIsVehicle(view.lanes[next])&&
  Number.isFinite(view.lanes[next].seconds)&&view.lanes[next].seconds>=3.5&&
  !laneIsBlocked(view.lanes[wantedLane]);
 if(laneIsBlocked(view.lanes[next],{allowReward})&&!transitEarly)
  return decision('wait',state,reason+'-adjacent-lane-blocked',current);
 return decision(next<current?'left':'right',state,transitEarly?reason+'-early-crossing':reason,next);
}

function chooseOrdinaryLane(view){
 const current=laneIndex(view.laneIndex),lanes=view.lanes;
 const safe=index=>!laneIsBlocked(lanes[index]);
 // During the 4-second public pedestrian warning, pre-stage a genuine
 // two-touch exit across a still-distant vehicle. At 3s it may already be
 // too late for normal touch/RPC latency, even though physics is unchanged.
 const opposite=2-current;
 const stageEarly=(current===0||current===2)&&lanes[current]?.danger===true&&
  lanes[current]?.kind==='pedestrian'&&Number.isFinite(lanes[current].seconds)&&
  lanes[current].seconds>=1.5&&lanes[current].seconds<=4&&
  laneIsVehicle(lanes[1])&&Number.isFinite(lanes[1].seconds)&&
  lanes[1].seconds>=3.5&&safe(opposite);
 if(stageEarly)return opposite;
 const safeFish=lanes.map((entry,index)=>entry?.fish===true&&safe(index)?index:-1).filter(index=>index>=0);
 if(laneIsBlocked(lanes[current])){
  return [
   ...safeFish.sort((a,b)=>Math.abs(a-current)-Math.abs(b-current)),
   ...[0,1,2].filter(index=>safe(index)).sort((a,b)=>Math.abs(a-current)-Math.abs(b-current)),
  ][0]??current;
 }
 if(safeFish.length)return safeFish.sort((a,b)=>Math.abs(a-current)-Math.abs(b-current))[0];
 return current;
}

export function decideRiskAction(view,state){
 const nextState={...state};
 const current=laneIndex(view.laneIndex),lanes=Array.isArray(view.lanes)?[...view.lanes]:[];
 while(lanes.length<3)lanes.push({});
 const nowMs=Number.isFinite(view.nowMs)?view.nowMs:0;

 if(state.stage==='capture'&&state.jumpIssued){
  if(laneIsVehicle(lanes[current])&&lanes[current].seconds<=1.5){
   nextState.stage='post-capture';
   const escape=chooseOrdinaryLane({...view,lanes});
   return moveOneLane({...view,lanes},nextState,escape,'capture-vehicle-escape');
  }
  // Keep the rider on the prize lane through the actual +9m fish.
  // Fixed wall-time holds delay the next jump when consecutive barriers are 20m apart;
  // require both a minimum verified hold and real HUD progress beyond the fish.
  // The HUD gold counter is user-visible, unlike hidden model events.
  // If it rises after clearing the barrier and reaching the +9m prize,
  // the rider can prepare the next tight turn immediately.
  const confirmedPrize=Number.isFinite(state.goldAtJump)&&Number.isFinite(view.goldCounter)&&
   view.goldCounter>state.goldAtJump&&Number.isFinite(view.distance)&&view.distance>=state.target.distance+7;
  const prizePassed=Number.isFinite(view.distance)&&view.distance>=state.target.distance+10;
  if(!confirmedPrize&&(nowMs-state.jumpAtMs<CAPTURE_HOLD_MS||!prizePassed))return decision('wait',nextState,'capture-hold',current);
  nextState.stage='post-capture';
 }

 const target=state.target;
 const inTargetWindow=Number.isFinite(view.distance)
  &&view.distance>=target.distance-TARGET_WINDOW_LEAD_METERS
  &&view.distance<=target.distance+TARGET_WINDOW_TRAIL_METERS;
 const rewardLane=lanes.findIndex(lane=>lane?.jumpReward===true&&
   radarIsExpectedBarrier(view,lane,state.target,state.levelId));
 // Back-to-back barriers may leave a different reward icon on the radar while
 // the correctly lined-up next barrier is already ready to jump. The button
 // is public player-visible feedback from the actual physics, not QA state.
 // Give it priority over an unrelated fish/reward lane; never jump into a car.
 if(inTargetWindow&&!state.jumpIssued&&current===state.committedRewardLane&&
    view.jumpReady===true&&view.distance<target.distance-3.15&&
    !laneIsVehicle(lanes[current])&&
    !(lanes[current]?.danger&&lanes[current]?.kind==='barrier'&&
      !radarIsExpectedBarrier(view,lanes[current],state.target,state.levelId))){
  nextState.stage='capture';nextState.jumpIssued=true;nextState.jumpAtMs=nowMs;
  nextState.lastJumpCountdown=Number.isFinite(lanes[current]?.seconds)?lanes[current].seconds:null;
  nextState.goldAtJump=Number.isFinite(view.goldCounter)?view.goldCounter:null;
  return decision('jump',nextState,'confirmed-next-barrier-ready',current,nextState.lastJumpCountdown);
 }
 if(inTargetWindow&&!state.jumpIssued&&rewardLane>=0&&!laneIsVehicle(lanes[rewardLane])&&
  (current===rewardLane||Number.isFinite(lanes[rewardLane].seconds)&&
   lanes[rewardLane].seconds<=(Math.abs(current-rewardLane)===2?4.5:lanes[current]?.fish!==true?3.65:2.7))){
  const targetLane=laneIndex(rewardLane),countdown=lanes[targetLane].seconds;
  // The visible jump reward may disappear behind another short-lived cue.
  // Keep the already-seen route rather than oscillating back toward safe fish.
  nextState.committedRewardLane=targetLane;
  if(current!==targetLane)return moveOneLane({...view,lanes},nextState,targetLane,'approach-jump-reward',targetLane);
  if(Number.isFinite(countdown)&&countdown<=JUMP_WINDOW_SECONDS){
   nextState.stage='capture';nextState.jumpIssued=true;nextState.jumpAtMs=nowMs;nextState.lastJumpCountdown=countdown;
   nextState.goldAtJump=Number.isFinite(view.goldCounter)?view.goldCounter:null;
   return decision('jump',nextState,'decimal-jump-window',current,countdown);
  }
  return decision('wait',nextState,'wait-for-decimal-jump-window',current,countdown);
 }

 if(inTargetWindow&&!state.jumpIssued&&Number.isInteger(state.committedRewardLane)){
  const committed=state.committedRewardLane;
  if(current!==committed)return moveOneLane({...view,lanes},nextState,committed,'continue-confirmed-jump-approach',committed);
  // The native button glows READY based on the real nearest low barrier.
  // Accept this player-visible signal even if the radar icon is momentarily
  // replaced by an ordinary fish. Never jump after the barrier is passed.
  if(view.jumpReady===true&&Number.isFinite(view.distance)&&view.distance<target.distance-3.15&&
     !(lanes[current]?.danger&&lanes[current]?.kind==='barrier'&&
       !radarIsExpectedBarrier(view,lanes[current],target,state.levelId))){
   nextState.stage='capture';nextState.jumpIssued=true;nextState.jumpAtMs=nowMs;
   nextState.lastJumpCountdown=null;
   nextState.goldAtJump=Number.isFinite(view.goldCounter)?view.goldCounter:null;
   return decision('jump',nextState,'visible-jump-button-ready',current,null);
  }
  return decision('wait',nextState,'hold-confirmed-reward-lane',current);
 }
 const wanted=chooseOrdinaryLane({...view,lanes});
 if(wanted!==current)return moveOneLane({...view,lanes},nextState,wanted,'visible-danger-or-fish');
 return decision('wait',nextState,'hold-safe-lane',current);
}
