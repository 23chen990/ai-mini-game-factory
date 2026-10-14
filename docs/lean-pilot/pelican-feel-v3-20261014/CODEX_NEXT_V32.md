# Codex 追加交接：V3.2 已补齐可在源码层完成的玩法项

请继续 GitHub Draft PR #16（分支 `chatgpt/pelican-feel-v3-20261014`），不要基于旧 `71221087` 或 PR #13 开新分支。不覆盖其他人的更新、不合并任何 PR、不发布生产。

## 不要重复策划、重写或删掉的内容

- ChatGPT 已在本分支追加 `runtime/engagement.mjs`、`runtime/engagement.node.mjs`、`runtime/engagement.integration.node.mjs`；`levels.mjs`、`adventure.mjs`、`coast-ui.mjs`、`build.mjs`、`coast.css`、核心单测和 CI 已同步适配。
- 跳障背后可见奖励金鱼、星级跳跃挑战、五关各自的主题提示、最佳捕鱼纪录、15星总目标、首分钟反馈已经有真实代码，不要再把它们当成纯 TODO，除非浏览器 QA 发现问题。
- 不要添加复杂 NPC、装饰付费商城、远程排行榜、后端或未获授权的竞品素材。

## 必须完成的独立构建与 QA

1. `node --test tools/lean-pilot/pelican-v2/core.node.mjs tools/lean-pilot/pelican-v2/runtime/{feel-safety,engagement,engagement.integration}.node.mjs`，lint、typecheck、完整 GitHub CI。发现断言不成立，要以实际实现为准定位并修复，不要绕过。
2. 固定作者源码 revision `54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`，重新跑 prepare/build，生成 V3.2 完整 H5，记录 SHA256。绝不复用旧 ZIP 的哈希。
3. WebKit 和 Chromium 真正触屏正常通关五关。额外跑第一关两条路线：跳过 x140 中车道路障→抓 x149 奖励金鱼（另有 x225→x234 的第二次机会）；提前变到侧车道安全避障→不强制拿金鱼。确认两条路线均不发生诡异死亡。
4. 录“首鱼/首金鱼/首行人/首跳障/第一关通关”五个可见节点，核对前 40 秒是否真的有清晰反馈；测试一次三星条件包含真实跳障，而不是仅按距离给满星。
5. 真机屏幕和旋转/低性能/后台恢复、真实广告未接入保持 BLOCKED，不能声称发布完成；需要真人判断 V3.2 转向/镜头是否优于 V2。
6. 最终提交新 H5 ZIP、视频、截图、QA 日志和中文交接至当前 Draft PR，不要一点一点让我反复验收。

重要：开发者要以真实画面判定奖励金鱼是否容易区分、提示是否遮挡路线。实测不佳直接修复，但保留三车道轻点操作和连续物理运动，不要退回生硬的线性横移。