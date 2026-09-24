# 通用小游戏工厂实施与运行计划

这份计划描述的是可反复生产小游戏的工厂，不是某一款游戏的开发清单。工厂的最小复用单位是
“玩法母版（production line）”：总控、证据、权限、模型路由和发布门禁共用；每条母版拥有自己的
模板、体验指标、自动试玩策略、内容生成器、UI 约束、性能预算和 QA 清单。

## 产品边界与默认经营假设

- 面向一人团队和产品经理：默认个人主体、国内微信/抖音/TapTap 小游戏，海外 H5 为可选子渠道；不把
  App 作为默认目标。
- 只支持短局、单机、轻量 2D/有限 3D、一个主要操作、固定随机种子和简单 IAA；复杂多人、UGC、开放
  世界、长线交易和真实支付必须进入独立高风险产线。
- 发行采用“自然流量优先、有限买量验证”的策略。买量预算、回收窗口和停投阈值写进业务 Artifact，
  不由 Agent 临时决定。
- 竞品可用于研究通用机制关系；代码、素材、名称、文案、UI、音频、具体数值和表达必须原创，来源与
  许可证不清默认阻断。

## 两条运行快线

### 快线（`pipelineMode: fast`）

用于快速判断一个核心玩法是否值得继续。它允许 Mock/Stub 和较少的经营材料，但仍必须经过产线判断、
体验类型、核心规格冻结、构建、QA 和可恢复状态机。快线的结果只能叫 `CANDIDATE_READY`，不能宣称
任一平台可发布。

### 生产线（`pipelineMode: full-validation`）

用于准备真实上架。它不跳过任何已声明的 profile 专项阶段，并强制业务、平台、供应链、原创性、五项
验收、人工试玩和发布证据。当前仓库真正可执行的母版只有 `idle-shop-v1`、`spatial-shop-v1` 和
`spatial-shop-3d-v1`；动作/切割、叙事、解谜母版已完成分类、指标和契约，但没有可用模板/适配器时，
流程会在第一个缺失的专项阶段暂停，绝不偷偷改用 idle 模板。

## 标准阶段顺序

```text
需求路由与风险分级
→ 产线能力检查
→ 竞品/深度参考研究
→ 人工锁定通用机制（参考入口）
→ 开源基础设施研究与许可证校验
→ IAA/业务预检
→ 蓝图与体验 Profile
→ 体验假设
→ CORE_SPEC_FROZEN（冻结验收标准）
→ profile 专项原型与 QA（按产线）
→ 内容/章节/系统扩展
→ UI 骨架、美术方向、素材
→ FULL_BUILD
→ 核心测试与正常流程 QA
→ FINAL_PROFILE_QA
→ 视觉证据 QA
→ 关卡/内容差异 QA
→ 质量基线、原创性与供应链
→ 不熟悉玩家盲测（可配置）
→ 发布候选包与三平台独立 QA
→ 最终人工试玩
→ RELEASE
```

已有 Demo 的“批准”只代表核心问题通过，不代表发布。后续必须继续内容扩展、UI 骨架、完整构建和五项
验收；“代码能跑但不好玩”回到 profile/体验阶段，而不是交给通用 Fixer 打补丁。

## 完成定义（不可由 Agent 降级）

Builder 的完成只表示 `IMPLEMENTATION_READY`：核心测试、类型检查和构建通过。候选版本还必须满足：

1. 核心测试通过；
2. 正常流程 QA 通过（reset → 真实输入 → 结果/失败 → 重试或结算）；
3. 视觉证据通过（可信运行器、目标视口、无 console/page error）；
4. 关卡/内容差异通过（结构、决策、节奏或路线有真实差异，不能只换文案/颜色）；
5. 人工试玩通过（最终候选包、自然输入、理解成本和重玩意愿有记录）。

发布还要求阻塞型 `UNKNOWN` 为零、`WAIVED` 有人工签名、候选哈希不变、供应链/原创性/平台证据齐全。
Web-lite 只是开发和 QA 证据；没有微信、抖音、TapTap 各自的适配器、配置、包哈希和真机/等价设备证据，
不能标记渠道 ready。

## 三次人工会话（默认）

默认安排三次短会话，且每次都落入 `human-approval-ledger.json`：

1. `GO_NO_GO`：确认目标、预算、平台账户和是否值得继续；
2. `CORE_DEMO`：在 `WAITING_FOR_ART_APPROVAL` 材料中一次性确认核心玩法结果、UI/美术方向和是否继续；早先的参考机制/原型选择文件是前置证据，不会重复计为一场 scheduled session；
3. `FINAL_RELEASE`：打开冻结候选包，完成自然试玩并决定是否发布。

