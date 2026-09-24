import { describe, expect, it } from 'vitest';
import { canTransition } from '../../src/core/state-machine.js';

describe('state machine', () => {
  it('allows the deterministic happy path and rejects skips', () => {
    expect(canTransition('CREATED', 'COMPETITOR_RESEARCH')).toBe(true);
    expect(canTransition('COMPETITOR_RESEARCH', 'IDEA_GENERATION')).toBe(true);
    expect(canTransition('IDEA_GENERATION', 'LOW_COST_FILTER')).toBe(true);
    expect(canTransition('LOW_COST_FILTER', 'PROTOTYPE_SELECTION')).toBe(true);
    expect(canTransition('PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES')).toBe(true);
    expect(canTransition('BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT')).toBe(true);
    expect(canTransition('PLAYTEST_TOURNAMENT', 'WINNER_SELECTION')).toBe(true);
    expect(canTransition('WINNER_SELECTION', 'WAITING_FOR_PROTOTYPE_APPROVAL')).toBe(true);
    expect(canTransition('WAITING_FOR_PROTOTYPE_APPROVAL', 'OPEN_SOURCE_RESEARCH')).toBe(true);
    expect(canTransition('OPEN_SOURCE_RESEARCH', 'IAA_REVIEW')).toBe(true);
    expect(canTransition('WAITING_FOR_PROTOTYPE_APPROVAL', 'IAA_REVIEW')).toBe(false);
    expect(canTransition('IAA_REVIEW', 'ART_DIRECTIONS')).toBe(true);
    expect(canTransition('ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL')).toBe(true);
    expect(canTransition('PROTOTYPE_SELECTION', 'ART_DIRECTIONS')).toBe(false);
  });

  it('does not impose a fixed automatic repair-attempt ceiling', () => {
    expect(canTransition('QA', 'FIX', { fixAttempts: 5 })).toBe(true);
    expect(canTransition('QA', 'FIX', { fixAttempts: 6 })).toBe(true);
    expect(canTransition('QA', 'FIX', { fixAttempts: 1_000 })).toBe(true);
  });

  it('routes a reference reskin through a human mechanic lock without ideation or prototype tournament stages', () => {
    expect(canTransition('CREATED', 'REFERENCE_MECHANIC_LOCK')).toBe(true);
    expect(canTransition('REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL')).toBe(true);
    expect(canTransition('WAITING_FOR_REFERENCE_APPROVAL', 'OPEN_SOURCE_RESEARCH')).toBe(true);
    expect(canTransition('WAITING_FOR_REFERENCE_APPROVAL', 'DESIGN_REJECTED')).toBe(true);
    expect(canTransition('REFERENCE_MECHANIC_LOCK', 'IDEA_GENERATION')).toBe(false);
    expect(canTransition('WAITING_FOR_REFERENCE_APPROVAL', 'BUILD_3_PROTOTYPES')).toBe(false);
  });

  it('runs core-action experiments through their dedicated approval gate', () => {
    expect(canTransition('CREATED', 'ACTION_EXPERIMENT_SPEC')).toBe(true);
    expect(canTransition('ACTION_EXPERIMENT_SPEC', 'BUILD_ACTION_PROTOTYPES')).toBe(true);
    expect(canTransition('BUILD_ACTION_PROTOTYPES', 'PLAYTEST_ACTION_PROTOTYPES')).toBe(true);
    expect(canTransition('PLAYTEST_ACTION_PROTOTYPES', 'WAITING_FOR_ACTION_APPROVAL')).toBe(true);
  });

  it('keeps post-demo productization ordered from content to UI to build', () => {
    expect(canTransition('CONTENT_EXPANSION', 'UI_SKELETON')).toBe(true);
    expect(canTransition('UI_SKELETON', 'FULL_BUILD')).toBe(true);
    expect(canTransition('CONTENT_EXPANSION', 'FULL_BUILD')).toBe(false);
  });

  it('requires feel and natural-play review before content expansion', () => {
    expect(canTransition('EXPERIENCE_CONTRACT', 'FEEL_PROTOTYPE')).toBe(true);
    expect(canTransition('FEEL_PROTOTYPE', 'NATURAL_PLAY_QA')).toBe(true);
    expect(canTransition('NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW')).toBe(true);
    expect(canTransition('EXPERIENCE_REVIEW', 'CONTENT_EXPANSION')).toBe(true);
    expect(canTransition('FEEL_PROTOTYPE', 'CONTENT_EXPANSION')).toBe(false);
    expect(canTransition('EXPERIENCE_REVIEW', 'FEEL_REPAIR')).toBe(true);
  });

  it('offers the reusable experience contract gate after blueprinting', () => {
    expect(canTransition('BLUEPRINT', 'EXPERIENCE_CONTRACT')).toBe(true);
    expect(canTransition('BLUEPRINT', 'ART_DIRECTIONS')).toBe(true);
  });

  it('keeps the durable production stages in order after monetization review', () => {
    expect(canTransition('IAA_REVIEW', 'BLUEPRINT')).toBe(true);
    expect(canTransition('BLUEPRINT', 'EXPERIENCE_HYPOTHESIS')).toBe(true);
    expect(canTransition('EXPERIENCE_HYPOTHESIS', 'ART_DIRECTIONS')).toBe(true);
    expect(canTransition('STYLE_LOCK', 'CONTENT_EXPANSION')).toBe(true);
    expect(canTransition('UI_SKELETON', 'FULL_BUILD')).toBe(true);
    // Legacy callers may still use the direct edge; the orchestrator itself
    // records BLUEPRINT and EXPERIENCE_HYPOTHESIS before art production.
    expect(canTransition('IAA_REVIEW', 'ART_DIRECTIONS')).toBe(true);
  });

  it('freezes the core acceptance standard before visual production continues', () => {
    expect(canTransition('EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN')).toBe(true);
    expect(canTransition('CORE_SPEC_FROZEN', 'ART_DIRECTIONS')).toBe(true);
    expect(canTransition('EXPERIENCE_HYPOTHESIS', 'ART_DIRECTIONS')).toBe(true);
  });

  it('requires deep reference research before a mechanic lock', () => {
    expect(canTransition('CREATED', 'REFERENCE_DEEP_RESEARCH')).toBe(true);
    expect(canTransition('REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK')).toBe(true);
    expect(canTransition('CREATED', 'REFERENCE_MECHANIC_LOCK')).toBe(true);
  });

  it.each([
    'ACTION_EXPERIMENT_APPROVED',
    'ACTION_EXPERIMENT_REFACTOR',
    'ACTION_EXPERIMENT_KILLED',
  ] as const)('allows the action approval gate to resolve as %s', (resolution) => {
    expect(canTransition('WAITING_FOR_ACTION_APPROVAL', resolution)).toBe(true);
  });

  it('does not let an action experiment skip its dedicated stages', () => {
    expect(canTransition('ACTION_EXPERIMENT_SPEC', 'PLAYTEST_ACTION_PROTOTYPES')).toBe(false);
    expect(canTransition('BUILD_ACTION_PROTOTYPES', 'WAITING_FOR_ACTION_APPROVAL')).toBe(false);
  });
});
