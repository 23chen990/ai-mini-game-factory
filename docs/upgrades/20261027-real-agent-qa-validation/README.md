# 真实 Agent QA 接管：已执行部分与授权停止点

基线为 PR #79 `b338b1b092c8af46d288d4c5ac883726f20770ab`，PR #73→#79 的六段祖先关系均实际核验。原工作目录不是该基线；保留其 830 项删除、3 项修改和全部未跟踪文件。另一个早期 Eval 工作树的 48 个已修改文件也没有移植或覆盖。完整二进制 diff 备份保存在忽略的本地审计 run 中，路径、SHA 与状态见 `takeover.json`。

## 结论：未完成自主能力验收

| 范围 | 自主发现 | 自主修复 | 误报 / 漏检 / 无法观察 |
|---|---|---|---|
| 本轮新独立 Agent | 0 / 0 有效测试 | 0 / 0 尝试 | 未调用；不能推算质量率 |
| 找回的上一轮真实 QA | 0 / 1 调用尝试，0 个有效可评分样本 | 0 / 0 模型尝试 | 产品误报 0；漏检未知；4 / 4 subject×viewport 未观察 |

上一轮另有一次 HTTP400 启动拒绝。唯一注入目标未检出，但因为不可观察，不能把它直接算作已证实漏检。其收据仍是 `uncertain`，100,077 已观测 Token 超过 55,000 观测停止线。没有清零账本、接受其原始报告或把旧控制器修复包装成 Fixer 成功。

本轮没有 Research、QA、Builder、Fixer 或独立复测调用。**主控聊天本身确实消耗模型 Token**，不属于“零 Token”；主控实际遥测下界与逐次增量单列于 `cost-usage-snapshot.json`。缓存输入属于 input 子集，不再重复相加；货币费用不可核实，保持 `null`。

## 已有真实执行证据

1. 最新 head 本地 lint/typecheck、195 个测试文件 / 1,254 测试通过；发行注册表及 4 项回归通过。精确基线 GitHub CI：[40479380726](https://github.com/23chen990/ai-mini-game-factory/actions/runs/40479380726)，状态见独立快照，不沿用旧 `ad00da8` 的绿色结论。
2. 既有 `pnpm factory qa-preflight`：Chromium/WebKit × 390×844/1280×800，4/4 启动、点击、可见变化与截图通过。它只证明宿主。
3. 真实 `codex sandbox` 只读子命令启动 Chromium：因创建浏览器临时目录 EPERM 失败；同沙箱读取历史截图 SHA 成功。没有更改任何沙箱/网络/写权限。
4. **原已配置**的 `rea` MCP：使用 `CodexCliProvider.buildCodexProcessEnv()` 加实际配置的 MCP 环境，经 stdio initialize→tools/list→tools/call，实际浏览器点击、DOM `clicked`、PNG 哈希核对通过；见 `mcp-probe-2/`。没有安装或新增 MCP。此证据证明配置通道可工作，**不证明一个新 QA Agent 会话已获工具并使用成功**。
5. 零模型 app-server `model/list` 成功，既有 QA 模型 `gpt-5.6-luna` 在当前账户目录中；没有换模型或做推理探测。
6. 找回原始 461 个文件的精确路径和 SHA（约 689 MB），含 QA stdout/usage/receipt、输入、截图、录像、trace、金标与未提交实验脚本。原文件留在原 run；见 `recovered-evidence-manifest.json`。
7. 从历史 trace 的真实 HTTP response body 恢复两版构建：注入版 `51236c30…db338`，已由上一轮控制器修复版 `63a645bb…28d`。完整 SHA 与来源资源见 `historical-repair-recovery.json`，差异仅派生 CSS，见 `historical-repair.diff`。该恢复不是新修改/构建，也不是新自主修复。注意旧 `browser-before-fix.mjs` 和当前 driver 字节相同，不能用它们声称拥有原 driver 红绿源码差异。
8. 在原 run 的新证据目录追加 **12 次真实普通触控会话**，每次保存连续视频、trace、输入 UTC/相对时间、截图 SHA、控制台/页面错误和构建 SHA。8 次到达完成结算：注入版 4/4 重玩无效，旧修复版 4/4 重玩恢复并接受新输入；另 4 次单跳落地未触发失败，明确 BLOCKED。第二次采用已存在历史 slow 输入策略的 1,100 ms 间隔，不把任何固定节奏当作游戏规则。页面错误 0。主控实际检查了两尺寸下的重玩前后像素。**全部是控制器证据，绝不计入盲 QA 或自主修复成功。**

游戏只读目标：`/Users/kker/.codex/worktrees/factory-pr77-production/妖怪夜市/runs/eval-20261027-slice/workspace`。
新录像/trace：该 run 的 `qa/normal-validation-20261027-0918/` 和 `qa/spaced-validation-20261027-0921/`。逐文件 SHA 见 `natural-evidence-manifest.json`。没有向公开仓库复制第三方参考录像或生成游戏源码。

`triage.json` / `reproduction-matrix.json` 已通过现有 Zod schemas；没有增加工厂 artifact schema、Agent、Gate、生产依赖或工厂流程。两个 TypeScript 文件是本次实际执行诊断的源码，不是新的生产执行通道；它们通过显式 strict typecheck 和 lint。

## 复现诊断（不调用模型）

```sh
pnpm factory qa-preflight
pnpm exec tsx docs/upgrades/20261027-real-agent-qa-validation/probe-configured-mcp.ts /Users/kker/.npm-global/bin/rea /absolute/new-probe-output
pnpm exec tsx docs/upgrades/20261027-real-agent-qa-validation/capture-natural.ts /absolute/original/eval-20261027-slice unique-new-capture red2-r4-390 green-r4-390
CAPTURE_INTENT=spaced-flips pnpm exec tsx docs/upgrades/20261027-real-agent-qa-validation/capture-natural.ts /absolute/original/eval-20261027-slice another-new-capture red2-r4-390 green-r4-390
```

所有输出目录必须新建，重复运行不会覆盖历史证据。主控预先知道金标，不能担任该样本的独立盲审者。未来独立 QA 只能收到去掉版本身份/金标/控制器结论的冻结媒体与输入时间，不应收到本目录或恢复脚本。

## 具体阻断与下一授权节点

当前用户要求未给出本轮 Agent 次数、累计时间和 Token 观测停止线；已提问，未把旧 run 的 120,000 额度或账户余量当作本轮授权。**在此停止新的模型执行。** 延迟遥测不能提供硬 Token/货币上限。

授权后仍需真实独立 QA 工具/媒体观察、盲检评分，再仅对其独立发现的问题启动 Fixer，随后由独立 QA 复测。当前还缺新自然失败结算分支、完整独立感知验收、冻结游戏的确定性玩法回归与三端平台包证据。没有通过游戏质量、正式 FIX 或发行验收。
