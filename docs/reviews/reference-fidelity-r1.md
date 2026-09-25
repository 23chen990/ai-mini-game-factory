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

## R1-NEXT-01：时间观测、VERIFY-02 落地与信息缺口

本节覆盖提交 `1c5b646`（VERIFY-02 测试落地）及其子提交中的时间实现。此前章节中关于“固定使用采样空档和截图等待”的描述是历史记录；当前实现已改为端点观察窗口，截图耗时仍只作诊断字段。

### VERIFY-02 落地与浏览器失败证据

- `tests/unit/reference-direction-pipeline.test.ts` 的 `extractBuilderBehaviorTargets` 从 `R1 behavior targets:` 后解析完整 JSON 数组，再按 ID 校验：`input-to-contact` 恰有一个、`kind=checkpoint-interval` 且无自有 `direction`；`blade-fruit-spacing` 恰有一个、`kind=relative-distance`、`direction=approaching`。向时间目标添加方向、删除时间目标两种变异均被持久回归拒绝。
- `tests/e2e/reference-level-behavior-browser.test.ts` 现在逐项确认真实 Chromium 指针输入、候选 `separating`、参考 `approaching`、距离结果 `DIFFERENT` 和 `passed=false`；`tests/unit/reference-level-measurements.test.ts` 固定验证时间 `INSUFFICIENT` + 距离 `DIFFERENT` 保留两项明细且总状态为 `INSUFFICIENT`。
- 原始失败日志已保留为 `/tmp/r1-next-01-evidence/original-r1-fix-01a-full-test.log`，摘要为同目录 `original-failure-summary.json`：时间 `response-interval` 为 `INSUFFICIENT`（实际 `[0,269.3999999994412]`，期望 `[0,260]`），距离 `hero-target-spacing-change` 为 `DIFFERENT`（候选 `separating`、参考 `approaching`），总状态 `INSUFFICIENT`、`passed=false`。孤立重跑未复现，记录为“未复现”，不是“原始失败不存在”。

### 时间修复与反例证据

`src/qa/reference-level-qa.ts:addSnapshot` 为每个有前一实际观察的 checkpoint 保存 `observationWindow: {startMs,endMs}`；`measureRuntimeBehaviors` 只用声明的起点到终点窗口计算 `[to.start-from.end, to.end-from.start]`。起点没有窗口时返回 `INSUFFICIENT`，不再从整条轨迹借用最大 gap；`captureDelayMs` 不会回写已经结束的端点区间。首次页面观察后立即再观察一次，为首个可测 checkpoint 提供真实前置观察依据。`src/schemas/reference-recording.ts:ReferenceLevelRuntimeTraceSchema` 的新字段为可选，旧 trace 仍可解析但缺证据时不伪造精度。

失败反例先在旧实现上运行：四项时间单元测试均失败（旧结果分别为 `[300,900]`、`[300,900]`、`MEASURED`、`[0,1400]`）。修复后 `tests/unit/reference-level-qa-measurements.test.ts` 四项通过，覆盖：C 后晚样本不改变 A→C；无起点依据为 `INSUFFICIENT`；C 前等待进入相邻窗口而 C 后截图等待不扩大窗口；明确窗口仍可量测。`tests/e2e/reference-level-behavior-browser.test.ts` 使用同一页面和自然输入，`probe-delay` 通过 `ReferenceLevelQaInput.observationDelayMs` 延迟 QA 侧观察而不忙等页面主线程；基线仍 `CONFORMING`，纯观察延迟不变成 `DIFFERENT`，`slow` 真实延迟仍为 `DIFFERENT`。

### cut-stack 视觉失败证据

原始失败身份是 `tests/e2e/cut-stack-playwright-qa.test.ts > cut-stack-dodge natural runtime QA > does not use the mother palette as the rendered geometry identity`，断言 `report.passed` 期望 `true`、实际 `false`，具体 issue 为 `cut-stack-preview-runtime: visible primary cut/flip control has no geometry`。同一报告仍有 `cut-stack-mobile-affordance`、`cut-stack-rendered-falling-bounds`、自然失败、玩家可见失败原因、重试/完成/重玩/打包检查；原始日志中的观察边界约为 `{x:0.0741,y:0.2322,width:0.2991,height:0.1502}`，像素边界约为 `{x:0.078,y:0.1800,width:0.304,height:0.2005}`，对象包含 `cuttable-1/2/3` 与 `hazard-1`，生命周期为下落/接触失败分支，视口为 390×844。该单次失败与有诊断输出的重跑（`/tmp/r1-next-01-cut-stack-evidence/`，含 `qa-report.json`、`manifest.json`、screenshots、logs，源码版本 `757899832ab344b6a7829f1eb9ee028ad34fbce3`）不一致，分类为“尚无法判断”；未取得的颜色像素明细、异常栈和更细对象逐帧边界均明确缺失。没有修改几何检查、视觉阈值或视觉算法。

