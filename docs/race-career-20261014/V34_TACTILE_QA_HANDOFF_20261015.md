# 双键飞驰 V3.4 追加复核与 Codex 交接｜2026-10-15

分支：`feat/racing-v31-tracks-items-recovery-20261014`，Draft PR #18。不得合并、部署、公开发行。本文只记录本轮针对性风险，不覆盖已有 V3/V3.4 QA。

## 这轮由 ChatGPT 直接处理

1. **双指重叠时操作抵消**：原 TouchSteering 对同时按下的左右键输出 `left:true,right:true`，RaceDriver 的方向差归零；改为后按的手指优先，松开后若另一指仍按着则恢复其方向。仅翻译触摸边沿，不修改物理、速度、坐标或自动转向。
2. **误触和手指丢失**：原 `pointercancel` 清掉所有手指（多点触摸的另一指也断开）；改为只取消目标指针。短按 80ms 补偿仅限正常 `pointerup`，浏览器后续 `lostpointercapture` 不吞掉已发出的合法短按。
3. **淘汰赛 HUD 位置冲突**：第 12 关 `#race-knockout` 和 `#race-speed` 同处左上 100px 一带；只在 `elimination` 阶段将速度徽章下移，保留末位淘汰紧迫反馈。
4. **三圈 Boss 数据遗漏**：第 13/16 关都跑三圈，既有 `ai-pace-v33.json` 和 `native-player-pace-v34.json` 以两圈为基线。新增独立 `bossThreeLaps` 三圈原生 AI 和原生 PlayerCar（带地图内部信息的合成控制器）对照，保留旧两圈数据不破坏历史比较。结果仅作为难度风险信号，不代表真人胜率。

新增 `racing-touch-steering.test.mjs` 涵盖双指重叠、同键多指、反向快切、合法短按、取消、HUD 状态。CI 要同时通过规则测试、lint/typecheck、真实 H5 build 和 Chromium WebGL 冒烟，并保存新 build hash；旧构建的绿灯不能移用。

## 仍不能冒充已完成

- **ACTION_FEEL 真人体验 NOT_RUN**：用可见游戏画面、真实双拇指输入，四图各完整自然驾驶，尤其城市连续 S、海湾坡道、雪地高架，观察后按优先是否改善换向且不会使车突然甩尾。不要靠读取地图中心线合成完赛。
- **16 关与每日挑战正常游玩 NOT_RUN**：失败必须保留录屏、按键/时速/弯道/碰撞/排名/目标 trace。重点第 07 限时、第 12 淘汰、第 13/16 三圈 Boss；不得降目标、偷改排名或直接授星。
- **Android/iPhone 真机 NOT_RUN**：包含双指跨按钮、系统触摸中断、横屏安全区域、触控延迟与帧率、发热、音频、暂停与后台恢复、低端设备。
- **正式商业准入 BLOCKED**：TapTap LIVE IAA 的应用资质和正式 placement ID；固定上游几何/视觉资产的合法商用再分发许可。CI 和程序化重绘不构成授权。

### Codex 只处理新增确凿失败

从当前 PR #18 HEAD 开始，不重写赛车引擎、不迁回 #17、不重新做 V3.4 已完成项。先核对新 CI 与 `bossThreeLaps` 原始 JSON，再用正常触摸录屏定位失败；仅对失败案例做最小修复、复测，提交同一 Draft PR。禁止合并、部署、发布，广告和资产许可不明时保持发布门禁关闭。
