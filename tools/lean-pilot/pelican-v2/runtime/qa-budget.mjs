import {LEVELS} from './levels.mjs';

// Natural-play wall-clock time budget ONLY; never changes game speed or physics.
// Software rendering in Linux CI is substantially slower than phone hardware.
export const MIN_WALL_BUDGET_MS=135000;
export const MAX_WALL_BUDGET_MS=300000;
export function campaignWallBudgetMs(stage,overrideMs){
 if(overrideMs!==undefined){
  if(!Number.isFinite(overrideMs)||overrideMs<=0)throw Error('Invalid explicit QA wall limit');
  return overrideMs;
 }
 const level=LEVELS.find(l=>l.id===stage);
 if(!level)return MIN_WALL_BUDGET_MS;
 const naturalRideSeconds=level.distance/level.speed;
 return Math.min(MAX_WALL_BUDGET_MS,Math.max(MIN_WALL_BUDGET_MS,Math.ceil(naturalRideSeconds*3500)));
}
