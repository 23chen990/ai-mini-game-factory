# AI 小游戏工厂

这是一个本地、可暂停恢复的 AI 小游戏工厂。默认的新游戏流程不允许 Agent 自己发散玩法：人类先指定一个经过验证的参考游戏，并把需要复现的通用机制关系写成 `referenceMechanics`。工厂只校验、锁定和执行该规格，不生成候选创意，也不运行三原型赛马。代码、素材、名称、文案、UI 布局、音频和具体数值必须保持原创。

所有游戏默认面向微信小游戏、抖音小游戏和 TapTap 小游戏。参考游戏默认走
`replica-preview` 短流程：run 内证据绑定与用途隔离 → 五维行为分析 → 机制确认 → 产品体验契约 → 单一核心切片 → 独立工程/感知 QA → 真人核心试玩。
它只回答“核心玩法是否被正确复刻”，不会把开源、IAA、平台适配和发布检查伪装成预览已完成；这些门禁
必须在显式的 full-validation/release 流程中处理。当前 `web-lite` 产物仍只是浏览器玩法验证与 QA 候选，
不等同于三平台可提审包；详细边界见 [三平台发布与开源复用政策](docs/platform-publishing-policy.md)。

## 环境检查

```bash
pnpm install
pnpm factory doctor
```

`doctor` 检查 Node.js、pnpm、Codex CLI、`codex login status`、`codex exec`、JSONL、JSON Schema、resume、`workspace-write`、Playwright、imagegen 能力和当前运行模式。它只检查命令与帮助信息，不发起模型调用，也不读取 `~/.codex/auth.json`。

若登录项失败，只需执行：

```bash
codex login
```

## 启动一次参考机制换皮制作

`examples/seeds/relic-revival-workshop.yaml` 是“我要当美女”的参考机制 seed：参考对象只用于锁定通用机制，题材与表现层均为原创。

```bash
run_id=$(FACTORY_MODE=mock pnpm --silent factory new examples/seeds/relic-revival-workshop.yaml)
FACTORY_MODE=mock pnpm factory run "$run_id"
```

Run 会先检查 `referenceMechanics.source.researchFiles` 和 `reference-evidence/manifest.json` 是否绑定到当前 run。已核验证据必须带用途；只有 `gameplay-reference` 与 `design-document` 会进入竞品行为分析，平台日志和包身份材料不会污染玩法契约。ResearchAgent 会自动生成
`artifacts/reference-behavior-analysis.json`，并在 `reference-evidence-pack.json` 中写入带来源路径、哈希和定位的五类 `behaviorChecks`：输入/状态、空间关系、失败/恢复、反馈顺序、终点/重玩。任一维度缺失或仍是未知都会停在 `REFERENCE_DEEP_RESEARCH`。证据与逐场景分析通过后才会停在
`WAITING_FOR_REFERENCE_APPROVAL`。检查 `runs/<run-id>/human/reference-mechanic-review.json` 后确认或拒绝：

`evidence:ingest` 默认把材料绑定到标准生成工作区 `runs/<run-id>/workspace/game`。只有审计历史项目时才显式传入旧工作区。启动或续跑前可执行：

新摄入项保持 `PENDING`，不能直接参与研究。核对用户指定来源与预期 SHA-256 后，显式完成身份复核；命令会再次计算当前字节哈希、把文件移到 `verified/`，并写入独立复核记录：

```bash
pnpm evidence:review -- \
  --run-root "runs/$run_id" \
  --target-game "$run_id" \
  --workspace "$PWD/runs/$run_id/workspace/game" \
  --id <evidence-id> \
  --expected-sha256 <sha256> \
  --reviewer <reviewer> \
  --basis "与用户指定来源及既有核验记录一致"
```

```bash
pnpm factory audit-reference "$run_id"
```

审计会校验证据用途与 SHA-256、标准 `state/seed/pipeline-plan`、权限清单版本、行为/产品契约、独立 QA 门禁和 `CORE_DEMO` 构建哈希，并写入 `artifacts/reference-quality-audit.json`。`READY_FOR_STANDARD_RESUME` 才能直接续跑；`REQUIRES_NEW_RUN_MIGRATION` 表示必须创建标准新 run，不能在历史目录中补造状态文件。

若 `gameplay-reference` 是录屏，标准流水线会先生成逐帧清单和联系表，再由研究阶段产出关卡重建与 Builder 实现契约。历史 run 或提取器校准可单独执行：

```bash
pnpm factory extract-reference-frames "$run_id" \
  --evidence-id <verified-recording-id> \
  --fps 8
```

输出 `artifacts/reference-frame-manifest.json`，其中绑定目标游戏、绝对工作区、录屏 SHA-256、真实帧时间戳、尺寸和每个派生文件的 SHA-256。来源身份不明、目标/工作区不匹配、文件越界或哈希变化都会阻塞；相同输入重复运行会校验并复用原工件。

证据清单的独立字节校验需要显式声明目标，示例：

```bash
pnpm evidence:check -- \
  --manifest "runs/$run_id/reference-evidence/manifest.json" \
  --target-game "$run_id" \
  --workspace "$PWD/runs/$run_id/workspace/game"
```

