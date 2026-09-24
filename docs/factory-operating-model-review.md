# 通用小游戏工厂生产系统方案（评审稿）

> **本评审稿的经营前提（v2）**：工厂服务一人团队和产品经理，不要求负责人会代码或设计；默认只做
> 国内微信/抖音/TapTap 小游戏，海外 H5 是可选子渠道，不做 App；变现只采用 IAA。可以少量买量，
> 但首轮以自然流量和小额、可停止的验证为主。账号、实名认证/备案、广告开通、税务/结算和平台条款
> 都是需要负责人按当期官方规则确认的外部事实，不能由模型猜测或写死在代码里。

> **落地口径**：`fast` 只回答“这个候选值得继续吗”，不宣称可发布；`full-validation` 才走平台、供应链、
> 原创性、人工试玩和发布证据。当前仓库真正可执行的母版以能力报告为准；没有模板/适配器的产线必须
> 停在能力检查，不得静默套用 idle 模板。三次人工会话是 `GO_NO_GO`、`CORE_DEMO`、`FINAL_RELEASE`；
> 条件性合规、平台和盲测记录异步完成，不伪装成额外会议。

## 0. 目标与边界

这不是某一款游戏的流程，而是一套可以反复生产 2D 轻量小游戏的工厂操作模型。

工厂的最小复用单位不是“某一款游戏”，而是“一类玩法母版（production line）”。总控流程、证据格式、权限、安全和发布门禁是共用的；玩法母版提供自己的代码模板、体验指标、原型模板、自动试玩策略、UI 模板、性能预算和 QA 清单。

第一阶段建议建设五条母版：

1. 单指物理 / 跑酷
2. 切割 / 堆叠 / 躲避
3. Idle 商店 / 经营
4. 选择 / 人生模拟
5. 规则型轻解谜

默认产品边界：2D、单机、短局、一个主要操作、状态有限、固定随机种子、无复杂后端、无实时 PvP、使用成熟代码母版。复杂 3D 物理、实时多人、UGC、开放世界、长线交易、大量剧情演出和真实支付需要单独的高风险产线与更多人工检查，不能直接套用默认流程。

浏览器 `web-lite` 构建只用于开发和自动 QA；微信、抖音、TapTap 的平台包、适配器、配置、真机 QA 和发布证据必须在同一 run 内隔离并单独验证。

## 1. 总体架构

```text
Factory Control Plane（总控）
  ├─ Request Router（需求与风险路由）
  ├─ Production Line Registry（玩法母版注册表）
  ├─ Stage Contract Registry（阶段契约注册表）
  ├─ Model Policy（模型与权限策略）
  ├─ Context Manager（上下文预算与交接包）
  ├─ Evidence Store（结构化 Artifact、哈希、日志）
  ├─ Factory Eval Suite（工厂自身回归评测）
  └─ Release Gate（发布门禁）

Role Agents（角色 Agent）
  ├─ Research / Open-source Research
  ├─ Producer / Experience Designer
  ├─ Prototype Builder
  ├─ Art / Asset Producer
  ├─ Builder
  ├─ QA / Experience Review
  ├─ Fixer
  └─ Release Reviewer
```

总控负责状态、权限、输入输出、重试和证据，不负责替角色“凭感觉”判断结果。角色 Agent 之间只通过经过 Schema 校验的 Artifact 交接，不直接共享长对话。

## 2. 标准生产流程

```text
需求输入
  ↓
需求分类与风险分级
  ↓
竞品 / 参考研究
  ↓
开源基础设施研究
  ↓
玩法母版选择 + 体验类型确认
  ↓
玩法 / 体验契约
  ↓
核心原型或垂直切片
  ↓
体验专项验证
  ↓
人工确认核心 Demo
  ↓
内容、系统、关卡扩展
  ↓
UI 骨架
  ↓
美术方向确认
  ↓
素材生产
  ↓
完整构建
  ↓
核心测试
  ↓
正常流程 QA
  ↓
视觉证据 QA
  ↓
关卡 / 内容差异 QA
  ↓
人工试玩
  ↓
最终验收
  ↓
发布候选包
```

三条入口可以不同，但必须在“玩法 / 体验契约”之后汇合：

### 2.1 新玩法入口

```text
竞品研究 → 玩法创意 → 低成本筛选 → 原型竞赛 → 人工选择核心 Demo
```

