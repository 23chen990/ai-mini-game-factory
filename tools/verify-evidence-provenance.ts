import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyEvidenceFileBindings } from '../src/core/evidence-provenance.js';

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const manifestPath = arg('--manifest');
const targetGame = arg('--target-game');
const workspace = arg('--workspace');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
const runRoot = path.dirname(path.dirname(path.resolve(manifestPath)));
const result = await verifyEvidenceFileBindings(manifest, { targetGame, workspace }, { runRoot, requireRunLocal: true });
console.log(JSON.stringify({ schemaVersion: 1, artifactType: 'EvidenceProvenanceCheck', passed: result.passed, blockers: result.blockers, manifest: manifestPath }, null, 2));
if (!result.passed) process.exitCode = 1;