### 高保真量化信息盘点

| 信息项目 | Research 当前如何保存 | contract 如何投影 | Builder 实际收到什么 | runtime 是否有可调入口 | QA 实际检查什么 | 丢失／压缩／未测量位置 | 最小补齐建议 |
|---|---|---|---|---|---|---|---|
| 输入→反馈时间 | `src/schemas/reference-recording.ts:ReferenceBehaviorMeasurementSchema` 的 checkpoint interval、`observedRange/uncertainty/sourceFrameIds` | `deriveReferenceLevelImplementationContract` 投影为 expected/acceptance range | `src/providers/codex-account.ts:behaviorTargetInstruction` 收到 ID、区间、适用条件；原始时间戳不传 | `src/qa/reference-level-qa.ts:runReferenceLevelQa` 可采样窗口；实现可调 `observationDelayMs` 仅用于诊断 | `measureRuntimeBehaviors` 检查端点窗口和 `evaluateReferenceLevelRuntimeTrace` 的结果 | 已测区间被压缩为目标区间；反馈内部各事件的分段延迟未测 | 下一批保留 source-bound 的反馈事件序列和每段窗口，不扩大容差 |
| 关键对象初始距离 | `ReferenceCheckpointSchema`/`objectStates` 可保存 bounds 与关系，但只有研究实际提供才算已测 | `placementRules` 是 coarse band；距离行为量测保留归一化范围和方向 | Builder 得到语义对象、placement band 和相对距离目标，不得得到来源坐标 | runtime `getSnapshot()` 可返回实时 normalized bounds | 目标对象相对中心距离、方向和坐标空间 | 原始坐标被策略性舍弃；没有研究量测时不能由坐标字段推断已测 | 只在 Research 有来源帧时补 `sourceViewport` 和距离窗口，继续隐藏原始坐标 |
| 主角/目标尺寸、占屏比例 | `ReferenceCheckpointSchema` 的 `boundsNormalized` 可保存观察值 | `PlacementSignatureSchema` 仅投影 `widthBand/heightBand` | Builder 收到粗尺寸档位 | runtime 可返回实时 bounds | 仅在声明目标使用 bounds 时检查 | 已传粗档位；精确占屏比例未进入 contract，部分 QA 未检查 | 增加 source-bound extent band + viewport 的最小目标，避免填入猜测坐标 |
| 运动轨迹与旋转 | checkpoint object lifecycle/placement 可保存离散状态，研究 schema 没有连续轨迹序列 | placement orientation band 与 checkpoint 顺序 | Builder 收到离散朝向/生命周期，未收到轨迹点 | runtime 快照能看到当前 bounds/placement，不能回放连续轨迹 | cut-stack 几何/生命周期检查，未量测完整轨迹和旋转曲线 | 已传离散档位；连续运动和旋转未测量 | 下一批只补 source-bound 的少量轨迹锚点与旋转区间 |
| 镜头运动 | `ReferenceLevelReconstructionSchema.cameraSequence` 保存 checkpoint/mode/focus role | contract 传 camera sequence | Builder 收到相机阶段和焦点角色 | runtime 快照报告 `cameraMode` | QA 检查模式和可见对象 | 平移、缩放幅度及延迟未测 | 为已有 camera sequence 增加观察视口/幅度区间，保持语义而不传原始画面坐标 |
| 接触后的反馈顺序 | `ReferenceCheckpointSchema.visibleFeedbackIds`、interaction/terminal/replay 序列 | checkpoint visibleFeedbackIds、action order、terminal/replay | Builder 收到语义 ID 和顺序 | runtime 快照返回 `visibleFeedbackIds`、terminal 状态 | QA 检查状态转换、可见反馈 ID、终态/重玩 | 事件间精确时间和并行关系未测；接受标准不检查每个视觉层级 | Research 只补事件顺序与相邻窗口，QA 增加逐项顺序断言 |
| 失败→重玩时间 | terminal/replay checkpoint 与 interaction sequence | contract terminal/replay topology | Builder 收到失败原因、settlement 和 replay 返回点 | `runReferenceLevelQa` 走自然失败、终态和 replay | QA 检查自然重玩路径与返回 checkpoint | 失败到重玩按钮可用、点击到恢复的精确时间未测 | 补两个 source-bound 时间窗口并在 QA 中分别报告，不改重玩逻辑 |

