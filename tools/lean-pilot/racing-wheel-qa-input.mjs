const ACTION_IDS = Object.freeze({ drift: 2, small: 3, nitro: 4, item: 5 });
const WHEEL_ID = 1;
const TURN_STEP = Math.PI / 18;

function touchPoint(id, x, y) {
  return { id, x, y, radiusX: 7, radiusY: 7, force: 1 };
}

function wheelPoint(angle, bounds) {
  const radius = Math.min(bounds.width, bounds.height) * 0.42;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return touchPoint(WHEEL_ID, centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
}

export function actionTouchPoints(actions, boundsByAction) {
  return actions.map(action => {
    const bounds = boundsByAction[action];
    return touchPoint(ACTION_IDS[action], bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  });
}

export function planWheelGesture(direction, bounds, activeActionPoints, previousAngle) {
  if (direction === null) {
    return { events: [{ type: 'touchEnd', touchPoints: activeActionPoints }], angle: null };
  }

  const angle = previousAngle ?? -Math.PI / 2;
  const target = typeof direction === 'number'
    ? -Math.PI / 2 - direction * 58 * Math.PI / 180
    : direction === 'left' ? -Math.PI : 0;
  const events = previousAngle === null
    ? [{ type: 'touchStart', touchPoints: [wheelPoint(angle, bounds), ...activeActionPoints] }]
    : [];
  const steps = Math.ceil(Math.abs(target - angle) / TURN_STEP);
  for (let step = 1; step <= steps; step++) {
    const nextAngle = angle + (target - angle) * step / steps;
    events.push({ type: 'touchMove', touchPoints: [wheelPoint(nextAngle, bounds), ...activeActionPoints] });
  }
  return { events, angle: target };
}