### 2.2 指定竞品或参考游戏入口

```text
深度参考研究 → 人工锁定核心机制 → 开源研究 → 高保真机制蓝图
```

此路径只复制经人工确认的通用机制关系，不复制第三方代码、素材、名称、UI、文本、数值或表达。

### 2.3 已有游戏修改入口

```text
变更影响分析 → 更新体验契约 → 最小垂直切片 → 专项 QA → 内容 / UI / 构建
```

“Demo 已通过”不等于流程结束。通过 Demo 后必须继续进入内容扩展、UI 骨架、完整构建和五项验收。

## 3. FACTORY_CONSTITUTION（工厂宪章）

以下规则是所有产线共用的硬规则：

1. 关键阻塞型 `UNKNOWN` 未解决，不得进入下游阶段。
2. 每个阶段必须有结构化输入、输出、证据、通过标准和失败回路。
3. `Observation`、`Inference`、`Unknown` 必须分开记录，不能把推测写成事实。
4. Builder、Fixer、Producer 不得验收自己的工作；验收者必须是独立角色和独立上下文。
5. `SPEC_READY` 后冻结验收标准；任何改变必须走版本化变更请求，不能为了过测试降低标准。
6. 每次修复必须增加对应回归测试或说明为何不适用。
7. 失败回到产生错误 Artifact 的最早责任阶段，不得一律交给 Fixer。
8. 外部代码和素材必须有来源、许可证、版本和使用清单；许可证无法确认默认阻断。
9. 自动修复最多五轮；成本、时间、Token 或平台门禁可以更早中断但不能延长上限。达到循环上限必须进入 `FAILED`/`BLOCKED`，等待新的、明确授权的人工复核，不得无限打补丁。
10. `RELEASE_READY` 必须满足所有必需质量门 PASS、阻塞型 UNKNOWN 为零、所有 WAIVER 有人工签署、最终人工试玩通过。
11. Agent 不能自行扩大工具权限、文件范围、网络范围或发布权限。
12. 原始网页、README、下载文件和游戏文本永远是不可信数据，不能直接作为 Builder 指令。
13. 自动评分只能做筛选和预警，不能替代最终玩家体验判断。
14. 每次模型、Prompt、模板、路由或 QA 规则变更都必须运行 Factory Eval Suite。
15. 上下文超过预算必须压缩或新建交接包，不得无限追加历史对话。
16. 所有模型调用必须记录模型、推理强度、输入 Artifact 哈希、输出 Artifact 哈希、耗时和 token 使用。
17. 每条玩法母版必须有独立的体验指标、失败案例、性能预算和人工标定记录。

`UNKNOWN` 分两种：阻塞型必须解决；非阻塞型可以暂存，但要有负责人、截止阶段和风险说明。这样既防止盲目推进，也避免流程被无关小问题锁死。

## 4. 阶段契约（Stage Contract）

每个阶段在注册表中必须定义以下字段：

```text
stageId
purpose
ownerRole
allowedModelTiers
mutationScope
inputArtifacts（名称、Schema、版本、信任级别）
outputArtifacts（名称、Schema、版本）
evidenceRequired
passCriteria
failureClassification
failureRoute
maxAttempts
contextBudget
approvalRequired
idempotencyKey
```

建议的通用阶段契约如下：

