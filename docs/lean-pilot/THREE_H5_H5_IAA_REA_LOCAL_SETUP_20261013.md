# 2026-10-13 用户确定的商业化边界与本地 REA 安装（以此补充 PR #8 原交接）

> 本文是 PR #8 原研究报告中“先做 APK”“暂不接广告”“重度打磨”的**明确纠偏**。本次目标为 **H5 网页小游戏 → TapTap H5 试玩/可玩测试形态 → IAA 广告变现 → 低成本快速试错**。不是原生应用研发项目，不另建游戏工厂。

## A. 产品边界与商业逻辑

- 优先保留网页 H5 技术栈与 Three.js 等实际能复用的通用框架；**不要默认转 Unity、APK、Capacitor/WebView**，仅在平台实际限制且明确批准时评估替代。
- TapTap 目前区分 H5 游戏、Tap 小游戏、APK/PC。先按照 H5 游戏通道核对接入、上传、H5 广告、备案和审核。“开放试玩”是用户的**试玩测试意图**；不要把传统 APK“开放试玩”选项与小游戏“正式上线（试玩版）”状态混为一谈。
- 低成本 P0：可打开、手机触控好理解、15–30 秒内可开始操作、可重复完成约 2–5 分钟的单局/循环、明显成功或失败反馈、基础存档、不卡死、不侵权、广告安全兑现。仅做一个核心玩法、一个或少量场景、少量进阶；不要先开发联网、多套地图、社交、商城、复杂经济、高清外部资源。
- 商业 P0：**先一类激励视频广告**，只由玩家主动触发：失败后复活 / 结算双倍奖励二选一即可。广告完成回调才发奖励；失败、拒绝和无填充均允许继续游戏；避免广告覆盖控制区。插屏只在确有收入需求并满足平台审核规范时追加。首分钟/首关无广告。
- 低成本验收：Chrome/Safari 基础浏览器和至少一台真实手机（必要时人工代跑）、首次进入、触屏、暂停/切后台、静音、结算重开、广告完成与取消/失败三分支、真实 TapTap 环境广告测试。**不是**要求十人以上研究、长周期审美迭代、复杂实时监控及超高画质。缺少真实设备/平台账号则标记 PENDING，不杜撰。
- 小额广告收入不是已验证商业模型：只记录实际曝光、广告加载、完成率、真实收入和玩家重开/留存；无数据时收入=UNKNOWN，不做 ROI 虚假承诺。简单有效优先于堆玩法。
- 参考游戏必须独立做 IP/许可检查。上游公开不等于商业许可；不能保留 QQ飞车/穿越火线的官方称谓和仿官方地图，TapTap 官方小游戏审核明确不接受未经授权或二次同人作品。鹈鹕形象的具体原创性、源码各文件许可也应确认。

## B. TapTap 官方对应入口（以实际发布后台规则为准）

- 平台 H5 与 APK 分流：https://developer.taptap.cn/agents.md
- 小游戏支持 H5 类型：https://developer.taptap.cn/minigameapidoc/quick-start/guide/minigames-intro/
- H5 适用广告开通/审核：https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/
- 广告审核规范（包括首次启动 60 秒内/首关无广告）：https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/minigame-ad-policy/
- 小游戏创建及试玩版状态：https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/
- 小游戏前置备案：https://developer.taptap.cn/minigameapidoc/quick-start/guide/pre-filing/
- 小游戏审核规范：https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/review-standards/

小程序/普通 Tap 小游戏 API 如 `tap.createRewardedVideoAd` 的可用性须在**最终选择的 H5 形态与真实后台/文档**确认；不能因为另一种形态有此 API 就直接复制到 H5。需要真实广告位/财务身份的步骤由账号所有者完成，不把私密凭据提交代码。

## C. REA 实际安装运行结果

Actions: https://github.com/23chen990/ai-mini-game-factory/actions/runs/38358883399

