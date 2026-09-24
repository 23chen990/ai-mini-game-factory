import { OriginalityDeclarationSchema, type OriginalityDeclaration } from '../schemas/originality.js';

export function buildOriginalityTemplate(): OriginalityDeclaration {
  return OriginalityDeclarationSchema.parse({
    schemaVersion: 1,
    status: 'BLOCKED',
    mechanicsOnlyReference: true,
    referenceSources: ['human:record approved reference mechanics or no-reference declaration'],
    originalElements: { code: false, assets: false, namesAndText: false, uiLayout: false, audio: false, tuningValues: false },
    evidence: ['human:attach source/license and originality review'],
    unknowns: ['originality-review-required'],
    reviewedAt: new Date().toISOString(),
  });
}

export function evaluateOriginality(value: unknown): { passed: boolean; blockers: string[]; declaration: OriginalityDeclaration } {
  const declaration = OriginalityDeclarationSchema.parse(value);
  const blockers: string[] = [];
  if (declaration.status !== 'PASS') blockers.push('status-not-pass');
  if (!declaration.mechanicsOnlyReference) blockers.push('expression-reference-not-mechanics-only');
  if (Object.values(declaration.originalElements).some((item) => !item)) blockers.push('original-expression-incomplete');
  if (declaration.unknowns.length) blockers.push(...declaration.unknowns.map((item) => `unknown:${item}`));
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], declaration };
}
