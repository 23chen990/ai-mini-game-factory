import {
  UnknownClassSchema,
  UnknownEvaluationSchema,
  UnknownRegisterSchema,
  type UnknownEvaluation,
  type UnknownItem,
  type UnknownRegister,
} from '../schemas/unknowns.js';

/** These classes are never safe to guess away at a release boundary. */
export const DEFAULT_BLOCKING_UNKNOWN_CLASSES = [
  'security', 'legal', 'license', 'platform', 'core_experience', 'performance',
  'save', 'input', 'monetization',
] as const;

type ItemSeed = Omit<UnknownItem, 'createdAt' | 'updatedAt' | 'status' | 'evidence' | 'waiver'> & {
  status?: UnknownItem['status'];
  evidence?: string[];
  waiver?: UnknownItem['waiver'];
};

export function buildUnknownRegister(input: {
  runId: string;
  items?: ItemSeed[];
  blockingClasses?: UnknownRegister['blockingClasses'];
}): UnknownRegister {
  const now = new Date().toISOString();
  const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const blockingClasses = input.blockingClasses?.map((item) => UnknownClassSchema.parse(item)) ?? [...DEFAULT_BLOCKING_UNKNOWN_CLASSES];
  const items = (input.items ?? []).map((item) => ({
    ...item,
    deadline: item.deadline ?? (item.blocking ? undefined : defaultDeadline),
    status: item.status ?? 'OPEN',
    evidence: item.evidence ?? [],
    createdAt: now,
    updatedAt: now,
  }));
  return UnknownRegisterSchema.parse({ schemaVersion: 1, runId: input.runId, items, blockingClasses, generatedAt: now, updatedAt: now });
}

function isExpired(iso: string | undefined, now: Date): boolean {
  return Boolean(iso && Date.parse(iso) <= now.getTime());
}

export function evaluateUnknownRegister(value: unknown, options: {
  now?: Date;
  requireAllResolved?: boolean;
  /** Require every human waiver to identify the exact reviewed artifact,
   * scope, signer and an expiry. This is enabled at production release only. */
  requireBoundWaivers?: boolean;
  /** Optional current artifact hashes keyed by waiver scope (or item id). */
  artifactHashes?: Record<string, string>;
} = {}): UnknownEvaluation {
  const register = UnknownRegisterSchema.parse(value);
  const now = options.now ?? new Date();
  const blocking: string[] = [];
  const unresolved: string[] = [];
  const nonBlocking: string[] = [];
  const expiredWaivers: string[] = [];
  for (const item of register.items) {
    if (item.status === 'RESOLVED') continue;
    if (item.status === 'WAIVED') {
      if (options.requireBoundWaivers) {
        const waiver = item.waiver;
        if (!waiver?.artifactHash) blocking.push(`${item.id}:waiver-artifact-hash-missing`);
        if (!waiver?.scope) blocking.push(`${item.id}:waiver-scope-missing`);
        if (!waiver?.signer) blocking.push(`${item.id}:waiver-signer-missing`);
        if (!waiver?.expiresAt) blocking.push(`${item.id}:waiver-expiry-missing`);
        const expected = waiver?.scope ? options.artifactHashes?.[waiver.scope] : undefined;
        if (expected && waiver?.artifactHash && expected !== waiver.artifactHash) blocking.push(`${item.id}:waiver-artifact-hash-mismatch`);
      }
      if (isExpired(item.waiver?.expiresAt, now)) {
        expiredWaivers.push(item.id);
        if (item.blocking || register.blockingClasses.includes(item.class)) blocking.push(item.id);
        else nonBlocking.push(item.id);
      }
      continue;
    }
    unresolved.push(item.id);
    const isBlocking = item.blocking || register.blockingClasses.includes(item.class);
    if (isBlocking) blocking.push(item.id);
    else nonBlocking.push(item.id);
  }
  // A strict release cannot rely on an expired exception, even when the
  // original item was marked non-blocking. Keep local evaluation permissive so
  // operators can still inspect the stale waiver and renew it deliberately.
  if (options.requireAllResolved) {
    for (const id of expiredWaivers) if (!blocking.includes(id)) blocking.push(id);
  }
  // A release boundary may opt into a zero-UNKNOWN policy.  Keep the default
  // permissive behavior for local/legacy runs, but make the stricter decision
  // explicit and auditable instead of silently treating an unresolved
  // non-blocking item as harmless.
  if (options.requireAllResolved) {
    for (const id of unresolved) if (!blocking.includes(id)) blocking.push(id);
  }
  return UnknownEvaluationSchema.parse({ passed: blocking.length === 0, blocking, unresolved, nonBlocking, expiredWaivers });
}

export function resolveUnknown(value: unknown, id: string, evidence: string[]): UnknownRegister {
  const register = UnknownRegisterSchema.parse(value);
  const now = new Date().toISOString();
  let found = false;
  const items = register.items.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return { ...item, status: 'RESOLVED' as const, evidence, waiver: undefined, updatedAt: now };
  });
  if (!found) throw new Error(`unknown ${id} does not exist`);
  return UnknownRegisterSchema.parse({ ...register, items, updatedAt: now });
}

export function waiveUnknown(value: unknown, id: string, waiver: NonNullable<UnknownItem['waiver']>): UnknownRegister {
  const register = UnknownRegisterSchema.parse(value);
  const now = new Date().toISOString();
  let found = false;
  const items = register.items.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return { ...item, status: 'WAIVED' as const, waiver, updatedAt: now };
  });
  if (!found) throw new Error(`unknown ${id} does not exist`);
  return UnknownRegisterSchema.parse({ ...register, items, updatedAt: now });
}
