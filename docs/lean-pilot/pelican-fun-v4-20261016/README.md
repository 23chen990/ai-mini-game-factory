# PR19 鹈鹕 V4 修复与复测

仅处理鹈鹕海岸冒险 `runs/pelican-coast-v2-20261014/workspace`；从 `5a5b4fa1484345991e33003610e6af1443ed5415` 接手，PR16 基线保持 `5e7590558149a198ae67c82397db97600285a970`。路由为 `formal-fixer`，沿用现有适配器、源码授权、构建器和 QA 机制，无新增运行时依赖或素材。

保留首关十处危险及原四障碍的 ID/距离。将首辆新增车 118→130m，给行人碰撞后留下可避让时间；用共享的行人到达位置判断恢复 75m 左跳障的安全奖励鱼。复活请求校验局对象与代次，重复/旧请求不能发放；官方广告缺失时立即结算一次、禁用复活且可免费重开。未来真实广告完成后先停在继续界面，再开始保护，清除残留转向，禁止无敌擦车刷分。普通竖屏的三星进度与位置指示移到顶部仪表区；冲刺/保护使用低成本 UI 状态，无新增渲染通道。

`triage-intake.json`、`reproduction-matrix-intake.json` 是接手与复现时的历史记录，不能当作最终通过报告。`attempt23-perceptual-review.json` 保留独立审查的 BLOCKED，后续必须在新构建重审。原始失败、动作、截图、视频与最终报告均保存在同一 run 的 attempts 中；CI 上传当前 SHA 绑定的收据和所有浏览器证据。最终结果以 PR19 最新 SHA 的 CI 与 PR 说明中的确切报告为准。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run pilot:pelican:test
pnpm lint
pnpm typecheck
# H5_PINNED_SOURCE_ROOT 必须是已授权的固定源码 revision 54adc1fb64155f9dd7c1c90ecae7b8185ac540b8
H5_PINNED_SOURCE_ROOT=/path/to/pinned-source node tools/lean-pilot/pelican-v2/prepare.mjs
REPAIR_HYPOTHESIS='explicit evidence-backed hypothesis' node tools/lean-pilot/pelican-v2/build.mjs
# 两个引擎均执行；同一机器串行运行浏览器 QA。
QA_ENGINE=chromium node tools/lean-pilot/pelican-v2/qa.mjs campaign
QA_ENGINE=chromium node tools/lean-pilot/pelican-v2/risk-qa.mjs
QA_ENGINE=chromium node tools/lean-pilot/pelican-v2/experience-qa.mjs
QA_ENGINE=chromium node tools/lean-pilot/pelican-v2/v4-qa.mjs
QA_ENGINE=chromium node tools/lean-pilot/pelican-v2/qa.mjs collisions
# 独立新存档的小屏/横屏首关回归不伪装成五关报告。
QA_ENGINE=chromium QA_RISK_VIEWPORT=360x740 QA_RISK_FIRST_ONLY=1 node tools/lean-pilot/pelican-v2/risk-qa.mjs
QA_ENGINE=chromium QA_RISK_VIEWPORT=844x390 QA_RISK_FIRST_ONLY=1 node tools/lean-pilot/pelican-v2/risk-qa.mjs
# 将 chromium 替换为 webkit，重复以上检查。
node tools/lean-pilot/pelican-v2/lifecycle-qa.mjs
```

154 项专项 Node 测试、lint 与 typecheck 已通过候选代码。仓库总 `pnpm test` 并非全绿：18 个失败文件中，17 个为 Vitest 误收集原生 node:test，另有 `tests/unit/unknown-waiver-binding.test.ts` 的既有断言；共 974/975 个断言通过。代表性失败在原始 `5a5b4fa` 的隔离 checkout 重现，共享工厂文件未改。新版浏览器、三星、视觉和 CI 结果仍须真实执行，不引用 PR16 或前次哈希充当证据。

工程测试可证明触发/通关/边界，不能证明真人觉得好玩。真实广告、实体手机、原生平台包与真人复玩意愿保持待验收。广告接入条件和清单见 [TAPTAP_REWARDED_ADS.md](./TAPTAP_REWARDED_ADS.md)。不合并、部署或发布。