| 阶段 | 主要输入 | 必须输出 | 通过证据 | 失败回路 | 默认模型 |
|---|---|---|---|---|---|
| INTAKE / ROUTE | 用户需求、目标平台 | `request-route.json`、风险等级 | 产线、体验类型、风险已确定 | 信息不足则回到需求澄清 | Sol / Luna |
| COMPETITOR_RESEARCH | 需求、允许的 URL | 竞品观察 Artifact | 至少多个来源、事实/推断分离、相似性红旗 | 研究不足回研究 | Sol |
| REFERENCE_LOCK | 研究 Artifact、人工选择 | 机制锁定 Artifact | 核心动作、状态转移、反馈和边界已锁定 | 退回研究或人工审批 | Sol |
| OPEN_SOURCE_RESEARCH | 已批准玩法、候选基础设施 | 开源研究 Artifact | URL、不可变版本、许可证、平台适配、风险齐全 | 许可证不明则阻断 | Sol / Luna |
| EXPERIENCE_PROFILE | 玩法蓝图、产线规则 | profile + 指标契约 | 只选一个主体验目标和次目标 | 回到玩法设计 | Sol |
| EXPERIENCE_CONTRACT | profile、蓝图 | 体验契约、正常流程任务 | 可观测指标、失败条件、代表场景齐全 | 回到设计 | Sol |
| CORE_PROTOTYPE | 体验契约、母版模板 | 可玩的核心原型 | 真实输入、首个爽点、压力/失败、重试信号可见 | 回到原型或玩法 | Terra / Sol |
| PROFILE_QA | 原型、体验契约 | profile-specific QA 报告 | 通过该产线的专项指标 | 回到原型或体验契约 | Luna |
| CORE_DEMO_APPROVAL | 原型/参考锁定、蓝图、体验契约、美术方向 | `CORE_DEMO` 台账记录 | 玩法结果与 UI/美术方向一次确认 | REVISE 回对应前置阶段；KILL 终止 | 人工 + Sol |
| CONTENT_EXPANSION | 锁定蓝图、体验契约 | 关卡 / 章节 / 系统差异 Artifact | 变化不是只换文案或数值 | 回到内容设计 | Sol / Terra |
| UI_SKELETON | 蓝图、内容契约 | 可用 UI 骨架 | 核心动作、当前目标、反馈和重试入口可见 | 回 UI | Spark / Luna |
| ART_DIRECTION | 蓝图、UI 约束 | 四个方向、预览和审批 | 结构差异而非只换色 | 回美术方向 | Luna / Sol |
| ASSETS | 锁定方向、资产清单 | 资产及透明度/来源证据 | alpha、边缘、许可证和哈希通过 | 回素材生产 | Spark 执行 + Luna 检查 |
| FULL_BUILD | 所有锁定 Artifact | 完整构建、Builder 报告 | 测试、类型检查、构建通过 | 回 Builder | Terra |
| CORE_VERIFY | Build 报告、测试 | 核心测试报告 | 规则、状态机、存档、平台边界通过 | 回 Builder | Luna |
| NORMAL_FLOW_QA | 构建、体验任务 | 正常流程 trace、截图、日志 | 从 reset 开始的真实输入流程完成 | 回 Builder / Fixer | Luna |
| VISUAL_EVIDENCE_QA | 正常流程证据、视觉契约 | 视觉证据报告 | 触发前/中/后、成功/失败、无错误帧齐全 | 回 UI / Builder | Spark 执行 + Luna 检查 |
| CONTENT_VARIATION_QA | 关卡清单、两次以上运行 | 差异报告 | 结构、决策、节奏或路线有真实差异 | 回内容 / 关卡 | Luna |
| HUMAN_PLAYTEST | 最终候选包、试玩任务 | 人工试玩记录 | 自然输入、玩家笔记、结论和录屏/截图 | 回最早失败阶段 | 人工 |
| ACCEPTANCE_REVIEW | 所有五项门禁 | completion gate | 五项 PASS、无阻塞 UNKNOWN | 回对应阶段 | Sol + 人工 |
| RELEASE | 验收包、平台证据 | 发布候选包、哈希清单 | 只打包已批准版本 | 阻断，不自动绕过 | Sol + Release |

阶段状态必须可恢复、可重入、幂等。每次暂停都保存 `state.json`、输入哈希、输出哈希、尝试次数和错误分类。

## 5. 体验类型与产线插件

总控只负责通用生命周期；体验指标由 `ExperienceProfile` 和 `ProductionLine` 共同决定。

### 主体验 Profile

- `ACTION_FEEL`：操作响应、碰撞可信度、运动连续性、命中反馈、节奏、重试欲望
- `NARRATIVE_AGENCY`：选择差异、后果可见性、角色关系、分支、重玩价值
- `STRATEGIC_SYSTEM`：资源循环、机会成本、风险收益、成长决策、压力节奏
- `PUZZLE_CLARITY`：规则理解、公平性、提示、可推导性、解法反馈
- `SOCIAL_EMOTION`：关系变化、情绪反馈、互动意义和重复价值
- `EXPLORATION_DISCOVERY`：空间引导、发现密度、奖励、路线和回访价值

每个游戏必须有一个主 Profile，可有一个次 Profile。不能用同一套指标验收所有游戏。

