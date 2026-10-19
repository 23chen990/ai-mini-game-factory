# Reference-First：共享工厂链路审计与首个差异检出切片

## 范围和基线

这是 **shared-factory** 改动，不是某个既有游戏的体验修补。原本打开的目录指向 `night-market-hero`；本次隔离工作树从目标仓库 PR #71 的已核查提交继续，不纳入旧仓库历史、用户修改或生成游戏。

核查时间：2026-10-19。主干为 `cb0ea67d7ed9ec25a3deed7110cb4b685d598e7b`。本次基线为 PR #71 的 `d269cbd94f9eb23bf24d01e8340748e025bf5eed`，**不是已合并主干**。没有合并任何历史分支。

| 位置 | 实际能力 | 不代表什么 |
|---|---|---|
| main | 既有 Zod 工件、Builder/Fixer、参考行为合同、双轨 QA、恢复和发布边界 | 未包含下列未合并 PR 的全部能力 |
| [#2](https://github.com/23chen990/ai-mini-game-factory/pull/2)，`2ffcd5bd` | 独立 grid-merge 候选；REA 离线 plan/inspect/anchor/review | bridge 不执行 REA；合成测试不是实际逆向 |
| [#3](https://github.com/23chen990/ai-mini-game-factory/pull/3)，`f7dd75bd` | 基于 #2 的门诊试点和真实候选浏览器检查 | 没有参考对象的对照运行 |
| [#7](https://github.com/23chen990/ai-mini-game-factory/pull/7)，`b4d34871` | 基于 #3 的来源 SHA、claim→机制→用例结构门禁 | 三个 180 秒场景只是定义；未接入核心 factory 执行 |
| [#8](https://github.com/23chen990/ai-mini-game-factory/pull/8)，`0919f504` | 基于 #7 的真实 REA 6.4.0 静态试验 | 工具成功不证明玩法准确、浏览器试玩或还原通过 |
| [#71](https://github.com/23chen990/ai-mini-game-factory/pull/71)，`d269cbd9` | 直接基于 main；brief intake、来源缓存/审批绑定、修复账本、readiness 和工程演示 | 演示没有真实 LLM 重建；默认仅两种预览模板；无完整双端机制测量 |

#8 的 [Actions run](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38358883399) 中，`three-h5-real-rea` 确实成功；整体 workflow 因另一 job 的 lint 失败。静态 receipt 明确 `browserPlayed=false`、`sourceMatched=false`；不能把 job 成功写成全链路验收。

## 断点：不是“逆向没有用”，而是没有成为共同验收依据

1. **REA → Research**：历史 `tools/lean-pilot` 是独立脚本，核心 `src/factory.ts` 不消费其 packet。静态 findings 没有自动成为可追溯、分清观察/推断的共享机制证据。
2. **Research → Builder**：现有 fidelity/pressure/recording 合同已有接线，应保留；但数值关系、状态、观测协议仍散落，且源哈希证明的是身份，不是结论正确。
3. **Research → QA**：QA 主要检查候选是否满足 Research 写出的预期；参考本身没有被同等实测。研究理解错了，Builder 和 QA 可以一起“正确地做错游戏”。
4. **QA → 修复**：旧 gate 缺少研究错误/实现错误的区分，很多差异容易直接落到 Fixer。
5. **验收语义**：旧 `verifyReferenceFidelityReview` 仅有候选自然轨迹和图片，也能通过。本次先用失败回归复现了这个缺口，再改代码。

这些证据支持用户提出的根因假设，但不证明它是所有游戏体验差的唯一原因，也不承诺商业收益。

## 本次实际代码，而非新增一套工厂

- 在既有 `ReferenceBehaviorCheck` 中增加 `comparison`：证据类别、参考工件、条件、操作协议、单位、参考范围、容差和采样要求。它随原来的分析→证据包→fidelity 合同进入 Builder；没有再建一个机制合同平行入口。
- 在既有独立 review 中增加参考/候选两份 capture 引用。核验 run、合同内容哈希、当前候选哈希、参考来源、对象/状态分支、视口、协议、截图字节和正常输入权限。
- 没有双端证据、夹具/注入、证据过期、分支不匹配或样本不足均不通过；文件损坏直接报错，不当成缓存未命中。
- 比较结果区分 `RESEARCH`（参考实测推翻合同/来源不明）、`CONTRACT`（协议缺失）、`BUILDER`（参考支持合同而候选偏离）、`QA`（证据不足或条件不同）。预览和完整验证都使用同一个 verifier；完整验证不再从候选感知评审直接推导参考对标通过。
- 工厂据此进入对应等待阶段，输出可追溯差异。**这还不是自动执行补研究/修复的闭环**；不可把 stage 路由当成已调用 Research/Fixer，更不可把本次负向试验说成自动修复成功。
- 等待时写入 Zod 校验的 `reference-comparison-task.json`：研究/合同问题交 Research，候选偏差交正式 Fixer，采集缺口交独立 QA。任务带 run/合同/构建身份、输入、差异和各角色操作要求；QA 必须交两份 capture 及文件哈希，不再收到一份缺少双端采集要求的笼统评审任务。已知研究阻塞即使尚无 QA review 也返回 Research。
- 未测量的时序允许写 `null`，但合同必须保留 `BLOCKED` 和原因；不为了 schema 通过而填虚构时序。旧版本有数值的合同保持兼容。
- 保留独立感知 QA 和真人确认；数字比较通过不会替代它们。旧合同仍可读，但缺少 comparison 的旧验收不能继续被视作对标通过。

实现：`src/schemas/reference-comparison.ts`、`src/core/reference-comparison.ts`、既有 `reference-fidelity.ts` / `reference-evidence.ts` / `factory.ts`。两个 Research provider 和 brief intake 共享同一测量提示，不另增 Agent。

## 试点：复用 #2，不继续开发某个商业游戏

- 唯一 run：`factory-comparison-2048-20261019`；候选目录：`runs/<run-id>/workspace/game`。
- 参考：[2048 固定提交](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc)，直接 [MIT 许可](https://github.com/gabrielecirulli/2048/blob/478b6ec346e3787f589e4af751378d06ded4cbbc/LICENSE.txt)。参考副本仅供隔离研究，保留许可；它的代码、UI 和素材不进入候选。
- 候选：#2 已有原创 grid-merge 模板，固定 `2ffcd5bd`，未扩关、调参或改美术；使用既有 14 项规则测试。不是本轮 LLM 从零生成的游戏。
- 使用完整可读源码，因此本次没有为展示工具次数调用 REA。先核对来源/许可/规则，再从独立新浏览器会话运行两端；只发送正常按键和终局重开点击，禁用非本地网络。没有设置 RNG、localStorage、棋盘或通关状态。
- 同一方向序列下随机棋盘不会相同，故比较**给定当前棋盘和方向的条件规则残差**，而不是拿最终分数硬判相似：移动后生成、单次合并、得分因果、无路可走的失败、正常重开。
- 未测量的难度曲线、随机分布、触屏手感、时机/动画相似度、赢局继续分支和长期成长明确留空；不能把这五个局部规则扩写成完整体验高保真。

执行器：`tools/reference-comparison-pilot.ts`；独立 DOM 读数/规则检查：`src/qa/grid-comparison-adapter.ts`。输入是已固定、已核验的本地参考和候选目录；不会下载或修改游戏。

```sh
pnpm exec tsx tools/reference-comparison-pilot.ts runs/factory-comparison-2048-20261019 workspace/game final-scoped
```

本地来源 manifest、许可研究、合同、原始双端 capture、截图、测试和执行日志都在同一 run。它们不作为第三方游戏素材加入 Git。可移植结果摘要和文件 SHA 见 [验证回执](reference-chain-verification.json)。执行器中的 revision 字符串是准备时的来源声明；运行时实际核验的是 manifest 所列文件字节和候选目录内容哈希，而不是仅信任版本标签。

### 已执行的证据层次

1. 原始候选：一次约 180 秒、529 次共享方向输入，规则残差为零；参考 3 次、候选 4 次自然失败和重开。只能支持所测条件规则，不能推断相同难度。
2. 独立负向副本：只在 `workspace/negative-control` 增加每步多计 2 分的故意错误。约 180 秒、527 次输入，捕获 `score-feedback` 偏差并归到 `BUILDER`。原候选没有被改动；这是 QA 检出能力试验，不是对商业游戏的修复。
3. 检查截图时发现参考终局 overlay 有延迟淡入：DOM `isVisible()` 不等于玩家已经看见。已补浏览器回归并等待实际 opacity，再采集终局。早期截图不被晋升为感知通过；保留原始记录和修正后的复测。
4. 最终正向复测 `final-scoped` 使用约 180 秒、510 次共享方向输入，参考 269 次合并、3 次失败/重开，候选 281 次合并、4 次失败/重开；五类规则残差为零。已检查双方终局截图，参考提示与重开按钮实际显现；这只关闭透明 overlay 的采集缺陷，不批准整体感知相似度。
5. 最终合同明确 `BLOCKED: pilot:timing-and-difficulty-not-measured`。所有报告分别保留 `measuredBehaviorPassed`、`perceptualPassed=false`、`humanAccepted=false`、`commercialReleaseReady=false`。最终负向复测也采用这一合同，详见回执；不拿早期合同下的结果冒充当前合同验收。

## 保留、整合、退役决定

- **保留**：现有 factory、Zod、Builder/Fixer、自然操作 QA、证据 provenance、缓存、修复账本、成本/权限和平台边界。
- **选择性整合**：#2 的导出完整性/来源锚、#7 的 claim→用例映射；应通过现有 Zod 边界接入，不整分支合并，也不携带三个游戏的历史改动。
- **退出默认验收语义**：候选工程绿=参考对标通过；静态 REA 成功=玩法恢复；候选感知 QA 自动代替参考运行。
- **保持兼容但不泛化**：`reference-core-gameplay-research.ts` 虽名称通用，内部硬编码五章、特定动作和经营关系，是历史特定游戏模型，不应拿它当万能新工厂协议。
- **暂不增加**：新 Agent 层、服务、数据库、队列、生产依赖或更多商业游戏内容。

## 明确剩余工作

1. 将已存在的 REA 静态导出验证器接入共享 Research，按未解问题选择源码/REA/动态观察；当前新增的是提示层策略，**尚非自动工具调度**。
2. 在 Builder 启动前验证关键机制/测量协议覆盖，合并多份旧合同的派生关系，修正所有入口的缓存失效；目前新增严格比较主要发生在 QA。
3. 执行已经路由的最小增量研究/正式 FIX 任务，执行后重新采集候选并对照；保留参考证据而非每次重做研究。本次做到结构化交接及阶段等待，尚未自动执行，没有伪称完整自动修复。
4. 通过真正模型驱动的 Research→Builder 试点验证交接。现有模板复用和脚本生成合同不证明这一步已成功。
5. 追加难度/时序等适配器、独立感知与少量真人试玩，再谈平台适配和商业化。没有真实发行 SDK/包、账户和收益数据，不宣称可发布或赚钱。
6. 开始记录研究命题准确率、首次对标通过率、重复调用/构建、人工干预与真实总成本。本轮没有可比的旧流程基准，不报告节省百分比。

现在不需要用户逐项设计玩法或找代码问题。仍需人的事项是权利/成本/不可研究缺口的决策及最终试玩，并非要求用户继续担任日常 QA。用户已授权本轮提交并创建 Draft PR，不自动合并；PR 以 #71 的分支为基线，清楚保留依赖关系。
