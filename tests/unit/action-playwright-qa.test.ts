import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { runActionPlaywrightQa } from '../../src/qa/action-playwright-qa.js';
import type {
  ActionMechanicExperimentSpec,
  ActionPrototypeBuildReport,
} from '../../src/schemas/action-mechanic-experiment.js';

const hash = `sha256:${'a'.repeat(64)}`;
const slots = ['A', 'B', 'C'] as const;

const spec: ActionMechanicExperimentSpec = {
  schemaVersion: 1,
  experimentId: 'swing-feel-1',
  question: 'Which one-button swing has the clearest release timing?',
  coreAction: 'Hold to attach and release to preserve momentum',
  decisionIntervalMs: 800,
  sourceWorkspace: 'workspace/source-game',
  sharedGeometryFixture: 'fixtures/action-course.json',
  constraints: {
    greyboxOnly: true,
    chaseIncluded: false,
    formalUiIncluded: false,
    iaaIncluded: false,
  },
  prototypes: slots.map((slot) => ({
    slot,
    name: `Prototype ${slot}`,
    workspace: `workspace/action-${slot.toLowerCase()}`,
    geometryFixtureHash: hash,
    treatmentHash: hash,
    hypothesis: `${slot} preserves readable momentum`,
    treatment: [`treatment-${slot}`],
  })),
  automaticQaThresholds: {
    inputResponseMs: { max: 100 },
    releaseVelocityRetentionRatio: { min: 0.9 },
    wrongHookAttachments: { max: 0 },
    maxEventGapMs: { max: 1_000 },
    retryFrictionMs: { max: 500 },
    missedFinishDetections: { max: 0 },
  },
};

const buildReport: ActionPrototypeBuildReport = {
  schemaVersion: 1,
  experimentId: spec.experimentId,
  prototypes: spec.prototypes.map(({ slot, workspace, geometryFixtureHash, treatmentHash }) => ({
    slot,
    workspace,
    geometryFixtureHash,
    treatmentHash,
    entrypoint: `${workspace}/dist/index.html`,
    launchCommand: 'pnpm preview',
    author: 'BuilderAgent',
    verification: ['pnpm test', 'pnpm build'],
  })),
};

function actionFixture(slot: string) {
  return `<!doctype html>
    <html><body><canvas width="390" height="844"></canvas><script>
      (() => {
        let scenario = 'input-response';
        let seq = 0;
        let events = [];
        let state;
        const fresh = () => ({
          tick: 0,
          status: scenario === 'retry-friction' ? 'failed' : 'playing',
          inputHeld: false,
          player: {
            x: scenario === 'finish-crossing' ? 90 : 0,
            y: 200,
            vx: scenario === 'release-kinematics' ? 10 : scenario === 'finish-crossing' ? 20 : 2,
            vy: 0,
          },
          anchors: [
            { id: 'behind', x: -10, y: 100 },
            { id: 'forward', x: 20, y: 100 },
          ],
          attachedAnchorId: null,
          ropeLength: null,
          maxSpeed: 20,
          finishX: 100,
          failY: 900,
          eventSeq: seq,
        });
        const emit = (type, source = 'simulation') => {
          seq += 1;
          state.eventSeq = seq;
          events.push({ seq, tick: state.tick, type, source });
        };
        const api = {
          contractVersion: 1,
          getManifest: () => ({
            slot: '${slot}',
            fixedStepSeconds: 1 / 60,
            courseFixtureHash: '${hash}',
            anchorPolicy: 'forward-direction-nearest',
          }),
          resetGame: () => { seq = 0; events = []; state = fresh(); return state; },
          getState: () => structuredClone(state),
          act: ({ held, source = 'api' }) => {
            state.inputHeld = held;
            if ((scenario === 'input-response' || scenario === 'hook-selection' || scenario === 'release-kinematics') && held) {
              state.attachedAnchorId = 'forward';
              state.ropeLength = 100;
              emit('anchor-attached', source);
            } else if (scenario === 'release-kinematics' && !held) {
              state.attachedAnchorId = null;
              state.ropeLength = null;
              emit('input-released', source);
            } else if (scenario === 'retry-friction' && held && state.status === 'failed') {
              state.status = 'playing';
              emit('retry', source);
            } else {
              emit(held ? 'input-held' : 'input-released', source);
            }
            return api.getState();
          },
          advanceTicks: (count) => {
            for (let i = 0; i < count; i += 1) {
              state.tick += 1;
              if (scenario === 'event-gap') state.player.vx += 2;
              if (scenario === 'finish-crossing') {
                state.player.x += 15;
                if (state.player.x >= state.finishX) state.status = 'won';
              }
            }
            return api.getState();
          },
          loadScenario: (id) => { scenario = id; seq = 0; events = []; state = fresh(); return api.getState(); },
          getEvents: (since = 0) => events.filter((event) => event.seq > since).map((event) => ({ ...event })),
        };
        state = fresh();
        window.__ACTION_TEST__ = api;
        addEventListener('keydown', (event) => {
          if (event.code === 'Space' && !event.repeat) api.act({ held: true, source: 'keyboard' });
        });
        addEventListener('keyup', (event) => {
          if (event.code === 'Space') api.act({ held: false, source: 'keyboard' });
        });
      })();
    </script></body></html>`;
}

