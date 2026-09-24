# Action Realizability / Interaction Continuity

这是小游戏工厂的通用交互连续性契约，不绑定切割、跳跃、挂点、卡牌或射击等具体玩法。

## 交付物

当某个游戏声明交互连续性契约时，Builder 在当前 run 的 `artifacts/interaction-continuity-contract.json` 保存每个 `actionId` 的：

- `feedbackSignal`：玩家看到的可操作反馈；
- `successCondition`：成功后的目标状态；
- `constraints`：可测量指标和阈值；
- `recovery`：失败后的补救机制及（可选）最大固定步数；
- `repetition`：尝试次数和最低成功次数；
- `evidence`：流程、状态、视觉证据引用。

成功默认不能是不可玩的终态。若确实是“结算后可重开”，必须把 `successTerminalMode` 声明为 `replayable` 或 `settlement`，同时声明 `replayableAfterSuccess: true`；否则终态成功仍会失败。

Builder 还要产生节点事实：反馈是否可见、实际动作候选、选中动作、成功后的后继、失败后的恢复后继，以及状态转移和最终物理结果是否被观察到。QA 不接受只写“距离足够”“碰撞命中”或“状态标签正确”。

## QA 判定

`evaluateInteractionContinuity` 会验证：

1. 反馈出现时存在真实动作候选，且高亮、输入候选和最终选中动作一致；
2. 成功不会直接进入不可恢复的终态，并且至少有一个可玩后继；
3. 正常、边缘、救援三条路径都有固定步长模拟和证据；
4. 允许失败的动作有可达的恢复后继；
5. 声明的重复次数和最低成功次数真实满足；
6. 候选、状态转移和物理结果均有独立验证标记。

如果契约存在但观察或报告缺失，QA 会失败；QA 场景必须自己提交 normal/edge/rescue 固定步长结果，不能复用 Builder 计划中的场景声明。报告还会生成 `actionEvidenceMap`，把动作和场景映射到流程/状态/视觉证据，便于 Fixer 定位。若契约不存在，旧版产物按兼容模式继续运行。

## 责任边界

- Builder（`gpt-5.6-terra`）：实现节点和派生可达性事实，不负责自验收。
- QA（`gpt-5.6-luna`/reviewer）：用固定步长和自然输入验证当前可达、后继可玩、失败可恢复，并留下流程/状态/视觉证据。
- Fixer（`gpt-5.6-terra`，仅在需要写工作区时）：优先修节点布局、反馈条件、候选选择和后继/恢复关系；不得通过放宽阈值或删除断言“修绿”。
- Release：只要 run 声明了契约，就必须提交通过的 `interaction-continuity-report.json`，并随候选包复制；旧版没有契约时不增加额外门禁。

契约和报告都是 run-local、可哈希、可恢复的结构化 artifact。它们不改变既有 `ActionTestApi` v1；浏览器测试 API 只额外支持可选的 `getInteractionContinuity()`，因此旧版游戏仍可运行。
