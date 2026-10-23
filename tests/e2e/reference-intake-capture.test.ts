import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { loadReferenceIntakeEvidence } from '../../src/core/reference-intake.js';
import { createFactory } from '../../src/factory.js';
import { reviewReferenceMediaIdentity } from '../../src/core/evidence-provenance.js';

it('captures into a brief-only run and keeps collection separate from identity and mechanic approval', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'intake-capture-'));
  try {
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const brief = path.join(root, 'brief.json');
    await writeFile(brief, JSON.stringify({ schemaVersion: 1, title: 'Capture Trial', theme: 'First-party transport fixture', source: { name: 'Local fixture', url: 'https://example.com/game' } }));
    const runId = await factory.newReference(brief);
    const runRoot = path.join(root, 'runs', runId);
    const workspace = path.join(runRoot, 'workspace/game');
    await mkdir(workspace, { recursive: true });
    const fixture = path.join(workspace, 'capture-fixture.html');
    await writeFile(fixture, '<title>First-party transport fixture</title><canvas width="390" height="844"></canvas>');
    expect(factory).toHaveProperty('captureReferenceUrl');
    const result = await factory.captureReferenceUrl(runId, { url: pathToFileURL(fixture).href, captureId: 'first-pass', durationSeconds: 0.25, fps: 4 });
    expect(result.capture.status).toBe('READY');
    expect((await factory.run(runId)).stage).toBe('REFERENCE_DEEP_RESEARCH');
    await factory.promoteReferenceCapture(runId, 'first-pass');
    const provenance = JSON.parse(await readFile(path.join(runRoot, 'reference-evidence/manifest.json'), 'utf8'));
    expect(provenance.entries[0]).toMatchObject({ reviewStatus: 'PENDING', usableAsEvidence: false });
    const entry = provenance.entries[0];
    await reviewReferenceMediaIdentity({ runRoot, targetGame: 'capture-trial', workspace, id: entry.id, expectedSha256: entry.sha256, reviewer: 'fixture', basis: 'Explicit synthetic first-party transport fixture identity.' });
    const state = await factory.resume(runId);
    expect(state.stage).toBe('REFERENCE_DEEP_RESEARCH');
    const frames = JSON.parse(await readFile(path.join(runRoot, 'artifacts/reference-frame-manifest.json'), 'utf8'));
    expect(frames).toMatchObject({ status: 'READY', source: { mediaType: 'image/png-sequence' } });
    expect(state.stages.REFERENCE_DEEP_RESEARCH?.evidence.join(' ')).toMatch(/Mock provider cannot observe|recording-level/);
    await expect(readFile(path.join(runRoot, 'input/seed.yaml'))).rejects.toThrow();
    await writeFile(path.join(runRoot, result.capture.frames[0]!.path), 'tampered after cached research');
    await expect(loadReferenceIntakeEvidence(runRoot, runId)).rejects.toThrow(/hash mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
