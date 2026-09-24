import { describe, expect, it } from 'vitest';
import {
  ActionMechanicExperimentSpecSchema,
  ActionMechanicExperimentBundleSchema,
  ActionPlaytestReportSchema,
  ActionPrototypeBuildReportSchema,
  HumanActionMechanicDecisionSchema,
} from '../../src/schemas/action-mechanic-experiment.js';

const prototypes = [
  {
    slot: 'A',
    name: 'current baseline',
    workspace: 'workspace/action-a',
    geometryFixtureHash: `sha256:${'0'.repeat(64)}`,
    treatmentHash: `sha256:${'a'.repeat(64)}`,
    hypothesis: 'the current handling establishes the control result',
    treatment: ['keep current hook selection and momentum'],
  },
  {
    slot: 'B',
    name: 'precise swing',
    workspace: 'workspace/action-b',
    geometryFixtureHash: `sha256:${'0'.repeat(64)}`,
    treatmentHash: `sha256:${'b'.repeat(64)}`,
    hypothesis: 'intent-weighted hooks and strict momentum make releases legible',
    treatment: ['weight hooks by flight direction', 'preserve release momentum'],
  },
  {
    slot: 'C',
    name: 'forgiving swing',
    workspace: 'workspace/action-c',
    geometryFixtureHash: `sha256:${'0'.repeat(64)}`,
    treatmentHash: `sha256:${'c'.repeat(64)}`,
    hypothesis: 'input buffering improves recovery without hidden acceleration',
    treatment: ['buffer hook input', 'permit deliberate fall recovery'],
  },
] as const;

const spec = {
  schemaVersion: 1,
  experimentId: 'action_swing_release_01',
  question: 'Is holding and releasing intrinsically satisfying without chase, art, or progression?',
  coreAction: 'hold to hook and release to preserve momentum',
  decisionIntervalMs: 900,
  sourceWorkspace: 'runs/mobile-chart-adaptation/workspace/prototype-a',
  sharedGeometryFixture: 'fixtures/action-course-v1.json',
  constraints: {
    greyboxOnly: true,
    chaseIncluded: false,
    formalUiIncluded: false,
    iaaIncluded: false,
  },
  prototypes,
  automaticQaThresholds: {
    inputResponseMs: { max: 100 },
    releaseVelocityRetentionRatio: { min: 0.9 },
    wrongHookAttachments: { max: 0 },
    maxEventGapMs: { max: 2000 },
    retryFrictionMs: { max: 500 },
    missedFinishDetections: { max: 0 },
  },
} as const;

const builds = prototypes.map(({ slot, workspace, geometryFixtureHash, treatmentHash }) => ({
  slot,
  workspace,
  geometryFixtureHash,
  treatmentHash,
  entrypoint: `${workspace}/dist/index.html`,
  launchCommand: `pnpm preview ${slot.toLowerCase()}`,
  author: 'BuilderAgent',
  verification: ['build:passed', 'determinism:passed'],
}));

const results = prototypes.map(({ slot, workspace }) => ({
  slot,
  workspace,
  inputResponseMs: { value: 62, passed: true, evidence: `${slot}-input.json` },
  releaseVelocityRetentionRatio: { value: 0.94, passed: true, evidence: `${slot}-release.json` },
  wrongHookAttachments: { value: 0, passed: true, evidence: `${slot}-hooks.json` },
  maxEventGapMs: { value: 870, passed: true, evidence: `${slot}-events.json` },
  retryFrictionMs: { value: 310, passed: true, evidence: `${slot}-retry.json` },
  missedFinishDetections: { value: 0, passed: true, evidence: `${slot}-finish.json` },
}));

