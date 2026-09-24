import { reviewReferenceMediaIdentity } from '../src/core/evidence-provenance.js';

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const result = await reviewReferenceMediaIdentity({
  runRoot: arg('--run-root'),
  targetGame: arg('--target-game'),
  workspace: arg('--workspace'),
  id: arg('--id'),
  expectedSha256: arg('--expected-sha256'),
  reviewer: arg('--reviewer'),
  basis: arg('--basis'),
});
console.log(JSON.stringify({ schemaVersion: 1, artifactType: 'ReferenceMediaIdentityReviewResult', ...result }, null, 2));
