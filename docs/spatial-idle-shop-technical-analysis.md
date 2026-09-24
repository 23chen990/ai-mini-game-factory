# 空间物流经营游戏技术实现分析

> 文档日期：2026-08-30  
> 游戏名：海滩渔货铺  
> 目标平台：浏览器玩法验证、微信小游戏、抖音小游戏、TapTap 小游戏

## 1. 结论

本项目应实现“单移动操作的空间物流经营”，而不是对 Monkey Mart 的表达层复制。允许借鉴通用机制：靠近自动采集、实体堆叠、补货、顾客拿货、排队收银、现金投建和逐步自动化。不复用第三方游戏名称、美术、UI、关卡布局、角色设定、数值或商品解锁顺序。

技术路线采用两阶段：

1. **玩法验证阶段**：继续使用 Phaser 3 + Vite，快速验证前 3–5 分钟的移动、交互判定、经营瓶颈与升级节奏。
2. **发行生产阶段**：核心玩法通过后迁移到 Cocos Creator 3.8.8，输出微信小游戏、抖音小游戏和 TapTap 小游戏包。

两阶段共用纯 TypeScript 的规则层、数据配置和测试用例，替换的只是 Phaser 与 Cocos 的渲染、输入、音频和平台接口层。

显示方向锁定为**手机竖屏优先**：逻辑设计分辨率为 `540 × 960`（9:16），兼容 9:20 长屏和 3:4 较宽竖屏。桌面浏览器仅居中显示竖屏手机框，不能把桌面横向空间当成正式游戏区域。

## 2. 原创边界

### 可使用

- 小动物主角，但使用原创物种、轮廓、配色和动画。
- 鱼、海带、虾等通用海产品类。
- 浅滩捕捞点、潮池采集点、加工台、鲜货架和收银台构成的通用物流链。
- “先亲手劳动，感受瓶颈，再自动化”的节奏。

### 必须原创

- 地图轮廓、站点坐标、行走路线和解锁方向。
- 主角与 NPC 的造型、动画、声音和性格表达。
- UI 布局、图标、字体、色板、进度表现和引导文案。
- 商品开放顺序、配方关系、成本、产速、价格与升级曲线。
- 广告节点和长线系统。

## 3. 技术栈与运行时分层

### 3.1 当前 Builder 运行时

- Phaser 3.90
- TypeScript 5.x
- Vite 8
- Vitest 单元/契约测试
- Playwright 浏览器真实操作测试
- localStorage 版本化存档

该运行时用于玩法和参数验证，不直接承担最终小游戏 SDK 适配。

### 3.2 生产运行时

- Cocos Creator 3.8.8（当前开发机已安装）
- TypeScript / `import ... from 'cc'`
- 2D UITransform + Sprite + Tween，无需引入 3D 物理
- Asset Bundle：启动包、第一商店、后续商店/活动独立分包
- 节点池：顾客、商品、现金、数字飘字和小粒子

### 3.3 可复用层

```text
GameConfig / BalanceConfig / ProductRecipes
                    │
                    ▼
        Deterministic Simulation Core
  Player / Station / Inventory / Customer / Queue
     Construction / Upgrade / Employee / Save
                    │
          ┌───────────┴───────────┐
          ▼                       ▼
 Phaser View + Input        Cocos View + Input
          │                       │
          ▼                       ▼
 BrowserPlatformBridge      WeChat/Douyin/Tap Bridge
```

规则层不得引用 Phaser、`cc`、DOM、`window`、`localStorage`或任何平台 SDK。

### 3.4 竖屏布局与安全区

- 世界以 `540 × 960` 为逻辑设计尺寸，使用等比 `contain` 缩放；额外长屏空间扩展海面/沙滩背景，不拉伸站点与角色。
- 上方 HUD 和下方触控区分别应用 `env(safe-area-inset-top)`、`env(safe-area-inset-bottom)`；小游戏端由平台桥提供等价安全区数据。
- 生产点布置在上半区，货架与顾客路径位于中段，收银/现金/建设和升级位于下半区，形成适合单手观察的纵向物流链。
- 指针拖动可从游戏区域任意空白处开始；不放固定交互按钮，避免被手指或系统手势遮挡。
- 横屏或桌面视口使用居中的竖屏 QA 外壳和背景留白，不重排成横屏地图。

## 4. 核心模块

### 4.1 确定性模拟

- 使用固定时间步进规则，渲染帧只插值表现。
- 随机源使用可注入 seed，测试可重放。
- 所有收入、库存、建造、排队和解锁都由模拟层产生，渲染层不能私自修改经济状态。

### 4.2 玩家与自动交互

- 输入只产生归一化 `MoveAction{x,y}`。
- 键盘、虚拟摇杆、微信/抖音触摸都映射到同一 Action。
- 交互候选按“货物兼容性 → 任务优先级 → 距离 → 稳定 ID”排序，避免交互区重叠时乱跳。
- 进入半径与退出半径分离，形成滞回区，避免边界抖动。
- 自动操作不锁死移动，离开后 150ms 内释放。
- 携带量达到当前上限时，在最高货物上方显示主角附着的“满载”标记；卸下一件货物后立即隐藏。容量升级必须重新计算满载状态，不能把初始上限 `4` 写死在表现层。
- “满载”首次出现只触发一次局部弹跳/轮廓脉冲，不轮询创建对象、不使用全屏闪光；标记随后随主角和货物堆移动。

