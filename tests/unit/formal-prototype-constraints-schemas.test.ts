import { describe, expect, it } from 'vitest';
import { FormalPrototypeFollowupConstraintsSchema } from '../../src/schemas/formal-prototype-constraints.js';

function constraints() {
  return {
    schemaVersion: 1,
    game: { title: '夜市飞侠：护印突围', shortTitle: '夜市飞侠', subtitle: '护印突围' },
    targetWorkspace: 'runs/mobile-chart-adaptation-20260830/workspace/prototype-a',
    openSourceResearchArtifact: 'runs/20260830130002-action-93386070/artifacts/open-source-research.json',
    implementationGate: {
      actionExperimentRunId: '20260830130002-action-93386070',
      requiredTerminalStage: 'ACTION_EXPERIMENT_APPROVED',
      selectedSlotRequired: true,
      status: 'REGISTERED_NOT_IMPLEMENTED',
    },
    isolatedActionExperiment: {
      workspaces: ['workspace/action-a', 'workspace/action-b', 'workspace/action-c'],
      chaseIncluded: false,
      formalArtIncluded: false,
    },
    visualStandard: {
      status: 'HUMAN_APPROVED',
      referenceId: 'ui-f-night-market-interior',
      referenceImage: 'runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png',
      orientation: 'LANDSCAPE_16_9',
      rendering: 'MINIMAL_FLAT_2D',
      hud: {
        topLeft: 'TOKEN_STATUS_ONLY',
        topRight: 'DESTINATION_AND_PAUSE',
        center: 'UNOBSTRUCTED',
        pursuit: 'VISIBLE_GUARDS_AND_THIN_LEFT_EDGE_ALERT',
        persistentTutorial: false,
      },
      keep: [
        'horizontal-lookahead',
        'small-readable-characters',
        'three-visible-grapple-nodes',
        'minimal-corner-hud',
        'covered-night-market-interior',
        'minimal-flat-character-silhouettes',
      ],
      avoid: [
        'portrait-layout',
        'ornate-frames',
        'scrolls-seals-calligraphy',
        'poster-composition',
        'dense-market-detail',
        'open-sky-traversal',
        'anime-detailed-protagonist',
        'realistic-uniformed-guards',
        'character-identity-drift',
      ],
      characterIdentity: {
        enforcement: 'STRICT_REFERENCE',
        referenceImage: 'runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png',
        referenceSha256: 'adb2a97b3f72d9233aa807a3f7833d4f2633c6e3210b570750ded32c04f2c3eb',
        protagonist: ['near-solid-blue-black-silhouette', 'short-vermilion-scarf', 'tiny-copper-waist-accent'],
        pursuer: ['near-solid-blue-black-silhouette', 'tiny-vermilion-headband', 'compact-low-running-pose', 'short-low-held-weapon'],
        forbiddenDrift: ['readable-face-or-skin', 'anime-rendering', 'realistic-costume-detail', 'spear-guard-redesign'],
      },
    },
    environment: {
      spatialSetting: 'COVERED_NIGHT_MARKET_INTERIOR',
      openSkyTraversal: false,
      enclosure: ['continuous-canopies', 'overhead-crossbeams', 'stall-walls', 'interior-columns'],
      routes: {
        high: ['awning-rafters', 'interior-balconies', 'paifang-crossbeams'],
        low: ['stall-aisles', 'covered-alley', 'counter-passages'],
      },
      architecturalObstacles: [
        { id: 'barricade', expression: 'closing-stall-shutter', anchoredTo: 'stall-frame' },
        { id: 'roof-net', expression: 'beam-hung-cargo-net', anchoredTo: 'overhead-crossbeam' },
        {
          id: 'closing-gate',
          expression: 'inner-market-gate',
          anchoredTo: 'market-exit-arch',
          collision: 'SOLID_LEAVES_LIVE_APERTURE',
          success: 'PLAYER_CROSSES_LIVE_APERTURE_ON_BEAT_3',
          closureMotion: 'HORIZONTAL_DOUBLE_LEAVES_INWARD',
          motionReference: 'FIXED_MARKET_EXIT_ARCH_WORLD_GEOMETRY',
        },
      ],
    },
    narrative: {
      protagonist: '受托护送原创盟契铜符的游侠',
      objective: '坊门关闭前穿越夜市，把信物交给渡口接应人',
      pursuer: '执行宵禁并从后方追来的官兵',
    },
    controls: {
      hold: '按住飞索挂接地形节点并借力',
      release: '松手并保留当前动量',
      attackButtonIncluded: false,
      grappleNodes: ['檐角', '牌楼横梁', '灯绳架', '幌杆'],
    },
    criticalPath: [
      { order: 1, id: 'safe-tutorial', purpose: '摊棚街安全教学' },
      { order: 2, id: 'first-pursuit', purpose: '布幌巷首次官兵追入' },
      { order: 3, id: 'route-alternation', purpose: '牌楼与屋檐高低路线交替' },
      { order: 4, id: 'gate-climax', purpose: '坊门关闭前固定三拍高潮' },
    ],
    routes: {
      high: { surfaces: ['屋檐', '牌楼'], benefit: '速度快', risk: '可挂窗口短' },
      low: { surfaces: ['摊棚', '窄巷'], benefit: '较安全并能短暂甩开视线', risk: '推车、横杆和人群障碍' },
    },
    terrain: [
      { kind: '布棚', behavior: '承接后允许滑落', teachingOrder: 'SAFE_THEN_CHASE' },
      { kind: '竹架', behavior: '可暂时折断', teachingOrder: 'SAFE_THEN_CHASE' },
      { kind: '窄巷', behavior: '短暂降低追捕压力', teachingOrder: 'SAFE_THEN_CHASE' },
    ],
    chase: {
      visiblePursuerRequired: true,
      abstractMeterPrimary: false,
      phoneLeftEdgePresence: '手机画面左缘常驻官兵剪影或可读位置',
      closesDistanceOn: ['撞障碍', '错过挂点', '滞空失败'],
      opensDistanceOn: ['连续漂亮飞越', '利用捷径'],
      events: [
        { id: 'barricade', test: '路障逼走高线', allowedInput: 'HOLD_RELEASE_ONLY' },
        { id: 'roof-net', test: '屋顶抛网逼提前松手或走低弧线', allowedInput: 'HOLD_RELEASE_ONLY' },
        { id: 'closing-gate', test: '关坊门形成最终时机测试', allowedInput: 'HOLD_RELEASE_ONLY' },
      ],
    },
    originality: { copyThirdPartyExpression: false, copyThirdPartyBalanceValues: false },
  };
}

