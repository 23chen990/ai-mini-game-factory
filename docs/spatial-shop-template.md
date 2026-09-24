# `spatial-shop-v1` 空间物流经营母版

## 目标

`spatial-shop-v1` 将“单移动输入的空间服务经营”作为一个可配置玩法族，而不是对任何已有游戏的名称、角色、美术、UI、地图、数值或内容顺序进行复制。

母版固定以下机制关系：

```text
移动 → 靠近自动交互 → 采集/生产 → 携带 → 补货
     → 顾客取货 → 排队结算 → 收益 → 投建/升级 → 新瓶颈
```

## 分层

```text
SpatialShopSpec（Zod Artifact）
  ├─ world / player
  ├─ products
  ├─ stations
  │    ├─ producer
  │    ├─ shelf
  │    ├─ checkout
  │    ├─ construction
  │    └─ upgrade
  ├─ customers / weighted demand
  └─ flowEvents
       ├─ production-boost
       └─ demand-rush
              │
              ▼
Pure TypeScript Deterministic Simulation
              │
       ┌────────┴────────┐
       ▼                 ▼
Phaser web-lite       未来 Cocos RuntimeAdapter
```

模拟层不引用 Phaser、Cocos、DOM、`window`、`localStorage` 或任何平台 SDK。输入状态、固定步进、随机种子、库存、顾客、收益、解锁和升级都是可序列化纯数据。

## 可复用与必须变化的边界

| 层 | 复用策略 |
|---|---|
| 确定性模拟、输入、存档、顾客状态机、站点交互 | 全部复用 |
| 商品、价格、产速、容量、需求权重、解锁依赖 | 每款独立配置并经 Zod 校验 |
| 地图轮廓、站点坐标、动线和解锁方向 | 每款原创 |
| 角色、场景、商品造型、UI、图标、文案、音频 | 每款原创 |
| 节奏特色 | 每款至少配置一个原创的生产窗口或需求窗口 |

“换皮”在工厂内部的准确含义是：复用经验证的机制与基础设施，通过原创配置和表达生成独立游戏；不意味着只替换图片，也不允许复制第三方的具体表达。

## 配置门禁

`SpatialShopSpecSchema` 会拒绝：

- 重复的商品、站点或流程事件 ID。
- 引用不存在商品或站点的生产、货架、需求和解锁关系。
- 没有“已解锁生产点 → 已解锁货架 → 已解锁收银”的开局闭环。
- 站点、玩家出生点或顾客入口位于世界外。
- 同时存在零个或多个收银站。
- 指向非生产站点的生产加速窗口。

## 当前成果和发行边界

- 可运行母版：`templates/web-lite/spatial-shop-v1/`
- 工厂输入样例：`examples/seeds/spatial-beach-shop.yaml`
- 开源研究 Artifact：`docs/research/spatial-shop-v1-open-source-research.json`
- 旧 `idle-shop-v1` 保留为兼容测试样本，不改义。
- 当前只交付 web-lite 玩法验证能力；在微信、抖音、TapTap 的 RuntimeAdapter、配置、真机 QA 和完整构建证据齐备前，不得声称任何小游戏平台可发布。
