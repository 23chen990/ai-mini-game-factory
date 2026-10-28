# 统一工厂集成候选｜2026-10-28

## 结论与边界

代码已整合；真实 Agent 自主修复验收 **BLOCKED**，不能当作已投产。
唯一后续集成候选是 `codex/factory-unified-20261028`，提交的两个父系分别保留 #81 与 #82。
原始游戏、历史计数和用户未提交修改没有重置；未合并任何独立游戏分支。
精确当前 HEAD / GitHub CI 以集成 PR 的 head SHA 与检查链接为准。

机器结果：`reports/unified-20261028/verification.json`。
真实调用、原始拒绝、成本与证据：`reports/unified-20261028/experiment.json`、`experiment/`、`evidence-manifest.json`。
工作树/PR 清单与保留校验：`inventory.json`、`preservation.json`。

## 基线与继承

- 远端 main：`5ff8d88945d76fa7dc6b3dd65aa8f9aa58324217`，不是本地原始 checkout 的 `1eb8a194`。
- #73 → #74 → #75 → #76 → #77 → #78 → #79 → #80 → #81 是堆叠链；#81 HEAD 为 `0c3c498f54cf334b83e96bd14c3016e7c84382b6`，已有精确 HEAD 绿 CI。
- #82 HEAD `9962db5fbc6f4498b7cae650b0aca755ab0ff5d8` 直接源于旧 main，缺少上述堆叠链。
- 新工作树从 #81 创建；用有历史关系的 merge、逐块解决冲突，不用旧文件覆盖，也没有整批 cherry-pick。

## 同版本保留与修正

| 能力 | 集成方式 |
| --- | --- |
| Research 有界画面与来源校验 | 保留 #81 的媒体计划、隔离文件集、来源/帧哈希与有限采样，不把完整帧清单送回 Research |
| 独立调用、成本与恢复 | 保留唯一 execution ID、每次输出、账本、预算租约、超时、失败/未决用量阻断；增加每次实际参数/提示词/图片指针的脱敏留存 |
| 浏览器与 QA 图片输入 | 保留四单元 Chromium/WebKit 真实预检；修复 QA context → Provider → CLI 的 `qaObservation` 丢失；候选完整目录哈希、PNG/轨迹及参考图片重新校验 |
| 双端比较 | 保留独立 Reference/Candidate Capture、协议、比较模式和度量校验；历史录像用 `recording-observation`，不能伪装成已记录的正常输入 |
| #82 独立 QA 与发现 | 保留新鲜 QA 调用、合同外 discoveries、明确根因假设、原分支复测；初测不续用作者线程 |
| FIX 与强制复测 | #82 接回 #81 的 prepare/start/complete repair-history，不另维护一套修复计数/预算准入；模型不重复 build，宿主适配器构建一次 |
| 上游分流 | 明确 design/research 发现可定向执行现有 Blueprint/Research Provider；未改变输出则停止、不重复构建；旧合同下的下游结果失效并归档 |
| 缺证据与历史差距 | 独立实现问题可以先修；证据差距保留并成为当前构建的显式复测义务。上游改合同、措辞变化或通过兄弟分支都不能关闭旧问题 |
| 有界恢复 | 保留显式次数/Token/时间限制；移除与仓库规则冲突的隐式五次 FIX 上限；未完成尝试、无变化构建、相同诊断仍停止 |
| 模型配置拒绝 | 显示值 `account-default` 不再作为模型 id；强制原生 ChatGPT 登录/provider，避免继承按量 API；配置/权限拒绝不会误当作弱模型而升级重试 |

`AGENTS.md` 的用户提案纪律已继承。原始 checkout 中模型错误分类的未提交修正经本次真实拒绝证据验证后选择性纳入，未覆盖原文件。
#81 工作树未提交的 profile-contract / 其他 prompt 改动没有盲目并入，原位置保留。
原 checkout 的 830 项删除仍是原 checkout 的用户变更，没有作为集成补丁导入。

## 现有证据下的四问（没有增加 Agent / Gate / 默认模型调用）