class FakeRuntime implements RuntimeAdapter {
  readonly started: string[] = [];
  stopCalls = 0;

  constructor(
    private readonly includeContract: boolean,
    private readonly transformFixture: (html: string) => string = (html) => html,
  ) {}

  async createProject() {}
  async applyBlueprint() {}
  async importAssets() {}
  async verifyProject() { return []; }
  async buildWeb() { return ''; }
  async buildTarget() { return ''; }
  async stopPreview() { this.stopCalls += 1; }

  async startPreview(workspace: string) {
    this.started.push(workspace);
    const slot = workspace.endsWith('-a') ? 'A' : workspace.endsWith('-b') ? 'B' : 'C';
    const html = this.includeContract
      ? this.transformFixture(actionFixture(slot))
      : '<!doctype html><canvas width="390" height="844"></canvas>';
    return { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`, stop: async () => undefined };
  }
}

describe('runActionPlaywrightQa', () => {
  it('marks every slot failed when the required __ACTION_TEST__ v1 contract is absent', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-qa-missing-contract-'));
    const runtime = new FakeRuntime(false);

    const report = await runActionPlaywrightQa(runtime, spec, buildReport, runRoot);

    expect(report.results).toHaveLength(3);
    expect(report.recommendation).toBe('NONE');
    for (const result of report.results) {
      expect(Object.values(result).filter((value) => typeof value === 'object')).toEqual(
        expect.arrayContaining([expect.objectContaining({ passed: false })]),
      );
      expect(result.inputResponseMs.evidence).toMatch(/contract/i);
    }
    expect(runtime.started).toHaveLength(3);
    expect(runtime.stopCalls).toBe(3);
  });

  it('returns independent A/B/C metric results and writes screenshot, log, and trace evidence', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-qa-three-slots-'));
    const runtime = new FakeRuntime(true);

    const report = await runActionPlaywrightQa(runtime, spec, buildReport, runRoot);

    expect(report).toMatchObject({
      schemaVersion: 1,
      experimentId: spec.experimentId,
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
    });
    expect(report.results.map(({ slot }) => slot)).toEqual(['A', 'B', 'C']);
    expect(report.results.every((result) => Object.values(result).filter((value) => typeof value === 'object').every((metric) => (metric as { passed: boolean }).passed))).toBe(true);
    for (const slot of slots) {
      await expect(access(path.join(runRoot, `screenshots/action-${slot}.png`))).resolves.toBeUndefined();
      await expect(access(path.join(runRoot, `logs/action-${slot}.log`))).resolves.toBeUndefined();
      await expect(access(path.join(runRoot, `traces/action-${slot}.json`))).resolves.toBeUndefined();
      await expect(access(path.join(runRoot, `traces/action-${slot}.zip`))).resolves.toBeUndefined();
    }
  });

  it('fails retry friction when the named scenario does not actually begin in failure', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-qa-invalid-retry-scenario-'));
    const runtime = new FakeRuntime(true, (html) => html.replace(
      "loadScenario: (id) => { scenario = id;",
      "loadScenario: (id) => { scenario = id === 'retry-friction' ? 'input-response' : id;",
    ));

    const report = await runActionPlaywrightQa(runtime, spec, buildReport, runRoot);

    expect(report.recommendation).toBe('NONE');
    expect(report.results.every(({ retryFrictionMs }) => !retryFrictionMs.passed)).toBe(true);
  });
});
