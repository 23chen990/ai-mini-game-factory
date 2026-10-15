# 鹈鹕海岸冒险 V3 · H5 开发试玩候选

状态：**BLOCKED，未通过 release gate**。此包只用于本地/设备 H5 试玩，不是 WeChat、Douyin 或 TapTap 原生发布包，也不代表生产放行。

- 目标游戏：鹈鹕海岸冒险
- 工作区：`/Users/kker/.codex/worktrees/pelican-feel-v3/妖怪夜市/runs/pelican-coast-v2-20261014/workspace`
- Run：`pelican-coast-v2-20261014` · attempt 20
- 已测试 HTML SHA-256：`3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`
- 产品合约：15 个 feature / 30 个 viewport case，含 engagement runtime entrypoint
- 基线提交：`b3e9e41dbafd9fecff972e0838aec8bed8220afc`

解压后用静态 HTTP 服务打开 `index.html`。包内包含实际通过本轮 build receipt 绑定的单文件 H5、Three.js license、平台状态、机器报告副本及 manifest 指定的本轮 JSON 证据与 feel-state driver、截图和视频。feel-state 材料只证明当前构建的观测与正常触控路径，不证明独立玩家的乐趣或留存。

## 当前构建的桌面浏览器证据

| QA 类别 | 浏览器 | 状态 | 当前 attempt 报告 |
|---|---|---|---|
| campaign | webkit | PASS | `attempts/attempt-20/qa-campaign-webkit/report.json` |
| collision | webkit | PASS | `attempts/attempt-20/qa-collisions-webkit/report.json` |
| experience | webkit | PASS | `attempts/attempt-20/experience-webkit/report.json` |
| head | webkit | PASS | `attempts/attempt-20/head-webkit/report.json` |
| risk | webkit | PASS | `attempts/attempt-20/risk-webkit/report.json` |
| feel-state | webkit | PASS | `attempts/attempt-20/feel-state-webkit/report.json` |
| campaign | chromium | PASS | `attempts/attempt-20/qa-campaign-chromium/report.json` |
| collision | chromium | PASS | `attempts/attempt-20/qa-collisions-chromium/report.json` |
| experience | chromium | PASS | `attempts/attempt-20/experience-chromium/report.json` |
| head | chromium | PASS | `attempts/attempt-20/head-chromium/report.json` |
| risk | chromium | PASS | `attempts/attempt-20/risk-chromium/report.json` |
| feel-state | chromium | PASS | `attempts/attempt-20/feel-state-chromium/report.json` |
| visual | webkit | PASS | `attempts/attempt-20/visual/report.json` |
| lifecycle | webkit+chromium | BLOCKED | `attempts/attempt-20/lifecycle/report.json` |
| safety | webkit | BLOCKED | `attempts/attempt-20/qa-safety-webkit/report.json` |
| safety | chromium | BLOCKED | `attempts/attempt-20/qa-safety-chromium/report.json` |

## 自然流程与风险追踪

| 轨迹 | 状态 | 报告 |
|---|---|---|
| campaign-natural-flow | PASS | `artifacts/natural/campaign.json` |
| collision-natural-flow | PASS | `artifacts/natural/collisions.json` |
| v3-experience-natural-flow-webkit | PASS | `artifacts/natural/v3-experience-webkit.json` |
| v3-experience-natural-flow-chromium | PASS | `artifacts/natural/v3-experience-chromium.json` |
| v3-risk-natural-flow-webkit | PASS | `artifacts/natural/v3-risk-webkit.json` |
| v3-risk-natural-flow-chromium | PASS | `artifacts/natural/v3-risk-chromium.json` |
| v3-feel-state-natural-flow-webkit | PASS | `artifacts/natural/v3-feel-state-webkit.json` |
| v3-feel-state-natural-flow-chromium | PASS | `artifacts/natural/v3-feel-state-chromium.json` |
| v3-head-natural-flow-webkit-390 | PASS | `artifacts/natural/v3-head-webkit-390.json` |
| v3-head-natural-flow-webkit-360 | PASS | `artifacts/natural/v3-head-webkit-360.json` |
| v3-head-natural-flow-webkit-320 | PASS | `artifacts/natural/v3-head-webkit-320.json` |
| v3-head-natural-flow-webkit-844 | PASS | `artifacts/natural/v3-head-webkit-844.json` |
| v3-head-natural-flow-chromium-390 | PASS | `artifacts/natural/v3-head-chromium-390.json` |
| v3-head-natural-flow-chromium-360 | PASS | `artifacts/natural/v3-head-chromium-360.json` |
| v3-head-natural-flow-chromium-320 | PASS | `artifacts/natural/v3-head-chromium-320.json` |
| v3-head-natural-flow-chromium-844 | PASS | `artifacts/natural/v3-head-chromium-844.json` |

风险报告逐一绑定 12 个指定障碍跳跃、实际 earned golden fish objectId、五关结算/存档与最终重玩；静态 fish-source association 仅作为工程映射证据。

## 五关自然流程

| 关卡 | 路程 | 捕鱼 | 用时 | 结果 |
|---|---:|---:|---:|---|
| 1 | 300 m | 20 条 / 金鱼 5 | 40.0 秒 | complete |
| 2 | 420 m | 26 条 / 金鱼 5 | 52.5 秒 | complete |
| 3 | 540 m | 34 条 / 金鱼 7 | 61.4 秒 | complete |
| 4 | 630 m | 31 条 / 金鱼 7 | 68.5 秒 | complete |
| 5 | 720 m | 36 条 / 金鱼 6 | 75.0 秒 | complete |

## 仍为 BLOCKED 的发布条件

- iPhone/Android 真机操作、低端设备性能、发热和长局稳定性尚未验证。
- 手机真实切后台、锁屏、来电中断与恢复尚未验证；桌面浏览器或注入事件不能替代真机证据。
- TapTap 实际广告尚未接入，不存在模拟广告奖励。
- WeChat Mini Game 与 Douyin Mini Game 原生包未打包。
- 独立人类玩家的乐趣、可用性与留存测试和生产发布仍未完成。

平台状态：WeChat=NOT_PACKAGED，Douyin=NOT_PACKAGED，TapTap Ads=NOT_INTEGRATED，production=false。

包内 `qa-report-v3.json`、`build-report-v3.json`、`qa-summary-v3.json` 和 `qa-evidence-manifest-v3.json` 可机器复核。