```bash
pnpm factory approve-reference "$run_id" \
  --decision APPROVE \
  --notes "机制关系确认；所有表现层与数值保持原创"
FACTORY_MODE=mock pnpm factory resume "$run_id"
```

只有 `APPROVE` 才能进入蓝图和构建；缺少 `referenceMechanics` 的普通新 seed 会直接校验失败，避免隐式退回 Agent 创意流程。

Builder 首次只构建一个核心切片，内容扩展和非必要 HUD 要等候。录屏契约存在时，Builder 必须实现全部语义对象、生命周期、检查点、粗粒度摆放、空间关系、动作顺序、镜头、终态和重玩，并暴露只读运行时探针。普通 QA、调试注入或确定性截图采集不能结束参考预览；独立 QA 必须通过正常指针输入生成候选轨迹，再与来源契约逐项比较。比较失败会进入有五次上限的正式 FIX → QA 复测。每个行为检查 × 目标视口仍必须有同构建哈希的截图和独立感知结论；通过后停在 `WAITING_FOR_HUMAN_PLAYTEST`，只有真人接受该核心切片才允许后续扩展。
见[参考玩法质量优化与小李飞刀复盘](docs/factory-reference-quality-optimization-2026-09-08.md)。

## 兼容的 Prototype Tournament

旧实验仍可显式声明 `designMode: prototype_tournament` 后运行；它不再是新游戏默认路径。

```bash
run_id=$(FACTORY_MODE=mock pnpm --silent factory new examples/seeds/prototype-theme.yaml)
FACTORY_MODE=mock pnpm factory run "$run_id"
```

Run 会停在 `WAITING_FOR_PROTOTYPE_APPROVAL`。查看 `runs/<run-id>/human/prototype-review.json` 可得到三个玩法、AI 推荐、理由和启动命令。在三个终端分别运行：

```bash
pnpm factory preview "$run_id" prototype-a
pnpm factory preview "$run_id" prototype-b
pnpm factory preview "$run_id" prototype-c
```

人类可提交 `APPROVE / REJECT / PREFER_A / PREFER_B / PREFER_C / REVISE`：

```bash
pnpm factory approve-prototype "$run_id" --decision APPROVE
FACTORY_MODE=mock pnpm factory resume "$run_id"
```

`APPROVE` 或 `PREFER_*` 才会开始 `IAA_REVIEW`。`NONE` 是合法 Winner 结果；首批为 `NONE` 时自动再生成一批，第二批仍为 `NONE` 则以 `NO_PROTOTYPE_WINNER` 正常结束，不进入完整制作。

## 小游戏工厂回归 Fixture

`examples/seeds/ghost-night-market.yaml` 已标记为 `status: DESIGN_REJECTED` 和 `purpose: regression_fixture`。现有 `idle-shop-v1` 游戏与测试保留，仅验证构建、QA、存档、自动修复和发布能力，不再作为 Game Design 成功样本，也不再向其添加玩法。技术回归仍可运行：

```bash
FACTORY_MODE=mock ART_PROVIDER=mock pnpm factory demo
```

## codex-account 模式

复制配置示例，或直接设置环境变量：

```bash
cp .env.example .env
export FACTORY_MODE=codex-account
export ART_PROVIDER=codex-imagegen
```

该模式不会检查或要求 `OPENAI_API_KEY`、`CODEX_API_KEY`、`OPENAI_TEXT_MODEL` 或 `OPENAI_IMAGE_MODEL`，也不会静默回退到 Mock。默认参考模式中，现有岗位只做开源基础设施调研、IAA 复核、技术落地、美术和 QA，不参与玩法发散；没有新增 Agent 数量。

创建并启动第一款真实游戏：

```bash
run_id=$(FACTORY_MODE=codex-account ART_PROVIDER=codex-imagegen pnpm --silent factory new examples/seeds/relic-revival-workshop.yaml)
FACTORY_MODE=codex-account ART_PROVIDER=codex-imagegen pnpm factory run "$run_id"
pnpm factory approve-reference "$run_id" --decision APPROVE
FACTORY_MODE=codex-account ART_PROVIDER=codex-imagegen pnpm factory resume "$run_id"
```

文本阶段会使用 `--json`、`--output-schema` 和 `-o`。Producer、ArtDirector、StyleLock 在 run 根目录以 `read-only` 运行；Builder 只在 `runs/<run-id>/workspace/game` 以 `workspace-write` 运行。Builder 的 thread ID 写入 `state.json` 和 build report；Fixer 使用 `codex exec resume <thread-id>`，最多自动修复五轮；第五轮失败后进入 `FAILED`/`BLOCKED` 并等待新的人工复核。

Builder 和 Fixer 的超时预算独立配置：`CODEX_BUILD_TIMEOUT_MS` 默认
`900000`（15 分钟），`CODEX_FIX_TIMEOUT_MS` 默认 `600000`（10 分钟）。文本岗位仍使用
`CODEX_EXEC_TIMEOUT_MS`（默认 5 分钟）。Builder 完成后，工厂会在本地再次验证生成项目，依次运行
`pnpm test`、`pnpm typecheck` 和生产构建；成功结果写入
`artifacts/build-report.json`，其中 `verification` 会包含 `test:passed` 和
`typecheck:passed`。

