import { z } from 'zod';
import { sha256Text } from './files.js';

type ContextInput = { path: string; content: string; priority: 'required' | 'important' | 'optional' };
export const HandoffPacketSchema = z.object({ schemaVersion: z.literal(1), fromStage: z.string().trim().min(1), toStage: z.string().trim().min(1), summary: z.string().trim().min(1).max(4_000), artifactPaths: z.array(z.string().trim().min(1)).max(32), artifactHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)).optional(), changedFiles: z.array(z.string().trim().min(1)).max(64), commandsRun: z.array(z.string().trim().min(1)).max(32), omittedContext: z.array(z.string().trim().min(1)), estimatedChars: z.number().int().nonnegative(), estimatedTokens: z.number().int().nonnegative().default(0), tokenBudget: z.number().int().positive().default(1), truncationStrategy: z.enum(['priority-preserving', 'metadata-only']).default('metadata-only'), integrityHash: z.string().regex(/^[a-f0-9]{64}$/u).default('0'.repeat(64)), summaryHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(), /** Digest of the exact ContextPacket sent to the provider. */ contextPacketHash: z.string().regex(/^[a-f0-9]{64}$/u).optional() }).strict();
export type HandoffPacket = z.infer<typeof HandoffPacketSchema>;

export const ContextPacketSchema = z.object({ schemaVersion: z.literal(1), stage: z.string().trim().min(1), summary: z.string().trim().min(1).max(4_000), inputs: z.array(z.object({ path: z.string().trim().min(1), excerpt: z.string(), priority: z.enum(['required', 'important', 'optional']) }).strict()), omitted: z.array(z.string().trim().min(1)), totalChars: z.number().int().nonnegative(), /** hashes bind the exact sanitized payload seen by the next agent */ inputHashes: z.record(z.string().trim().min(1), z.string().regex(/^[a-f0-9]{64}$/u)).optional(), estimatedTokens: z.number().int().nonnegative().default(0), tokenBudget: z.number().int().positive().default(1), truncationStrategy: z.enum(['priority-preserving', 'metadata-only']).default('metadata-only'), integrityHash: z.string().regex(/^[a-f0-9]{64}$/u).default('0'.repeat(64)) }).strict();
export type ContextPacket = z.infer<typeof ContextPacketSchema>;

export function verifyContextPacketIntegrity(value: unknown) {
  const parsed = ContextPacketSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'] };
  const { integrityHash, ...payload } = parsed.data;
  if (!integrityHash || integrityHash === '0'.repeat(64)) return { passed: false, blockers: ['integrity-hash-missing'] };
  const passed = sha256Text(JSON.stringify(payload)) === integrityHash;
  return { passed, blockers: passed ? [] : ['integrity-hash-mismatch'] };
}

export function verifyHandoffPacketIntegrity(value: unknown) {
  const parsed = HandoffPacketSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'] };
  const { integrityHash, ...payload } = parsed.data;
  if (!integrityHash || integrityHash === '0'.repeat(64)) return { passed: false, blockers: ['integrity-hash-missing'] };
  return sha256Text(JSON.stringify(payload)) === integrityHash ? { passed: true, blockers: [] } : { passed: false, blockers: ['integrity-hash-mismatch'] };
}

