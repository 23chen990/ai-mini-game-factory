# 三平台发布与开源复用政策

## 默认目标

每个工厂游戏都以以下三个渠道为发行目标：

- 微信小游戏（`wechat-minigame`）
- 抖音小游戏（`douyin-minigame`）
- TapTap 小游戏（`taptap-minigame`）

三个渠道都提供 JavaScript 小游戏运行环境，但不应被当成标准浏览器。抖音与 TapTap 的官方入门
文档都明确说明运行时没有完整 BOM/DOM，并分别通过 `tt`、`tap` API 提供画布和平台能力。因此，
Phaser/Vite 浏览器构建只能作为玩法预览与自动 QA 基线，不能直接视为可提审包。

官方入口：

- [微信小游戏开发文档](https://developers.weixin.qq.com/minigame/dev/guide/)
- [抖音小游戏开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game)
- [TapTap 小游戏文档指引](https://developer.taptap.cn/minigameapidoc/quick-start/document-guide/)
- [TapTap 小游戏运行环境](https://developer.taptap.cn/minigameapidoc/dev/tutorial/overview/)

平台规则、包体限制、备案、必接能力和审核要求会变化。实现具体 Adapter 或准备提审前，必须重新
核对上述官方文档；仓库里的历史数字不能作为发布依据。

## 强制顺序

```text
人类批准玩法原型
  -> OPEN_SOURCE_RESEARCH
  -> game-blueprint.json（技术蓝图）
  -> 美术、Builder、QA、Release
```

`OPEN_SOURCE_RESEARCH` 必须输出 `artifacts/open-source-research.json`。技术蓝图阶段必须把该文件列入
输入 Artifact，且不能引用未被调研结论批准的依赖。

每个候选至少记录：

- 仓库 URL 和不可变 revision/version；
- 直接许可证证据与署名义务；
- 微信、抖音、TapTap 的实际覆盖范围；
- 维护风险、安全风险和技术适配判断；
- `REUSE`、`REFERENCE_ONLY` 或 `REJECT` 决策。

无法验证许可证或兼容性时不能选择 `REUSE`。没有合适候选时输出
`NO_SUITABLE_CANDIDATE`，然后再设计原创实现；不得为了“必须复用”而降低许可证、质量或平台兼容
门槛。

## 发布就绪定义

只有同时具备以下证据，某个平台才能标记为 ready：

- 独立平台 Adapter 与平台配置文件；
- 平台开发工具构建成功记录；
- 真机启动、输入、存档、音频、前后台切换和弱网/离线策略测试；
- 平台 API（登录、广告、支付、分享等）的能力隔离与降级测试；
- 包体与分包检查；
- 当前官方必接能力、备案和审核清单的人工确认；
- 目标平台提审包的哈希清单。

在这些证据完成前，`release-candidate/web` 只代表浏览器 QA 通过。
