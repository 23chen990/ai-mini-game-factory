import { z } from 'zod';

export const ACTION_TEST_CONTRACT_VERSION = 1 as const;

export const ActionTestManifestSchema = z.object({
  slot: z.enum(['A', 'B', 'C']),
  fixedStepSeconds: z.number().positive(),
  courseFixtureHash: z.string().min(1),
  anchorPolicy: z.string().min(1),
});

export type ActionTestManifest = z.infer<typeof ActionTestManifestSchema>;

export const ActionPlayerSchema = z.object({
  x: z.number(),
  y: z.number(),
  vx: z.number(),
  vy: z.number(),
});

export type ActionPlayer = z.infer<typeof ActionPlayerSchema>;

export const ActionAnchorSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export type ActionAnchor = z.infer<typeof ActionAnchorSchema>;

export const ActionSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  status: z.string().min(1),
  inputHeld: z.boolean(),
  player: ActionPlayerSchema,
  anchors: z.array(ActionAnchorSchema),
  attachedAnchorId: z.string().min(1).nullable(),
  ropeLength: z.number().nonnegative().nullable(),
  maxSpeed: z.number().nonnegative(),
  finishX: z.number(),
  failY: z.number(),
  eventSeq: z.number().int().nonnegative(),
});

export type ActionSnapshot = z.infer<typeof ActionSnapshotSchema>;

export const ActionEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  type: z.string().min(1),
  source: z.string().min(1),
});

export type ActionEvent = z.infer<typeof ActionEventSchema>;

export const ActionTraceSchema = z.object({
  snapshots: z.array(ActionSnapshotSchema),
  events: z.array(ActionEventSchema),
});

export type ActionTrace = z.infer<typeof ActionTraceSchema>;

export interface ActionCommand {
  held: boolean;
  source?: string;
}

export interface ActionTestApi {
  contractVersion: typeof ACTION_TEST_CONTRACT_VERSION;
  getManifest(): ActionTestManifest;
  resetGame(): ActionSnapshot | void;
  getState(): ActionSnapshot;
  act(action: ActionCommand): ActionSnapshot | void;
  advanceTicks(count: number): ActionSnapshot | void;
  loadScenario(scenarioId: string): ActionSnapshot | void;
  getEvents(sinceSeq?: number): ActionEvent[];
  /** Optional mechanic-neutral continuity facts for the general QA gate. */
  getInteractionContinuity?(): unknown;
}

type RuntimeMethod = (...args: never[]) => unknown;

const method = z.custom<RuntimeMethod>(
  (value) => typeof value === 'function',
  { message: 'Required action-test API method is missing' },
);

const ActionTestApiShapeSchema = z.object({
  contractVersion: z.literal(ACTION_TEST_CONTRACT_VERSION),
  getManifest: method,
  resetGame: method,
  getState: method,
  act: method,
  advanceTicks: method,
  loadScenario: method,
  getEvents: method,
  getInteractionContinuity: method.optional(),
});

export function validateActionTestApiShape(value: unknown): ActionTestApi {
  const api = ActionTestApiShapeSchema.parse(value);
  ActionTestManifestSchema.parse(api.getManifest());
  return value as ActionTestApi;
}

export function validateActionTrace(value: unknown): ActionTrace {
  const trace = ActionTraceSchema.parse(value);
  for (let index = 1; index < trace.events.length; index += 1) {
    const previous = trace.events[index - 1];
    const current = trace.events[index];
    if (previous === undefined || current === undefined) continue;
    if (current.seq <= previous.seq) {
      throw new Error(`Action event sequence must strictly increase: ${previous.seq} -> ${current.seq}`);
    }
    if (current.tick < previous.tick) {
      throw new Error(`Action event tick cannot move backwards: ${previous.tick} -> ${current.tick}`);
    }
  }
  return trace;
}

declare global {
  interface Window {
    __ACTION_TEST__?: ActionTestApi;
  }
}
