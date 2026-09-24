import { sha256Text } from './files.js';
import { getProductionLineContract, inferProductionLineDecisionFromText, productionLineForTemplate, type ProductionLine } from './production-lines.js';
import { ProductionLineResolutionSchema, type ProductionLineResolution } from '../schemas/production-line-resolution.js';
import { ProductionLineDecisionSchema, type ProductionLineDecision } from '../schemas/production-line.js';

type RuntimeName = 'web-lite' | 'cocos-3d';

export type ProductionLineResolutionInput = {
  title: string;
  theme: string;
  concept?: string;
  template: string;
  runtime: RuntimeName;
  decision?: ProductionLineDecision;
};

function expectedRuntime(template: string): RuntimeName | undefined {
  if (template === 'spatial-shop-3d-v1') return 'cocos-3d';
  if (template === 'idle-shop-v1' || template === 'spatial-shop-v1' || template === 'cut-stack-dodge-v1') return 'web-lite';
  return undefined;
}

function hashInput(value: Omit<ProductionLineResolution, 'resolutionHash' | 'resolvedAt'>): string {
  return sha256Text(JSON.stringify(value));
}

/** Resolve a run's production line exactly once from its seed evidence. */
export function resolveProductionLine(input: ProductionLineResolutionInput): ProductionLineResolution {
  const decision = ProductionLineDecisionSchema.parse(input.decision ?? inferProductionLineDecisionFromText([input.title, input.theme, input.concept ?? ''].join('\n')));
  const templateLine = productionLineForTemplate(input.template) ?? null;
  const inferredLine = decision.line;
  const blockers: string[] = [];
  const expected = expectedRuntime(input.template);
  if (expected && expected !== input.runtime) blockers.push('template-runtime-mismatch');

  // An unsupported/new-line request must not be made publishable by a legacy
  // template. A supported request may still use an explicit template as its
  // final authority, while retaining the inferred line for audit.
  if (decision.supportDecision !== 'SUPPORTED') blockers.push('decision-template-support-mismatch');
  if (templateLine === null && inferredLine === null) blockers.push('no-supported-production-line');
  const line: ProductionLine | null = blockers.length === 0 ? templateLine ?? inferredLine : null;
  const profile = line ? getProductionLineContract(line).primaryProfile : decision.profile;
  const sources = templateLine ? ['explicit-template'] : ['request-inference'];
  const base = {
    schemaVersion: 1 as const,
    status: blockers.length === 0 ? 'RESOLVED' as const : 'BLOCKED' as const,
    line,
    template: input.template,
    runtime: input.runtime,
    profile,
    supportDecision: decision.supportDecision,
    decision,
    inferredLine,
    templateLine,
    sources,
    blockers,
  };
  return ProductionLineResolutionSchema.parse({ ...base, resolutionHash: hashInput(base), resolvedAt: new Date().toISOString() });
}

export function assertProductionLineResolutionMatches(input: ProductionLineResolutionInput, resolution: ProductionLineResolution): ProductionLineResolution {
  const expected = resolveProductionLine({ ...input, decision: resolution.decision });
  if (expected.resolutionHash !== resolution.resolutionHash || expected.line !== resolution.line || expected.template !== resolution.template || expected.runtime !== resolution.runtime) {
    throw new Error('production-line-resolution mismatch: run inputs no longer match the locked resolution');
  }
  return ProductionLineResolutionSchema.parse(resolution);
}
