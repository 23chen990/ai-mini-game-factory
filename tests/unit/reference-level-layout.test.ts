import { describe, expect, it } from 'vitest';
import { sha256Text } from '../../src/core/files.js';
import {
  createReferenceLevelSaveIdentity,
  buildDeterministicReferenceLevelLayout,
  loadReferenceLevelLayout,
  validateReferenceLevelSave,
} from '../../src/core/reference-level-layout.js';
import { ReferenceLevelLayoutSchema } from '../../src/schemas/reference-level-layout.js';
import { advanceTicks, createInitialState, replay, tap } from '../../templates/web-lite/cut-stack-dodge-v1/src/simulation.js';

const physicalObjects = [
  { semanticId: 'target-object', role: 'cuttable', spawnOrder: 1, lifecycleOrder: ['ready', 'resolved'] },
  { semanticId: 'support-object', role: 'support', spawnOrder: 2, lifecycleOrder: ['ready'] },
  { semanticId: 'hazard-object', role: 'hazard', spawnOrder: 3, lifecycleOrder: ['ready', 'contact'] },
  { semanticId: 'finish-object', role: 'finish', spawnOrder: 4, lifecycleOrder: ['ready', 'contact'] },
] as const;

function runtimeData() {
  const payload = {
    schemaVersion: 1 as const,
    artifactType: 'reference-level-runtime-data' as const,
    targetRunId: 'layout-test-run',
    targetGame: 'layout-test-game',
    workspace: '/tmp/layout-test-run/workspace/game',
    production: {
      line: 'cut-stack-dodge' as const,
      template: 'cut-stack-dodge-v1' as const,
      runtime: 'web-lite' as const,
      resolutionHash: sha256Text('resolution'),
    },
    sourceContract: {
      path: 'artifacts/reference-level-implementation-contract.json' as const,
      sha256: sha256Text('contract'),
    },
    level: {
      objects: [
        { semanticId: 'player-object', role: 'player' as const, spawnOrder: 0, lifecycleOrder: ['ready', 'moving'] as const },
        ...physicalObjects,
      ],
      checkpoints: [],
      placements: [],
      relations: [],
      actions: [],
      camera: [],
      terminal: null,
      replay: null,
    },
  };
  return { ...payload, runtimeDataHash: sha256Text(JSON.stringify(payload)) };
}

function layout(sourceRuntimeDataHash: string | null = runtimeData().runtimeDataHash) {
  return {
    schemaVersion: 1 as const,
    artifactType: 'reference-level-layout' as const,
    template: 'cut-stack-dodge-v1' as const,
    runtime: 'web-lite' as const,
    sourceRuntimeDataHash,
    playerObjectId: 'player-object',
    level: {
      fixedStepSeconds: 1 / 60,
      gravity: 720,
      tapImpulse: -420,
      forwardSpeed: 240,
      angularImpulse: Math.PI * 2,
      failY: 720,
      finishX: 960,
      player: { x: 64, y: 300, radius: 18, angle: Math.PI / 2 },
      objects: [
        { id: 'target-object', role: 'cuttable' as const, x: 240, y: 160, width: 48, height: 220 },
        { id: 'support-object', role: 'support' as const, x: 40, y: 360, width: 160, height: 42 },
        { id: 'hazard-object', role: 'hazard' as const, x: 480, y: 400, width: 70, height: 200 },
        { id: 'finish-object', role: 'finish' as const, x: 940, y: 80, width: 28, height: 460 },
      ],
    },
  };
}