### 4.3 商品与物流

```ts
type ProductId = 'fish' | 'kelp' | 'shrimp' | 'dried_fish';

type ProductDefinition = {
  id: ProductId;
  source: 'producer' | 'animal' | 'machine';
  inputs: Array<{ productId: ProductId; amount: number }>;
  outputAmount: number;
  cycleMs: number;
  shelfCapacity: number;
  saleValue: number;
};
```

玩家携带的是有类型的堆叠，不是单一整数背包。卸货时只将相容商品送入对应货架或机器输入口。

### 4.4 顾客状态机

```text
ENTERING
  → CHOOSING_PRODUCT
  → TO_SHELF
  → WAITING_FOR_STOCK / TAKING_PRODUCT
  → TO_CHECKOUT
  → QUEUED
  → PAYING
  → LEAVING
```

- 顾客目标来自已解锁且当前允许售卖的商品权重表。
- 缺货时等待，但必须有最长容忍时间和可见状态。
- 队列使用固定索引点，只在前方位置释放后整体补位。
- 本版不做顾客碰撞物理，使用软分离向量或轨迹点降低开销。

### 4.5 现金、建设和升级

- 交易先在收银台生成可见现金，再由玩家靠近吸收。
- 建设区逐份投入现金，不使用瞬时扣除。
- 建成事件可以解锁新货架、新生产点、新员工或新机器。
- 首版升级只包含移速、携带容量和收银速度，数值全部来自配置。

### 4.6 员工

员工不进入本轮 Builder 的核心验收，但预留任务队列：

```text
IDLE → CLAIM_TASK → MOVE_TO_SOURCE → PICKUP
     → MOVE_TO_TARGET → DELIVER → REST_CHECK → IDLE
```

任务系统不把场景节点直接传给员工，只发放可序列化的 `TaskTicket`，便于存档和确定性测试。

## 5. Builder 首轮范围

目标是一个 3–5 分钟可反复验证的竖切版，不是 20 分钟完整商店。

### P0 必须完成

1. 键盘 + 指针/触屏拖动的单移动输入。
2. 原创小海獭占位角色，渔货实体显示在头顶。
   达到当前携带上限时，最高货物上方必须显示清晰的“满载”反馈；HUD 数字仅作补充。
3. 鱼和海带两个基础产品，各有独立捕捞/采集点与鲜货架。
4. 顾客选货、等货、取货、排队、结账、离开。
5. 现金堆、靠近吸收、建设区逐份投币。
6. 用建设区解锁第二产品，形成一次明确的场景扩张。
7. 容量升级且升级后堆叠高度可见。
8. 版本化本地存档、存档损坏回退、时间进度节流保存。
9. 9:16 竖屏优先布局、长屏与安全区适配、无 DOM 依赖的规则层、可切换的平台桥。
10. 不使用高频全屏闪光，高频动作只做局部跳动、抛物线和轻音效。

### 本轮不做

- 正式美术与品牌名。
- 广告、支付、登录、排行榜、分享和云存档。
- 完整员工系统、疲劳、故障和每日任务。
- 多商店与全部加工链。

## 6. 首轮原创产品链

使用同类通用食品，但重新设计解锁和空间关系：

```text
开局：近岸渔网 → 鲜鱼冰盘
第一次扩建：潮池采集点 → 海带篮
后续生产：浅水虾笼 → 鲜虾箱
后续加工：鲜鱼 → 晒鱼架 → 风干鱼
```

站点位置、解锁时机、容量和产出参数使用本项目独立配置，不参照第三方数值表。

## 7. 存档与平台桥

```ts
interface PlatformBridge {
  storage: {
    load(key: string): Promise<string | null>;
    save(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  lifecycle: {
    onHide(callback: () => void): () => void;
    onShow(callback: () => void): () => void;
  };
  ads: {
    isRewardedAvailable(): boolean;
    showRewarded(placement: string): Promise<'completed' | 'skipped' | 'failed'>;
  };
  analytics: {
    event(name: string, payload: Record<string, string | number | boolean>): void;
  };
}
```

- Browser：`localStorage` + Page Visibility API。
- 微信：`wx` 存储、生命周期、广告与数据上报适配。
- 抖音：`tt` 等价适配。
- TapTap 小游戏：`tap` 存储、生命周期、广告与数据上报适配。

存档结构带 `schemaVersion`、`savedAt`和 `contentVersion`。平台切换时必须通过迁移函数，不在读档时就地猜测字段。

## 8. 小游戏包体和性能

### 微信小游戏

- 小游戏不是普通浏览器环境，由 Cocos 完成 WebGL 和平台 API 适配。
- 主包上限为 4MB；启动必需代码、第一场景和最小 UI 进入主包。
- 后续商店、高清图集、音频与活动资源放 Asset Bundle/远程资源。
- 远程不能下载脚本，所有游戏规则代码必须随审核包发布。

