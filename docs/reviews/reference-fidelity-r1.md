# R1 参考玩法信息保真交接

## 基线与范围

- 目标仓库：`23chen990/ai-mini-game-factory`
- 基线：`ac187b28912e7307b18716af03ec48e4e016c7e5`
- 产线：现有 `replica-preview` 的 `cut-stack-dodge-v1` 语义关卡链路；没有新建产线或入口。
- 公开仓库只提交工厂代码、模板只读观测和自制测试；没有提交 `runs/`、录屏、账号数据或构建产物。

## 信息如何贯穿

1. `ReferenceLevelReconstructionSchema` 现在可保存带来源 checkpoint/frame、单位、区间、不确定度、坐标空间、适用条件和依据的两类行为量测：checkpoint 间隔（毫秒）与语义对象相对距离变化（归一化屏幕空间）。研究校验实际 `actualMs` 顺序、来源绑定、相机一致性和抽帧分辨率；无法直接观察的量测保留为 `INFERRED`/`UNKNOWN` 并阻塞实现契约。
2. `deriveReferenceLevelImplementationContract` 只把 `OBSERVED` 量测投影为带接受区间的 Builder 目标，并附源帧和源视口；原始坐标、时间戳不进入 runtime data。`BuilderAgent` 从冻结契约读取目标，`CodexAccountProvider` 将目标作为显式构建输入，同时要求候选状态只能来自真实模拟与自然输入。
3. `runReferenceLevelQa` 用 Playwright 正常指针操作，在浏览器中记录 `performance.now()`、实时 `boundsNormalized`、截图和事件 trace。候选时间不确定性来自实际采样空档和 checkpoint 截图等待，不再固定使用 ±50ms。`cut-stack-dodge-v1` 的只读 probe 返回相机修正后的实时边界，未从目标契约合成状态。
4. `evaluateReferenceLevelRuntimeTrace` 在候选数据独立采集后输出 `CONFORMING`、`DIFFERENT` 或 `INSUFFICIENT`。低分辨率或缺少边界证据不会被宽容差伪装成通过；`INSUFFICIENT` 会停在 QA 并要求补观察，不自动路由 Fixer。
5. 每次比较写入 `artifacts/reference-level-difference-report.md`，列出来源帧时间、候选证据、视口和产品下一步。候选入口标为本机 `dist/index.html`，不宣称真人试玩或市场验证。

## 验证

自制浏览器样例 `tests/e2e/reference-level-behavior-browser.test.ts` 通过真实 Chromium 指针输入验证：基准行为通过；同样的对象、状态和操作顺序下，慢响应与相对位置变化分别被识别为 `DIFFERENT`；延迟观测不会仅因 QA 延迟被判为 `DIFFERENT`；移除实时边界被识别为 `INSUFFICIENT`。单元测试覆盖源帧时间不确定度、Builder 目标传递、区间比较、旧契约兼容和报告路径。`CI=1 pnpm exec vitest run --maxWorkers=1 --no-file-parallelism` 全部通过（175 文件、1008 测试）。

## 限制

- 没有把通用视觉识别或物理公式反推加入本批；研究 Agent 必须根据已验证帧提供量测，程序只做来源和完整性校验。
- 归一化空间量测使用视口宽高比修正，但仍需要适用条件和独立画面审查来确认视觉反馈是否可见。
- 当前机器的已存真实竞品 run 仍停在研究阻塞状态，不能作为 R1 的真实还原通过证据。本批结论是“工程样例验证完成，真实竞品还原效果尚未验证”。
- 本批没有触发生成游戏 Builder/Fixer 修复，也没有执行正式 FIX 阶段；共享模板改动只增加实时只读观测字段。

## 复查修复

- 候选测量现在必须绑定契约声明的两个 checkpoint、单位和坐标空间；错误来源或 world-relative 边界会报告 `INSUFFICIENT`。
- `INFERRED`/`UNKNOWN` 来源量测不能携带观测值；验证发现的来源阻塞会进入 BLOCKED Builder 合约。
- Builder 提示只接收功能目标摘要，源帧 ID、源证据路径和哈希仍留在研究/QA 证据中。
- 终态截图使用独立路径，恢复校验不再无条件重写带新时间戳的 gate；QA 失效清单包含 R1 报告与 gate。