describe('FormalPrototypeFollowupConstraintsSchema', () => {
  it('accepts the renamed formal-game constraint packet while keeping action experiments isolated', () => {
    const parsed = FormalPrototypeFollowupConstraintsSchema.parse(constraints());
    expect(parsed.implementationGate.status).toBe('REGISTERED_NOT_IMPLEMENTED');
    expect(parsed.visualStandard).toMatchObject({
      status: 'HUMAN_APPROVED',
      referenceId: 'ui-f-night-market-interior',
      referenceImage: 'runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v3/ui-f-night-market-interior.png',
      orientation: 'LANDSCAPE_16_9',
    });
    expect(parsed.visualStandard.characterIdentity).toMatchObject({
      enforcement: 'STRICT_REFERENCE',
      referenceSha256: 'adb2a97b3f72d9233aa807a3f7833d4f2633c6e3210b570750ded32c04f2c3eb',
      protagonist: expect.arrayContaining(['near-solid-blue-black-silhouette', 'short-vermilion-scarf']),
      pursuer: expect.arrayContaining(['near-solid-blue-black-silhouette', 'tiny-vermilion-headband']),
    });
    expect(parsed.environment).toMatchObject({
      spatialSetting: 'COVERED_NIGHT_MARKET_INTERIOR',
      openSkyTraversal: false,
    });
    expect(parsed.terrain.map(({ kind }) => kind)).toEqual(['布棚', '竹架', '窄巷']);
  });

  it('rejects dropping the restored bamboo scaffold terrain', () => {
    const value = constraints();
    value.terrain.splice(1, 1);
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects open-sky traversal or free-floating chase obstacles', () => {
    const value = constraints();
    value.environment.openSkyTraversal = true;
    value.environment.architecturalObstacles[1]!.anchoredTo = '';
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects a pressure-only closing gate that characters can pass through', () => {
    const value = constraints();
    value.environment.architecturalObstacles[2]!.collision = 'PRESSURE_ONLY' as 'SOLID_LEAVES_LIVE_APERTURE';
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects vertical gate closure after the human changed it to horizontal side leaves', () => {
    const value = constraints();
    value.environment.architecturalObstacles[2]!.closureMotion = 'VERTICAL_TOP_BOTTOM' as 'HORIZONTAL_DOUBLE_LEAVES_INWARD';
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects a horizontal gate gap that tracks player progress instead of the fixed exit arch', () => {
    const value = constraints();
    value.environment.architecturalObstacles[2]!.motionReference = 'PLAYER_PROGRESS_TRACKING' as 'FIXED_MARKET_EXIT_ARCH_WORLD_GEOMETRY';
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects portrait or ornamental drift from the approved F visual standard', () => {
    const value = constraints();
    value.visualStandard.orientation = 'PORTRAIT_9_16' as 'LANDSCAPE_16_9';
    value.visualStandard.avoid = [];
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects the old mockup or character identity drift', () => {
    const value = constraints();
    value.visualStandard.referenceImage = 'runs/mobile-chart-adaptation-20260830/art-review/ui-concepts-landscape-v2/ui-f-corner-status.png';
    value.visualStandard.characterIdentity.forbiddenDrift = [];
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects chase or formal art leaking into the action experiment', () => {
    const value = constraints();
    value.isolatedActionExperiment.chaseIncluded = true;
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });

  it('rejects a new attack verb or pursuit event outside hold/release', () => {
    const value = constraints();
    value.controls.attackButtonIncluded = true;
    value.chase.events[0]!.allowedInput = 'NEW_ATTACK' as 'HOLD_RELEASE_ONLY';
    expect(() => FormalPrototypeFollowupConstraintsSchema.parse(value)).toThrow();
  });
});
