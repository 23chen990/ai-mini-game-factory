/* global console, URL */
// Run with: node --import tsx docs/race-two-button-20261014/verify-evidence.mjs
// This verifies saved evidence integrity; it does not run or approve gameplay.
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { QaReportSchema, BuildReportSchema } from '../../src/schemas/index.ts';
import { ExperienceComplaintTriageSchema, ExperienceReproductionMatrixSchema } from '../../src/schemas/experience-complaint.ts';
import { NaturalFlowEvidenceSchema } from '../../src/schemas/natural-flow.ts';
import { ExperienceContractSchema } from '../../src/schemas/experience-contract.ts';
import { OpenSourceResearchArtifactSchema } from '../../src/schemas/open-source-research.ts';
import { FailurePressureContractSchema } from '../../src/schemas/failure-pressure-contract.ts';
import { ProductExperienceContractSchema, PerceptualQaReportSchema, PerceptualQaGateSchema } from '../../src/schemas/product-experience.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const docs = fileURLToPath(new URL('./', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async name => JSON.parse(await readFile(path.join(docs, name), 'utf8'));
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const schemas = {
  qa: QaReportSchema, build: BuildReportSchema, triage: ExperienceComplaintTriageSchema,
  reproduction: ExperienceReproductionMatrixSchema, natural: NaturalFlowEvidenceSchema,
  experience: ExperienceContractSchema, research: OpenSourceResearchArtifactSchema,
  pressure: FailurePressureContractSchema, product: ProductExperienceContractSchema,
  perceptual: PerceptualQaReportSchema, perceptualGate: PerceptualQaGateSchema,
};
const manifest = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal('3D 赛车 H5 / qq-speed'),
  targetRunId: z.literal('h5-qq-mobile-20261013'), targetWorkspace: z.string().min(1),
  buildHash: digest, capturedAt: z.string().datetime(),
  files: z.array(z.object({
    sourcePath: z.string().min(1), sourceSha256: digest,
    archivePath: z.string().min(1), archiveSha256: digest,
    encoding: z.enum(['copy', 'gzip']), schema: z.enum(Object.keys(schemas)).optional(),
  }).strict()).min(1),
}).strict().parse(await json('evidence-provenance.json'));

let schemaCount = 0;
const bySource = new Map();
for (const entry of manifest.files) {
  const absolute = path.resolve(root, entry.archivePath);
  assert.ok(absolute.startsWith(docs), 'archive must remain in this delivery');
  const archive = await readFile(absolute);
  assert.equal(sha(archive), entry.archiveSha256, entry.archivePath);
  const original = entry.encoding === 'gzip' ? gunzipSync(archive) : archive;
  assert.equal(sha(original), entry.sourceSha256, entry.sourcePath);
  if (entry.schema) { schemas[entry.schema].parse(JSON.parse(original)); schemaCount++; }
  bySource.set(entry.sourcePath, { entry, original });
}
const build = await json('build-racing.json');
assert.equal(build.buildHash, manifest.buildHash);
const contract = await readFile(path.join(docs, 'product-experience-contract.json'));
const review = await json('independent-mobile/perceptual-addendum.json');
assert.equal(review.contractHash, sha(contract));
assert.equal(review.buildHash, build.buildHash);
assert.equal(review.passed, false, 'the physical/background gates remain blocked');
for (const item of review.cases) {
  for (const binding of [...item.screenshots, ...(item.trace ? [item.trace] : [])]) {
    const saved = bySource.get(binding.path);
    assert.ok(saved, `missing archived binding: ${binding.path}`);
    assert.equal(sha(saved.original), binding.sha256, binding.path);
  }
}
for (const viewport of ['844x390', '852x393', '740x360']) {
  const report = await json(`natural-${viewport}/report.json`);
  const raw = gunzipSync(await readFile(path.join(docs, `natural-${viewport}/natural-input-trace.json.gz`)));
  const trace = JSON.parse(raw);
  assert.equal(trace.buildHash, build.buildHash);
  assert.deepEqual(trace.forbiddenOperations, []);
  assert.equal(trace.inputTransport, 'CDP Input.dispatchTouchEvent');
  assert.equal(report.coreJourneyPassed, true);
  assert.equal(report.passed, false);
  assert.equal(report.gates.realBackground, 'BLOCKED');
  assert.equal(trace.frames.at(-1).observed.finished, true);
  assert.equal((report.replay ?? report.next).phase, 'race');
}
const owned = 'templates/web-lite/h5-source-mobile-v1/racing';
const inputs = await Promise.all(['driver.mjs', 'session.mjs', 'mobile.mjs', 'mobile.css'].map(name => readFile(path.join(root, owned, name), 'utf8')));
const builder = await readFile(path.join(root, 'tools/lean-pilot/racing-mobile-build.mjs'), 'utf8');
assert.equal(sha(inputs.join('\n') + builder), build.inputHash, 'current source must match the tested build');
const history = await json('repair-history.json');
assert.equal(history.priorRepairAttempt, 2);
assert.equal(history.repairAttempt, 9);
assert.equal(history.attempts.at(-1).buildHash, build.buildHash);
const gate = await json('runtime-product-gate.json');
assert.equal(gate.coreJourney, 'PASS');
assert.equal(gate.releaseGate, 'BLOCKED');
assert.equal((await json('qa-final.json')).passed, false);
for (const [file, expected] of Object.entries({
  'runs/h5-qq-mobile-20261013/workspace/game/index.html': gate.htmlSha256,
  [`runs/h5-qq-mobile-20261013/${build.trialName}`]: build.trialSha256,
})) {
  try { await access(path.join(root, file)); }
  catch { continue; } // Generated outputs are deliberately not committed.
  assert.equal(sha(await readFile(path.join(root, file))), expected, file);
}
console.log(JSON.stringify({ integrity: 'PASS', files: manifest.files.length, zodArtifacts: schemaCount, coreJourney: 'PASS', overallQa: 'BLOCKED', buildHash: build.buildHash }, null, 2));
