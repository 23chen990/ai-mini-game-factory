本次沿用 PR #2 → #3 → #7 → #8，新增一个 `h5-source-mobile-v1` 候选。目标是直接适配固定源码 `54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`，原 Three.js 场景和玩法保留。源码、编译 HTML、画面及旧失败报告只在忽略的 `runs/` 或私有研究目录，公开 PR 只有自有适配代码、事实、哈希和检查记录。

| 游戏 / 独立工作区 | 实际结果 | 下一步 |
| --- | --- | --- |
| 鹈鹕：`runs/h5-pelican-mobile-20261013/workspace` | 90 秒抓鱼挑战；左右/跳跃、暂停、最佳成绩/补给存档、失败/成功、重玩。原始 11 分成功及修复 HUD 后 5 分失败都有自然触控证据。 | 优先实体手机试玩和实际 H5 广告联调。 |
| QQ 飞车：`runs/h5-qq-mobile-20261013/workspace` | 一圈/低画质；横屏提示、旋转暂停/恢复、原触控。WebKit 实际观察结束/重玩，并发现结算读取 AI 车及结算后原生继续驾驶的问题。两次窄范围修复，当前独立复测结果见检查记录。 | 作为第二优先试玩；保留软件 WebGL 超时，不据此断言真机必然卡顿。 |
| 运输船：`runs/h5-cf-mobile-20261013/workspace` | 原战斗/触控，4v4 短对局；暂停、自然终局和重玩。该次玩家击杀为 0，非完整战斗验收。 | 保留试玩；优先验瞄准/武器体验，再决定追加投入。 |

手机入口为 [中文验收页](three-h5-20261013/mobile-acceptance.html)，同一 Wi‑Fi 的本地预览使用三个端口 4313/4314/4315；它不是 TapTap 已发布链接。最新版独立 HTML 以 [检查记录](three-h5-20261013/evidence-index.json) 中的文件名和 buildHash 为准，已在 WebKit 实际打开并用正常触控开始。实体手机、真人 30 秒理解测试、后台恢复和真实 IAA 均未通过验收。

可复用模块在 `templates/web-lite/h5-source-mobile-v1/`：`engine.mjs` 管理时钟、暂停、结算、存档隔离和奖励幂等；`themes.mjs` 包含小型原生接口绑定及 H5 激励视频生命周期；`main.mjs`/`style.css` 提供安全区、触控和结算 UI。后续同类工程可复用这层自有代码，授权源码继续直接由构建助手绑定。[55 项源码机制](three-h5-20261013/source-mechanisms.json) 提供实际源码路径/哈希；三款源代码没有被从零重写，事实记录也不是完整复刻精度声明。

你随后确认“现在没有版权问题，原作者已授权”。[授权记录](three-h5-20261013/author-authorization.json) 已据此允许继续原工程复用和商业化准备；它明确区分用户确认与工具核验的标准开源许可证。旧 run 的冻结输入和最初源构建回执保留授权确认前状态，当前适配回执/检查记录关联了这次授权更新。原始授权书和署名条款用于后续 TapTap 审核留档，不再作为本次继续开发的阻塞。

三款的 `research.json`、玩法合同、失败压力合同、开源研究和 IAA 合同保存在 `examples/lean-pilot/three-h5/<game>/`。实际原始 H5 触控记录作为 `BROWSER_PLAY` 证据接入 PR #7，三份门禁输出均允许原型开发且禁止发布。[门禁回执](three-h5-20261013/pr7-gate-receipts.json) 保留 `referenceRuntimeObserved=false` 等保守标记；哈希核验不等于自动证明语义。已经创建的 run 冻结输入没有被新证据覆盖。

[REA 对照](three-h5-20261013/rea-ground-truth.json) 复用 PR #8 Actions #38358883399 的相同输入。CI 仅保存回执，缺少可供逐项复核的大报告，因此本地每款补做一次同版本静态调用并保留完整输出 SHA。[真实回执](three-h5-20261013/actual-rea-receipts.json) 支持文件解析和部分存储调用；16 项玩法标准答案都未被明确恢复，另有一个 WebGL 扩展名被误判为网络端点。语义图截断，不能把解析完成当成机制完整。以后优先读源码；对打包文件使用 REA 时，区分依赖库结构、游戏语义、候选误报和未知项。

TapTap 路线按 [agents.md](https://developer.taptap.cn/agents.md)、[H5 MCP 指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/mcp-setup/) 和 [广告指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/) 核实。H5 有独立上传和广告路径；没有生成 APK，也没有用普通 Tap 小游戏 SDK 代替 H5。官方 H5 MCP 包的指南明确使用全局 `tap.createRewardedVideoAd({adUnitId})`。本次仅完成适配和 SDK fixture：完整观看、取消、加载/展示失败、超时、重复回调与并发；入口在权限未确认时隐藏，未播放真实广告或产生收入。

你已说明账号广告开通，并完成官方 MCP 扫码登录；随后明确本批游戏尚未建应用，要求暂不创建，先完成试玩包和 Draft PR。[平台状态](three-h5-20261013/platform-status.json) 据此保留新游戏 AppID/广告位为空，没有借用账号下其他产品的配置，也未上传或提审。以后恢复上架时，创建或明确选择本批 H5 应用，读取该应用 `check_ads_status` 与广告指南，再在真实 H5 环境/实体手机验奖励、取消和失败恢复。开发者/财务主体、收款账户和提审材料以当时 H5 后台要求为准；本次不把账号广告开通当成三款新游戏已获广告权限。真实 SDK 的解绑事件接口仍待实测。

复现不需要新 Agent 系统或后端。在已检出的固定源码副本上运行：

```sh
H5_PINNED_SOURCE_ROOT=/absolute/path/to/pinned-source pnpm pilot build h5-pelican-mobile-20261013 pelican-bike
pnpm pilot check h5-pelican-mobile-20261013
pnpm pilot browser h5-pelican-mobile-20261013
pnpm pilot serve h5-pelican-mobile-20261013 4313 你的局域网IPv4
pnpm pilot export h5-pelican-mobile-20261013
```

另两款的 runId 和 gameId 见表及 `examples/lean-pilot/three-h5/`。同一已完成且未改动的源构建可复用回执；部分构建或修复后的源码哈希变化不会被静默覆盖。手动修复后的现有 run 使用 `check/browser/export`；不要运行当前仅适用于 clinic 的 `prepare/delivery`。三款包都是未发布的测试产物，正式平台发布门禁保持阻塞。代码、证据摘要同步独立 GitHub 分支和 Draft PR；三个带哈希的试玩 ZIP 同步到未发布 Draft Release，供下载，不是 TapTap 上架。

已运行 lint/typecheck、原生测试、既有拼图 HTTP 回归及三款实跑；具体成功、失败、日志哈希和证据缺口见检查记录。`pnpm test` 的整仓失败保持可见：原有 Node 测试被 Vitest 错收，以及许可豁免测试使用了已过期日期；相关旧门禁未修改。PR #2/#3/#7/#8 的远端 head 未变；本次独立 Draft PR 不合并、不正式发布、不购买服务、不提交广告审核。