export function buildContextPacket(input: { stage: string; summary: string; inputs: ContextInput[]; maxChars: number }): ContextPacket {
  const seen = new Set<string>();
  let selected: ContextPacket['inputs'] = [];
  const omitted: string[] = [];
  const maxChars = Math.max(64, Math.trunc(input.maxChars));
  const stage = input.stage.trim();
  let summary = input.summary.trim().slice(0, Math.min(4_000, maxChars)).trim() || 'context';
  let totalChars = summary.length;
  const normalizedInputs = input.inputs.map((item) => ({ ...item, path: item.path.trim() }));
  const ordered = [...normalizedInputs].sort((a, b) => ({ required: 0, important: 1, optional: 2 }[a.priority] - { required: 0, important: 1, optional: 2 }[b.priority]));
  for (const item of ordered) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    const remaining = Math.max(0, maxChars - totalChars);
    const excerpt = item.content.slice(0, remaining);
    if (!excerpt && item.priority !== 'required') { omitted.push(item.path); continue; }
    selected.push({ path: item.path, excerpt, priority: item.priority });
    totalChars += excerpt.length;
    if (excerpt.length < item.content.length) omitted.push(item.path);
  }
  const makePacket = () => {
    const inputHashes = Object.fromEntries(selected.map((item) => [item.path, sha256Text(item.excerpt)]));
    const estimatedTokens = Math.max(1, Math.ceil((summary.length + selected.reduce((sum, item) => sum + item.excerpt.length, 0)) / 4));
    const packetWithoutIntegrity = {
    schemaVersion: 1 as const,
    stage,
    summary,
    inputs: selected,
    omitted: omitted.slice(0, 64),
    totalChars,
    inputHashes,
    estimatedTokens,
    tokenBudget: Math.max(estimatedTokens, Math.ceil(maxChars / 4)),
    truncationStrategy: 'priority-preserving' as const,
    };
    return { ...packetWithoutIntegrity, integrityHash: sha256Text(JSON.stringify(packetWithoutIntegrity)) };
  };
  let packet = makePacket();

  // `maxChars` is primarily a content budget, but metadata can otherwise make
  // the serialized handoff much larger than the model budget. Trim optional
  // excerpts first, then required excerpts and finally the summary. This is a
  // best-effort bound for extremely tiny budgets where the schema envelope
  // itself cannot fit.
  const serializedLength = () => JSON.stringify(packet).length;
  for (let iteration = 0; iteration < 96 && maxChars >= 256 && serializedLength() > maxChars; iteration += 1) {
    const optionalIndex = [...selected].map((item, index) => ({ item, index })).reverse().find(({ item }) => item.priority === 'optional')?.index;
    const importantIndex = [...selected].map((item, index) => ({ item, index })).reverse().find(({ item }) => item.priority === 'important')?.index;
    const index = optionalIndex ?? importantIndex;
    if (index !== undefined) {
      const item = selected[index]!;
      if (item.excerpt.length > 24) {
        const nextExcerpt = item.excerpt.slice(0, Math.max(8, Math.floor(item.excerpt.length * 0.55)));
        totalChars -= item.excerpt.length - nextExcerpt.length;
        selected[index] = { ...item, excerpt: nextExcerpt };
        if (!omitted.includes(item.path)) omitted.push(item.path);
      } else {
        totalChars -= item.excerpt.length;
        selected = selected.filter((_, candidate) => candidate !== index);
        if (!omitted.includes(item.path)) omitted.push(item.path);
      }
    } else if (summary.length > 32) {
      const nextSummary = summary.slice(0, Math.max(16, Math.floor(summary.length * 0.65))).trim() || 'context';
      totalChars -= summary.length - nextSummary.length;
      summary = nextSummary;
    } else {
      // Required inputs are contract prerequisites, not optional narration.
      // They may be reduced to a pointer-sized excerpt, but they must remain
      // present so the next agent can resolve the exact artifact path and hash.
      const requiredIndex = [...selected].map((item, index) => ({ item, index })).reverse().find(({ item }) => item.priority === 'required' && item.excerpt.length > 0)?.index;
      if (requiredIndex !== undefined) {
        const item = selected[requiredIndex]!;
        const nextExcerpt = item.excerpt.slice(0, Math.max(0, Math.floor(item.excerpt.length * 0.45)));
        totalChars -= item.excerpt.length - nextExcerpt.length;
        selected[requiredIndex] = { ...item, excerpt: nextExcerpt };
        if (!omitted.includes(item.path)) omitted.push(item.path);
      } else {
        // Compact bookkeeping before giving up.  Omitted paths are useful for
        // auditability but are lower priority than the required input pointer;
        // retain a deterministic prefix and a count marker rather than
        // letting a long list consume the model budget.
        if (omitted.length > 4) {
          const keep = Math.max(1, Math.floor(omitted.length * 0.5));
          omitted.splice(keep);
          omitted.push(`…${input.inputs.length - selected.length} more omitted`);
        } else if (summary.length > 1) {
          summary = summary.slice(0, Math.max(1, Math.floor(summary.length * 0.65))).trim() || 'context';
          totalChars = summary.length + selected.reduce((sum, item) => sum + item.excerpt.length, 0);
        } else {
          // At this point only required path metadata (possibly with an empty
          // excerpt) remains. Removing it would make the handoff look valid
          // while silently dropping a required prerequisite, so stop trimming.
          break;
        }
      }
    }
    packet = makePacket();
  }
  return ContextPacketSchema.parse(packet);
}

