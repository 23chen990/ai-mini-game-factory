# Phase 5 · QA provider runtime 证据主路径

状态：已实现（2026-09-01）。`QAAgent` 从 naturalFlow + 探测到的 wired files 派生主证据；factory rescue 经 `resolveRuntimeProductGate` 统一决议，**不得改写** `passed:true`。  
目标：让 `runtime-product` 门禁走 **QA 主证据路径**，rescue 仅作兜底，且不得放宽任何既有拒绝条件。

## 现状（已核实）

| 环节 | 行为 |
|---|---|
| `QAAgent.run`（`src/agents/index.ts` ≈297） | 固定写 `artifacts/runtime-product-gates.json`，`passed:false`，`runtimeWiredFiles` / `browserEvidence` 标 missing |
| Playwright QA（`src/qa/playwright-qa.ts`） | 产出 `naturalFlow` + screenshots，**不写** runtime-product 文件 |
| factory rescue（`src/factory.ts` ≈2366–2382） | 占位未过 + `natural.passed` 时用 `deriveRuntimeProductGate` 覆盖写回 |
| Provider 接口 | `QAProvider.playtest → Promise<unknown>`，无 runtime-product 字段；`CodexProvider` 无关 |

结论：今天唯一可达通路径是 rescue。主路径仍是 fail-closed 占位。

## 最小实现步骤

1. **Live QA 产出点**（优先 `playwright-qa.ts` 返回前，或 `QAAgent.run` 写盘前）：用真实 `naturalFlow` + 探测到的 `runtimeWiredFiles` + screenshots，调用现成 `deriveRuntimeProductGate`，写出完整 `artifacts/runtime-product-gates.json`；可另写 `artifacts/runtime-product-journey.json` 作为 `browserEvidence`。
2. **QAAgent 占位逻辑**：仅当 provider **未**给出合法 gate（缺文件或 schema 失败）时保留 fail-closed 占位；已有合法产物则**不得覆盖**为 missing。
3. **可选**：约定 `playtest` 返回形状（TS 类型或旁路 artifact），不必改 `CodexProvider`。
4. **factory rescue 保留为兜底**，加测试：主路径已 `passed:true` 时 rescue **不得改写**。
5. **测试锁**：
   - 扩展 `tests/unit/qa-agent.test.ts`：provider 提供完整 journey → 落盘非 missing
   - 复用 `runtime-product-gates.test.ts` 的 derive 拒绝用例
   - 加 factory 级「主路径优先于 rescue」断言
   - Mock/stub 继续 fail-closed 或显式 `passed:false`，禁止 stub 假绿

## 明确不要做

- 删/放宽 `RuntimeProductGateSchema.superRefine`、`verifyRuntimeWiredFiles`、derive 阻塞条件
- 让 Mock/stub 在无浏览器证据时 `passed:true`
- 用 test API / `forbiddenOperations` 冒充 natural play
- 把 rescue 当正式主路径长期依赖，或为跑通流水线跳过 `NORMAL_FLOW_QA`
- 硬编码 journey 为 always-pass

## 模型调度

- 设计（本文件）：已完成，主 Agent
- 实现：18:00 后 `deepseek-v4-pro`（脱离高峰、非高峰 5 折、1M 上下文）
- 机械测试补丁：可用 `hy3` / `glm-5.3-flash`
- 全程避开 `kimi-k3-1`（1.62x）
