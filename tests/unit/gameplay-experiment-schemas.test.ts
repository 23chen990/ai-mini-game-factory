import { describe, expect, it } from 'vitest';
import {
  IdeaGenerationSchema,
  PrototypeBuildReportSchema,
  PlaytestTournamentSchema,
  WinnerSelectionSchema,
} from '../../src/schemas/gameplay-experiment.js';

function idea(id: string, majorSystems = ['timed sorting', 'risk queue']) {
  return {
    id,
    name: `Idea ${id}`,
    coreAction: 'route one visitor to one of two stalls',
    decisionIntervalSeconds: 12,
    decision: 'choose safety now or a riskier combo route',
    choiceDrivers: ['visitor trait', 'queue pressure'],
    pressure: 'a full queue ends the run',
    firstDelight: 'the first three-visitor combo clears the lane',
    secondRunVariation: 'visitor traits and stall bonuses are reseeded',
    growthMechanic: 'unlock one alternative stall modifier between runs',
    randomVariation: 'seeded visitor traits',
    majorSystems,
    realDecision: true,
  };
}

const ideas = { schemaVersion: 1 as const, batch: 1 as const, theme: 'spirit night market', ideas: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => idea(`idea_${id}`)) };

describe('prototype tournament artifacts', () => {
  it('requires at least six gameplay ideas that answer the six design questions', () => {
    expect(() => IdeaGenerationSchema.parse(ideas)).not.toThrow();
    expect(() => IdeaGenerationSchema.parse({ ...ideas, ideas: ideas.ideas.slice(0, 5) })).toThrow(/at least 6/i);
  });

  it('rejects growth labels presented as core gameplay and ideas without real decisions', () => {
    expect(() => IdeaGenerationSchema.parse({ ...ideas, ideas: [{ ...ideas.ideas[0], coreAction: '赚钱' }, ...ideas.ideas.slice(1)] })).toThrow(/core gameplay/i);
    expect(() => IdeaGenerationSchema.parse({ ...ideas, ideas: [{ ...ideas.ideas[0], realDecision: false }, ...ideas.ideas.slice(1)] })).toThrow();
  });

  it('requires three distinct playable placeholder prototypes with at most two major systems', () => {
    const prototypes = ['a', 'b', 'c'].map((slot) => ({
      slot,
      ideaId: `idea_${slot}`,
      workspace: `workspace/prototype-${slot}`,
      entrypoint: `workspace/prototype-${slot}/dist/index.html`,
      launchCommand: `pnpm factory preview run prototype-${slot}`,
      placeholderArt: true,
      formalUi: false,
      iaaIncluded: false,
      majorSystems: ['timed sorting', 'risk queue'],
      verification: ['build:passed', 'core-loop:playable'],
      author: 'BuilderAgent',
    }));
    expect(() => PrototypeBuildReportSchema.parse({ schemaVersion: 1, batch: 1, prototypes })).not.toThrow();
    expect(() => PrototypeBuildReportSchema.parse({ schemaVersion: 1, batch: 1, prototypes: [{ ...prototypes[0], majorSystems: ['a', 'b', 'c'] }, ...prototypes.slice(1)] })).toThrow(/at most 2/i);
  });

  it('requires an independent reviewer and permits NONE instead of forcing a winner', () => {
    const comparison = ['a', 'b', 'c'].map((slot) => ({
      slot,
      ideaId: `idea_${slot}`,
      testedUrl: `http://127.0.0.1/${slot}`,
      playtestActions: ['start', 'act1', 'act2', 'act3', 'act4'],
      tenSecondUnderstanding: { score: 8, evidence: 'core action used without explanation' },
      funWithinThirtySeconds: { score: 7, evidence: 'first combo at 18s' },
      realDecision: { score: 8, evidence: 'safe and risky routes were both selected' },
      mechanicalRepetition: { score: 6, evidence: 'input repeats but targets change' },
      pressureOrFailure: { score: 8, evidence: 'queue overflow ended the run' },
      retryUrge: { score: 7, evidence: 'restarted after failure' },
      variationAfterFiveRepeats: { score: 8, evidence: 'traits changed the fifth route' },
      extensibility: { score: 8, evidence: 'new traits extend the same verb' },
      screenshot: `screenshots/prototype-${slot}.png`,
      consoleLog: `logs/prototype-${slot}.log`,
    }));
    expect(() => PlaytestTournamentSchema.parse({ schemaVersion: 1, batch: 1, reviewer: 'QAAgent', prototypeAuthor: 'BuilderAgent', comparisons: comparison })).not.toThrow();
    expect(() => PlaytestTournamentSchema.parse({ schemaVersion: 1, batch: 1, reviewer: 'BuilderAgent', prototypeAuthor: 'BuilderAgent', comparisons: comparison })).toThrow(/independent/i);
    expect(() => WinnerSelectionSchema.parse({ schemaVersion: 1, batch: 1, decision: 'NONE', selectedIdeaId: null, rationale: 'All three became rote after five repetitions.' })).not.toThrow();
  });
});
