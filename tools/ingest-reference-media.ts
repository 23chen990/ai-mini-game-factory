import { ingestReferenceMedia } from '../src/core/evidence-provenance.js';
import { EvidencePurposeSchema } from '../src/schemas/evidence-provenance.js';

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const result = await ingestReferenceMedia({
  sourcePath: arg('--source'),
  runRoot: arg('--run-root'),
  targetGame: arg('--target-game'),
  workspace: process.argv.includes('--workspace') ? arg('--workspace') : undefined,
  id: process.argv.includes('--id') ? arg('--id') : undefined,
  purpose: process.argv.includes('--purpose') ? EvidencePurposeSchema.parse(arg('--purpose')) : undefined,
});
console.log(JSON.stringify({ schemaVersion: 1, artifactType: 'ReferenceMediaIngest', ...result }, null, 2));
