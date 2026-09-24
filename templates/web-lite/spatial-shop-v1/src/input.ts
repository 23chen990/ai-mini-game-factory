import type { MoveInput, Position } from './simulation.js';

export function keyboardMove(keys: { left: boolean; right: boolean; up: boolean; down: boolean }): MoveInput {
  return {
    x: Number(keys.right) - Number(keys.left),
    y: Number(keys.down) - Number(keys.up),
  };
}

export function joystickMove(origin: Position, current: Position, deadzone: number, maxDistance: number): MoveInput {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= deadzone) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (distance - deadzone) / Math.max(1, maxDistance - deadzone));
  return { x: dx / distance * magnitude, y: dy / distance * magnitude };
}

export function mergeMoveActions(primary: MoveInput, secondary: MoveInput): MoveInput {
  const x = primary.x + secondary.x;
  const y = primary.y + secondary.y;
  const magnitude = Math.hypot(x, y);
  return magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
}