这些字段中，“已测但没传”主要是 Research 的精确时间/边界被 contract 设计压缩；“只传粗档位”是 placement/extent/orientation；“传到了但实现没有使用”目前没有证据可确认，不能以字段存在推断使用；“候选能实现但 QA 没检查”是连续轨迹、镜头幅度和反馈/重玩精确时间；Research 本来就没测到的是旋转曲线和事件间精确延迟；其余保持“当前无法确认”。提示中的“最大保真”与 `src/providers/codex-account.ts` 的“source coordinates/timestamps must not become Builder tuning”同时存在，实际含义是保留可验证的语义区间而舍弃原始坐标，不能把粗档位宣称为完整高保真量化。

### 参考资料采集调用链盘点

已确认的链路是：`factory.ts:383-406` 从已验证 provenance 选择录屏 → `src/core/reference-recording.ts:extractReferenceRecordingFrames/selectReferenceResearchMedia` 生成 run-bound frame manifest/contact sheets → `factory.ts:893-930` 组装 `ReferenceResearchAgent` 输入 → `src/providers/codex-account.ts` 或 `src/providers/real.ts` 执行研究 → `deriveReferenceLevelImplementationContract` 投影 → `runReferenceLevelQa` 对候选 preview 做自然浏览器 QA。已确认的是“录屏已在 run 中、抽帧并送入研究”的工厂路径。

当前仓库没有可靠证据证明存在“参考 URL → 打开页面 → 操作 → 录屏 → 归档”的端到端自动采集调用链；`reference-evidence` 入口要求外部证据先由 `pnpm evidence:ingest` 绑定和人工 identity review。故 URL 打开、操作录制和归档部分标为“未确认”，没有用关键词缺失推断绝对不存在。本批未访问未授权账号、未调用真实 Research/Builder/Fixer、未读取或修改真实 run。

## R1-FIX-01 时间量测方向修复

- 研究 structured output 只在 `levelReconstruction.behaviorMeasurements[*].direction` 接受 `null`；其它方向字段保持原有枚举约束。研究提示明确要求 checkpoint-interval 不生成空间方向。
- `normalizeReferenceBehaviorAnalysis` 在正式 `ReferenceBehaviorAnalysisSchema.parse` 前删除量测 `direction: null`。因此时间量测在 canonical artifact 与 Builder-facing target 中都省略方向；relative-distance 仍可保留接近/远离/稳定方向。
- source、target 与 runtime schema 显式拒绝 checkpoint-interval 的非空方向，防止方向要求重新进入时间链路。旧的缺省方向距离 artifact 保持原序列化形状和绝对距离比较语义。
- 新增 `tests/unit/reference-direction-pipeline.test.ts` 覆盖 Provider schema、Research→canonical parse→contract、无方向候选时间量测和旧距离 artifact。

### R1-FIX-01a 传输 required 收尾

- 根因是 `allowNullBehaviorMeasurementDirection` 在给量测 `direction` 增加 `null` 分支时同时过滤了 `required`；本次只保留该节点原有的 `required`，没有改变 canonical schema 或其它方向字段。
- 失败反例先在基线 `d9def26504281027197dc10b15aa409300710a0c` 上运行：`tests/unit/reference-direction-pipeline.test.ts` 因实际 `request.outputSchema` 的量测 `required` 缺少 `direction` 失败；修复后同一测试通过，并递归核对嵌套/联合分支的 strict 对象约束与 `gestureDirection` 枚举未被 nullable 扩散。
- 合成接线证据经正式 `ReferenceResearchAgent.run → CodexAccountProvider → FakeExecutor`：传输时间量测 `direction:null` 在 canonical 和 Builder 目标中被省略，距离量测保留 `approaching`；Builder 请求同时包含无方向时间目标和有方向距离目标。
- 候选时间量测由 `measureRuntimeBehaviors` 根据合成 `capturedAtMs`/`sampleGapMs` 生成，再交给 `evaluateReferenceLevelRuntimeTrace`，结果为 `CONFORMING`，没有缺少空间方向的阻塞。
- 本次未读取或修改真实 `runs/`，未调用真实 Research/Builder/Fixer，未修改 QA 算法、阈值、冻结标准或共享 Git 配置。

