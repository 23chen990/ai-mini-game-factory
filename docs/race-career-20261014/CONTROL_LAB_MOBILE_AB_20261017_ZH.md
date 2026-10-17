# 《极速飞驰》手机方向控制 A/B/C 内部实验｜2026-10-17

## 先说结论边界
**本目录只允许内部 QA 试玩，尚未选择正式操作方案。** 真实玩家已明确反馈旧手机版“不灵敏，电脑更好玩”，故不应该把现有轮盘的 CI 全绿当成体验过关。

- **A「方向按键」**：参考《QQ飞车手游》推荐的单侧方向键和《GRID Autosport》Arrow Touch。左侧区域左右半区分别给立即、离散的左/右方向输入；它**不是正式版恢复旧双键模式**，只是内部对照。
- **B「旋转方向盘」**：参考 Feral Interactive 官方 FAQ 的 Wheel Touch，按着圆环沿角度旋转才会转向，方向盘可见转动。它**不是**目前圆形底图+横向滑动的浮动轮盘。
- **C「现有浮动轮盘」**：保持 V6.3 已完成的触摸边缘按下、中央相对拖动、反打修复，作为控制组。

竞品来源：
- GRID Autosport 官方介绍：https://www.feralinteractive.com/en/faqs/gridautosport/latest/ios/
- GRID 操控与优化：https://www.feralinteractive.com/en/games/gridautosport/android-ios/features/
- QQ 飞车手游控制方式和自定义图示：https://www.biubiu001.com/qqfc/32377.html

本项目只是**按交互原理独立实现用于实验**，不是竞品客户端逐帧逆向；不复制其代码、按钮素材或商标。

## 内部入口（只允许使用经 CI 核实的准确预览 SHA）
分支：`feat/racing-v62-controls-qa-20261017`，草稿 PR 和真实 WebGL CI 通过后才允许打开：
- A 方向按键：`https://raw.githack.com/23chen990/ai-mini-game-factory/preview/racing-control-lab-v1-20261017/index.html?racing_qa_control=arrows`
- B 旋转方向盘：`https://raw.githack.com/23chen990/ai-mini-game-factory/preview/racing-control-lab-v1-20261017/index.html?racing_qa_control=wheel`
- C 浮动轮盘：`https://raw.githack.com/23chen990/ai-mini-game-factory/preview/racing-control-lab-v1-20261017/index.html?racing_qa_control=float`

**强制版本核验**：检查同目录 `PREVIEW_PROVENANCE.txt` 的 `SOURCE_COMMIT` 与本 PR HEAD 一致，再读取 `BUILD_SHA256`/`HTML_SHA256`。未通过时链接可能仍是旧版，不能交给体验者。

URL 参数只有明确的 `arrows/wheel/float` 并在 localhost/127.0.0.1/raw.githack.com 上才有效；非 QA 地址或不加参数时，继续使用原版唯一轮盘。进入 QA 时游戏内出现「内部操控对照」小标签、对照模式写进用户主动导出的本地 JSON，**没有面向玩家的操作切换设置**。

## 有效测试方式
- **共用同一个完整原生 Three.js H5 赛车**；相同赛道、车速系统、AI、碰撞、漂移、小喷、氮气、道具、油量与难度。不修改原生车辆物理、不启用自动转向、自动刹车、自动漂移或赛道吸附。
- 每个测试者使用同一台手机和同一横屏浏览器，固定为「流畅画质」+默认灵敏度；先在第 01 关 60–90 秒熟悉每种操控，不解释具体手指路径，只提示「左手控制方向，右手漂移/小喷」。
- 为控制熟练度的影响，至少 6 名测试者按六种顺序轮换：ABC、BCA、CAB、ACB、BAC、CBA；每种操控都要做同样 3 项动作，不允许一组赛道更简单。
- 三个固定任务：① 10 次直线短左→右→松开；② 同一技术 S 弯连续反打、按住右手漂移；③ 漂移出弯后小喷并尝试连贯入下一个弯。记录车身是否按预期响应、按键漏触与碰撞次数。
- 每人分别给操控可理解性、反打可靠性、漂移衔接舒适度、愿意再玩一局程度打 1–5 分，并写最多一句“最不舒服在哪里”。

## 证据字段与判定
- 成绩与碰撞：只能取游戏真实结算/本机试玩资料，不能伪造自然胜利。
- 从本机「导出数据 ↓」读 `qaControlLab.mode`、`phoneInput.directionReversals`、`inputSampleMsP95`、`frameMsP95`、`touchCancels`；不要收集手指坐标、手机号或平台用户 ID，数据由用户自愿提供。
- 指标不能混淆：`inputSampleMsP95` 只代表触控事件进入到原生 input.frame 取样的近似时延，`frameMsP95` 是 overlay RAF 帧耗时，**都不是触摸到最终显示像素的延迟**。
- 选型时优先排除**出现错误方向、反打失效、双指漏键、卡方向**的方案；若三个方案均失败，暂停继续调美术或关卡并回到输入/渲染根因。再综合玩家理解时间、同等任务成功率和主观评分选择唯一正式模式。
- 如结果接近，优先选择少解释、手机单手布局稳定的方案；绝不因为旧方案已开发就偏袒它，也不因为 UI 像 QQ 飞车就直接宣布它最好。

## 自动化仅保证技术可比
- Node 回归验证三个输入映射与原版 `ManualRaceDriver` 的 steering 连接、首次落指、反打、取消和锁定默认灵敏度。
- CI 通过同一个 H5 包，真实 Chromium WebGL 驾驶模拟跑 A/B/C 三个 URL，验证原生 `PlayerCar.steer` 的方向变化、左手控制 + 右手漂移同时操作、松手清零，并为每组保存截图与 `qa-comparison.json`。
- 这些只是**脚本控制**，不是用户真实偏好、真机 FPS 结论或驾驶乐趣证明。

## 交付规则
本实验 PR 只提交内部 QA 分支，**不合并到正式 V8**。确定唯一操控方案后再把**被选中的唯一实现**及 V6.3 手机修复一起整合进 V8；移除实验 URL、实验标签以及 A/B/C 切换代码。需要 V8 Racing/Lean CI 和真人手机复测通过，再考虑向普通玩家发链接。
