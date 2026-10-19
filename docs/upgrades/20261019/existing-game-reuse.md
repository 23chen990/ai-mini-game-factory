# 存量优先：不重做已有游戏

## 本轮范围

用户明确要求停止重新开发已做过的游戏。这里做的是共享工厂的续建修复，以及三个已有 run 的只读盘点；**没有修改这些游戏，没有复制它们的素材/数值/玩法代码，也没有新开游戏项目**。此前未提交的浏览器生命周期实验已停止，不作为本轮交付。

## 已落地：Builder 重试不再重新套母版

原路径：`BuilderAgent.run` 每次执行都调用 `createProject → applyBlueprint → importAssets`。WebLite 的 `createProject` 会先归档旧工作区，再复制模板。因此文件虽然可找回，当前默认工程却回到母版；中断前做出的功能、用户调整和已通过的测试被移出了工作路径。

这不等于“每次 resume 都重建”：已完成且有效的 FULL_BUILD 原本就会跳过。缺陷作用于 **Builder 真正再次执行**，例如中断重试或上游合同变化后的重建。

现在：

- 缺失或空工作区：正常初始化。
- 非空工作区，包括模型中途失败留下的部分成果：就地续建，不自动归档、重新复制母版、覆盖整个配置或素材。
- Builder 仍接收当前蓝图、风格、素材 manifest 和 `assetSource`，负责按合同差异选择性整合，而不是沿用旧配置就算完成。账户/API 两个后端共享续建指令。
- 原有参考数据核验、测试、构建和独立 QA 不跳过；保留已有代码不是验收通过。Mock 不再用演示布局覆盖已编写的参考布局。
- `build-report.json.verification` 增加 `workspace:initialized` / `workspace:continued`，使用现有报告，不新增阶段、schema、模型调用或交互门禁。
- 抽出并复用 WebLite 原有的工作区路径检查，避免跳过 `createProject` 后绕过隔离。显式调用低层 `createProject` 的归档重建行为仍保留，不用于正常续建。

代码：`src/agents/index.ts`、`src/core/workspace-path.ts`、`src/core/builder-continuation.ts` 和两个既有 Builder provider。

**成本理由**：消除“已完成工作被母版替换→再实现一次”这一实际路径。临时标记文件测试中，两次 Builder 执行只初始化一次；模型调用次数没有被声称减少，也没有真实工期/收益节省比例。测试不开发新游戏。

## 已有软件资产盘点，不把代码存在说成生产就绪

只读核查时间：2026-10-19。以下来自独立本地 checkout 的已有 run；checkout HEAD 和文件 SHA 分开记录，不能假定 run 文件都在该提交中。精确源文件哈希在同目录 `existing-game-reuse-sources.json`。没有进行本轮真机/广告复测或许可证复核。

| 已有工作区 | 可用的既有成果 | 复用方式与边界 |
| --- | --- | --- |
| `race-two-button` / `runs/h5-qq-mobile-20261013/workspace/game` | `engine.mjs`：纯状态的开始/暂停/恢复/结算、奖励幂等、版本化进度序列化；已有 `tests/engine.test.mjs` | 边界清晰，优先检查并提取通用转换/幂等逻辑，不移植该游戏经济规则和数值。存的是累计进度，不是现场存档 |
| 同上 | `main.mjs`：触屏按住、取消/丢失捕获释放，失焦/隐藏时暂停、清输入、保存，恢复时重置时钟 | 已经有实现，不应再从零研究一遍。与 DOM 和原游戏适配接口耦合，只适合窄提取；既有后台验收仍 BLOCKED，不能宣布真机问题解决 |
| 同上 | `themes.mjs`：TapTap H5 激励广告异步适配及 `tests/ads.test.mjs` | 已有并发限制、回调清理和异常/超时测试；均是 SDK 夹具，不是实际广告。不能当成微信/抖音通用适配器或 live IAA 证明 |
| `race-fuel-iaa` / `runs/h5-qq-challenges-20261013/workspace/game` | `fuel.mjs`：无依赖的时间驱动账本；`engine.mjs`：挑战包装；已有主程序暂停/清输入路径 | 账本形态可候选复用，容量、恢复周期、奖励及广告策略留在游戏内。未见 fuel 专属单测；既有 handoff 标记真机/live IAA 未运行、不可发布 |
| `pelican-final-acceptance` / `runs/pelican-coast-v2-20261014/workspace/game` | `index.html`：blur/pagehide/hidden 暂停并存进度、手动恢复界面 | 大型内联代码与玩法/渲染耦合，不整体复制。暂停函数未显式清除所有按住输入；已有 WebKit 结算轨迹不覆盖真实后台，真机/人工仍未运行 |

这些是 **候选资产及已知限制**，不是新公共库。原游戏整体、第三方嵌入源码、UI、素材、名称和数值不跨 run 复制。实际提取前按现有研究工件确认来源/权利、适用范围和归属；缺证据的部分不自动批准。

## 保留与后续集成边界

1. 保留已有游戏代码及其 QA 证据。后续验证优先运行已有测试，不能为了展示工厂能力重做同一游戏。
2. 先用现有明确模块边界；只有出现第二个适用消费者时，才将通用部分提取到共享源码并连入既有适配器。不要先造注册中心、组件市场或新的 Agent 层。
3. 控制/暂停逻辑已有案例，但真实后台证据仍缺；复用时连同这个未完成状态一起带走，不能只带“PASS”摘要。
4. 当前修复解决 **同一 run 的续建**；并未自动接管没有工厂工件的任意历史项目，也未完成跨游戏组件检索/安装、自动经验回流、真实 7～14 天交付或发行闭环。

## 回归与交付

- `tests/unit/builder-workspace-reuse.test.ts`：已有文件保留、空/缺失首次初始化、中断后的续建、验证失败传播、工作区/父目录链接隔离。使用临时标记文件和受控 provider，不是假游戏验收。
- `tests/unit/reference-level-builder.test.ts`：已有布局不被 mock 覆盖、参考数据篡改/移除/链接仍拒绝；新建路径和续建路径分别覆盖。
- `tests/unit/codex-account-provider.test.ts`：实际送出的 Builder 提示包含续建要求。
- `tests/unit/web-lite-runtime.test.ts`：原有显式归档/隔离行为保持。
- 全量结果、源码哈希及失败到通过的日志见 `workspace-reuse-verification.json`。所有游戏体验、真机和收益状态保持原结论，不用这次工程测试覆盖它们。
