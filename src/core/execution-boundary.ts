import path from 'node:path';
import { ContextPacketSchema, verifyContextPacketIntegrity } from './context-budget.js';
import { executionPolicyForStage, type ExecutionPolicy } from './model-policy.js';
import { StageNameSchema } from '../schemas/index.js';
import type { AgentExecutionContext } from '../providers/interfaces.js';

/** A hard failure at the model/tool boundary. It is intentionally not recoverable by a model. */
export class ExecutionBoundaryError extends Error {
  constructor(message: string) {
    super(`execution boundary rejected request: ${message}`);
    this.name = 'ExecutionBoundaryError';
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertAbsolute(value: unknown, name: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.trim() === path.parse(value).root) {
    throw new ExecutionBoundaryError(`${name} must be an absolute non-root path`);
  }
  return path.resolve(value);
}

function assertRelativeArtifact(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new ExecutionBoundaryError(`${name} must be a relative path`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '..') || normalized === '.' || normalized.startsWith('../')) {
    throw new ExecutionBoundaryError(`${name} contains a path traversal`);
  }
  return normalized;
}

/** Public lexical guard for callers that need to validate a pointer before
 * opening it. It intentionally performs no filesystem access. */
export function assertSafeContextInputPath(value: unknown): string {
  return assertRelativeArtifact(value, 'context input path');
}

function policyForStage(stageValue: unknown): ExecutionPolicy {
  const stage = StageNameSchema.safeParse(stageValue);
  if (!stage.success) throw new ExecutionBoundaryError(`unknown stage ${String(stageValue)}`);
  return executionPolicyForStage(stage.data);
}

/**
 * Validate the narrow execution contract handed to a provider. This is a
 * lexical check by design; filesystem symlink checks belong to the run store
 * immediately before a write. No network or secret capability can be enabled
 * through this object.
 */
