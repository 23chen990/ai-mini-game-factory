# 2026-10-23：生产交接修复与 Agent Eval（未完成产品验收）

## 结论

**共享代码缺陷已修，完整产品目标未达成。** 真实无提示 QA 没有自主识别出可确认的核心机制偏差；不能把本次升级描述为“工厂已能自动生产合格游戏”。本轮没有重做游戏、增加生产 Agent/Gate/模型/依赖，也没有调用 REA 或反编译。用户最新要求：若后续确需逆向，暂停那部分并提供自包含提示词，由用户交给其他 Agent。

## 集成和保护边界

- GitHub main：`5ff8d88945d76fa7dc6b3dd65aa8f9aa58324217`（#70）。
- #71：`d269cbd94f9eb23bf24d01e8340748e025bf5eed`，基于旧 main `cb0ea67d`。
- #72：`3cd613dc509a24f818353cc7abd13075e7fb9199`，包含 #71；不是独立实现。
- 在隔离工作树 `factory-agent-eval-v4` 整合已审查的 #71/#72 与 main，提交 `c025751`。唯一文本冲突保留双方 waiver 固定时间和 arrayContaining；23 项相关测试通过。Lint 另发现 #70 的全局注释与 #71 ESLint 配置重复，删除重复注释，不改脚本行为。
- [PR #73](https://github.com/23chen990/ai-mini-game-factory/pull/73) 是对 main 的整合候选。没有自动合并/关闭 #71、#72；没有合并赛车、鹈鹕或其他独立游戏分支。
- 原 checkout 的用户修改和另一个 `factory-agent-evaluation` 工作树的全部未提交试验原样保留。仅选择性复用后者的三组源码/回归，不整批覆盖；独立审查发现并撤回了一项错误的 YAML 扫描假说。

## 能力审计（代码存在不等于生产验证）

| 能力 | 状态 | 可复核依据与界限 |
|---|---|---|
| 工厂路由、版本化 eval corpus、反馈回归/内容签名 | 已实现且验证 | 现有 `factory-eval.ts` 和 route tests；只调用 RequestRouter，不调用四类生产 Agent |
| 来源身份、SHA、观察/推断/未知分离 | 已实现且验证（局部） | 原 run manifest 与用户录屏字节一致；不能推广到未绑定的 Poki live-play 或已排除的 Monkey Mart 录像 |
| Research 真实调用 | 已实现未充分验证 | 历史 A1/A2 超时、B1 超预算终止，没有完整输出；本轮未重跑昂贵试验 |
| Research 完整文件交付 | 已实现且验证（工程） | 本轮 12KB 以上结构文件、遗漏 excerpt、坏 JSON/seed、符号链接、注入反例；不是机制识别准确率提升 |
| 可执行行为规格与开工前检查 | 已实现未充分验证 | 已有 sourceRefs、输入/状态、空间关系、反馈顺序、condition/protocol/range；本轮补明确顺序语义。未证明旧切割游戏消费了现代契约 |
| 阻塞/非阻塞未知 | 已实现且验证（规则） | 复用 UnknownRegister 的 blocking/deadline/evidence 与 waiver；未添加新 Gate |
| Builder 核心切片与原工作区续建 | 已实现且验证（回归） | 复用 #72 的 continuation 与 `builder-workspace-reuse.test.ts`；不重搭工程。不证明真实模型一次体验通过率 |
| 构建/合同/QA 哈希绑定 | 已实现未充分验证 | 现代路径已有绑定；历史试点缺 canonical state/seed/permission/source revision，不补造它们 |
| QA 失败汇总、契约不可由 provider 弱化 | 已实现且验证（工程） | 本轮 stored continuity、failed checks/error/natural failure 的 RED→GREEN；缺 natural flow 时独立 runtime-product gate 仍阻断 |
| 双端参考比较、差异归因 | 已实现未充分验证 | 复用 #72；本轮 ordered 置换/长度反例检出。历史 2048 记录可复用为局部规则证据，不是切割体验或端到端自动修复 |
| QA 无提示自主发现核心体验偏差 | 未验证/本次目标未证明 | 实际隔离观察 PARTIAL；0 个可确认核心发现，仅一项未判为 bug 的呈现差异 |
| Research/规格/实现/采集根因分流 | 已实现且验证（路由） | 既有四类差异路由；waiting-handoff 不冒充实际执行了补研究/FIX |
| Fixer 线程、次数、证据保留与五轮限制 | 已实现且验证（工程） | 复用 append-only repair history；本轮 admission 与 #70 stage cap 对齐，五轮后重复 resume 不增调用/次数。真实旧分支仍待独立复测 |
| Agent 指标与留出评分 | 已实现未充分验证 | 沿用 Factory Eval CLI/schema，公式和非法证据回归通过；当前 0 个完成的能力样本，2 个留出均未执行 |
| 7–14 天合格交付、成本节省、跨游戏泛化 | 缺失验证 | 没有可以支持提升比例的 before/after 生产数据 |
| 单 Codex 与 Multi-Agent 同任务对照 | 仅有设计/未执行 | 不为展示比较而再花模型成本；见下面冻结实验条件 |

## 实际修复及可支持的因果结论

### 1. 完整 Research 前置文件

历史真实 A2 对截断的 provenance JSON 解析失败，292 帧索引也曾被交付为空。修复让当前 REFERENCE_DEEP_RESEARCH sandbox 从 run 内安全文件读取四种既有 schema 的完整数据：seed、evidence pack、frame manifest、provenance；显式文档提取仍经既有 sanitizer。其他文本继续有预算，且没有暴露游戏工作区。

外部文件确实可能损坏、越界、含注入，因此这里保留必要的路径/Zod/指令形状校验并明确抛错；不是通用防御性兜底。源文件哈希、完整内容和 sandbox 隔离通过本地回归。**尚未证明同一模型因此识别出更多关键机制**，也未证明截断是历史游戏体验问题的唯一原因。未复用旧工作树无关的 provider/browser/模型修改。

### 2. QA 必须尊重失败证据和 run 的原契约

同一 QAProvider 可以返回 `passed:true`，同时包含 failed check、error issue 或自然旅程失败；旧聚合可以继续为 PASS。另一个可复现输入是 provider 省略/弱化已存的 continuity 契约。修复以 run-owned 契约为准，缺/坏 observation 明确失败，真实文件错误向上传递，不能静默变成“未声明”。警告不升级为错误；没有 natural flow 的 legacy 工程报告也不能获得 runtime-product 通过。

### 3. 顺序不能只比较均值

固定身份 `[1,2,…]` 与 `[2,1,…]` 的数量、范围、均值相同，旧比较器不报差异。新增既有 comparison 的 `mean|ordered` 语义，逐位置及长度检查；重复独立标量仍允许 mean。旧文件可读，但缺语义会交回 CONTRACT，不猜测或给旧文件填成功。合成反例只是代码合同证据，**不是自主 QA 发现真实布局缺陷**。

### 4. FIX 五轮上限

main 的 stage contract 已限制五轮，而 #71 的 admission 仍可接受未配置/大于五的第六次。按用户最新约束将 admission 同样限制为最多五次，保留更严格预算、线程、历史 QA 和原次数。历史第 13 次人工续修记录不删除、不重编号，也不启动第 14 次。没有把 direct-builder 修补写成 formal FIX；本轮 route 是 shared-factory，没有新执行游戏 FIX。

### 5. 现有 Factory Eval 的可量化扩展

`pnpm factory eval --agent-results docs/upgrades/20261023/agent-observations.json`

- 原 `passed` 只代表 CONTROL_PLANE；`productQuality` 永远不由这些分数晋升。
- case 绑定 run/workspace/contract/build；观察绑定源码 revision、实际输入、协议、原始输出和独立审查证据。历史不知道的 revision 为 null，不能编造；完成样本必须提供 revision。
- 路径、字节 SHA、重复/缺失/未知判断、自己评分、已暴露的 holdout、跨 family 混用均有失败回归。source revision/评审者/未见标签仍是需要原始执行审计的声明，不是 schema 能证明的事实。
- 按 Agent × dataset × live/historical/deterministic 分组。纯确定性数据只能是 CONTROL_ONLY。BLOCKED 不计成功，但其已测时长、成本、返工和修复轮数不丢失；未测值为 null。
- 缺少 `--agent-results` 参数值明确报错，不静默降级到路由绿灯。缓存签名纳入新交接/比较/就绪实现与语料，不能只按 case ID 复用。

**统计定义**（每项都有 numerator/denominator；分母为 0 时 value=null）：

| 角色 | 定义 |
|---|---|
| Research | 关键识别 precision=TP/(TP+FP)；重要遗漏=FN/(TP+FN)；证据有效性=独立核验有效引用/已核验引用 |
| Builder | 需求正确率=(TP+TN)/全部判断，含 forbidden 行为；首切片通过=独立记录 firstPass=true/有记录样本；rework 为已测总量 |
| QA | 检出=TP/(TP+FN)；误报=FP/(FP+TN)；漏检=FN/(TP+FN)；归因正确=正确定位/有预期归因的全部正例（含漏检） |
| Fixer | 修复目标成功=TP/(TP+FN)；回归发生=出现回归的已复测样本/已复测样本；平均轮次=完成样本实测轮次/有测量样本。阻断轮次另记工作量 |
| Pipeline | 合格交付=被独立确认的合格交付/预期交付标签；另列人工次数、时长、tokens、USD 的已测合计及 measuredCases |

语料 9 例，含历史失败、正常续建、未知边界、注入负例；2 个 family 隔离的 holdout 尚未执行。**当前结果：完成 0、BLOCKED 4、未观察 5；能力指标全部 null。** 确定性测试可以重放，但不转换为模型能力成功样本，也不靠重复已知题声称泛化。

## 真实试点和失败保留

唯一目标 `mobile-slice-adaptation-20260830`；工作区 `/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a`。

参考录像 SHA `3781e4dcd3d21094f186cf442b3ee30cddfbb2fbe68d87c5c7470a2c742bf75a`；候选单文件构建 SHA `c4cc3c427fc52c9f91f6229c9aea0ae7cfe8220341be521df6c807626d101aae`。前后未变；源码 snapshot 见 `pilot-inventory.json`。原视频、所有截图和输入脚本保留在同 run 的 `factory-eval-20261023/blind-qa/`，新生成的派生画面另有显式身份审核 manifest；Git 只包含回执，不复制第三方画面为游戏素材。

新 QA 只获得中性任务、这两个精确对象和普通输入权限；没有给历史问题列表、布局提示、根因或预期答案。实际打开 fresh Chrome/Chromium-compatible Playwright 会话、查看视频帧及候选像素；没有内部 API、状态注入、改 RNG 或读游戏源码。**这是当前聊天的隔离 QA 实验，不是 CodexAccountProvider 的完整生产阶段调用。**

首次 276.795 秒，0 次人工问题提示：1 项呈现观察，未判为缺陷，0 个可确认核心机制发现。原始 PARTIAL 结果保持不动。主线程验收发现原任务的 replay 未执行，发出一次无问题提示的补充任务；补充 114.261 秒用可见重玩按钮返回起点。总墙钟 473.261 秒（含调度间隙），在 8 分钟预算内。补充任务另开了第 3 个 fresh session，超出初始“两会话”的协议范围，因此只作为补充验收，不合并为初始无跟进成功。task copy 是评测者保存的副本，不是执行前原始派单的加密封存。主线程与 worker 模型 token/USD 没有可审计账单，保持未知，绝不填“免费”。

缺少成功核心片段、移动端和参考输入轨迹；未完成当前构建标签集独立标定。历史诊断有人工提示且部分原始证据不可用，因此只能记录“没有自主重新发现历史机制主题”，**不能捏造 0/3 召回率、误报率或归因准确率**。一项明确非缺陷观察不算误报。

复现矩阵区分 reference traversal、candidate traversal、failure、replay、未观察移动端；只有失败和重玩局部通过，不能让这两个 sibling branch 关闭完整体验问题。旧 run 的 `state.json`、seed、pipeline plan 和 permission manifest 缺失；真实 readiness 命令返回 ENOENT，旧 audit 要求迁移，故没有伪造状态来 resume。

| 链路 | 本轮实际状态 |
|---|---|
| 研究证据 | 原录像字节核验；历史真实 provider 失败保留 |
| 产品规格 | 现代共享 schema/测量语义已修；历史试点当前契约仍未获确认 |
| 核心切片 | 原候选只读复用；没有新的真实 Builder 调用 |
| 独立 QA | 真实中性观察 PARTIAL，目标未证明 |
| 根因分流 | 规则回归通过；本案覆盖/契约问题先于盲目写代码 |
| 定向 FIX / 独立复测 | BLOCKED，未启动，不伪称修复成功 |
| 人工终验 / 三平台发布 | 未执行/未批准 |

## 最小后续实验、成本与决策

1. **先补可评判性而非答案提示**：同一候选、同一原录像、冻结的中性玩家意图和核心契约，QA 不见缺陷标签；完整观察关键链，再由独立评审标定当前构建 TP/FP/FN。预算不超过原 8 分钟一次试验；关键分支未覆盖就保留 BLOCKED。不能先告诉它布局/顺序问题再宣称自主检出。
2. **安全续建与修复**：先在现有迁移/授权渠道确认旧工作区的合法 canonical 绑定和核心需求；不能新建游戏绕过问题。明确 validated issue 和根因后只修因果文件，最多五次、一次一假设/构建、同约束独立 QA；不改合同来变绿。
3. **真实预算**：历史 200,000 token 计划实际记录下界 1,229,593，预算没有及时阻止。先用本地 stub 校验累计 usage、超时/abort 和停止条件，再考虑有费用的模型试验；本轮没有重新调用它。

保留本轮局部修复的标准是同案 RED→GREEN、回归通过且不放松验收；不是新增多少测试。若对照质量不提升、成本超界或新增错误，则撤回对应策略而保留失败记录。单 Codex/Multi-Agent 对照目前只冻结方案：相同源码/合同/工具/模型/预算和未泄露样本，各跑一次；比较完整合格交付、人工介入、总时长与完整用量账单，留出未通过则不保留策略。本轮无可比完成数据，不作效率提升结论。

## 下一阶段最重要的三个问题

1. 在完整且可评判的核心片段上，QA 能否无答案提示发现因果关系偏差，而不只报按钮/分数/外观？
2. 如何把旧切割游戏已知差距、获批核心合同、源码/构建和精确分支的独立 FIX 复测真正闭合，而非再次初始化？
3. 如何用有效的累计成本停止条件和真正未泄露的留出结果，证明减少人工纠错/返工，而不是仅增加规则和调用？


## 最终工程验证

代码提交 `ed326beee233e73f206da0f37edb05525e2b640c` 的 [GitHub CI](https://github.com/23chen990/ai-mini-game-factory/actions/runs/39935524987) 全部通过：lint、typecheck、190 个测试文件 / 1202 项测试、Chromium + WebKit 浏览器检查、发布登记校验。它证明共享实现和回归，不批准试点体验。

本地首次全量记录保留为失败（1154 pass / 41 fail）：39 项受缺少浏览器二进制影响，另两项是开发中的 corpus/Research fixture 前置输入，均已修正；没有删除失败或放松断言。完整 pinned-browser 验证由 CI 完成后，停止了本地重复下载。详见 `verification.json`、`ci-result.json` 与 `ci-summary.txt`。
