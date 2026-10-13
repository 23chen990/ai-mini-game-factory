/* global process, URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { auditResearchToBuild } from '../research-to-build.mjs';

const caseRoot = fileURLToPath(new URL('../../../examples/lean-pilot/clinic/', import.meta.url));
const cli = fileURLToPath(new URL('../research-gate-cli.mjs', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'research-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(caseRoot, root, { recursive: true });
  return root;
}
async function edit(root, file, mutate) {
  const name = path.join(root, file);
  const value = JSON.parse(await readFile(name, 'utf8'));
  mutate(value);
  await writeFile(name, JSON.stringify(value, null, 2) + '\n');
}
test('original clinic code findings are bound to prototype loops and three 180s natural-input cases', async () => {
  const report = await auditResearchToBuild(caseRoot, 'research-to-build.json');
  assert.equal(report.status, 'SOURCE_BOUND_PROTOTYPE_HYPOTHESIS', JSON.stringify(report.blockers));
  assert.equal(report.verifiedEvidenceFiles, 3);
  assert.equal(report.mechanismCount, 2);
  assert.equal(report.candidateBuildAllowed, true);
  assert.equal(report.releaseAllowed, false);
  assert.equal(report.referenceRuntimeObserved, false);
  assert.equal(report.humanFunValidated, false);
  assert.equal(report.rea.status, 'NOT_RUN');
  assert.equal(report.counterfactual.scenarios.length, 3);
});
test('CLI reports proposal-only receipt without inventing a real REA run', () => {
  const result = spawnSync(process.execPath, [cli, caseRoot, 'research-to-build.json'], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.qaStatus, 'NOT_RUN');
  assert.equal(receipt.reaExecutedVerified, false);
  assert.equal(receipt.referenceFidelityProven, false);
});
test('reference version mismatch is blocked even when underlying excerpt bytes still match', async t => {
  const root = await fixture(t);
  await edit(root,'research-to-build.json', p => { p.sourceRevision = 'b'.repeat(40); });
  const r=await auditResearchToBuild(root,'research-to-build.json');
  assert.equal(r.status, 'BLOCKED');
  assert.ok(r.blockers.includes('REFERENCE_REVISION_MISMATCH'));
});
test('the wrong game target never inherits someone else evidence', async t => {
  const root = await fixture(t);
  await edit(root,'research-to-build.json', p => { p.referenceId = 'different-reference'; });
  const r=await auditResearchToBuild(root,'research-to-build.json');
  assert.ok(r.blockers.includes('TARGET_IDENTITY_MISMATCH'));
});
test('all required source claims must map to an implementation mechanism', async t => {
  const root=await fixture(t);
  await edit(root,'research-to-build.json',p=>{p.mechanisms[1].claimIds=['separate-queues'];});
  const r=await auditResearchToBuild(root,'research-to-build.json');
  assert.ok(r.blockers.includes('REQUIRED_CLAIM_UNMAPPED:service-time'));
});
test('claims labeled as mere inference are not proof of a reference mechanic', async t => {
  const root=await fixture(t);
  await edit(root,'research.json',p=>{p.claims[1].kind='INFERENCE';});
  const r=await auditResearchToBuild(root,'research-to-build.json');
  assert.ok(r.blockers.some(x=>x.includes('required-unresolved')));
});
test('a stale or changed contract is blocked', async t => {
  const root=await fixture(t);
  await edit(root,'contract.json',p=>{p.policyHash='0'.repeat(64);});
  const r=await auditResearchToBuild(root,'research-to-build.json');
  assert.ok(r.blockers.some(x=>x.startsWith('SPEC_')));
});
test('real source text byte changes invalidate the claim hash', async t => {
  const root=await fixture(t);
  await writeFile(path.join(root,'reference/queue-excerpt.txt'),'TAMPERED');
  const r=await auditResearchToBuild(root,'research-to-build.json');
  assert.ok(r.blockers.some(x=>x.includes('hash-mismatch')));
});
test('unknown target actions and fake debug controls are not accepted', async t => {
  const root=await fixture(t);
  await edit(root,'research-to-build.json',p=>{p.counterfactual.scenarios[1].inputMode='DEBUG_INJECTION';});
  await assert.rejects(auditResearchToBuild(root,'research-to-build.json'),/reverse-gate:scenario/);
});
test('no-action, one-action and adaptive must all exist with exact action counts', async t => {
  const root=await fixture(t);
  await edit(root,'research-to-build.json',p=>{p.counterfactual.scenarios[1].actions.push({atSeconds:30,input:'tap',target:'#assign-care'});});
  await assert.rejects(auditResearchToBuild(root,'research-to-build.json'),/reverse-gate:scenario-actions/);
});
test('invalid research permissions and traversal are rejected before reading arbitrary files', async t => {
  const root=await fixture(t);
  await edit(root,'research-to-build.json',p=>{p.sourcePermission.basis='PUBLIC_BUT_UNAUTHORIZED';});
  await assert.rejects(auditResearchToBuild(root,'research-to-build.json'),/reverse-gate:permission/);
  await edit(root,'research-to-build.json',p=>{p.sourcePermission.basis='OWNED';p.inputs.contract='../secrets.json';});
  await assert.rejects(auditResearchToBuild(root,'research-to-build.json'),/reverse-gate:inputs/);
});
test('unreviewed REA claims cannot be enabled with a boolean flip', async t => {
  const root=await fixture(t);
  await edit(root,'research-to-build.json',p=>{p.rea.status='REVIEWED_STATIC';});
  await assert.rejects(auditResearchToBuild(root,'research-to-build.json'),/reverse-gate:rea/);
});
