# AI 小游戏工厂 · Reference First

本仓库是可复用的本地生产系统，不是一款游戏。**给参考材料 → 还原机制关系 → 原创核心切片 → 独立 QA / 真人试玩 → 商业与平台验证**，而不是每次让 AI 发明玩法。

**首要优化目标：用户提供已试玩认可的轻量网页游戏后，争取在 7～14 天内，以尽可能少的人工介入交付原创、可玩、可提审的 H5 IAA 小游戏。** 这是待真实生产验证的交付目标，不是当前已达成的能力，也不是平台审核通过或盈利承诺。

默认 `reference_reskin / replica-preview` 不走创意发散和三原型赛马。保留原有 Builder、Fixer、双轨 QA、模板、权限/成本控制、证据账本和发布适配器。代码、素材、名称、文案、UI、关卡内容和数值保持原创；只复用经过许可证核验的基础设施。

**预览通过 ≠ 好玩 ≠ 广告可用 ≠ 三平台可提审。** 微信、抖音、TapTap 仍分别验收。

共享工厂最新核查：[Reference-First 链路审计与差异检出试点](docs/upgrades/20261019/reference-chain-audit.md)。双端测量与按原因交接已接入；REA 自动调度、模型驱动重建和自动研究/修复闭环仍未完成，不应把工程测试或局部规则通过当作完整还原。

## 交付与复用原则

**存量优先，不重做已有游戏。** Builder 再次执行时，非空工作区就地续建；只对缺失/空工作区初始化。已有源码、配置、素材和测试不再被母版自动替换。当前合同变化由 Builder 定向整合，原有测试与 QA 仍必须执行。详见 [存量资产盘点与续建边界](docs/upgrades/20261019/existing-game-reuse.md)。

- 选择最便宜的有效路径：已有组件/模板与许可允许的基础设施优先，可读源码直接分析，只有明确的信息缺口才使用 REA。只研究本次核心切片需要的机制，不把完整逆向作为开工条件。
- 质量检查服务于核心玩法、正常输入、移动端、失败/重玩、阻断故障和提审风险；不把所有边缘体验都做成新门禁。新增流程必须指出减少哪类返工或交付风险、增加多少调用/构建/人工步骤，以及如何验证效果；不能仅以“更完整”立项。
- 第十款应比第一款更容易生产，靠的是可执行资产：共享基础组件（输入、生命周期、结算、存档、广告）、玩法类型模板、已复现故障的诊断和回归测试，而非越来越长的提示词。
- Builder 开工先查现有能力；真正跨游戏的修复回到共享实现及回归测试。记录使用版本、适用范围和验证证据，按需升级已有 run，不能静默改写其他游戏。只在单个游戏出现的逻辑不提前抽象为框架；参考特有内容和未经证实的结论不进入共享库。
- 按相近规模与生产路径比较端到端耗时、人工介入次数/分钟、实际成本、首次核心对照通过率和返工调用/构建次数。组件数量、Agent 数量和测试数量不是产能提升指标；未知成本不记作零，不在没有基线时声称节省比例。

当前已有模板复制入口、平台适配与成本/修复记录；**尚没有经过连续多款真实交付验证的完整组件库和经验回流闭环**。具体已有能力和缺口见上面的审计，不能把这组原则写成已经实现的产品能力。

## 1. 环境

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm factory doctor
```

Node/pnpm 版本以 `package.json` 为准。真实研究/开发使用 `FACTORY_MODE=codex-account` 和已有 Codex CLI 登录；不读取认证文件，不把密钥写入仓库。研究网络必须显式配置 `FACTORY_RESEARCH_ALLOWED_HOSTS`，见 `.env.example`。Mock 不会观察参考游戏，也不会静默替代失败的真实 Provider。

## 2. 提供参考，而不是先写完整玩法规格

创建 `brief.json`，只需原创目标名称/题材和来源身份。录屏或文档来源可省略 `url`；无 URL 时采用已核验证据清单的内容哈希 URI，绝不虚构网站。

```json
{
  "schemaVersion": 1,
  "title": "My Original Game",
  "theme": "原创世界观与表现方向",
  "source": { "name": "经授权的参考来源", "url": "https://example.com/game" }
}
```

```bash
export FACTORY_MODE=codex-account
export FACTORY_RESEARCH_ALLOWED_HOSTS=example.com,github.com
run_id=$(pnpm --silent factory new-reference brief.json)
pnpm factory status "$run_id"
```

`state.json.canonicalGameId` 是后续证据命令的 `target-game`，**不是 run-id**。工作区固定为 `runs/$run_id/workspace/game`；研究前没有 seed，也没有伪造的 `lockedBy: human`。

### 材料摄入 / URL 采集

用户给出的文件必须立即摄入对应 run，再分析：

```bash
pnpm evidence:ingest -- --run-root "runs/$run_id" \
  --target-game <canonicalGameId> --source /absolute/reference.mp4 \
  --purpose gameplay-reference