GitHub Actions Ubuntu runner 上 Node.js 24.11.0、`rea-agents@6.4.0` 安装成功，输出 `rea --version = 6.4.0`。使用真正的 `rea analyze-javascript-application` 得到：
- 自有静态 JS smoke：成功，真实 Evidence ID。
- 固定上游 commit：`54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`，**16 个源码锚点成功**。
- 下载用户提供的三个 CDN H5 单 HTML，提取 inline JS，固定哈希后运行 REA 静态分析：QQ 飞车、运输船、鹈鹕三者退出码均为 **0**，获得静态 Evidence 收据，耗时约 18/20/21 秒。
- 上述结果**不是** REA 识别准确率已验证、浏览器动态行为已观察、后端已破解、TapTap 已可上线。
- 整体 workflow 仍为 **failure**，原因是 HTTP job 的 lint 阶段（包含 PR #7 上游遗留文件）。实验的 `three-h5-real-rea` job 独立成功。勿掩盖问题。
- 原始未脱敏上游 HTML 和大型 REA JSON 没有上传公开仓库；CI artifact 是摘要、SHA 和源码锚点。若要做详细机制 accuracy 对比，应另做经批准的短期受限本地运行并保留私有 Evidence。

## D. REA 在你的电脑 / Codex 长期环境如何安装（尚未执行）

GitHub Actions 是临时机器，每次运行后销毁。**不等于 REA 已在用户电脑安装。** 助手无法从 GitHub Actions 把程序直接装到用户本地 macOS。用能操作本地终端的 Codex / Agent 安装：

1. 只在单独研究环境操作，记录 `uname -a` / `node -v` / `npm -v` / `which rea`；若版本符合并已安装，先 `rea --version`、`rea doctor --client codex --json`，不要重复覆盖。
2. REA 6.4.0 的 Node 要求 `^22.19.0 || ^24.11.0 || >=26.0.0`；不满足则用用户现有版本管理器安装兼容版（推荐固定 24.11.0），不要修改工厂仓库 `package.json` 或锁文件。
3. 官方可用 `npm install --global rea-agents@6.4.0` 和 `rea --version`，或者无需全局安装 `npx -y rea-agents@6.4.0 --version`。先读取 `https://github.com/morluto/rea/blob/main/docs/installation.md`。
4. **先预览** `rea setup --client codex --skill=false --dry-run`，展示会写入哪个用户配置文件（Codex MCP 配置）；确认不会覆盖其他 MCP，再执行 `rea setup --client codex --skill=false`，只配置 Codex（如需该工具自带 Skills，单独审核，不要覆盖现有工厂 Skills）。
5. `rea doctor --client codex --json`；重启/reconnect Codex。检查注册的 MCP 工具确实可调用。
6. 对用户**自行创建的小 JS** 在隔离目录运行 `rea analyze-javascript-application /absolute/path --json`，记录退出码、时间、版本、输出摘要以及隐私防护。不要用第三方游戏做安装 smoke。
7. 需要真实 H5 浏览器动态观察时，先从 `rea --help`、`rea inspect-web-page --help` 验证该已安装版本是否支持，再确认授权、限定访问域名、保存必要证据。
8. 禁止将 token、cookie、真实用户数据、浏览器资料或未经许可的第三方源码推送到 GitHub。支持仅研究账号，非生产权限。
9. 安装成功须实证：版本正确 + Codex MCP doctor 通过 + CLI 自有 smoke 成功。任何一项缺失，标记 **NOT_READY**。仅配置就绪时为 `REA_INSTALLED_LOCAL`，不能标记 `TARGET_REVERSE_PROVEN`。

## E. 一次性交给 Codex 的开发优先级（不扩展工厂）

- 先根据本文件修订 PR #8 的 TapTap 产品方向，**不要修改 PR #2/#3/#7**。保留它们的 Draft 状态和工作成果。
- 将已确认的 REA 输出与现有 PR #7 门禁 `research-to-build.mjs` 关联。直接从固定源码和实测行为得到新机制证据；不要另写一套门禁/任务编排/Agent 团队。
- 三款 H5 各做 **最小复用/合法改造价值分析**（类型、手机按键、场景性能、广告触发、IP风险）。优先一个可验证的原创新手项目，其他留为候选，避免同时做三款复杂项目。
- 交付中文手机验收页、H5 产物、真实 REA 状态、3–5 个核心验收用例、版权清单、IAA mocked & real pending 标记、适用 TapTap H5 上线入口。线上广告创建/正式提交必须经用户确认。
- 用小成本 GO/FIX/STOP 规则：可玩的 H5 + 真实触控 + 广告桥接适配 => GO 测试；反复卡在授权或平台形态不支持 => STOP，换更简单样本，而不是无限修复。
