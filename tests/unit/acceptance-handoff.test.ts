import { describe, expect, it } from 'vitest';
import { buildAcceptanceHandoff } from '../../src/core/acceptance-handoff.js';

describe('acceptance-first handoff', () => {
  it('requires an actionable launch path and observable pass/fail criteria', () => {
    const handoff = buildAcceptanceHandoff({
      targetGame: '夜市飞侠',
      targetWorkspace: '/runs/example/workspace/prototype-a',
      entrypoint: '夜市飞侠-护印突围-试玩版.html',
      launchCommand: 'open 夜市飞侠-护印突围-试玩版.html',
      steps: [{ action: '进入闸门开口', expect: '接应人举钱袋并显示获得金币', failIf: '角色在开口外却出现成功结算' }],
      passCriteria: ['从启动到结算可完整操作', '重开后回到可玩状态'],
      blockers: [],
    });
    expect(handoff.steps[0]?.action).toBe('进入闸门开口');
    expect(Object.keys(handoff).slice(0, 6)).toEqual(['schemaVersion', 'targetGame', 'targetWorkspace', 'entrypoint', 'launchCommand', 'steps']);
  });
});