describe('reference-level-layout consumer contract', () => {
  it('provides a clearly labelled deterministic Builder fallback for mock previews', () => {
    const data = runtimeData();
    const generated = buildDeterministicReferenceLevelLayout(data);
    expect(generated.sourceRuntimeDataHash).toBe(data.runtimeDataHash);
    expect(generated.playerObjectId).toBe('player-object');
    expect(generated.level.objects.map((object) => object.id)).toEqual(['target-object', 'support-object', 'hazard-object', 'finish-object']);
    expect(generated.level.objects.map((object) => object.role)).toEqual(['cuttable', 'support', 'hazard', 'finish']);
    expect(generated.level.finishX).toBeGreaterThan(generated.level.player.x);
    const byRole = new Map(generated.level.objects.map((object) => [object.role, object]));
    expect(byRole.get('cuttable')).toMatchObject({ x: 420, y: 205, width: 100, height: 50 });
    expect(byRole.get('hazard')).toMatchObject({ x: 700, y: 400 });
    expect(byRole.get('finish')).toMatchObject({ x: 900, y: 210, width: 28 });
    expect(generated.level.forwardSpeed).toBeGreaterThan(500);
    expect(generated.level.tapImpulse).toBe(-280);
  });

  it('validates authored config, binds exact runtime objects, and produces save identity', () => {
    const data = runtimeData();
    const loaded = loadReferenceLevelLayout(layout(), data);

    expect(loaded.mode).toBe('recording');
    expect(loaded.layout.level.objects.map((object) => object.id)).toEqual(['target-object', 'support-object', 'hazard-object', 'finish-object']);
    expect(loaded.playerObjectId).toBe('player-object');
    expect(loaded.runtimeBinding).toEqual({
      runtimeDataHash: data.runtimeDataHash,
      contractHash: data.sourceContract.sha256,
      resolutionHash: data.production.resolutionHash,
      dataPath: 'src/generated/reference-level.json',
    });
    expect(loaded.layoutHash).toMatch(/^[a-f0-9]{64}$/u);

    const saveIdentity = createReferenceLevelSaveIdentity(loaded);
    expect(validateReferenceLevelSave({ ...saveIdentity, state: createInitialState(loaded.level) }, saveIdentity)).toMatchObject(saveIdentity);
    expect(() => validateReferenceLevelSave({ ...saveIdentity, objectIds: ['stale-object'], state: {} }, saveIdentity)).toThrow(/object/i);
  });

  it('rejects foreign IDs, stale runtime hashes, and non-finite authored physics', () => {
    const data = runtimeData();
    expect(() => loadReferenceLevelLayout({ ...layout(), playerObjectId: 'foreign-player' }, data)).toThrow(/player/i);
    expect(() => loadReferenceLevelLayout({ ...layout(), sourceRuntimeDataHash: sha256Text('stale') }, data)).toThrow(/hash/i);
    expect(() => loadReferenceLevelLayout({ ...layout(), level: { ...layout().level, objects: [{ ...layout().level.objects[0], id: 'foreign-object' }, ...layout().level.objects.slice(1)] } }, data)).toThrow(/object/i);
    expect(() => ReferenceLevelLayoutSchema.parse({ ...layout(), level: { ...layout().level, gravity: Number.NaN } })).toThrow();
    expect(() => ReferenceLevelLayoutSchema.parse({ ...layout(), unexpected: true })).toThrow();
  });

  it('keeps legacy demo fallback explicit and changes live simulation from authored layouts', () => {
    const demo = loadReferenceLevelLayout(layout(null), null);
    const alternate = loadReferenceLevelLayout({ ...layout(null), level: { ...layout(null).level, player: { ...layout(null).level.player, x: 180 }, objects: layout(null).level.objects.map((object, index) => index === 0 ? { ...object, x: 320 } : object) } }, null);
    expect(demo.mode).toBe('demo');
    expect(demo.runtimeBinding).toBeUndefined();
    expect(createInitialState(demo.level).player.x).not.toBe(createInitialState(alternate.level).player.x);
    expect(createInitialState(demo.level).objects[0]?.x).not.toBe(createInitialState(alternate.level).objects[0]?.x);
    expect(alternate.layoutHash).not.toBe(demo.layoutHash);
  });

  it('keeps both natural failure and timed recovery branches playable', () => {
    const authored = buildDeterministicReferenceLevelLayout(runtimeData()).level;
    const failed = advanceTicks(authored, tap(createInitialState(authored)), 120);
    expect(failed.phase).toBe('failed');
    expect(failed.failureCause).toBe('hazard-object');
    expect(failed.events.some((event) => event.type === 'cut' && event.objectId === 'target-object')).toBe(true);
    const retried = replay(authored, failed);
    const beforeHazard = advanceTicks(authored, tap(retried), 45);
    const settled = advanceTicks(authored, tap(beforeHazard), 90);
    expect(settled.phase).toBe('won');
    expect(settled.events.some((event) => event.type === 'finish')).toBe(true);
  });

  it('replay starts from the same authored layout and cannot use a stale object list', () => {
    const loaded = loadReferenceLevelLayout(layout(), runtimeData());
    const fresh = createInitialState(loaded.level);
    const replayLike = createInitialState(loaded.level, 2, 99);
    expect(replayLike.objects.map((object) => object.id)).toEqual(fresh.objects.map((object) => object.id));
    expect(replayLike.player.x).toBe(fresh.player.x);
    expect(() => validateReferenceLevelSave({ ...createReferenceLevelSaveIdentity(loaded), objectIds: [...loaded.objectIds, 'foreign'], state: {} }, createReferenceLevelSaveIdentity(loaded))).toThrow(/object/i);
  });
});
