export type CarrySwayState = {
  angleDegrees: number;
  angularVelocity: number;
  offset: number;
  offsetVelocity: number;
};

export type CarrySwayInput = {
  deltaSeconds: number;
  lateralAcceleration: number;
  turnRate: number;
  stackIndex: number;
  stackSize: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function createCarrySwayState(initial: Partial<CarrySwayState> = {}): CarrySwayState {
  return { angleDegrees: 0, angularVelocity: 0, offset: 0, offsetVelocity: 0, ...initial };
}

export function stepCarrySway(state: CarrySwayState, input: CarrySwayInput): CarrySwayState {
  const deltaSeconds = clamp(input.deltaSeconds, 0, 1 / 20);
  const stackSize = Math.max(1, input.stackSize);
  const heightRatio = clamp((input.stackIndex + 1) / stackSize, 0.25, 1);
  const targetAngle = clamp((-input.lateralAcceleration * 0.52 - input.turnRate * 1.45) * heightRatio, -8, 8);
  const targetOffset = clamp((-input.lateralAcceleration * 0.009 - input.turnRate * 0.02) * heightRatio, -0.18, 0.18);

  const angularAcceleration = (targetAngle - state.angleDegrees) * 52 - state.angularVelocity * 11;
  const angularVelocity = state.angularVelocity + angularAcceleration * deltaSeconds;
  const angleDegrees = clamp(state.angleDegrees + angularVelocity * deltaSeconds, -8, 8);

  const offsetAcceleration = (targetOffset - state.offset) * 60 - state.offsetVelocity * 12;
  const offsetVelocity = state.offsetVelocity + offsetAcceleration * deltaSeconds;
  const offset = clamp(state.offset + offsetVelocity * deltaSeconds, -0.18, 0.18);

  return { angleDegrees, angularVelocity, offset, offsetVelocity };
}

export class CarryStackSway {
  private readonly states: CarrySwayState[] = [];

  step(input: Omit<CarrySwayInput, 'stackIndex'>) {
    while (this.states.length < input.stackSize) this.states.push(createCarrySwayState());
    this.states.length = input.stackSize;
    return this.states.map((state, stackIndex) => {
      const next = stepCarrySway(state, { ...input, stackIndex });
      this.states[stackIndex] = next;
      return next;
    });
  }
}