## 本轮候选观测复查（基线 e49595b）

### 根因与修复

- 状态变化：`src/qa/reference-level-qa.ts` 原先把 `capturedAtMs` 纳入 JSON 比较，导致没有游戏状态变化的自然点击也被记录为 `stateChanged=true`。现在比较时只移除观测时间元数据；所有 checkpoint 样本仍保留，时间量测不会因状态去重丢样本。
- 时间口径：候选量测原先按终点 checkpoint 找第一个动作开始时间，可能把 A→C 指标替换成 B→C。现在统一使用声明的起点 checkpoint 与后续终点 checkpoint 的实际采样时间；跨多个动作且采样/截图延迟不足时仍保留 `INSUFFICIENT`。
- 距离方向：旧指标仍比较绝对变化量；新增可选 `direction`（`approaching`/`separating`/`stable`），只有冻结目标声明方向时才比较方向，旧目标含义和旧 artifact 兼容。
- 下落几何：`templates/web-lite/cut-stack-dodge-v1/src/main.ts` 的观察边界现在包含 `fallOffset`、下落旋转后的实际绘制包围盒和 `settled` 隐藏状态；没有修改模拟物理参数。
- 画面一致性：cut-stack 自然点击会读取 canvas 实际像素边界，并与 runtime 提供的当前对象渲染色证据匹配；不再把母模板固定配色当成候选通用条件。模板测试覆盖 390×844、430×932 和仅替换配色的候选。

### 失败回归与通过证据

- 修复前失败：自然点击无状态变化被时间戳差异判为变化；A→C 单元回归会被错误终点动作开始时间缩短；反向接近/远离样例在旧绝对值比较下无法区分；固定颜色扫描无法证明配色变化安全；模板 canvas 边界与下落对象观察边界不一致。
- 修复后定向回归：方向 schema/Builder 提示、来源方向一致性、采样空档与截图等待、延迟观测浏览器反例、旧方向缺省语义、`tests/e2e/reference-level-behavior-browser.test.ts`、`tests/e2e/cut-stack-playwright-qa.test.ts` 均通过；模板实测包含真实自然点击、canvas 像素边界、两个手机视口和仅替换配色的候选。

### 真实竞品样本状态

- 已核对 `runs/20260919050429-6b7e8c7a`：录屏证据已验证（SHA-256 `3781e4dcd3d21094f186cf442b3ee30cddfbb2fbe68d87c5c7470a2c742bf75a`），但 `REFERENCE_DEEP_RESEARCH` 因 `codex exec timed out after 300000ms` 失败；恢复出的 `reference-level-reconstruction.json` 没有 `behaviorMeasurements`，因此不能作为 R1 真实量测通过证据。
- 本轮实际诊断确认：真实 Provider 为 `codex-account` 的 `gpt-5.6-luna`，研究 sandbox 为 `research-sandbox/reference_deep_research`，输入包含 VERIFIED 录屏、292 帧 READY manifest、contact sheets 和 evidence pack。超时前日志保留了 thread/turn、沙箱列举和 timeout stack；stderr 另记录 models cache 字段不兼容及刷新超时。没有发现可用的已完成行为量测输出。
- 本轮尝试只重试 `REFERENCE_DEEP_RESEARCH`，未修改全局超时或重试策略；run 进入 waiting 后，`resume`/`run` 没有重新发起 Provider 调用，现有 stage gate 仍未给出新的研究输出。该事实已保留在 run state/logs，不能被解释成研究通过。
- 已核对 `runs/20260917065307-974ee21f` 与 `runs/20260919045632-6b7e8c7a`：已有录屏/接触表资料，但研究输出明确阻塞于 `recording-level:non-authoritative-provider:mock`，不得升级为真实竞品还原通过。
- 本轮未让产品经理补填坐标、时间或技术规格，也未用自制样例替代真实参考。真实最小样本仍为 `BLOCKED`，最小缺口是使用权威研究输出从已验证录屏提取至少两项 source-bound 行为量测，并保留 frame/checkpoint provenance，然后才可进入 Builder→自然 QA→差异定位链路。