### 抖音小游戏

- 分包后主包上限为 4MB，整体默认上限 20MB；开通虚拟支付后整体上限可变为 30MB，以提审后台实时限制为准。
- 使用分包时必须展示进度，避免黑屏流失。
- 第一商店进入主包或启动分包，其他商店按章节加载。

### TapTap 小游戏

- TapTap 小游戏是无 BOM/DOM 的 JavaScript VM，使用 `tap` API，不是直接打开 H5 页面。
- Cocos Creator 适配插件要求 3.8.x 及以上；构建时先生成微信小游戏产物，再转换为 `build/TapBuild/game.zip`。
- 官方当前提供的 Cocos 转换插件为 1.2.2；由于未找到公开不变仓库和直接许可证据，在正式安装前必须再做二进制/插件审查。
- 广告、登录、存储和分享仍通过独立 `TapMiniGameBridge` 接入，不进入规则层。

### 性能基线

- 中低端 Android 目标 60 FPS，降级时不低于 30 FPS。
- 同屏顾客 20‑30，商品飞行物 30‑50，现金和反馈对象全部使用对象池。
- 无 2D 刚体必要时不启用物理模块；范围检测使用简单距离与空间分区。
- 图集优先 WebP/ASTC/ETC2 平台覆盖，单张贴图不追求超高分辨率。
- 高频反馈不创建每帧临时对象，避免 GC 峰值。

## 9. 测试策略

### 规则层单元测试

- 移动归一化、地图边界和不同帧率一致性。
- 交互优先级、滞回区和多商品卸货。
- 生产成熟、加工输入/输出和上限。
- 顾客缺货等待、队列顺序、交易和离开。
- 现金拾取、建设投入、解锁与升级。
- 存档往返、损坏数据回退和版本迁移。

### Builder 契约

Browser 版保留 `window.__GAME_TEST__`：

- `resetGame`
- `getState`
- `spawnCustomer`
- `completeOrder`
- `grantCurrency`
- `upgradeStation`
- `setRandomSeed`

后续可增加方法，但不删除已有契约。

### 真机验收

- 浏览器：Chromium + WebKit；至少验证 `360×800`、`390×844`、`430×932` 三个竖屏触摸视口，并检查横屏时仍为居中竖屏 QA 外壳。
- 微信/抖音：开发者工具只作预检，至少一台 iOS 和一台中低端 Android 真机。
- TapTap 小游戏：扫码真机自测、冷启动、后台切换、存档恢复、断网和 ZIP 包解析。

## 10. 节奏与可观测性

首轮不复制第三方数值，使用独立验收窗口：

- 8 秒内首次拾取。
- 20 秒内首次补货。
- 45 秒内首次交易。
- 60‑90 秒内首次投建。
- 2‑3 分钟解锁第二产品。
- 正常操作期间不连续超过 10 秒没有可见状态变化。

开发测量事件：`first_move`、`first_pickup`、`first_stock`、`first_sale`、`first_cash_collect`、`first_build_invest`、`first_unlock`、`upgrade_bought`、`shelf_empty_start/end`、`queue_overflow_start/end`。

## 11. Builder 验收标准

1. 生产构建成功，发行目录存在可玩入口。
2. 新增单元测试先失败、后通过，且不回归旧测试。
3. lint、typecheck、目标测试和生产构建全部退出 0。
4. Chromium 中画布可见，没有 page error 和 console error。
5. 完成可重放的“采集 → 补货 → 顾客取货 → 排队 → 交易 → 拾取现金 → 投建/升级”闭环。
6. 存档刷新后保留有意义的生产、顾客和建设进度。
7. 画面不使用高频全屏闪光。
8. 三个目标竖屏视口均无横向滚动、HUD 裁切、核心站点遮挡或触控死区；安全区留白有效。

## 12. 交付路线

### Iteration A：当前 Builder

- 两个基础产品、多货架、顾客队列、现金实体、建设解锁和容量升级。
- 调整前 3‑5 分钟节奏。

### Iteration B：玩法竖切

- 虾笼与风干鱼加工链。
- 收银员和补货员两个岗位。
- 第一次“亲手做 → 自动化 → 新瓶颈”。

### Iteration C：Cocos 迁移

- 接入 Cocos 表现层和平台桥。
- 微信、抖音构建及真机存档/生命周期验证。
- 通过已审查的 TapTap Cocos 转换插件生成独立 Tap 小游戏 ZIP 测试包。

### Iteration D：发行功能

- 激励视频、数据上报、隐私同意、实名/防沉迷、云存档。
- 正式美术、音频、分包和启动性能优化。

## 13. 官方技术参考

- [Cocos Creator 3.8：发布到微信小游戏](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html)
- [Cocos Creator 3.8：发布到小游戏平台](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-mini-game.html)
- [抖音开放平台：小游戏代码包与分包](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)
- [TapTap 小游戏：Cocos/Laya/Egret 引擎适配](https://developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/)
- [TapTap 小游戏：快速上手](https://developer.taptap.cn/minigameapidoc/quick-start/document-guide/)