```

文档使用 `--purpose design-document`。材料初始为 `PENDING`，不能参与玩法推断。

对可访问的 H5，可自动采集截图时间序列与输入记录：

```bash
pnpm factory capture-reference-url "$run_id" --url https://example.com/game \
  --capture-id first-pass --seconds 20 --fps 4 --actions /absolute/actions.json
pnpm factory promote-reference-capture "$run_id" --capture-id first-pass
```

`actions.json` 例如 `[{"type":"tap","atMs":800,"x":0.5,"y":0.6}]`，坐标归一化。支持 tap/drag/key/hold；省略动作仅观察页面，**不能证明核心玩法**。采集默认只允许公共 HTTPS 来源主机，或本 run 工作区内的文件。站点确需 CDN 时可显式加 `--allowed-hosts a.poki-cdn.com,img.poki-cdn.com`（以实际来源依赖为准，非通用全网许可）；域名/DNS仍校验为公共地址，并将授权列表写进采集指纹。未批准域名、登录/防爬仍可能阻塞，需要合法录屏补充，不能绕过访问限制。交互式多步采集 API 也保留在 `reference-web-capture.ts`。

只有选中的 READY 草稿才能晋升为 PENDING 证据；人工或明确授权的身份审查者核对来源和 SHA-256 后：

```bash
pnpm evidence:review -- --run-root "runs/$run_id" \
  --target-game <canonicalGameId> --workspace "$PWD/runs/$run_id/workspace/game" \
  --id <evidence-id> --expected-sha256 <sha256> \
  --reviewer <reviewer> --basis "具体来源身份核对依据"
