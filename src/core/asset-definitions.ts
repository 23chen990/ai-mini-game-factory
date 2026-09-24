import type { GameBlueprint } from '../schemas/index.js';

export type AssetDefinition = readonly [
  id: string,
  kind: 'character' | 'product' | 'background' | 'ui' | 'marketing',
  purpose: string,
];

const idleAssets: readonly AssetDefinition[] = [
  ['customer', 'character', '顾客角色，透明背景'],
  ['product', 'product', '售卖商品图标，透明背景'],
  ['background', 'background', '可循环使用的场景背景'],
  ['upgrade', 'ui', '升级按钮或徽章 UI，透明背景'],
  ['promo', 'marketing', '原创宣传主视觉，透明背景'],
];

const cutStackAssets: readonly AssetDefinition[] = [
  ['blade', 'character', '玩家操控的原创主体，清晰轮廓，透明背景'],
  ['cuttable', 'product', '可被玩家操作物切开的原创目标，处理前完整形态，透明背景'],
  ['support', 'product', '操作物可落地支撑或反弹的安全支点，透明背景'],
  ['hazard', 'product', '接触即失败且轮廓明确的危险构件，透明背景'],
  ['finish', 'ui', '关卡终点或结算标记，透明背景'],
  ['background', 'background', '适配横向推进与手机裁切的分层背景，不含交互对象'],
];

/** Keep asset vocabulary aligned with the locked runtime template. */
export function deriveAssetDefinitions(blueprint: Pick<GameBlueprint, 'template'>): readonly AssetDefinition[] {
  return blueprint.template === 'cut-stack-dodge-v1' ? cutStackAssets : idleAssets;
}

export function assetDefinitionIds(blueprint: Pick<GameBlueprint, 'template'>): string[] {
  return deriveAssetDefinitions(blueprint).map(([id]) => id);
}
