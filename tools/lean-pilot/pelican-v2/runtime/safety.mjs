// Shared authoritative lane hazard forecast, used by placement, HUD, and tests.
// Pedestrians cross at a fixed time relative to the player's arrival at their x.
export const LANES = Object.freeze([-1.7, 0, 1.7]);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const PED_START_LEAD_SECONDS = 3.4;
const PED_CROSS_SECONDS = 4.3;
export const SAFE_LANE_WARNING_SECONDS = 4.5;

export function pedestrianZAtArrival(obstacle, run) {
  const velocity = Math.max(run.speed || run.level?.speed || 0, 0.01);
  const remaining = Math.max(0, (obstacle.x - run.distance) / velocity);
  const elapsedCross = obstacle.crossAt == null
    ? PED_START_LEAD_SECONDS
    : Math.max(0, run.elapsed - obstacle.crossAt + remaining);
  const p = clamp(elapsedCross / PED_CROSS_SECONDS, 0, 1);
  const side = obstacle.lane === 2 ? -1 : 1;
  return side * (-3.6 + 7.2 * p);
}

export function unsafeFishLanes(obstacles, x) {
  const bad = new Set();
  for (const o of obstacles) {
    const ahead = ['car', 'van'].includes(o.kind) ? 26 : o.kind === 'pedestrian' ? 26 : 9;
    const behind = o.kind === 'pedestrian' ? 12 : 11;
    if (x < o.x - ahead || x > o.x + behind) continue;
    if (o.kind === 'pedestrian') {
      // Crossing from left ends near right lane, from right ends near left lane.
      // Earlier V2 inverted this and sent fish onto the collision path.
      bad.add(o.lane === 2 ? 0 : 2);
    } else bad.add(o.lane);
  }
  return bad;
}

export function hazardForecast(obstacle, run) {
  if (obstacle.hit || obstacle.passed) return null;
  const speed = Math.max(0.01, run.speed || run.level?.speed || 0.01);
  const relative = obstacle.x - run.distance;
  if (relative < -2) return null;
  const seconds = Math.max(0, relative / (speed + (obstacle.speed || 0)));
  if (seconds > SAFE_LANE_WARNING_SECONDS) return null;
  let lanes;
  if (obstacle.kind === 'pedestrian') {
    const predicted = pedestrianZAtArrival(obstacle, run);
    // Include swept-collision width plus a small margin for real player reactions.
    lanes = [0, 1, 2].filter(i => Math.abs(LANES[i] - predicted) < .75);
  } else lanes = [obstacle.lane];
  return { obstacle, lanes, seconds, distance: relative };
}

export function upcomingHazards(run) {
  return run.obstacles.map(o => hazardForecast(o, run)).filter(Boolean)
    .sort((a, b) => a.seconds - b.seconds);
}