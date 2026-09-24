import { describe, expect, it } from 'vitest';
import { advanceTicks, createInitialState, replay, tap } from './simulation.js';
import { loadCutStackRuntime } from './runtime-loader.js';
import type { CutStackLevelConfig } from './simulation.js';

const legacyLevel: CutStackLevelConfig = {
  fixedStepSeconds: 1 / 60,
  gravity: 760,
  tapImpulse: -430,
  forwardSpeed: 260,
  angularImpulse: Math.PI * 2,
  failY: 650,
  finishX: 920,
  player: { x: 80, y: 420, radius: 18, angle: Math.PI / 2 },
  objects: [{ id: 'demo-target', role: 'cuttable', x: 220, y: 150, width: 46, height: 380 }],
};

const runtimePayload = {
  schemaVersion: 1,
  artifactType: 'reference-level-runtime-data',
  targetRunId: 'loader-run',
  targetGame: 'loader-game',
  workspace: '/tmp/loader-run/workspace/game',
  production: { line: 'cut-stack-dodge', template: 'cut-stack-dodge-v1', runtime: 'web-lite', resolutionHash: 'resolution' },
  sourceContract: { path: 'artifacts/reference-level-implementation-contract.json', sha256: 'contract' },
  level: {
    objects: [
      { semanticId: 'player-object', role: 'player', spawnOrder: 0, lifecycleOrder: ['ready', 'moving'] },
      { semanticId: 'authored-target', role: 'cuttable', spawnOrder: 1, lifecycleOrder: ['ready', 'resolved'] },
    ],
    checkpoints: [], placements: [], relations: [], actions: [], camera: [], terminal: null, replay: null,
  },
};

const authoredLevel: CutStackLevelConfig = {
  ...legacyLevel,
  player: { ...legacyLevel.player, x: 140 },
  objects: [{ id: 'authored-target', role: 'cuttable', x: 350, y: 180, width: 34, height: 180 }],
};

async function cryptoHashJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recordingInputs() {
  const runtimeData = { ...runtimePayload, runtimeDataHash: await cryptoHashJson(runtimePayload) };
  const layout = {
    schemaVersion: 1,
    artifactType: 'reference-level-layout',
    template: 'cut-stack-dodge-v1',
    runtime: 'web-lite',
    sourceRuntimeDataHash: runtimeData.runtimeDataHash,
    playerObjectId: 'player-object',
    level: authoredLevel,
  };
  return { runtimeData, layout };
}

describe('cut-stack runtime loader', () => {
  it('keeps null runtime data on an explicit legacy demo path', async () => {
    const loaded = await loadCutStackRuntime(null, null, legacyLevel);
    expect(loaded.mode).toBe('demo');
    expect(loaded.level).toEqual(legacyLevel);
    expect(loaded.runtimeBinding).toBeUndefined();
  });

  it('uses authored player and objects, binds the loaded runtime, and rejects stale data', async () => {
    const { runtimeData, layout } = await recordingInputs();
    const loaded = await loadCutStackRuntime(runtimeData, layout, legacyLevel);
    expect(loaded.mode).toBe('recording');
    expect(loaded.playerObjectId).toBe('player-object');
    expect(loaded.level).toEqual(authoredLevel);
    expect(createInitialState(loaded.level).objects.map((object) => object.id)).toEqual(['authored-target']);
    expect(loaded.runtimeBinding).toMatchObject({ runtimeDataHash: runtimeData.runtimeDataHash, dataPath: 'src/generated/reference-level.json' });
    const running = advanceTicks(loaded.level, tap(createInitialState(loaded.level)), 4);
    expect(running.player.x).not.toBe(advanceTicks(legacyLevel, tap(createInitialState(legacyLevel)), 4).player.x);
    expect(replay(loaded.level, running).objects.map((object) => object.id)).toEqual(loaded.objectIds);
    expect(() => loadCutStackRuntime(runtimeData, { ...layout, sourceRuntimeDataHash: '0'.repeat(64) }, legacyLevel)).toThrow(/hash/i);
    expect(() => loadCutStackRuntime(runtimeData, { ...layout, playerObjectId: 'foreign-player' }, legacyLevel)).toThrow(/player/i);
    expect(() => loadCutStackRuntime(runtimeData, { ...layout, level: { ...layout.level, objects: [] } }, legacyLevel)).toThrow(/object/i);
  });
});