export function buildHandoffPacket(input: { fromStage: string; toStage: string; summary: string; artifacts: Array<{ path: string; content: string }>; changedFiles: string[]; commandsRun: string[]; contextPacketHash?: string; maxChars: number }) {
  const maxChars = Math.max(128, Math.trunc(input.maxChars));
  const fromStage = input.fromStage.trim();
  const toStage = input.toStage.trim();
  const artifacts = input.artifacts.map((artifact) => ({ ...artifact, path: artifact.path.trim() }));
  const changedFiles = input.changedFiles.map((file) => file.trim());
  const commandsRun = input.commandsRun.map((command) => command.trim());
  let summary = input.summary.trim().slice(0, Math.min(4_000, maxChars)).trim() || 'handoff';
  let artifactLimit = Math.min(32, input.artifacts.length);
  let changedLimit = Math.min(64, input.changedFiles.length);
  let commandLimit = Math.min(32, input.commandsRun.length);
  let omittedLimit = Math.min(32, input.artifacts.length);
  /**
   * `estimatedChars` is part of the integrity payload, so changing it after
   * calculating the digest invalidates the packet.  Solve the tiny fixed point
   * (the digest is always 64 characters) before returning it.
   */
  const finalize = (base: Record<string, unknown>): HandoffPacket => {
    const canonicalPayload = (value: Record<string, unknown>): Record<string, unknown> => {
      const parsed = HandoffPacketSchema.parse({ ...value, integrityHash: '0'.repeat(64) });
      return Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'integrityHash'));
    };
    let payload = canonicalPayload({ ...base, estimatedChars: 0 });
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const integrityHash = sha256Text(JSON.stringify(payload));
      const result = HandoffPacketSchema.parse({ ...payload, integrityHash });
      const nextEstimated = JSON.stringify(result).length;
      if (nextEstimated === payload.estimatedChars) return result;
      payload = canonicalPayload({ ...payload, estimatedChars: nextEstimated });
    }
    const integrityHash = sha256Text(JSON.stringify(payload));
    return HandoffPacketSchema.parse({ ...payload, integrityHash });
  };
  const make = () => {
    const selectedArtifacts = artifacts.slice(0, artifactLimit);
    const artifactPaths = selectedArtifacts.map((artifact) => artifact.path);
    const artifactHashes = Object.fromEntries(selectedArtifacts.map((artifact) => [artifact.path, sha256Text(artifact.content)]));
    const omittedContext = ['raw transcript', ...artifacts.slice(artifactLimit, artifactLimit + omittedLimit).map((artifact) => artifact.path)].slice(0, Math.max(1, omittedLimit + 1));
    const raw = { schemaVersion: 1 as const, fromStage, toStage, summary, artifactPaths, artifactHashes, changedFiles: changedFiles.slice(0, changedLimit), commandsRun: commandsRun.slice(0, commandLimit), omittedContext, estimatedChars: 0, estimatedTokens: Math.max(1, Math.ceil(summary.length / 4)), tokenBudget: Math.max(1, Math.ceil(maxChars / 4)), truncationStrategy: 'priority-preserving' as const, summaryHash: sha256Text(summary), ...(input.contextPacketHash ? { contextPacketHash: input.contextPacketHash } : {}) };
    return finalize(raw);
  };
  let candidate = make();
  for (let iteration = 0; iteration < 48 && JSON.stringify(candidate).length > maxChars; iteration += 1) {
    if (summary.length > 32) summary = summary.slice(0, Math.max(32, Math.floor(summary.length * 0.65))).trim() || 'handoff';
    else if (artifactLimit > 1) artifactLimit = Math.max(1, Math.floor(artifactLimit / 2));
    else if (changedLimit > 1) changedLimit = Math.max(1, Math.floor(changedLimit / 2));
    else if (commandLimit > 1) commandLimit = Math.max(1, Math.floor(commandLimit / 2));
    else if (omittedLimit > 1) omittedLimit = Math.max(1, Math.floor(omittedLimit / 2));
    else break;
    candidate = make();
  }
  // A tiny handoff budget can be smaller than the integrity/telemetry envelope
  // itself.  Preserve the one thing the next stage needs (an artifact pointer
  // and its hash), then drop optional narration/telemetry fields in a stable
  // order until the declared bound is true.
  const compact = () => {
    const firstHash = candidate.artifactPaths[0] && candidate.artifactHashes?.[candidate.artifactPaths[0]];
    const compactSummary = candidate.summary.slice(0, 32).trim() || 'handoff';
    const minimalBase = {
      schemaVersion: 1 as const,
      fromStage: candidate.fromStage,
      toStage: candidate.toStage,
      summary: compactSummary,
      artifactPaths: candidate.artifactPaths.slice(0, 1),
      ...(firstHash ? { artifactHashes: { [candidate.artifactPaths[0]!]: firstHash } } : {}),
      changedFiles: [],
      commandsRun: [],
      omittedContext: ['raw transcript'],
      estimatedChars: 0,
      estimatedTokens: Math.max(1, Math.ceil(compactSummary.length / 4)),
      tokenBudget: 1,
      truncationStrategy: 'metadata-only' as const,
      summaryHash: undefined,
      ...(candidate.contextPacketHash ? { contextPacketHash: candidate.contextPacketHash } : {}),
    };
    const withoutUndefined = JSON.parse(JSON.stringify(minimalBase)) as Omit<typeof minimalBase, 'estimatedChars'> & { estimatedChars: number };
    return finalize(withoutUndefined);
  };
  if (JSON.stringify(candidate).length > maxChars) candidate = compact();
  // For exceptionally small (but schema-valid) budgets, trim the summary one
  // character at a time. This loop is bounded and deterministic.
  for (let iteration = 0; iteration < 64 && JSON.stringify(candidate).length > maxChars && candidate.summary.length > 1; iteration += 1) {
    const base = { ...candidate } as Record<string, unknown>;
    delete base.integrityHash;
    delete base.estimatedChars;
    const nextSummary = candidate.summary.slice(0, -1).trim() || 'handoff';
    candidate = finalize({ ...base, summary: nextSummary, summaryHash: candidate.summaryHash ? sha256Text(nextSummary) : undefined, estimatedTokens: Math.max(1, Math.ceil(nextSummary.length / 4)) });
  }
  return HandoffPacketSchema.parse(candidate);
}
