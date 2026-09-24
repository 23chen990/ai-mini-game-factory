import { describe, expect, it } from 'vitest';
import { decideFeedbackRepairRoute } from '../../src/core/feedback-routing.js';
import { RequestRouter } from '../../src/core/request-router.js';

describe('feedback escalation workflow', () => {
  it('forces related core symptoms through QA → FIX → QA', () => {
    const decision = decideFeedbackRepairRoute({
      requestType: 'BUG_FIX', issueCount: 3, affectedSystems: ['core-loop', 'collision', 'level-design'], rootCauseClear: false,
    });
    expect(decision.route).toBe('formal-fixer');
    expect(decision.stages).toEqual(['QA', 'FIX', 'QA']);
  });

  it('routes an experience complaint with screenshot language to formal fix', () => {
    const route = new RequestRouter().route({ request: '截图里掉到官兵这里却没被抓，闸门也不合理', targetRunId: 'mobile-chart-adaptation-20260830' });
    expect(route.stages).toEqual(['QA', 'FIX', 'QA']);
    expect(route.rationale).toMatch(/triage record and reproduction matrix/i);
    expect(route.repairRoute).toBe('formal-fixer');
  });

  it('treats 修正 requests against an existing game as formal bug fixes', () => {
    const route = new RequestRouter().route({ request: '请修正这个游戏的通关判定和追兵碰撞', targetRunId: 'mobile-chart-adaptation-20260830' });
    expect(route.requestType).toBe('BUG_FIX');
    expect(route.stages).toEqual(['QA', 'FIX', 'QA']);
  });

  it('does not require screenshot wording to escalate a cross-module gameplay complaint', () => {
    const route = new RequestRouter().route({ request: '闸门、追兵、布棚三个系统的体验都需要修正', targetRunId: 'mobile-chart-adaptation-20260830' });
    expect(route.stages).toEqual(['QA', 'FIX', 'QA']);
    expect(route.repairRoute).toBe('formal-fixer');
  });
});