| 修正 | 具体失败与原因证据 | 更小方案与成本 | 判断/保留标准 |
| --- | --- | --- | --- |
| 版本整合 | #82 的 merge-base 是 main，而非 #81；七个实际代码冲突 | 保持现状会继续漏能力；按块 merge 比覆写/双线维护小 | 两个 HEAD 都是祖先；旧回归、类型与浏览器预检全过，否则不接受 |
| QA 接线/哈希 | `red-qa-handoff.log` 证明 structured 丢失观察输入；`red-directory-hash.log` 证明文件型 guard 拒绝实际目录构建哈希 | 复用现有 observation/preflight；不新增观察 Agent | 同例变绿、资产篡改仍拒绝；真实像素观察若未发生必须仍 BLOCKED |
| 上游真实执行 | `red-model-upstream.log` 的 design 案例只有一次 Blueprint 调用；#82 代码直接 setWaiting | 现有 Stage/Provider 定向重入，不引入平行生产线 | Research/Blueprint 二次调用与 issue 交接可验证；无变化停止；实际上游语义改善尚未由模型验证 |
| 修复/历史 | 旧 FIX 合同隐式限制五次；旧假设可被 message 改写；上游/延期差距不在 requiredRetests | 复用已有 repair-policy、主账本和 fidelity gate，保留显式五次配置回归 | 不改变次数；新因果假设可入场，重述不可；旧分支必须在新构建复测 |
| 模型参数 | 首次 HTTP 400 拒绝 `account-default`；替补原生订阅 HTTP 400 拒绝本机配置 `gpt-6.1-sol` | 修复 sentinel 传递，不盲猜新模型、不使用付费代理、不重复消耗 | 零模型成本接线/分类回归通过；替补仍拒绝，故停止真实实验，不能声称检测能力提高 |
| 累计执行时间 | 人工等待后仅有 9.481 秒执行，旧“距首次调用时间”算法却触发 30 分钟 | 累加已结束 invocation 的真实执行间隔，未决时间仍阻断 | 相隔六小时的 10 秒/20 秒调用仅计 30 秒；每次与累计上限仍生效 |

## 真实实验（非 Mock 成功）

目标：`runs/unified-agent-repair-20261028/workspace/game`，原始候选隔离复制。
Builder 角色构造了真实的终局重玩回调缺失；oracle 保留在 run 之外，不给 QA。
宿主从 fresh 浏览器执行 48 次正常操作，真实到达胜利终局并点击重玩两次。
冻结 5 张候选截图、连续视频和输入轨迹，绑定构建：
`32a499d21023799d50a81236bf5461f28a35e09f210b8609ec037b22141ab5e0`。

参考录像精确 SHA-256：`3781e4dcd3d21094f186cf442b3ee30cddfbb2fbe68d87c5c7470a2c742bf75a`。
重新 ingest 为 PENDING，显式身份检查后 verified；选定三张同源 contact sheet。
没有登录/绕过受限网站；录像不能证明的输入时序、隐藏因果及双端正常输入比较保持 UNKNOWN。

1. 首测请求：CLI 参数含真实图片附件，但 `account-default` 被订阅端在推理前拒绝。
2. 用户仅授权一次替补首测；零成本参数回归通过后，替补请求的 `gpt-6.1-sol` 仍被订阅端拒绝。
3. 无完成推理、无独立 QA 结果、无自主发现；Fixer **0** 次、独立复测 **0** 次。
4. 控制器没有修复样本，也没有把正常输入录制或单元 Mock 当成 Agent 自主发现。
5. 原拒绝和账本保留；首次状态核对有 before receipt、原始拒绝 SHA 与理由。第二条未决用量保持未决，不能静默重授预算。

本机缓存的模型别名与原生订阅的实际响应相矛盾，缓存不是账号可用性证据。
未修改用户全局配置或默认模型；进一步选择订阅可用模型及追加初测需要新的明确授权。

## 能力结论与成本

- 工程流程：以完整自动化/浏览器结果为准；测试中的合成 Provider 只证明控制平面。
- 独立 QA 观察像素、自主发现、Fixer 自主修复、独立复测：本次均未获证。
- Reference-First 全新游戏生产：未执行完成；微信、抖音、TapTap 发布包均未验收。
- 请求尝试 2 次，完成推理 0 次，观测 Token 下界 0，缓存 Token 未知。
- 两次 invocation 累计执行 **23,610 ms**；人工等待不算模型执行。
- 没有购买 Credits、没有使用按量 API；货币费用及主聊天模型用量未查询，不编造成功率或节省比例。

`tools/unified-agent-repair-pilot.ts` 只是本次现有游戏/历史证据的有界实验复现脚本，复用现有 Provider/FixerAgent/Adapter；它不是新生产 Stage、平行工作流、默认 Research 或默认额外模型调用。