export function assertExecutionContext(value: AgentExecutionContext, options: { strictPaths?: boolean } = {}): AgentExecutionContext & { role: ExecutionPolicy['role']; policy: ExecutionPolicy } {
  if (!value || typeof value !== 'object') throw new ExecutionBoundaryError('context must be an object');
  const context = value as AgentExecutionContext & Record<string, unknown>;
  const runRoot = assertAbsolute(context.runRoot, 'runRoot');
  const outputPath = assertAbsolute(context.outputPath, 'outputPath');
  const logDir = assertAbsolute(context.logDir, 'logDir');
  if (options.strictPaths !== false) {
    if (!isWithin(runRoot, outputPath)) throw new ExecutionBoundaryError('outputPath must remain inside run root');
    if (!isWithin(runRoot, logDir)) throw new ExecutionBoundaryError('logDir must remain inside run root');
  }
  if (!Array.isArray(context.inputPaths)) throw new ExecutionBoundaryError('inputPaths must be an array');
  context.inputPaths.forEach((item, index) => assertRelativeArtifact(item, `inputPaths[${index}]`));
  if (context.mediaInputs !== undefined) {
    if (!Array.isArray(context.mediaInputs)) throw new ExecutionBoundaryError('mediaInputs must be an array');
    if (policyForStage(context.stage).role !== 'research') throw new ExecutionBoundaryError('mediaInputs are restricted to research stages');
    for (const [index, media] of context.mediaInputs.entries()) {
      if (!media || typeof media !== 'object') throw new ExecutionBoundaryError(`mediaInputs[${index}] must be an object`);
      const mediaPath = assertRelativeArtifact(media.path, `mediaInputs[${index}].path`);
      if (!mediaPath.startsWith('reference-evidence/derived/') || !/\.(?:png|jpe?g|webp)$/iu.test(mediaPath)) throw new ExecutionBoundaryError('mediaInputs must be images inside derived reference evidence');
      if (typeof media.sha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(media.sha256)) throw new ExecutionBoundaryError(`mediaInputs[${index}] requires a SHA-256 hash`);
    }
  }
  if (context.targetGameId !== undefined && (typeof context.targetGameId !== 'string' || context.targetGameId.trim().length === 0)) {
    throw new ExecutionBoundaryError('targetGameId cannot be empty');
  }
  if (context.targetWorkspaceRelative !== undefined) assertRelativeArtifact(context.targetWorkspaceRelative, 'targetWorkspaceRelative');
  if (context.requiredArtifacts !== undefined) {
    if (!Array.isArray(context.requiredArtifacts) || context.requiredArtifacts.length === 0) throw new ExecutionBoundaryError('requiredArtifacts must be a non-empty array');
    context.requiredArtifacts.forEach((item, index) => assertRelativeArtifact(item, `requiredArtifacts[${index}]`));
  }
  const policy = policyForStage(context.stage);
  if (context.sandbox !== policy.sandbox) throw new ExecutionBoundaryError(`${policy.role} stage ${context.stage} requires ${policy.sandbox}`);
  if (context.model !== undefined && (typeof context.model !== 'string' || context.model.trim().length === 0)) throw new ExecutionBoundaryError('model override cannot be empty');
  if (context.reasoning !== undefined && !['low', 'medium', 'high', 'max'].includes(context.reasoning)) throw new ExecutionBoundaryError('unsupported reasoning level');
  if (context.contextPacket !== undefined) {
    const packet = ContextPacketSchema.parse(context.contextPacket);
    if (packet.stage !== context.stage) throw new ExecutionBoundaryError('context packet stage does not match execution stage');
    if (packet.totalChars > policy.handoffMaxChars) throw new ExecutionBoundaryError('context packet exceeds the stage handoff budget');
    if (context.enforceBoundary === true && !verifyContextPacketIntegrity(packet).passed) throw new ExecutionBoundaryError('context packet integrity check failed');
  }
  for (const forbidden of ['network', 'networkAccessEnabled', 'allowNetwork', 'allowSecrets', 'readSecrets', 'secretPath', 'apiKey']) {
    if (context[forbidden] === true || (typeof context[forbidden] === 'string' && context[forbidden])) throw new ExecutionBoundaryError(`${forbidden} cannot be enabled in an agent context`);
  }
  const role = policy.role;
  if ((role === 'builder' || role === 'fixer') && !isWithin(runRoot, path.join(runRoot, 'workspace'))) {
    throw new ExecutionBoundaryError('workspace scope could not be established');
  }
  // A provider context may point at a file inside the run, but only Builder
  // and Fixer are ever allowed to address the generated game workspace. This
  // lexical guard closes the easy accidental-escalation path; the run store
  // performs the final symlink-aware check before writes.
  if (role !== 'builder' && role !== 'fixer' && isWithin(path.join(runRoot, 'workspace'), outputPath)) {
    throw new ExecutionBoundaryError(`${role} outputPath cannot target the generated workspace`);
  }
  if (role === 'release' && !isWithin(path.join(runRoot, 'artifacts'), outputPath) && !isWithin(path.join(runRoot, 'release-candidate'), outputPath) && !isWithin(path.join(runRoot, 'logs'), outputPath)) {
    throw new ExecutionBoundaryError('release outputPath must remain in artifacts, release-candidate or logs');
  }
  return { ...context, runRoot, outputPath, logDir, role, policy };
}

/** Return a provider-safe subset without unknown capability flags. */
export type SafeExecutionContext = AgentExecutionContext & { role: ExecutionPolicy['role']; policy: ExecutionPolicy };

export function safeExecutionContext(value: AgentExecutionContext): SafeExecutionContext {
  const checked = assertExecutionContext(value, { strictPaths: value.enforceBoundary === true });
  return {
    runRoot: checked.runRoot,
    outputPath: checked.outputPath,
    logDir: checked.logDir,
    inputPaths: checked.inputPaths.map((item) => item.replaceAll('\\', '/')),
    mediaInputs: checked.mediaInputs?.map((item) => ({ path: item.path.replaceAll('\\', '/'), sha256: item.sha256.toLowerCase() })),
    targetGameId: checked.targetGameId,
    targetWorkspaceRelative: checked.targetWorkspaceRelative,
    requiredArtifacts: checked.requiredArtifacts?.map((item) => item.replaceAll('\\', '/')),
    stage: checked.stage,
    model: checked.model,
    reasoning: checked.reasoning,
    sandbox: checked.sandbox,
    contextPacket: checked.contextPacket,
    enforceBoundary: checked.enforceBoundary,
    role: checked.role,
    policy: checked.policy,
  };
}
