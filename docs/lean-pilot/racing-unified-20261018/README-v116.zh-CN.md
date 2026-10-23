# 极速飞驰 V11.6：地图、六车型与本次验证

## 当前试玩：attempt 13 渲染开销修复

最新构建为 `3a1bd6000047d8310718ca3ee39c7602b311a07eb5c2d2c08e950fee399cadf5`。本地实际桌面和触屏冷启动已通过原生产门槛，桌面键盘响应也通过；修复、当前构建身份及证据见 [attempt 13 说明](render-cost-fix-v116.md)。归档时新提交的远端检查尚待执行，最终结果以该提交的 [PR Checks](https://github.com/23chen990/ai-mini-game-factory/pull/68/checks) 为准。

[attempt 12 的本地检查点](cold-start-fix-v116.md)和原证据保持不变；其提交 `4746…` 后续远端独立桌面冷启动仍未通过 45 秒门槛，原始失败已纳入本次修复说明。以下保留 **attempt 11 / c606…** 的历史构建与实测记录，不能当作 attempt 13 的新执行结果。

目标游戏：`qq-speed / 极速飞驰`。运行工作区：`runs/h5-qq-mobile-20261013/workspace`。本页对应 2026-10-18 的 **attempt 11**。

V11.6 已将基础车和五款用户 GLB 接入同一原生赛车流程，保留 30 张主线地图与 10 条物理近道。本次完整浏览器 smoke、车库流程及原生物理审计已通过；**已观察第 1 关真实 DNF 和点击重玩后重新开赛，完整 30 关加每日挑战的自然验收仍为 BLOCKED，真实手机和真实广告 SDK 为 NOT_RUN，`publishable: false`**。本页记录开发试玩产物的验证范围。

## 构建身份

| 字段 | 值 |
| --- | --- |
| 版本 / UI 修订 | `V11.6` / `racing-v116-garage` |
| buildHash | `c60652cca51624b1efb8fbb4cc183e17a741c89e3e39c313113d7f9e74dab3f1` |
| inputHash | `9936cef6259c01abb7315dce82fd07a1bafa3e30e7dbdea862422c9a4e351855` |
| 单文件 HTML | `racing-two-button-c60652cca516.html` |
| HTML 字节数 | `13,338,723` |
| HTML SHA-256 | `d246537f3cdba7081350f1a5de3e4956e7a05c50be74659e40f003a5945f44ab` |
| 统一赛车源码提交 | `7d2f484afc50617dffa66747c2406d7840b88227` |
| 源码树 | `2e27824445593e79dd9dda61d02e2924a81698f5` |
| 收据中的 sourceRevision | `54adc1fb64155f9dd7c1c90ecae7b8185ac540b8` |

完整身份见[构建收据](evidence-v116/build-receipt.json)，机器可读结论见[验证摘要](verification-summary-v116.json)。本页链接指向本次 `evidence-v116/` 归档；归档清单和最终收集状态记录在[证据清单](evidence-v116/manifest.json)及验证摘要中。

## 地图与驾驶

主线含 30 张地图。05、10、12、13、16、18、22、25、27、30 关设有实际道路分支、入口和出口的物理近道；最终产物的[几何报告](evidence-v116/geometry-30.json)覆盖全部 30 关和 10 条近道，[节奏报告](evidence-v116/pacing-30.json)保留各关路线与时长指标。

驾驶继续使用原生 `PlayerCar`，触屏方向盘、反打、漂移释放、小喷、氮气、碰撞和暂停逻辑保持共同规则。AI 使用 `native-playercar-physics` 模式，经相同原生物理更新前进；本次 30 关各 5 台对手的实际工程运行共有 150/150 完赛。该数据用于验证物理与终点规则，不表示玩家胜率或自然游玩难度已验收。[原生玩家检查](evidence-v116/player-12.json)、[AI 运行报告](evidence-v116/ai-150.json)

## 六款实际车型

| 稳定 ID | 车型 | 车漆和车轮 |
| --- | --- | --- |
| `starter` | 初始赛车 | 初始拥有，支持既有八种车漆，四个独立车轮节点 |
| `custom-01` | 银紫超跑 | 原材质，静态车轮表面 |
| `custom-02` | 荧光跑车 | 原材质，静态车轮表面 |
| `custom-03` | 黄金方程式 | 原材质，静态车轮表面 |
| `custom-04` | 赤焰超跑 | 原材质，静态车轮表面 |
| `custom-05` | 蓝白拉力 | 原材质，静态车轮表面 |

五款新增 GLB 保留各自模型和材质，首页预览及原生开赛读取实际模型身份。它们的车身与车轮为合并表面，尚无独立轮转或转向动画；基础车保留已有车轮动画。各资产的字节数、三角形预算、来源与 SHA-256 见[车型接入说明](car-integration-v116.md)及[构建收据](evidence-v116/build-receipt.json)。

车型仅改变外观与所有权，不提供差异化驾驶属性。车库报告核对了六个实际模型，并在同一产物中为每个模型执行相同输入、相同时间步长的 600 帧独立物理探针；六份完整轨迹精确一致。探针没有推进实际比赛或生成真实完赛结果。[车库与物理证据](evidence-v116/car-garage.json)

## 领取、本地保存与平台状态

新增车型的领取契约是：完整观看对应激励视频、收到有效完成回调并成功写入本地所有权后，该车型持续可用，再次装备不需重复观看。取消、错误、超时、缺少 SDK、迟到回调或所有权写入失败均不授予。所有权已经成功保存、但后续模型展示或装备失败时，保留已领取状态，不误报装备成功。[所有权与存档源码回归](evidence-v116/source-399.tap)、[车库浏览器证据](evidence-v116/car-garage.json)

“永久”指同一浏览器来源的本地持久化存档，使用 `h5-mobile:qq-speed:career:v1` 的 `ownedCars` 和 `car` 字段；当前没有账号云同步或跨设备恢复。领取和换车不改油量、星星、成绩和已开放关卡。既有车漆所有权保留，新车采用原材质，切回基础车仍可用已取得的车漆。[存档与装备实现说明](car-integration-v116.md)

实际 [platform.json](../../../templates/web-lite/h5-source-mobile-v1/platform.json) 仍为 `PENDING / NOT_RUN`，`appId`、`spaceId`、`screenOrientation` 为空。默认配置没有可用的真实激励视频 SDK，领取入口隐藏；基础车可用，未拥有的新车型可预览。浏览器中的模拟 SDK 已覆盖领取、取消和异常路径，但不构成真实广告投放验收。

## 本次已完成的验证

| 检查 | 结果 | 范围与证据 |
| --- | --- | --- |
| 源码回归 | 399/399 PASS，0 skip | [原始输出](evidence-v116/source-399.tap)，包括已生成原生项目相关检查 |
| 首次构建契约 | 26/26 PASS，0 skip | [原始输出](evidence-v116/build-contracts-26.tap)，包含当时的 4 项仪器回归 |
| 最新仪器与车型构建契约 | 18/18 PASS，0 skip | [原始输出](evidence-v116/instrumentation-usercar-build-18.tap)，8 项仪器回归与 10 项车型构建检查 |
| GLB 运行与资源释放 | 18/18 PASS，0 skip | [原始输出](evidence-v116/car-runtime-18.tap)，模型身份、材质、预览切换、解码缓存与资源生命周期；浏览器位图解码使用桩 |
| 原生地图几何 | 30 关 / 10 条近道 PASS | [几何报告](evidence-v116/geometry-30.json) |
| 原生 AI 完赛 | 30/30 关，150/150 台 PASS | [AI 报告](evidence-v116/ai-150.json) |
| 原生玩家物理 | 12/12 PASS | [玩家报告](evidence-v116/player-12.json)，报告版本为实际 V11.6 |
| 车库浏览器流程 | 6/6 PASS | [车库报告](evidence-v116/car-garage.json)，六实际模型、领取、刷新、无 SDK、存储失败与兼容路径 |
| 下一关激励广告接线 | 3/3 PASS | [广告报告](evidence-v116/next-stage-ads.json)，模拟 SDK 与注入失败结果 |
| 交付证据契约 | 29/29 PASS，0 skip | [最终原始输出](evidence-v116/delivery-contracts-final.tap)，包含原 22 项、大中文内联脚本及入口属性回归 |
| 实际单文件与 H5 ZIP 完整性 | PASS，55 个声明文件 | [实际校验结果](evidence-v116/delivery-verified.json)、[执行与哈希收据](evidence-v116/delivery-verification-command.json)；2/2 脚本语法通过，发布门槛仍保留 |
| 燃料与结算布局夹具 | 10/10 PASS，0 skip | [原始输出](evidence-v116/fuel-lifecycle-10.tap)，原十项断言不变；补齐预览接口及浏览器/服务清理顺序 |
| 独立桌面冷启动 | PASS | [冷启动报告](evidence-v116/desktop-cold-start.json)，ready 到 race 36.6515 秒 |
| 完整浏览器 smoke | PASS，10 个报告视图 | [smoke 报告](evidence-v116/smoke.json)，2026-10-18 15:09:15.109–15:13:14.970 UTC，`errors: []` |

各套件存在重叠，上表不累计成单一测试总数。仪器修复后使用同一 attempt 11 产物复核，未因版本标签问题放宽引擎、哈希、物理、几何或完赛门槛。完整 smoke 保留桌面原有 45 秒/18 秒限制，实际键盘输入、原生跟随镜头及前进响应均通过。

桌面结果来自当前软件 Chromium WebGL 环境。独立冷启动时画质自动降至 `pixelRatio = 0.35`，1366 × 768 视口对应约 478 × 268 绘图缓冲；HUD 仍清晰，3D 场景明显变糊。PASS 说明该环境满足所测启动与响应门槛，不代表真实手机性能，也不消除画质下降这一限制。[桌面报告](evidence-v116/desktop-cold-start.json)

## 待完成的体验和发布条件

| 项目 | 当前状态 | 所需证据 |
| --- | --- | --- |
| 第 1 关真实 DNF → 结果 → 重玩重新开赛 | **已观察** | [原始自然报告](evidence-v116/natural-journey.json)、[实际重开状态](evidence-v116/loss-replay.json)；该局未完赛、未通关 |
| 完整 30 关加每日挑战的自然通过 | **BLOCKED** | 本次仅观察第 1 关，合格完赛为 0，尚无其余关卡与每日挑战通过证据 |
| 真实手机操控、清晰度与性能 | **NOT_RUN** | 目标设备上的实际测试 |
| 真实平台 SDK 与激励视频 | **NOT_RUN** | 完整平台配置、真实回调与相应平台测试 |
| 商业可发布状态 | **false** | 完整自然通过及目标平台发布条件仍未满足 |

本次自然观察使用可见小地图、可见提示和正常 CDP 触控，未预置生涯进度，原生状态只用于断言。第 1 关在原生比赛时间 `300.0239 s` 达到真实 DNF，墙钟观察时长为 `518.401 s`；结果显示“未完赛（进度 92%）”，第 6 名、0 星，`finished: false`、`finishTime: 0`。报告为 `passed: false`、`errors: []`；无脚本错误不能替代通关结果。[原始自然报告](evidence-v116/natural-journey.json)

结果页 `actionsFit: true`：844 × 390 视口内，“重玩”和“返回大厅”按钮均为 44 像素高，纵向范围 317–361。随后通过真实按钮点击重玩，原生状态和页面阶段均恢复为 `race`，仍为 `race-01`；重开快照记录原生比赛时间 `0.2 s`、车速 `90.5221 km/h`，漂移、小喷、氮气与碰撞计数均归零。该证据确认了真实失败后的重开路径；本次没有合格完赛或全生涯通过。[实际重开状态](evidence-v116/loss-replay.json)

完整 smoke 和车库检查包含预置存档、模拟广告、工程摆场、隔离物理探针以及提前 DNF/结算分支。它们证明对应实现路径，不能替代自然完赛、失败压力或真实设备感受。第一轮仅被旧版元数据标签拦住的 smoke 原报告保留；通过结果取自本次独立的 `racing-v3-smoke-v116-recheck1`。

[旧版说明](README.zh-CN.md)、[旧版摘要](verification-summary.json)和旧 `evidence/` 记录 V11.5 的历史结论。本次 V11.6 报告单独归档，历史自然体验阻断没有被改写为新版通过。

历史 `evidence/manifest.json` 中 README 的引用哈希与基线及当前未改动的旧 README 存在既有差异；本次保留两者原始字节，不改写历史来消除差异。V11.6 的文件身份以本次独立证据清单为准。

最终证据归档已完成，清单记录 54 个文件的原始字节数、SHA-256 和来源。实际交付校验绑定上表源码提交；源码树对应游戏与工具，随后证据提交仅补充文档与原件。大中文内联脚本导致的旧校验栈溢出、修复前属性入口回归失败以及燃料夹具失败/清理阻断记录均保留。交付完整性 PASS 仍不授予自然通关、真实设备、真实广告或商业发布资格。
