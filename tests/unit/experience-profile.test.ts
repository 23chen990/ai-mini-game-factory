import { describe, expect, it } from 'vitest';
import { ExperienceProfileSelectionSchema, NarrativeAgencyContractSchema } from '../../src/schemas/experience-profile.js';
import { createFactory } from '../../src/factory.js';

describe('experience profiles', () => {
  it('locks one primary experience profile and profile-specific quality contract', () => {
    const selection = ExperienceProfileSelectionSchema.parse({
      schemaVersion: 1,
      primary: 'NARRATIVE_AGENCY',
      secondary: 'REPLAY_VALUE',
      lockedBy: 'human',
      rationale: '玩家主要为了理解选择造成的人物和时代后果而继续。',
    });
    expect(selection.primary).toBe('NARRATIVE_AGENCY');
    expect(NarrativeAgencyContractSchema.parse({
      schemaVersion: 1,
      profile: 'NARRATIVE_AGENCY',
      choicePillars: ['价值取舍', '人物关系', '后果延续'],
      consequenceRules: ['选择改变后续可用事件', '回响改变人物处境', '结局回应路线'],
      pacingRules: ['每次选择前有明确问题', '结果在短期内可见', '章节有情绪转折'],
      acceptanceIds: ['NARR-001', 'NARR-002', 'NARR-003'],
    }).profile).toBe('NARRATIVE_AGENCY');
  });

  it('routes narrative productization through story and consequence QA, not action-feel QA', () => {
    const route = (createFactory({ mode: 'mock', qaMode: 'stub' }) as any).routeRequest({
      request: '村口向南 demo 已批准，请扩展剧情、选择后果和重玩价值',
      targetRunId: 'village-run',
    });
    expect(route.experienceProfile.primary).toBe('NARRATIVE_AGENCY');
    expect(route.stages).toEqual([
      'NARRATIVE_CONTRACT',
      'STORY_VERTICAL_SLICE',
      'CHOICE_CONSEQUENCE_QA',
      'NARRATIVE_REVIEW',
      'REPLAY_VALUE_QA',
      'CONTENT_EXPANSION',
      'UI_SKELETON',
      'FULL_BUILD',
      'QA',
    ]);
    expect(route.stages).not.toContain('FEEL_PROTOTYPE');
  });
});
