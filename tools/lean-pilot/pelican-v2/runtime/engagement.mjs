import {LANES,unsafeFishLanes} from './safety.mjs';
// Fractional fish positions share one collision and visual coordinate.
export function fishRoadZ(fish){return Number.isFinite(fish?.z)?fish.z:LANES[fish.lane];}
// Preserve an earned barrier prize on the radar when a later vehicle also
// occupies the lane: the prize is reached first, while imminent danger remains
// authoritative. This never changes collision or collection mechanics.
export function earnedPrizePrecedesRisk(run,fish,forecast){
 if(!run||!fish?.bonus||!forecast||!(run.speed>0)||!Number.isFinite(fish.x)||!Number.isFinite(forecast.seconds))return false;
 const barrier=run.obstacles?.find(o=>o.id===fish.sourceObstacleId);
 if(!barrier?.jumped||!barrier?.passed)return false;
 const fishSeconds=(fish.x-run.distance)/run.speed;
 return fishSeconds>=0&&fishSeconds<=3&&fishSeconds+.55<forecast.seconds;
}
// HUD pacing follows authored beats, without changing simulation speed or
// hiding hazards. Protection is a distinct visual state and active-time timer.
export function coastBeat(run){
 if(run.reviveGrace>0)return {id:'protected',icon:'🛟',label:`保护 ${Math.ceil(run.reviveGrace)} 秒`};
 if(run.level.id!==1)return {id:'coast',icon:'🏁',label:'海岸路程'};
 if(run.distance<60)return {id:'teaching',icon:'🐟',label:'捕鱼热身'};
 if(run.distance<100)return {id:'jump-choice',icon:'↟',label:'跳障追金'};
 if(run.distance<205)return {id:'traffic',icon:'🚗',label:'预判车流'};
 if(run.distance<285)return {id:'climax',icon:'⚡',label:'最后冲刺'};
 return {id:'finish',icon:'🏁',label:'终点在前'};
}
// Pure, low-cost replay goals for Pelican Coast. No backend or hidden rewards.
// Each reward fish is visible, collectible by normal player movement, and
// placed after (not inside) a jumpable barrier.
export const BARREL_PRIZE_OFFSET = 9;

export function makeBarrierPrizes(levelId, obstacles, endDistance) {
  const prizes = [];
  for (const obstacle of obstacles) {
    if (obstacle.kind !== 'barrier') continue;
    const x = obstacle.x + BARREL_PRIZE_OFFSET;
    if (x >= endDistance - 8) continue;
    // Use the same arrival envelope as ordinary fish. A pedestrian's authored
    // lane is its sidewalk origin, not the lane it will occupy on arrival.
    if (unsafeFishLanes(obstacles.filter(o=>o!==obstacle),x).has(obstacle.lane)) continue;
    prizes.push({
      id: `l${levelId}-jump-${obstacle.id}`,
      x, lane: obstacle.lane, golden: true, bonus: true,
      sourceObstacleId: obstacle.id,
    });
  }
  return prizes;
}

export function fishPoints(fish) {
  if(fish.airborne)return 3;
  return (fish.golden ? 5 : 1) + (fish.bonus ? 2 : 0);
}

export function starRequirements(level) {
  const count = level.goal.count;
  return {
    bronze: count,
    silver: count + Math.ceil(count * .18),
    gold: count + Math.ceil(count * .4),
    goldFish: level.goal.gold + 1,
    jumps: level.mastery?.jumps ?? 1,
    streak: Math.ceil(count * .2) + 2,
  };
}

export function starChallengeText(level){const r=starRequirements(level);return `${r.gold} 条鱼、${r.goldFish} 条金鱼、跳过 ${r.jumps} 个路障、连续抓鱼 ${r.streak} 条且无碰撞`;}
export function masteryStatus(run){const r=starRequirements(run.level),chain=run.bestStreak??0;return {catch:{value:run.count,target:r.gold,done:run.count>=r.gold},gold:{value:run.gold,target:r.goldFish,done:run.gold>=r.goldFish},jump:{value:run.jumpedBarriers,target:r.jumps,done:run.jumpedBarriers>=r.jumps},noHit:{done:run.hits===0},streak:{value:chain,target:r.streak,done:chain>=r.streak}};}