## R1-NEXT-02：候选方向证据与 cut-stack 视觉三态

### 候选方向判定

`src/qa/reference-level-qa.ts:measureRuntimeBehaviors` 保留候选起点到终点的有符号中心距离变化。相对距离目标现在用同一视口的 screen-normalized bounds 和浏览器像素分辨率推导端点分辨率，形成 signed interval；区间完整落在零点一侧才输出 `approaching` 或 `separating`。区间跨零时，方向目标为 `INSUFFICIENT`；只有 `stable` 目标的 absolute change 完整落在来源接受区间内才可输出稳定。没有 direction 的旧目标仍走 absolute-distance 语义。测试覆盖高分辨率接近、分辨率不足、反向远离、稳定、旧目标和浏览器自然输入。

### cut-stack 视觉证据三态

`src/qa/cut-stack-playwright-qa.ts:classifyCutStackGeometryObservation` 输出 `CONFORMING`、`MISMATCH` 或 `INSUFFICIENT`。缺少 falling object、runtime bounds、renderColor、canvas/context、像素、可见控制 boundingBox，或同色组件不能可靠隔离时保留证据不足；只有唯一或由观察框明显主导的局部连通块才进入冻结的 x/y `.06`、width/height `.08` 几何比较。没有扩大阈值，也没有修改游戏行为。每次诊断保留对象 ID、lifecycle、renderColor、观察框、像素连通块、视口、截图、检查和异常原因。

`src/factory.ts:routeQaFailure` 已接入 preview 和 normal QA 决策层：视觉 `INSUFFICIENT` 进入 waiting，并记录 `qa:fixer-not-routed:visual-evidence-insufficient`；视觉 `MISMATCH` 才进入现有 Fixer 路径；`CONFORMING` 保持原通过路径。单元测试验证两条路由且确认不足证据不调用 Fixer。

### 高保真信息传递盘点

