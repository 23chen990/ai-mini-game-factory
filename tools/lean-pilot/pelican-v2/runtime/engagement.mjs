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
    const rivals = obstacles.filter(o => o !== obstacle && Math.abs(o.x - x) < 14 && o.lane === obstacle.lane);
    if (rivals.length) continue; // never put a reward behind a lethal same-lane hazard
    prizes.push({
      id: `l${levelId}-jump-${obstacle.id}`,
      x, lane: obstacle.lane, golden: true, bonus: true,
      sourceObstacleId: obstacle.id,
    });
  }
  return prizes;
}

export function fishPoints(fish) {
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
    time: level.seconds * .92,
  };
}

export function starChallengeText(level){const r=starRequirements(level);return `${r.gold} 条鱼、${r.goldFish} 条金鱼、跳过 ${r.jumps} 个路障、无碰撞及 ${r.time.toFixed(1)} 秒内完成`;}
export function masteryStatus(run){const r=starRequirements(run.level);return {catch:{value:run.count,target:r.gold,done:run.count>=r.gold},gold:{value:run.gold,target:r.goldFish,done:run.gold>=r.goldFish},jump:{value:run.jumpedBarriers,target:r.jumps,done:run.jumpedBarriers>=r.jumps},noHit:{done:run.hits===0},time:{target:r.time,done:run.elapsed<=r.time}};}

export function rateStars(level, run) {
  const req = starRequirements(level);
  if (run.reason !== 'complete') return 0;
  const silver = run.hits === 0 && run.count >= req.silver;
  const gold = silver && run.count >= req.gold && run.gold >= req.goldFish &&
    (run.jumpedBarriers ?? 0) >= req.jumps && run.elapsed <= req.time;
  return 1 + Number(silver) + Number(gold);
}

export function nextStarTip(level, run) {
  const req = starRequirements(level);
  if (run.reason !== 'complete') return '先完成本关捕鱼与路程目标';
  if (rateStars(level, run) === 3) return '三星达成！尝试刷新最多捕鱼纪录';
  if (run.hits > 0) return '下次不碰撞，再挑战高星';
  if (run.count < req.gold) return `再抓 ${req.gold - run.count} 条鱼，冲击三星`;
  if (run.gold < req.goldFish) return `再抓 ${req.goldFish - run.gold} 条金鱼，冲击三星`;
  if ((run.jumpedBarriers ?? 0) < req.jumps) return `再跳过 ${req.jumps - (run.jumpedBarriers ?? 0)} 个路障，冲击三星`;
  if (run.elapsed > req.time) return '下一次试着更快抵达终点';
  return '继续挑战个人捕鱼纪录';
}

const isNonnegativeInt = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
export function newBestEntry() { return { fish: 0, gold: 0, jumps: 0, score: 0 }; }
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
}
export function allStars(save) {
  return Array.isArray(save.stars) ? save.stars.reduce((s, n) => s + n, 0) : 0;
}
// Keep the visible prize trail after a real jump while side fish remain optional.
// This changes only the HUD cue; collection still uses the ordinary hit test.
export function selectFishCue(run){
 const available=run.fishes.filter(f=>!f.caught&&f.x-run.distance>1&&f.x-run.distance<35);
 return available.find(f=>f.bonus&&run.obstacles.some(o=>o.id===f.sourceObstacleId&&o.jumped===true&&o.passed===true))??available[0];
}