describe('action mechanic experiment artifacts', () => {
  it('defines one action question, a 400-2000ms decision rhythm, and exactly A/B/C isolated prototypes', () => {
    expect(() => ActionMechanicExperimentSpecSchema.parse(spec)).not.toThrow();
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, decisionIntervalMs: 399 })).toThrow();
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, decisionIntervalMs: 2001 })).toThrow();
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, questions: [spec.question, 'A second question'] })).toThrow();
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, prototypes: [prototypes[0], prototypes[1], { ...prototypes[2], workspace: prototypes[0].workspace }] })).toThrow(/isolated/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, prototypes: [{ ...prototypes[0], treatmentHash: 'not-a-hash' }, ...prototypes.slice(1)] })).toThrow(/hash|format/i);
  });

  it('requires all six automatic QA thresholds', () => {
    const incompleteThresholds = {
      inputResponseMs: spec.automaticQaThresholds.inputResponseMs,
      releaseVelocityRetentionRatio: spec.automaticQaThresholds.releaseVelocityRetentionRatio,
      wrongHookAttachments: spec.automaticQaThresholds.wrongHookAttachments,
      maxEventGapMs: spec.automaticQaThresholds.maxEventGapMs,
      retryFrictionMs: spec.automaticQaThresholds.retryFrictionMs,
    };
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, automaticQaThresholds: incompleteThresholds })).toThrow();
  });

  it('requires a safe repository-relative source workspace for deriving the three variants', () => {
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: '' })).toThrow(/sourceWorkspace|path/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: '/tmp/existing-game' })).toThrow(/relative/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: 'C:/existing-game' })).toThrow(/relative/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: '../outside/game' })).toThrow(/safe|segment|relative/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: 'runs/./game' })).toThrow(/safe|segment/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: 'runs/game/../other' })).toThrow(/safe|segment/i);
    expect(() => ActionMechanicExperimentSpecSchema.parse({ ...spec, sourceWorkspace: 'runs\\..\\outside' })).toThrow(/backslash|safe|relative/i);
  });

  it('accepts one build per slot and rejects duplicate slots or workspaces', () => {
    const report = { schemaVersion: 1, experimentId: spec.experimentId, prototypes: builds };
    expect(() => ActionPrototypeBuildReportSchema.parse(report)).not.toThrow();
    expect(() => ActionPrototypeBuildReportSchema.parse({ ...report, prototypes: [builds[0], builds[1], { ...builds[2], slot: 'A' }] })).toThrow(/slot/i);
    expect(() => ActionPrototypeBuildReportSchema.parse({ ...report, prototypes: [builds[0], builds[1], { ...builds[2], workspace: builds[0]?.workspace }] })).toThrow(/isolated/i);
  });

  it('requires an independent QAAgent report with all six metrics for A/B/C', () => {
    const report = {
      schemaVersion: 1,
      experimentId: spec.experimentId,
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
      results,
      recommendation: 'B',
      rationale: 'B best exposes the release timing consequence.',
    };
    expect(() => ActionPlaytestReportSchema.parse(report)).not.toThrow();
    expect(() => ActionPlaytestReportSchema.parse({ ...report, reviewer: 'BuilderAgent' })).toThrow(/independent/i);
    expect(() => ActionPlaytestReportSchema.parse({ ...report, results: [results[0], results[1], { ...results[2], slot: 'A' }] })).toThrow(/slot/i);
  });

  it('models the human KEEP/REFACTOR/KILL gate coherently', () => {
    expect(() => HumanActionMechanicDecisionSchema.parse({ schemaVersion: 1, experimentId: spec.experimentId, decision: 'KEEP', selectedSlot: 'B', rationale: 'Release timing is readable.', requiredChanges: [] })).not.toThrow();
    expect(() => HumanActionMechanicDecisionSchema.parse({ schemaVersion: 1, experimentId: spec.experimentId, decision: 'REFACTOR', selectedSlot: 'C', rationale: 'Recovery is promising but too automatic.', requiredChanges: ['remove hidden acceleration'] })).not.toThrow();
    expect(() => HumanActionMechanicDecisionSchema.parse({ schemaVersion: 1, experimentId: spec.experimentId, decision: 'KILL', selectedSlot: null, rationale: 'None is intrinsically satisfying.', requiredChanges: [] })).not.toThrow();
    expect(() => HumanActionMechanicDecisionSchema.parse({ schemaVersion: 1, experimentId: spec.experimentId, decision: 'KEEP', selectedSlot: null, rationale: 'invalid', requiredChanges: [] })).toThrow(/selected/i);
    expect(() => HumanActionMechanicDecisionSchema.parse({ schemaVersion: 1, experimentId: spec.experimentId, decision: 'KILL', selectedSlot: 'A', rationale: 'invalid', requiredChanges: [] })).toThrow(/select/i);
  });

  it('keeps schema versions and experiment identities coherent across the bundle', () => {
    const bundle = {
      spec,
      buildReport: { schemaVersion: 1, experimentId: spec.experimentId, prototypes: builds },
      playtestReport: { schemaVersion: 1, experimentId: spec.experimentId, reviewer: 'QAAgent', prototypeAuthor: 'BuilderAgent', results, recommendation: 'B', rationale: 'B wins.' },
      humanDecision: { schemaVersion: 1, experimentId: spec.experimentId, decision: 'KEEP', selectedSlot: 'B', rationale: 'Keep B.', requiredChanges: [] },
    };
    expect(() => ActionMechanicExperimentBundleSchema.parse(bundle)).not.toThrow();
    expect(() => ActionMechanicExperimentBundleSchema.parse({ ...bundle, buildReport: { ...bundle.buildReport, schemaVersion: 2 } })).toThrow();
    expect(() => ActionMechanicExperimentBundleSchema.parse({ ...bundle, playtestReport: { ...bundle.playtestReport, experimentId: 'another_experiment' } })).toThrow(/experiment/i);
    expect(() => ActionMechanicExperimentBundleSchema.parse({
      ...bundle,
      buildReport: {
        ...bundle.buildReport,
        prototypes: [{ ...builds[0], geometryFixtureHash: `sha256:${'1'.repeat(64)}` }, ...builds.slice(1)],
      },
    })).toThrow(/geometry.*hash|hash.*geometry/i);
    expect(() => ActionMechanicExperimentBundleSchema.parse({
      ...bundle,
      buildReport: {
        ...bundle.buildReport,
        prototypes: [{ ...builds[0], treatmentHash: `sha256:${'d'.repeat(64)}` }, ...builds.slice(1)],
      },
    })).toThrow(/treatment.*hash|hash.*treatment/i);
  });

  it('recomputes all six thresholds from measurements instead of trusting self-reported passed flags', () => {
    const lyingResults = results.map((result) => result.slot === 'B'
      ? { ...result, inputResponseMs: { ...result.inputResponseMs, value: 101, passed: true } }
      : result);
    const bundle = {
      spec,
      buildReport: { schemaVersion: 1, experimentId: spec.experimentId, prototypes: builds },
      playtestReport: { schemaVersion: 1, experimentId: spec.experimentId, reviewer: 'QAAgent', prototypeAuthor: 'BuilderAgent', results: lyingResults, recommendation: 'B', rationale: 'B claims to pass.' },
      humanDecision: { schemaVersion: 1, experimentId: spec.experimentId, decision: 'KEEP', selectedSlot: 'B', rationale: 'Keep B.', requiredChanges: [] },
    };
    expect(() => ActionMechanicExperimentBundleSchema.parse(bundle)).toThrow(/inputResponseMs.*passed|passed.*inputResponseMs/i);
  });

  it('permits an A/B/C recommendation only when that slot passes all six recomputed thresholds', () => {
    const failingResults = results.map((result) => result.slot === 'B'
      ? { ...result, releaseVelocityRetentionRatio: { ...result.releaseVelocityRetentionRatio, value: 0.89, passed: false } }
      : result);
    const bundle = {
      spec,
      buildReport: { schemaVersion: 1, experimentId: spec.experimentId, prototypes: builds },
      playtestReport: { schemaVersion: 1, experimentId: spec.experimentId, reviewer: 'QAAgent', prototypeAuthor: 'BuilderAgent', results: failingResults, recommendation: 'B', rationale: 'B is preferred despite one failure.' },
      humanDecision: { schemaVersion: 1, experimentId: spec.experimentId, decision: 'REFACTOR', selectedSlot: 'B', rationale: 'Refactor B.', requiredChanges: ['restore release momentum'] },
    };
    expect(() => ActionMechanicExperimentBundleSchema.parse(bundle)).toThrow(/recommendation.*six|six.*recommendation/i);
    expect(() => ActionMechanicExperimentBundleSchema.parse({
      ...bundle,
      playtestReport: { ...bundle.playtestReport, recommendation: 'NONE' },
    })).not.toThrow();
  });
});
