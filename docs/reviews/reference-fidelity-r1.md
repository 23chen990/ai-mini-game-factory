# R1 参考玩法信息保真交接

## 基线与范围

- 目标仓库：`23chen990/ai-mini-game-factory`
- 基线：`f38d9955575db5561eba40007640c00094add885`
- 产线：现有 `replica-preview` 的 `cut-stack-dodge-v1` 语义关卡链路；没有新建产线或入口。
- 公开仓库只提交工厂代码、模板只读观测和自制测试；没有提交 `runs/`、录屏、账号数据或构建产物。

## 信息如何贯穿

1. `ReferenceLevelReconstructionSchema` 现在可保存带来源 checkpoint/frame、单位、区间、不确定度、坐标空间、适用条件和依据的两类行为量测：checkpoint 间隔（毫秒）与语义对象相对距离变化（归一化屏幕空间）。研究校验实际 `actualMs` 顺序、来源绑定、相机一致性和抽帧分辨率；无法直接观察的量测保留为 `INFERRED`/`UNKNOWN` 并阻塞实现契约。
2. `deriveReferenceLevelImplementationContract` 只把 `OBSERVED` 量测投影为带接受区间的 Builder 目标，并附源帧和源视口；原始坐标、时间戳不进入 runtime data。`BuilderAgent` 从冻结契约读取目标，`CodexAccountProvider` 将目标作为显式构建输入，同时要求候选状态只能来自真实模拟与自然输入。
3. `runReferenceLevelQa` 用 Playwright 正常指针操作，在浏览器中记录 `performance.now()`、实时 `boundsNormalized`、截图和事件 trace。`cut-stack-dodge-v1` 的只读 probe 返回相机修正后的实时边界，未从目标契约合成状态。
4. `evaluateReferenceLevelRuntimeTrace` 在候选数据独立采集后输出 `CONFORMING`、`DIFFERENT` 或 `INSUFFICIENT`。低分辨率或缺少边界证据不会被宽容差伪装成通过；`INSUFFICIENT` 会停在 QA 并要求补观察，不自动路由 Fixer。
5. 每次比较写入 `artifacts/reference-level-difference-report.md`，列出来源帧时间、候选证据、视口和产品下一步。候选入口标为本机 `dist/index.html`，不宣称真人试玩或市场验证。

## 验证

自制浏览器样例 `tests/e2e/reference-level-behavior-browser.test.ts` 通过真实 Chromium 指针输入验证：基准行为通过；同样的对象、状态和操作顺序下，慢响应与相对位置变化分别被识别为 `DIFFERENT`；移除实时边界被识别为 `INSUFFICIENT`。单元测试覆盖源帧时间不确定度、Builder 目标传递、区间比较、旧契约兼容和报告路径。`CI=1 pnpm exec vitest run --maxWorkers=1 --no-file-parallelism` 全部通过（173 文件、984 测试）；并行默认运行曾有一个既有 Playwright 用例超时，单独运行该用例通过，属于环境资源争用信号。

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
