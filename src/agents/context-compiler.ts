import { buildContextPacket, type ContextPacket } from '../core/context-budget.js';
import { packageForStage, type AgentPackage } from './packages.js';

type CompilerInput = { path: string; content: string; priority?: 'required' | 'important' | 'optional' };

export function compileAgentContext(input: { stage: string; summary: string; inputs: CompilerInput[]; requiredPaths?: string[]; includeOptionalPaths?: string[]; maxChars?: number }): { package: AgentPackage; packet: ContextPacket } {
  const packageDefinition = packageForStage(input.stage);
  const required = new Set((input.requiredPaths ?? []).map((path) => path.trim()));
  const optional = new Set((input.includeOptionalPaths ?? []).map((path) => path.trim()));
  const normalizedInputs = input.inputs.map((item) => ({ ...item, path: item.path.trim() }));
  const selected = normalizedInputs.filter((item) => required.has(item.path) || optional.has(item.path));
  const selectedPaths = new Set(selected.map((item) => item.path));
  const omitted = normalizedInputs.filter((item) => !selectedPaths.has(item.path));
  const packet = buildContextPacket({
    stage: input.stage,
    summary: input.summary,
    inputs: [
      ...selected.map((item) => ({ path: item.path, content: item.content, priority: required.has(item.path) ? 'required' as const : item.priority ?? 'important' as const })),
      ...omitted.map((item) => ({ path: item.path, content: '', priority: 'optional' as const })),
    ],
    maxChars: Math.min(input.maxChars ?? packageDefinition.contextBudget, packageDefinition.contextBudget),
  });
  return { package: packageDefinition, packet };
}