pnpm factory run "$run_id"
```

URL 截图序列和视频复用同一帧/事件重建合同；视频本地提取当前使用 macOS AVFoundation，URL 截图不需要它。多份录屏必须显式选源，之后只复用同 run 的选择：

```bash
pnpm factory extract-reference-frames "$run_id" --evidence-id <verified-id>
```

## 3. 一个研究职责，一个方向确认

采集器只保存可核验事实，不替研究做结论。Research 一次返回：

- 拟定的机制规格；观察 / 推断 / 未知分开；
- 输入状态、空间关系、失败恢复、反馈顺序、终点重玩的五类验收检查；
- 压力来源、预警、升级、失败归因和恢复的 failure-pressure contract；
- 有录屏时的对象生命周期、事件时序和关卡实现合同。

材料 / 提示合同不变时复用草案；BLOCKED 的未知不会自动花钱重试。新来源或明确诊断后才重研。图片/视频用具备像素输入能力的 `codex-account`；旧 text-only API Provider 会明确阻塞视觉研究。

核心行为缺少对照协议、仍是推断/未知、或引用未绑定来源时，在 Builder 之前暂停，而不是构建后才发现。恢复旧的已完成研究也复查同一规则；该检查不新增模型调用，也不要求先执行完整双端 QA。相同缺口的 intake 恢复不重复研究；旧 seed 入口的增量补研究仍需显式处理。

检查 `human/reference-mechanic-review.json` 后作一次方向决定：

```bash
pnpm factory approve-reference "$run_id" --decision APPROVE --notes "机制关系和核心切片范围确认"
pnpm factory resume "$run_id"
```

批准同时绑定来源 inputHash 和草案哈希，才生成 seed/不可变游戏身份。证据改变或审批过期不能继续使用旧批准。当前自动发现入口支持 `idle-shop-v1` 和 `cut-stack-dodge-v1`；其他玩法明确停在产线缺口，**不套用 idle 代替**。已有完整规格仍可使用 `factory new <seed.yaml>`；空间经营等原有模板不删除。

## 4. 构建、体验和修复

先自动核验实际使用的 Vite / Phaser 固定版本与直接许可证，再写技术蓝图。预览只做一个代表性切片，复用原模板和 Builder；不先扩几十关、不做无价值的四方向评选。正式美术/素材与内容扩展属于后续完整验证。

QA 分开检验：

1. 确定性工程：状态、碰撞、存档、构建、测试；
2. 新浏览器正常输入：启动 → 核心操作 → 可归因失败/终局 → 重玩，以及移动端可见反馈；
3. 独立参考比对和感知门禁，Builder/Fixer 不能给自己签通过；
4. 真人核心试玩：触控、压力、理解、关卡差异、公平和重玩意愿。AI 分数不是玩家数据。

`factory readiness <run-id>` 输出 **codeCorrectness / gameplayFidelity / experienceQuality / monetizationReadiness / platformReleaseReadiness** 五个独立维度、证据、缺口和下一步；不是另造一套 QA。完成预览的状态是 `PREVIEW_ACCEPTED`，不会冒充 `CANDIDATE_READY` 或 `RELEASE_READY`。

自动 FIX 保留原 Builder 线程、累计次数、每次 QA/截图/轨迹、输入/输出构建哈希。自动 FIX 没有固定次数上限；仅显式配置的项目次数、成本、累计执行时间、Token、平台上限生效。没有新失败依据、构建未变、上一尝试中断或历史不一致时，**先停再花钱**，在 `repair-policy-decision.json` 写明原因。当前自动假设基于失败检查/问题签名；相同失败仍需新诊断，不能用重建或换时间戳充当修复成功。

`resume` 不盲目重做已完成的模型调用；工件漂移会失效下游。已完成 Builder turn 但本地验证失败时可用 `factory verify-build <run-id>`，它不再调用模型。历史 FIX 已有计数却无可恢复账本时会明确暂停，不能凭空补造旧证据。

## 5. 商业化与发布不是预览尾部的假通过

保留现有 IAA、商业预检、平台适配/包、不可变候选、哈希/供应链/质量基线与发布流程。进入显式 `full-validation` 才走这些阶段；预览不会自动变成发行包，既有 run 的冻结计划不能被静默改写。

激励广告必须可选、频控、奖励幂等、无广告可用时可继续，失败/复活不得靠蓄意挫败绑架玩家。广告展示率、完成率、恢复/复玩及收入指标需要真实 SDK 和真实流量；模拟器不能证明收益。每个平台的 packageHash 与共同 coreHash 分开绑定。`live-verify` 核验当前冻结候选和平台包实际字节，并要求已记录 SUBMITTED；不能跳过发行授权/平台提交。H5 成功不能证明真机广告或原生包可提审。

仍需要人：来源/权利不明时的确认，机制方向和必要美术决定，真实玩家体验，平台账号/真机权限，最终发行授权。图片生成的非交互落盘能力不足时保留 `WAITING_FOR_CODEX_IMAGEGEN` 人工接力，不用 Mock 图片冒充。

## 6. 可重跑的最小演示

```bash
pnpm factory demo-reference --prepare
# 输出精确 run-id、目标游戏和工作区后：
pnpm factory demo-reference <fixture-run-id>
```

该演示把 `examples/reference-demo/reference.json` 的**自有明确需求**经摄入/身份核验/草案/fixture 方向审批，交给真实 Builder 模板构建、项目测试和 Playwright 自然输入 QA，产出自包含 `workspace/game/dist/index.html`。再次 resume 校验模型/构建不重复。

报告 `artifacts/reference-demo-report.json` 明确 `llmExecuted:false`、`humanAccepted:false`、`commercialReleaseReady:false`。它证明接线和可玩输出，**不证明模型理解了任意市场游戏，也不证明好玩**；独立参考比对和真人验收仍阻塞。没有真实参考材料时不伪造观察结论。

已有 `mobile-slice-adaptation-20260830/workspace/prototype-a` 的 Slice Master 对标项目是独立的 Three.js 半成品，不属于此 fixture。不能用 demo-reference 覆盖其代码、旧修复次数或已核验证据；legacy run 需显式兼容接入，不能凭目录名创建假状态。

旧 `prototype_tournament` 和 `factory demo` 仅用于兼容实验/回归，不是默认新游戏入口。

## 验证与架构

```bash
pnpm verify
pnpm factory eval
```

[本次审计与验证](docs/upgrades/20261019/audit.md) · [内部架构](docs/architecture.md) · [玩家验收](docs/player-acceptance-workflow.md) · [三平台与许可政策](docs/platform-publishing-policy.md)

README 是当前入口/阶段策略的规范；旧计划和评审文档中的实验路线、历史模型名称与旧修复上限不是当前运行默认值。所有游戏代码、资产、QA 和构建仅存在于自己的 `runs/<run-id>/workspace` 及同 run 证据目录；提交不包含生成游戏或本地密钥。


## 7. Factory Eval：路由回归与 Agent 能力证据分开

`pnpm factory eval` 只执行确定性控制面回归，报告明确标记 `CONTROL_PLANE` / `productQuality: NOT_ASSESSED`。它不调用 Research、Builder、QA 或 Fixer，不证明游戏合格。

```bash
pnpm factory eval --agent-results docs/upgrades/20261023/agent-observations.json
```

同一命令可附带独立审查后的 Agent 观察，使用现有 `factory-eval/agent-cases.json` 与 Zod schema；输出仍在 `factory-eval/latest.json`。标签只供评分，禁止传给受测 Agent。case 绑定 run、工作区、规格/构建哈希；观察另绑定源码 revision、原始输出、实际输入、协议及独立审查证据。文件字节改变、路径越界、缺文件、重复/缺失判断、自己评分或已暴露的 holdout 均拒绝。

指标同时输出分子、分母和 `value`；无数据为 `null`，不是 0% 或 100%。按角色、dataset、`live-agent` / `historical-agent` / `deterministic-regression` 分组，不能用 Mock/回归替代自主能力。阻断样本不计质量成功，已测耗时/成本仍保留。固定 holdout 有家族隔离检查，但本轮尚无有效完成的独立留出结果；标签隔离依赖实际执行审计，schema 不能证明模型没见过答案。

本轮审计、同案 RED→GREEN、真实无提示 QA 的负面结果和未完成链路见 [2026-10-23 升级报告](docs/upgrades/20261023/audit.md)。没有新增生产 Agent、Gate、模型或依赖；没有修改原切割游戏、重置历史次数、合成验收或批准发布。
