import { ProductionLineCapabilityReportSchema, type RuntimeName } from '../schemas/index.js';
import type { ProductionLine } from './production-lines.js';

type Capability = {
  expectedTemplates: string[];
  implementedTemplates: string[];
  runtimes: RuntimeName[];
};

/**
 * Runtime capability is kept separate from experience classification.  A
 * request may correctly be narrative/action/puzzle while the repository still
 * lacks the corresponding mother template; that state must stop before a
 * Builder call instead of silently compiling an idle game.
 */
const CAPABILITIES: Record<ProductionLine, Capability> = {
  'single-finger-action': { expectedTemplates: ['single-finger-action-v1'], implementedTemplates: [], runtimes: ['web-lite'] },
  'cut-stack-dodge': { expectedTemplates: ['cut-stack-dodge-v1'], implementedTemplates: ['cut-stack-dodge-v1'], runtimes: ['web-lite'] },
  'idle-management': { expectedTemplates: ['idle-management-v1', 'idle-shop-v1', 'spatial-shop-v1', 'spatial-shop-3d-v1'], implementedTemplates: ['idle-shop-v1', 'spatial-shop-v1', 'spatial-shop-3d-v1'], runtimes: ['web-lite', 'cocos-3d'] },
  'choice-life': { expectedTemplates: ['choice-life-v1'], implementedTemplates: [], runtimes: ['web-lite'] },
  'rule-puzzle': { expectedTemplates: ['rule-puzzle-v1'], implementedTemplates: [], runtimes: ['web-lite'] },
};

export function productionLineCapability(line: ProductionLine): Capability {
  const value = CAPABILITIES[line];
  return { expectedTemplates: [...value.expectedTemplates], implementedTemplates: [...value.implementedTemplates], runtimes: [...value.runtimes] };
}

export function evaluateProductionLineCapability(input: { line: ProductionLine; template: string; runtime: RuntimeName }) {
  const capability = CAPABILITIES[input.line];
  const blockers: string[] = [];
  if (!capability.expectedTemplates.includes(input.template)) blockers.push('template-line-mismatch');
  if (!capability.runtimes.includes(input.runtime)) blockers.push('runtime-line-mismatch');
  if (!capability.implementedTemplates.includes(input.template)) blockers.push('template-not-implemented');
  if (input.template === 'spatial-shop-3d-v1' && input.runtime !== 'cocos-3d') blockers.push('3d-runtime-required');
  if (input.template !== 'spatial-shop-3d-v1' && input.runtime === 'cocos-3d' && !input.template.includes('spatial')) blockers.push('cocos-template-mismatch');
  return ProductionLineCapabilityReportSchema.parse({
    schemaVersion: 1,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    line: input.line,
    template: input.template,
    runtime: input.runtime,
    expectedTemplates: capability.expectedTemplates,
    implementedTemplates: capability.implementedTemplates,
    checkedAt: new Date().toISOString(),
  });
}

export function listProductionLineCapabilities() {
  return (Object.keys(CAPABILITIES) as ProductionLine[]).map((line) => ({ line, ...productionLineCapability(line) }));
}
