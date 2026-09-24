import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateProductionLineCapability } from '../../src/core/production-line-capability.js';
import { qaModeForProductionLine } from '../../src/qa/production-line-qa.js';
import { SeedSchema } from '../../src/schemas/index.js';
import {
  advanceFrame,
  createInitialState,
  replay,
  tap,
  type CutStackLevelConfig,
} from '../../templates/web-lite/cut-stack-dodge-v1/src/simulation.js';

const templateRoot = path.join(process.cwd(), 'templates/web-lite/cut-stack-dodge-v1');

const level: CutStackLevelConfig = {
  fixedStepSeconds: 1 / 60,
  gravity: 0,
  tapImpulse: -180,
  forwardSpeed: 120,
  angularImpulse: Math.PI * 2,
  failY: 900,
  finishX: 1_000,
  player: { x: 40, y: 200, radius: 12, angle: 0 },
  objects: [],
};

describe('cut-stack-dodge-v1 production contract', () => {
  it('is a supported web-lite mother template for the cut production line', () => {
    expect(SeedSchema.parse({
      title: '符刃夜行',
      theme: '原创符刃训练场',
      runtime: 'web-lite',
      template: 'cut-stack-dodge-v1',
      designMode: 'reference_reskin',
      referenceMechanics: {
        schemaVersion: 1,
        lockedBy: 'human',
        source: { name: 'recording-bound generic mechanics', url: 'https://example.com/reference', researchFiles: [] },
        coreLoop: ['tap', 'flip', 'contact', 'settle'],
        playerActions: ['tap'],
        progressionSystems: ['authored course'],
        unlockRules: ['finish unlocks replay'],
        feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 1, microGoalMaxSeconds: 30 },
        mustPreserveMechanics: ['tap changes the blade trajectory'],
        adaptableMechanics: ['original expression'],
        fidelityPolicy: {
          level: 'maximum_core_mechanics',
          preserveInputStateTransitions: true,
          preserveCoreLoopOrder: true,
          preserveProgressionTopology: true,
          preserveUnlockDependencies: true,
          preserveFailureAndRecoveryRules: true,
          preserveFeedbackTimingBands: true,
        },
        expressionIsolation: {
          originalCode: true,
          originalAssets: true,
          originalNamesAndText: true,
          originalUiLayout: true,
          originalAudio: true,
          originalTuningValues: true,
        },
      },
    }).template).toBe('cut-stack-dodge-v1');

    expect(evaluateProductionLineCapability({
      line: 'cut-stack-dodge',
      template: 'cut-stack-dodge-v1',
      runtime: 'web-lite',
    })).toMatchObject({ passed: true, blockers: [] });
    expect(qaModeForProductionLine('cut-stack-dodge')).toBe('cut-stack-dodge');
  });

  it('ships a deterministic fixed-step simulation across 30, 60, and 120 Hz host frames', () => {
    const run = (frameSeconds: number) => {
      let state = tap(createInitialState(level));
      for (let elapsed = 0; elapsed < 1 - 1e-9; elapsed += frameSeconds) {
        state = advanceFrame(level, state, Math.min(frameSeconds, 1 - elapsed));
      }
      return state;
    };
    const at30 = run(1 / 30);
    const at60 = run(1 / 60);
    const at120 = run(1 / 120);
    expect(at30.tick).toBe(60);
    expect(at60).toEqual(at30);
    expect(at120).toEqual(at30);
  });

  it('uses swept contact so a fast sharp edge cuts a thin target without tunnelling', () => {
    const fastLevel: CutStackLevelConfig = {
      ...level,
      forwardSpeed: 3_600,
      player: { ...level.player, angle: Math.PI / 2 },
      objects: [{ id: 'cut-1', role: 'cuttable', x: 90, y: 180, width: 4, height: 40 }],
    };
    let state = tap(createInitialState(fastLevel));
    state = advanceFrame(fastLevel, state, 1 / 60);
    expect(state.objects[0]).toMatchObject({ id: 'cut-1', lifecycle: 'falling' });
    expect(state.events.some((event) => event.type === 'cut' && event.objectId === 'cut-1')).toBe(true);
  });

  it('attributes hazard failure, reaches a terminal finish, and replays from a clean state', () => {
    const hazardLevel: CutStackLevelConfig = {
      ...level,
      forwardSpeed: 3_600,
      objects: [{ id: 'hazard-1', role: 'hazard', x: 90, y: 180, width: 4, height: 40 }],
    };
    const failed = advanceFrame(hazardLevel, tap(createInitialState(hazardLevel)), 1 / 60);
    expect(failed).toMatchObject({ phase: 'failed', failureCause: 'hazard-1' });

    const finishLevel = { ...level, finishX: 80, forwardSpeed: 3_600 };
    const won = advanceFrame(finishLevel, tap(createInitialState(finishLevel)), 1 / 60);
    expect(won.phase).toBe('won');
    expect(replay(finishLevel, won)).toEqual(createInitialState(finishLevel, 2));
  });

  it('can be copied and verified through the web-lite runtime adapter', async () => {
    const packageJson = JSON.parse(await readFile(path.join(templateRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts).toMatchObject({ test: 'vitest run', typecheck: 'tsc --noEmit', build: 'vite build' });
    expect(await readFile(path.join(templateRoot, 'src/main.ts'), 'utf8')).toContain('__REFERENCE_LEVEL_TEST__');
    expect(await readFile(path.join(templateRoot, 'src/main.ts'), 'utf8')).toContain('__GAME_TEST__');
  });
});