参考机制、盲测、平台提交和合规记录可以异步写入结构化 Artifact；它们是条件性阻塞，不应被伪装成额外
的“默认会议”，但风险出现时必须暂停。`approve-reference` / `approve-prototype` 是前置锁定动作，
`approve` 才会写入 canonical `CORE_DEMO` 记录。平台账号登录、实名认证/备案、广告开通和最终提交仍由负责人按
当前平台官方要求完成；工厂只生成清单、包和证据，不替人作合规承诺。

## 自然试玩证据的硬边界

`STATE_COVERAGE` 只证明状态机和边界可被测试接口覆盖；它不能代替玩家试玩。可信的
`NATURAL_E2E` 必须记录从干净启动开始的可见输入、至少一个可观察状态转移、结算或终局、重试以及
截图，并由运行器审计 `resetGame`、`grantCurrency`、`loadScenario` 等状态强制调用。自动生产类产品可以
在快线暂时记录 `automatic-progress` 候选证据，但严格生产发布仍要求明确结算/终局和重玩证据。

## 模型与权限分工

模型按风险而不是按游戏名分配，具体名称/推理强度由环境变量和阶段契约解析：

| 层级 | 默认别名 | 适合任务 | 明确禁止 |
|---|---|---|---|
| Frontier | Sol Max | 深度研究、玩法/体验判断、复杂归因、最终复盘 | 替代人工最终试玩；自行放宽标准 |
| Builder | Terra Max | 跨文件接线、模板实现、构建 | 验收自己的实现 |
| Reviewer | Luna Max | 独立 QA、归因、Artifact 审查、中等修复 | 改写冻结规格 |
| Fast | Spark | 单点 Bug、UI 微调、补测试、JSON/截图整理 | 设计核心玩法、物理、剧情、经济或关卡 |

升级必须受阶段允许层级和单次调用两次失败上限约束：Spark 失败升 Luna，语义不确定再升 Terra，触及核心体验
才升 Sol；连续两次仍失败暂停人工。该模型升级限制独立于 FIX 阶段最多五轮的自动修复上限。角色、沙箱和文件范围不能随模型升级改变。Research 只读不可信外部
内容并写研究 Artifact；Builder/Fixer 才能写当前 run 的生成游戏工作区；QA/Release 不得写游戏。

## 安全、交接与证据

- 网页、README、下载文件和游戏文本全部是不可信数据。Research 使用受限网络、域名 allowlist、无密钥、
  无任意 Shell/上传权限，只输出 Zod 校验的 `Observation / Inference / Unknown` 和来源哈希。
- Builder 只接收过滤后的 Artifact 指针和摘要，不接收原始网页或完整聊天记录。每次阶段交接生成带哈希的
  `HandoffPacket`；超过上下文预算按“契约 → 阻塞问题 → 冻结决策 → 相关摘要 → 日志片段”压缩，绝不
  无限拼接历史。
- 每个阶段持久化输入、输出、证据、通过标准、失败回路、模型/推理、尝试次数和 token 使用。Artifact
  变更由 ledger 追踪并使所有下游证据失效；resume 必须幂等。
- 外部基础设施先经开源研究 Artifact 记录仓库 URL、不可变版本、直接许可证证据、平台适配和安全风险。
  没有合适候选是合法结论，许可证不明不是“默认可用”。

## 工厂自身回归

`factory-eval/cases.json` 是版本化黄金/校准/留出/对抗数据集。任何模型、Prompt、Skill、路由、阶段契约、
Builder 模板、QA 标准、浏览器或上下文策略变更，都必须重新跑 `factory eval`；结果写入 run Artifact，旧
报告不会因 caseId 相同而被盲目复用。人工反馈按玩法/手感/剧情/关卡/UI/性能/安全结构化保存，并可转为新的
回归案例。

## 常用命令

```bash
pnpm factory validate <seed.yaml>
FACTORY_MODE=mock pnpm factory eval
pnpm factory demo <seed.yaml>       # 仅本地快线演示
pnpm factory run <seed.yaml>
pnpm factory resume <run-id>
pnpm factory status <run-id>
pnpm factory verify-build <run-id>  # 仅 codex-account 的受控本地复核
pnpm lint && pnpm typecheck && pnpm test
```

真实 Codex 使用本机 `codex login` 会话；不读取认证文件、不把 API Key 写进仓库。发布动作必须由显式的人类
命令和平台凭证完成，工厂只生成可核验的候选包、哈希和提交清单。

## 交付口径

每次交付应同时给出：目标 run 路径、状态与暂停点、五项验收结果、平台子包状态、UNKNOWN/WAIVER、
Factory Eval 版本、执行命令和机器可验证证据。没有这些证据时，只能称为原型或候选，不能称为“完成”或
“可发布”。