如果 Builder 的 Codex turn 已经完成、但工厂本地验证出现误报或暂时失败，不要重新消费一次
Codex 调用。确认 `state.json` 的 `FULL_BUILD` 为 `failed`，且
`logs/codex/BUILD.attempt-1.stdout.jsonl` 同时包含 `thread.started` 和
`turn.completed`，没有 `turn.failed`，并且记录了 Builder thread ID 后，可运行：

```bash
FACTORY_MODE=codex-account pnpm factory verify-build <run-id>
```

`verify-build` 只复用已经保存的完成态 JSONL 和现有 `workspace/game`，重新执行本地
`test`、`typecheck`、生产构建并写回 `build-report.json`，不会调用 Codex 或创建新的 thread。
如果 JSONL 没有证明 turn 已完成、缺少 thread ID，或 FULL_BUILD 并非失败，命令会拒绝继续；此时应按
失败原因修正后使用受控的 `retry`。

### 图片人工接力

当前 Codex CLI 支持向非交互任务输入图片，但没有稳定、文档化的非交互图片输出到指定路径契约。因此 `codex-account` 会停在：

```text
WAITING_FOR_CODEX_IMAGEGEN
```

四方向任务位于：

```text
runs/<run-id>/art-review/art-imagegen-task.md
```

把其中四段各自包含 `$imagegen` 的指令粘贴到当前 Codex 对话执行，并将 PNG 保存到任务指定的绝对目录。工厂不会生成 SVG、色块或 Mock 图冒充成功。四张 `direction_a.png` 至 `direction_d.png` 都通过 PNG 文件检查后，恢复：

```bash
FACTORY_MODE=codex-account ART_PROVIDER=codex-imagegen pnpm factory resume "$run_id"
open "runs/$run_id/art-review/index.html"
```

然后审批并继续：

```bash
pnpm factory approve "$run_id" \
  --direction direction_b \
  --notes "保留人物比例和配色，降低饱和度，简化背景，不要太幼儿化"

FACTORY_MODE=codex-account ART_PROVIDER=codex-imagegen pnpm factory resume "$run_id"
```

审批文件经过 Zod 验证，默认不覆盖已有文件；确需替换时加 `--force`。StyleLock 由新的独立只读 Codex 线程生成。

正式素材使用相同机制：流水线会写 `art-review/asset-imagegen-task.md` 并再次停在 `WAITING_FOR_CODEX_IMAGEGEN`。所有真实 PNG 存在后再次 `resume`，Builder、Playwright QA、必要时 Fixer、以及本地确定性 Release 才会继续。

## 限制与证据

- `CODEX_EXEC_TIMEOUT_MS` 控制单次 `codex exec` 超时，默认 300 秒。
- `CODEX_BUILD_TIMEOUT_MS` 控制真实 Builder 的 `workspace-write` 调用超时，默认 900 秒；
  `CODEX_FIX_TIMEOUT_MS` 控制 Fixer 的恢复调用超时，默认 600 秒。
- `CODEX_EXEC_MAX_RETRIES` 只能取 0 或 1；每个 Agent stage 的单次 provider 调用最多重试一次（总计两次 Codex 调用），这不是 FIX 阶段的修复轮数。
- Fixer 最多自动修复五轮，且只能处理 `qa-report.json` 明确列出的问题；成本、时间、Token 或平台门禁可以更早暂停，但不能增加轮数。第五轮失败后必须等待新的、明确授权的人工复核，不能因“直到通过”自动增加轮数。
- Codex stdout、stderr、JSONL 事件、最终消息与 Schema 保存在 `runs/<run-id>/logs/codex/`。
- 每 stage 的调用次数和 token usage 记录在 `state.json` 及 `artifacts/provider-usage.json`。
- 认证材料不会写入日志或 Artifact；工厂从不读取 `~/.codex/auth.json`。
- 方向预览固定四张；缺图时等待，不继续消费后续阶段。

Builder 的 build report 是本地可复核证据，不是 Codex 最终消息的声明：`verification` 至少记录
契约检查、版本化存档、`test:passed`、`typecheck:passed`，并在这些检查和 Vite 生产构建都成功后
才允许进入 QA。若失败发生在本地验证而已完成的 Builder JSONL 已保存，优先使用
`pnpm factory verify-build <run-id>`，避免重复调用模型。

QA 是现有真实 Playwright 自动测试，不获得修改游戏源码的权限。Release 仍是现有本地只读打包与 SHA-256 清单生成，不需要模型。旧 OpenAI API Provider 源码仅作为未来可选扩展保留，不是 `codex-account` 的运行依赖。

验证仓库：

```bash
pnpm lint
pnpm typecheck
pnpm test
FACTORY_MODE=mock ART_PROVIDER=mock pnpm factory demo
pnpm factory doctor
```