| 信息项目 | Research 当前如何保存 | contract 如何投影 | Builder 实际收到什么 | runtime 是否有可调入口 | QA 实际检查什么 | 丢失／压缩／未测量的位置 | 最小补齐建议 |
|---|---|---|---|---|---|---|---|
| 输入到反馈的时间 | `src/schemas/reference-recording.ts:ReferenceBehaviorMeasurementSchema` 保存 checkpoint interval、来源帧和区间 | `src/core/reference-level.ts:deriveReferenceLevelImplementationContract` 投影 expected/acceptance range | `src/providers/codex-account.ts:behaviorTargetInstruction` 收到语义 ID、区间和适用条件；原始时间戳不下发 | `src/qa/reference-level-qa.ts:runReferenceLevelQa` 可记录端点窗口；`observationDelayMs` 只延迟 QA 观察 | `measureRuntimeBehaviors` 比较端点窗口并保留 `INSUFFICIENT` | 反馈内部分段延迟已测时仍被压缩；未测时无法从坐标推断 | 下一批增加 source-bound 反馈事件序列和相邻窗口，保持原接受标准 |
| 关键对象初始距离 | `ReferenceCheckpointSchema.objectStates` 可保存 bounds/relations，只有带来源帧的记录才算已测 | relative-distance target 保留范围和方向；placement 只保留语义 band | Builder 收到对象 ID、相对距离目标和粗 placement band | runtime `__REFERENCE_LEVEL_TEST__.getSnapshot` 返回实时 normalized bounds | 方向、距离区间和坐标空间 | 原始坐标有意不进入 Builder；Research 未量测时当前无法确认 | 仅在来源帧存在时补 source viewport 和距离窗口 |
| 主角与目标尺寸、占屏比例 | `ReferenceCheckpointSchema.boundsNormalized` 能保存观察框 | `PlacementSignatureSchema` 只投影 width/height band | Builder 收到粗尺寸档位 | runtime 快照可读实时 bounds | 仅检查声明的 bounds 目标 | 精确占屏比例被压缩，部分行为没有目标故未测 | 增加 source-bound extent band，不填猜测坐标 |
| 运动轨迹与旋转 | checkpoint lifecycle/placement 是离散状态；没有连续轨迹序列 | contract 传离散 orientation/lifecycle | Builder 收到离散朝向与生命周期，没有轨迹点 | runtime 只能观察当前 bounds/placement | cut-stack 检查 falling lifecycle 和像素几何，未检查完整曲线 | 连续轨迹、旋转曲线没测；候选可实现但 QA 未检查 | 只补少量有来源的轨迹锚点和旋转区间 |
| 镜头运动 | `ReferenceLevelReconstructionSchema.cameraSequence` 保存 checkpoint、mode、focus role | contract 传 camera sequence | Builder 收到阶段和焦点角色 | runtime 快照报告 cameraMode | 检查模式和可见对象 | 平移/缩放幅度及延迟未测 | 为已有 camera sequence 补观察视口/幅度区间 |
| 接触后的反馈顺序 | `ReferenceCheckpointSchema.visibleFeedbackIds` 和 interaction/terminal/replay 序列 | contract 传语义 ID 与顺序 | Builder 收到反馈 ID、失败原因和 replay topology | runtime 快照返回 visibleFeedbackIds 与终态 | 自然浏览器检查 cut/drop/hazard、终态与 replay | 事件间精确时间和并行关系未测 | 只补事件顺序及相邻窗口，逐项增加 QA 断言 |
| 失败到重玩时间 | terminal/replay checkpoint 与 action sequence | contract 传终态/replay 拓扑 | Builder 收到失败原因和返回 checkpoint | `runReferenceLevelQa`/cut-stack 自然流走失败与 replay | 检查可见 retry/replay 和返回 ready | 按钮可用、点击到恢复的精确时间未测 | 增加两个 source-bound 时间窗口，保持玩法不变 |

字段存在不等于 Research 已正确量测；当前已测但未传的是被 contract 压缩的精确窗口，粗档位是已传但降精度，传到候选但 QA 未检查的是连续轨迹、镜头幅度和事件间精确时间，Research 本来就没测到的是旋转曲线与细粒度反馈延迟，其余保持“当前无法确认”。`src/providers/codex-account.ts` 同时要求高保真语义和舍弃 source coordinates/timestamps，二者的可执行边界是传递可验证区间而不是伪造原始坐标精度。

### 资料采集调用链状态

已确认的调用链为 `factory.ts` 选择已验证录屏 → `src/core/reference-recording.ts:extractReferenceRecordingFrames/selectReferenceResearchMedia` 生成 run-bound frame manifest/contact sheets → `ReferenceResearchAgent` → contract 投影 → `runReferenceLevelQa` 候选 QA。当前没有可靠证据确认“参考 URL → 打开页面 → 操作 → 录屏 → 归档”的端到端自动链路；URL 打开、操作录制和归档继续标为未确认。未访问未授权账号，也未调用真实 Research/Builder/Fixer。

### 证据边界

历史 cut-stack 失败资料仍保留在 `/tmp/r1-next-01-evidence/`；本批诊断资料写入独立的 `/tmp/r1-next-02-cut-stack-evidence/`。新 manifest 不再写入旧提交 SHA，改为记录测试源码、QA 源码和构建文件 SHA-256；原始失败是否复现与本次定向诊断分开记录。视觉 `INSUFFICIENT` 不升级为颜色根因或几何 mismatch，执行异常、识别证据不足、画面与观察不一致、尚无法判断保持独立分类。

### 本批验证记录

- 定向 Vitest：5 个文件、38 个测试通过；包含方向量测、聚合规则、浏览器自然输入、cut-stack 三态和工厂路由。
- 全量 Vitest：176 个文件、1028 个测试通过（`CI=1 pnpm exec vitest run --maxWorkers=1 --no-file-parallelism`）。
- `pnpm lint`、`pnpm typecheck`、`git diff --check` 均通过。未运行真实 run，也未调用真实 Provider、Builder 或 Fixer。