### 五条首批母版的自动试玩重点

| 母版 | 自动试玩策略 | 关键体验指标 |
|---|---|---|
| 单指物理 / 跑酷 | hold/release、碰撞、失败后重开、多速度测试 | 输入延迟、运动连续性、碰撞可信度、节奏 |
| 切割 / 堆叠 / 躲避 | 连续切割、物体生成、掉落和回收、极端角度 | 接触时机、掉落轨迹、反馈、误操作容错 |
| Idle 商店 / 经营 | 生产→交付→奖励→升级闭环、刷新恢复 | 目标清晰度、奖励频率、成长决策、等待价值 |
| 选择 / 人生模拟 | 两条以上路线、重开、选择后果、延迟回响 | 选择差异、因果理解、角色投入、重玩理由 |
| 规则型轻解谜 | 首次教学、错误尝试、提示、解法和重置 | 规则可理解、公平、提示质量、解法满足感 |

新增母版前要提交：模板、指标、原型、自动试玩策略、性能预算、已知失败案例，并经过多次人工标定。

## 6. 模型策略

模型按任务风险分配，不按游戏名称分配。`Max` 表示推理强度，不是独立的新模型；实际模型名称应由配置解析，不能写死在业务逻辑中。

### 6.1 模型层级

| 层级 | 当前推荐别名 | 责任 | 禁止责任 |
|---|---|---|---|
| Frontier | Sol Max；API 可对应旗舰级模型 | 研究、玩法、体验判断、复杂架构、最终复盘 | 不可单独替代人工最终试玩 |
| Builder | Terra Max | 完整实现、跨文件接线、正常构建 | 不负责验收自己的实现 |
| Reviewer | Luna Max | 独立 QA、问题归因、Artifact 审查、中等修复 | 不改变已冻结的设计标准 |
| Fast | Spark | UI 微调、单点 Bug、补测试、证据整理、机械化任务 | 不得设计核心玩法、物理、剧情、经济或关卡 |
| Extractor（可选） | GPT-5.4 mini / nano 等低延迟模型 | 分类、字段提取、去重、排序、日志摘要 | 不做高影响决策 |