export function rateStars(level, run) {
  const req = starRequirements(level);
  if (run.reason !== 'complete') return 0;
  const silver = run.hits === 0 && run.count >= req.silver;
  const gold = silver && run.count >= req.gold && run.gold >= req.goldFish &&
    (run.jumpedBarriers ?? 0) >= req.jumps && (run.bestStreak ?? 0) >= req.streak;
  return 1 + Number(silver) + Number(gold);
}

export function nextStarTip(level, run) {
  const req = starRequirements(level);
  if (run.reason !== 'complete') return '先完成本关捕鱼与路程目标';
  if (rateStars(level, run) === 3) return '三星达成！挑战更长的捕鱼连击纪录';
  if (run.hits > 0) return '下次不碰撞，再挑战高星';
  // A replay tip must not imply that fixing one easy condition earns three
  // stars when the player also missed the genuine jumping requirement.
  // Surface two independent, attainable changes without crowding small H5 UI.
  const missing = [];
  if ((run.jumpedBarriers ?? 0) < req.jumps)
    missing.push(`跳过 ${req.jumps - (run.jumpedBarriers ?? 0)} 个路障`);
  if (run.count < req.gold) missing.push(`再抓 ${req.gold - run.count} 条鱼`);
  if (run.gold < req.goldFish) missing.push(`再抓 ${req.goldFish - run.gold} 条金鱼`);
  if ((run.bestStreak ?? 0) < req.streak) missing.push(`连续抓到 ${req.streak} 条鱼`);
  if (missing.length) return `冲击三星：${missing.slice(0,2).join('，')}${missing.length>2?'等目标':''}`;
  return '继续挑战个人捕鱼纪录';
}

const isNonnegativeInt = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
export function newBestEntry() { return { fish: 0, gold: 0, jumps: 0, score: 0, streak: 0 }; }
export function normalizeBest(raw) {
  if (!Array.isArray(raw) || raw.length !== 5) return Array.from({ length: 5 }, newBestEntry);
  return raw.map(entry => {
    const clean = newBestEntry();
    if (entry && typeof entry === 'object' && !Array.isArray(entry))
      for (const key of Object.keys(clean)) if (isNonnegativeInt(entry[key])) clean[key] = entry[key];
    return clean;
  });
}
export function updateBest(save, run) {
  if (!Array.isArray(save.best) || save.best.length !== 5) save.best = normalizeBest(null);
  if (run.reason !== 'complete') return;
  const best = save.best[run.level.id - 1];
  best.fish = Math.max(best.fish, run.count);
  best.gold = Math.max(best.gold, run.gold);
  best.jumps = Math.max(best.jumps, run.jumpedBarriers ?? 0);
  best.score = Math.max(best.score, run.rewardScore ?? run.score);
  best.streak = Math.max(best.streak, run.bestStreak ?? 0);
}
export function allStars(save) {
  return Array.isArray(save.stars) ? save.stars.reduce((s, n) => s + n, 0) : 0;
}
// Keep the visible prize trail after a real jump while side fish remain optional.
// This changes only the HUD cue; collection still uses the ordinary hit test.
export function selectFishCue(run){
 const available=run.fishes.filter(f=>!f.caught&&!f.forfeited&&(!f.airborne||run.gliding)&&f.x-run.distance>1&&f.x-run.distance<35&&(!f.bonus||run.obstacles.some(o=>o.id===f.sourceObstacleId&&o.jumped===true)));
 return available.find(f=>f.bonus&&run.obstacles.some(o=>o.id===f.sourceObstacleId&&o.jumped===true&&o.passed===true))??available[0];
}
