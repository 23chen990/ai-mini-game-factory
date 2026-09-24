import { describe, expect, it } from 'vitest';
import { getExperienceProfileSupport } from '../../src/core/production-lines.js';
import { RequestRouter } from '../../src/core/request-router.js';

describe('experience profile support boundary', () => {
  it('does not silently map social or exploration products to the idle line', () => {
    expect(getExperienceProfileSupport('SOCIAL_EMOTION')).toMatchObject({ status: 'new-line-required', line: null });
    expect(getExperienceProfileSupport('EXPLORATION_DISCOVERY')).toMatchObject({ status: 'new-line-required', line: null });
  });

  it('routes unsupported profile requests to a human line review', () => {
    const route = new RequestRouter().route({ request: '增加社交情感互动玩法', targetRunId: 'existing-run' });
    expect(route.experienceProfile.primary).toBe('SOCIAL_EMOTION');
    expect(route.supportDecision).toBe('NEW_LINE_REQUIRED');
    expect(route.stages).toEqual(['BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW']);
  });
});