官方模型资料将旗舰模型定位在复杂推理和专业编码，将 Mini 类模型定位在低延迟、高吞吐任务；官方 Codex 用例也把 Spark 放在已有项目的快速、聚焦修改上。以上具体阶段映射是工厂基于风险的工程建议，不是模型能力保证。[GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5)、[GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[Codex use cases](https://learn.chatgpt.com/use-cases?category=data&category=engineering&category=front-end&category=integrations&category=ios&category=macos&search=Automation&task_type=analysis&task_type=code&task_type=testing&team=engineering&team=operations&team=sales)

### 6.2 模型升级规则

```text
Spark 任务验证失败一次       → Luna
Luna 涉及多文件或语义不确定    → Terra
Terra 触及核心玩法 / 物理 / 剧情 → Sol
任意模型连续两次失败          → 暂停并人工复核
```

模型不能自行把任务降级、扩大范围或把失败标记为通过。每次升级必须保留原始失败证据。

### 6.3 权限矩阵

```text
Research：网络读取（受限）+ 文件写入研究 Artifact
Producer：只读研究 Artifact，写设计 Artifact
Builder：只写当前 run 的 generated workspace
Fixer：只写当前 run，且只能处理明确 QA issue
QA：只读构建，写 QA / evidence Artifact
Release：只读所有证据，写发布清单，不改游戏
```

只有 Builder 和 Fixer 能修改生成游戏工作区；QA、Release 和 Research 不得写入该工作区。

## 7. 上下文与交接设计

### 7.1 交接包，而不是完整对话

每次交接只发送版本化 `HandoffPacket`：

```text
fromStage / toStage
当前目标
已冻结决策
当前失败问题
相关 Artifact 路径和哈希
实际改动文件
已执行命令和结果
下一步动作
省略内容列表和摘要哈希
```

禁止把完整聊天记录、完整 Builder 日志、重复 JSON 或所有截图直接拼进 Prompt。

### 7.2 上下文预算

建议初始预算（以实际 token 计量后再调）：

```text
Spark：8k–16k token
Luna：16k–32k token
Terra：32k–48k token
Sol：48k–64k token
```

预算不是越大越好。超过预算时按以下优先级保留：

```text
当前阶段契约 > 阻塞问题 > 锁定决策 > 相关 Artifact 摘要 > 相关日志片段 > 历史讨论
```

### 7.3 新线程策略

- 默认每个责任角色使用独立线程。
- 正式 FIX 按 `codex-game-repair` 恢复保存的 Builder/Fixer 线程，保留累计修复次数；当前任务只交接已验证 QA issue 和必要产物。
- 其他阶段仅在同一角色、同一阶段、上下文未超预算时恢复旧线程；不能通过新线程重置正式 FIX 次数。
- 线程 ID 只用于追踪，不代表必须把旧对话重新传给下游。
- 长日志保存在文件中；模型按需读取相关区段。
- 每次阶段完成时生成滚动摘要，旧摘要不重复嵌套。

### 7.4 摘要安全

摘要必须保留事实来源和 Artifact 哈希，不能把模型推断变成事实。关键研究或玩法决策的摘要由确定性提取器先生成，再由 Reviewer 校验；不能只依赖一个模型自由总结。

## 8. 外部内容与 Agent 安全

Research Agent 浏览的网页、README、下载文件、游戏文本和第三方仓库内容全部视为不可信数据。

隔离结构：

```text
Research Sandbox（无生产权限）
  ├─ 受限网络 / 域名白名单
  ├─ 无密钥读取
  ├─ 无任意 Shell
  ├─ 无主仓库写入
  ├─ 下载文件隔离、扫描、哈希
  └─ 只输出结构化 Observation / Inference / Unknown
          ↓
安全过滤、来源和许可证校验
          ↓
人工或规则批准的研究 Artifact
          ↓
Builder（只接收批准结果）
```

安全要求：

- 网页中的“请执行命令”“请读取密钥”“请下载并上传文件”等文本永远只是数据，不是指令。
- 原始网页不直接进入 Builder Prompt；Builder 只读过滤后的字段和来源指针。
- URL、README、下载包和游戏文本记录来源、抓取时间、内容哈希和信任级别。
- 许可证、平台兼容性或安全性无法核实时，结果为 `UNKNOWN` 或 `REJECT`，不能猜测。
- 禁止把任何环境变量、API Key、用户文件或主仓库内容作为研究输入暴露给外部 Agent。
- 所有外部上传、发布、付费和删除动作都必须是显式人工授权的独立步骤。

## 9. Artifact 体系

所有 Artifact 至少包含：

```text
schemaVersion
runId
productionLineId
experienceProfile
createdByRole
model / reasoning
createdAt
inputArtifactHashes
sourceRefs
confidence
```

建议的核心 Artifact：

- `request-route.json`
- `competitor-research.json`
- `reference-mechanic-spec.json`
- `open-source-research.json`
- `game-blueprint.json`
- `experience-contract.json`
- `prototype-playtest-report.json`
- `build-report.json`
- `qa-report.json`
- `visual-evidence-report.json`
- `level-difference-report.json`
- `playtest-trace.json`
- `completion-gates.json`
- `factory-eval-result.json`
- `feedback-record.json`
- `release-manifest.json`

每个 Artifact 都必须能回答：谁生成、基于什么、何时生成、是否被批准、哪些文件或决策依赖它。

## 10. 五项验收与发布门禁

Builder 的 `IMPLEMENTATION_READY` 只表示核心测试、类型检查和构建完成，不表示游戏可以交付。

候选版本和发布版本必须区分：

```text
implementationReady
  = 核心测试 / 类型检查 / 构建通过

candidateReady
  = implementationReady
  + 正常流程 QA
  + 视觉证据
  + 关卡 / 内容差异

releaseReady
  = candidateReady
  + 人工试玩通过
  + 无阻塞 UNKNOWN
  + 无未签署 WAIVER
```

五个门禁：

1. **核心测试**：状态机、物理、碰撞、存档、输入和平台边界。
2. **正常流程 QA**：从 reset 开始，用自然输入走完整流程；不得使用 `loadScenario`、`setState`、坐标 Oracle 或直接修改玩家状态代替试玩。
3. **视觉证据**：触发前、触发中、解决后，以及成功和失败状态的真实截图/视频帧；必须检查 console/page error。
4. **关卡差异**：结构差异 + 行为差异；不能只改变文案、颜色或无关数值。
5. **人工试玩**：人工打开最终构建，记录输入方式、理解成本、爽点、失败原因、重玩意愿和明确结论。

视觉和内容证据必须来自正常流程，测试接口只能作为辅助核心证据。任何一项失败都回到对应责任阶段，而不是直接发布。

## 11. Factory Eval Suite

工厂要评测自己，而不只是评测生成的游戏。

### 11.1 数据集

建立版本化的黄金案例集，每个案例包括：

```text
caseId
参考链接或本地材料
正确体验类型
核心循环
关键操作
主要爽点
应该发现的失败机制
合理原型范围
禁止复制的表达
已知技术难点
人工评分与理由
```

黄金案例应覆盖五条玩法母版和典型失败案例，而不是只放成功项目。

### 11.2 必须触发回归的变更

- 更换模型或推理强度
- 修改 Prompt、Skill 或输出 Schema
- 增加 / 删除 Agent
- 修改路由、阶段顺序或失败回路
- 修改研究模板、Builder 模板或 QA 标准
- 更换浏览器、Playwright 或 Runtime Adapter
- 修改上下文压缩和交接策略

### 11.3 评测指标

- 路由和体验类型准确率
- 核心循环提取准确率
- 研究事实 / 推断 / 未知分离率
- 许可证和提示注入拦截率
- 原型范围偏差
- 自动 QA 与人工评分的相关性
- 关键回归通过率
- 平均 token、耗时、重试次数
- 误放行率和误阻断率

自动评分必须与盲测人工评分定期校准。单次轨迹成功不能代表工厂改好了；每次变更都要在固定数据集上重复运行并保留完整日志。

## 12. 人工反馈闭环

每一次人工反馈都保存为结构化记录：

```text
project
run_id
production_line_id
experience_profile
artifact_version
stage
rejected_dimension
reason
before
after
accepted_result
evidence
reviewer
new_regression_case
```

反馈处理流程：

```text
人工反馈
  ↓
归类（玩法 / 手感 / 剧情 / 关卡 / UI / 性能 / 安全）
  ↓
定位最早错误 Artifact
  ↓
更新产线规则或具体项目 Artifact
  ↓
增加回归案例
  ↓
运行 Factory Eval Suite
```

单个游戏的特殊意见不能直接改变全局规则；只有经过多案例验证，才能升级为母版规则。

## 13. 三次人工审批与强制中断

默认可以把人工审批压缩为三次；台账中的 scheduled 记录必须恰好对应这三次：

1. **`GO_NO_GO`**：确认目标、预算、平台账户和是否值得继续。
2. **`CORE_DEMO`**：在同一份核心 Demo/美术 review 材料中确认是否真的有趣、核心动作/选择是否成立以及 UI/美术方向；参考机制或原型选择只是前置证据，不重复计会。
3. **`FINAL_RELEASE`**：打开冻结候选包，完成自然试玩并决定是否发布。

以下情况无论处于哪一阶段都必须强制中断（中断不等于新增 scheduled 会审）：

- 相似性红旗未解决
- 外部许可证或来源无法确认
- 密钥、权限或安全边界异常
- 阻塞型 UNKNOWN
- 自动修复循环达到上限
- 生成内容与冻结规格冲突
- 平台包或真机证据缺失
- 人工试玩明确表示“不好玩”或“无法理解”

## 14. 失败分类与回路

```text
研究事实不足 / 提示注入 → Research Sandbox
许可证 / 来源问题      → Open-source Research / Asset
体验目标错误            → Experience Profile / Contract
玩法不成立              → Prototype / Demo Approval
内容没有真实差异        → Content Expansion / Production Line
实现错误                → Builder / Fixer
视觉或布局问题          → UI / Art / Visual QA
自动证据不足            → QA Evidence
人工试玩失败            → 最早对应体验阶段
发布和平台证据缺失      → Release Gate（阻断）
```

Fixer 只处理明确、局部、可验证的实现问题；“代码没报错但不好玩”必须交给对应体验负责人或 Sol + 人工重新判断。

## 15. 发布前最终检查清单

```text
[ ] 生产线和主体验 Profile 已锁定
[ ] 所有输入 Artifact 版本和哈希可追溯
[ ] 研究中的 Observation / Inference / Unknown 已分离
[ ] 外部代码和素材来源、许可证、透明度证据齐全
[ ] SPEC_READY 后没有未经批准的标准变更
[ ] Builder 报告只声明 IMPLEMENTATION_READY
[ ] 核心测试通过
[ ] 正常流程 QA 通过
[ ] 视觉证据通过
[ ] 关卡 / 内容差异通过
[ ] 人工试玩通过
[ ] 阻塞型 UNKNOWN 为零
[ ] 所有 WAIVER 有人工签名
[ ] 自动修复没有超过循环上限
[ ] 目标平台有独立构建和 QA 证据
[ ] release-manifest 哈希与候选包一致
```

## 16. 建议落地顺序

### Phase 1：规则和契约

建立 `FACTORY_CONSTITUTION`、Stage Contract Registry、Artifact 版本和失败分类。先让“什么算完成”变得不可含糊。

### Phase 2：安全和交接

建立 Research Sandbox、信任级别、来源哈希、HandoffPacket、上下文预算和新线程策略。

### Phase 3：模型策略

将模型按风险分层，接入阶段允许模型、权限、升级和重试上限；模型配置通过策略文件和环境变量覆盖，业务逻辑不写死具体厂商名称。

### Phase 4：五条玩法母版

为每条母版补齐原型模板、体验指标、自动试玩、UI 模板、性能预算和失败案例。

### Phase 5：Factory Eval Suite

建立黄金数据集、人工基线和变更回归；先评估路由、研究和体验契约，再评估 Builder 和 QA。

### Phase 6：生产门禁

把五项验收、人工试玩、UNKNOWN / WAIVER 和平台证据接入 Release Gate；历史项目只作为兼容运行，不得作为新流程的质量基线。

## 17. 一人团队的低运营运行方式

工厂的默认节奏应是“少做、快停、可复用”，而不是同时铺开很多未验证的游戏：

1. 先用快线验证一个候选的核心体验和素材表达；没有通过 `CORE_DEMO` 就不生成完整内容和平台包。
2. 首发只选一个主渠道，其余国内/海外渠道作为独立子包准备；每个子包都要有自己的配置、包哈希和
   QA 记录，不能用主渠道通过代替其他渠道通过。
3. 上线初期以自然流量为基线，只在预先写入 `business-strategy` 的上限内做小额买量；买量必须有
   独立的 `spendCents`、观察窗口和停止条件，达到上限或收益信号不足就自动标记 `KILL/PAUSE`，不再
   让模型继续“优化几轮试试”。
4. 每个项目只保留一个可复用的经验教训和一个回归案例：记录被拒维度、原因、修复前后证据与接受结果，
   通过 Factory Eval 后才升级为产线规则。

工厂可以自动生成指标模板、素材清单、版本哈希和待办；账号登录、平台审核、广告开通、付款/结算、
投放和最终发布由负责人显式执行。`approve-reference` / `approve-prototype` 仍保留为前置锁定动作，
但不新增 scheduled 台账记录；`approve`、业务预审和候选试玩分别写入 `CORE_DEMO`、`GO_NO_GO`、`FINAL_RELEASE`。
这样能把人工时间集中在三次会话和真正需要判断的异常上。

## 18. 评审时需要重点确认的问题

1. 五条首批母版是否足够，是否要先砍到三条？
2. 每条母版的主体验指标是否能被人工和自动 QA 一致理解？
3. 哪些 UNKNOWN 算阻塞型，谁负责关闭？
4. 三次人工审批的材料是否足够短、足够可操作？
5. 生产环境是否默认开启人工验收强制门禁？
6. Research Sandbox 的允许域名、下载策略和安全扫描由谁维护？
7. Factory Eval Suite 的黄金案例由谁标定、多久复核一次？
8. Spark 的文件修改范围是否需要进一步缩小到补丁级别？
9. 上下文预算、重试次数和模型升级阈值如何用真实运行数据校准？
10. 哪些复杂产品明确拒绝进入默认产线？

最终目标不是让一个 Agent 更聪明，而是让工厂在 Agent 不聪明、模型变化、研究内容恶意、实现失败或人工否决时，仍然能够安全暂停、准确回退、保留证据，并且不会把一个“能运行的 Demo”误报成“可发布的游戏”。
