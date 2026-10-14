# 运输船手机端敌我识别与横屏 HUD 改造（2026-10-14）

## 目标与隔离
- 仅修改工厂模板 h5-source-mobile-v1 中运输船的运行时体验；基于 PR #11，不修改其 head，不动鹈鹕/赛车的游戏业务逻辑。新 run **必须单独创建**，不要覆盖 `h5-cf-challenges-20261013` 或旧的证据与 QA 结论。
- 用户自然试玩指出**敌我不分**；源码验证 BL 阵营标签橘色、GR 阵营蓝色，即当 BL 是我方时友军呈敌对色；原生仅为友军生成始终可见名称，敌军仅在准星命中时显示阵营名。
- 原生 CSS 在手机仍叠加 #score/#radarWrap/#feed 与工厂 .mk-header/.mk-meter；触屏包含双开火控件。症状与用户反馈一致，但**尚无此次修改版本的实体真机验收**。

## 已提交的工程改动
1. 新增 `fps-mobile-ux.mjs`：BL/GR 转换成**相对玩家**的蓝色友军/红色敌人；队友标签统一「◆ 队友」，瞄准目标显示身份；仅允许在准星视场内、有效距离内且无遮挡的敌人显示小幅「▼ 敌人」，避免穿墙和全屏血条。暂停/死亡时隐藏。
2. 运输船专属 CSS 压缩头部：相对比分居中、独立任务进度、左上雷达、左下血甲、右下弹药、右侧战况；原生 #score 隐藏，避免重复。补启动引导与手机竖屏提示。
3. `main.mjs` 在运输船实际 Native Game 存在后创建 HUD，接入每局 start 和 frame，不影响其他游戏分支。
4. 修复独立 ZIP 生产链：新增脚本写入 `GAME_FILES` 与 `standaloneHtml` 内联白名单。旧 run 的 buildHash 与独立包 **不应该复用**：改了模板后必须构建新 run，再由新的 QA 生成新哈希。
5. 补 `fps-mobile-ux.test.mjs` 覆盖玩家视角阵营、穿墙、离屏、死亡、超距判断。

## 未完成／不能声称完成
- 当前仅完成**GitHub 源码提交**，没有本地原 run 文件、真机 Chromium/WebKit 浏览器和实时 REA 执行环境；未生成/核验新可试玩 ZIP，也未验证 WebGL 模型实际遮挡和手机上两手操作。**状态：Draft / QA BLOCKED**。
- 必须先运行：`node --test templates/web-lite/h5-source-mobile-v1/tests/fps-mobile-ux.test.mjs`、全部模板测试、`pnpm lint`、`pnpm typecheck`，并独立验证 `standaloneHtml` 可生成 ZIP。已有整仓 Vitest 旧缺陷不可通过降低门禁绕过。
- 下一步建议修正原版 `touch.js` 的捕获：当前 window touchstart 通过屏幕 X 比例划分移动/瞄准，按按钮会冒泡并被误捕获，且第二开火虽然视觉隐藏但其余操作按钮仍需真机验证。若在新 run 中出现，使用独立的 source fork 修复并保留回归，而不是向原作者仓库提交。
- 来源调研：Activision COD Mobile / Warzone Mobile 官方指南共同验证左手摇杆、右手视角与 HUD 自定义的必要性，Warzone Mobile 敌人轮廓只在接近准星时、不可穿墙。只借鉴机制，不复刻素材、名称、界面、平衡数值。
- REA：保留 PR #8 历史可核验报告，不能把静态源码检查谎称为此次已调用 REA。若本机 REA CLI 可用，按 `docs/lean-pilot/REA_INTEGRATION.md` 操作，任务限定为敌我标识、右手控制、首30秒与短局反馈，比对原始观察和逆向推断，所有外部代码/素材需要核查许可。

## 专项验收清单
- BL/GR 双阵营轮流作为玩家：友军统一蓝色 + ◆，敌人红色 + ▼；友军位于墙后显示与否遵循原生既有 tag 策略，敌人不可透视。
- 敌人隐藏在集装箱后、在视野外、已死亡或超距时无敌方图标；只在靠近准星且实际可见时显现；命中、未命中提示不能误认为真实战果。
- 844×390、740×360、667×375 手机横屏：中央瞄准区无遮挡；小地图、比分、任务、暂停、血量、弹药可读，操控不互相覆盖；竖屏引导明确。
- 从开始→M4命中3次/失败→结算→重玩，以及 AWM 击杀、MP5 生存、暂停/回来、换弹/切枪/开镜、设备方向切换、后台恢复、低端帧率全部按**玩家可见的自然输入**验证，模拟注入只作为辅助工程证据。
- 默认第一局难度须让新玩家能在15–30秒内找到并伤害敌人，不能把 AI 击杀充当玩家战果；失败归因、再次挑战入口要明确。
- 要进行两次真人无讲解30秒理解测试，记录敌我识别成功、首次有效命中耗时、误操作/误解按钮；保留截图/视频和 SHA，对应新 buildHash，未通过则继续 Draft。

## 2026-10-14 真实源码构建与浏览器复核补充（以此为最新结果）

- **实测范围**：独立云端临时 QA 使用固定来源 `riba2534/claude-opus-5-5-demo@54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`，完成 Three.js 源码编译、工厂冻结工程测试与 H5 模板测试（24/24）。非虚构演示、无游戏行为注入。
- **本轮真实浏览器自动化**：Chromium 软件 WebGL 触控模拟，844×390，`mobile-entry`、`mobile-controls`、`mobile-pause-resume`、`mobile-save-reload`、`mobile-terminal-replay` **5/5 流程门禁通过**，page errors 0；首屏就绪约 14.1 秒。
- **重要限制**：`mobile-controls` 只记录了真实触摸事件和截图，**没有断言成功命中**；本轮玩家击杀/命中分数是 **0**，终局为“本次挑战未完成”。因此三关成功路径、真实手机手感、两指操作、玩家敌我理解、广告和 REA 新一轮实测仍不可标记 PASS。软件渲染卡顿，也不能代表真机帧率。
- 修复迭代：首轮把 FPS 专用文件错误注册为所有候选模板的公共文件，导致非射击项目 54 项 ENOENT；已改为 `h5-source-mobile-v1` 专属 runtimeFiles，并以 candidate 版本位区分新旧 run。第一次云端实景 QA 因开始按钮尺寸不达标失败、截图揭示原生菜单重叠；已隐藏旧菜单/暂停/结算/配装蒙层且保留内部事件处理，恢复 48px 触控尺寸，再次构建与复测通过。
- 验证对应**实际构建 hash**：`8208e5903755a155ea91a5de3769fe04cb3c10c1f61b2fb698d7a825c6be419a`。试玩包 ZIP SHA-256：`ca4e21eb2df68c015fe130562d4b733c25b34a5ba56abccd06d744ec56c58e0e`；单页 HTML SHA-256：`91e4754d91ab9b99cdf93fd6d465ca33e4bcbd645d0d1ad4c4c9a98ead80937c`。
- **不可变的 GitHub Actions 证据**：[实际完整源构建/自动试玩与截图](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38521787772)，附件 `cf-transport-review-6498084fe0f9e058746857149cac6d749e746321`（Actions Artifacts 有保留期）。历史失败证据 [第一次云端试玩](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38520975457) 同样保留，未涂改。
- 临时 `.github/workflows/cf-mobile-qa.yml` 仅用于获取正式源文件及真实浏览器证据，已**从 PR 的最终净改动移除**，不调整既有 `pilot:scope` 门禁。新包仅是可供验收的 H5 候选，不是平台发行。

## 2026-10-14 V3 手机优先体验复核（最新）

**反馈驱动：** 用户最新截图指出仍像电脑版操作说明，要求无需用户亲自试玩，先由 ChatGPT 自查。V3 把隐藏旧 PC 菜单升级为真正移动端专属 UI：入口仅保留「左手摇杆移动 / 右侧滑动瞄准 / 点按或按住开火」，去掉原生键盘教程、Esc 和 R 提示、数字键切枪栏、重复开火键，简化为开火/跳/换弹/狙击时开镜；血甲离开左摇杆。暂停清除蓄积的开火、跳跃、鼠标增量和滑动数据。小队生存进度条改按存活时间上涨而不是按死亡次数。

**不可变真实源码、自然触控复核：** [GitHub Actions #38526715200](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38526715200)。执行固定上游授权源码编译、冻结工程和移动单测、Playwright Chromium 软件 WebGL；5/5 浏览器流程 PASS，0 page errors。额外验证 844×390、667×375 入口布局，手机教程可见且旧桌面菜单隐藏；火力按钮按住后 0→7 发，左手摇杆位移约 5.51m，右侧滑动偏航变化约 0.229 rad；模拟狙击挑战启动后触控开镜，scope=1。按钮均在视窗内、无重叠，重复开火/蹲/切枪不可见。QA 自然失败终局、重玩和本地最佳数据读回通过。

- 新候选 buildHash：`73e63062fe4e4298abc1108773ac2f7a260728066cacdf28814e695357d20d6e`。
- 独立 ZIP SHA-256：`404cbec37fca9d29487cb993304024753ea752795d2e703e2d74e632e086f126`。
- 独立 HTML SHA-256：`7f259db6c7fce9fa155078e20c1c786530a925cab7f38f2ba758f0c1070a5cb6`。
- 新截图：`mobile-entry.png`, `mobile-entry-667x375.png`, `mobile-controls.png`, `mobile-forward-look.png`, `mobile-sniper-controls.png`, `mobile-terminal.png`；在 Actions Artifacts 中（有保留期限）。
- 临时真实源码 QA workflow 已在测试后删除，原 `pilot:scope` 门禁不变；不可将该 Actions 成功称作用户手机实机/发布 PASS。

**仍未闭环：** 最重要的是 *首次有效命中及三种挑战自然成功*；本次任务失败，score=0。自动脚本只前进、转头和射击，没有像真人一样找敌人，0 命中不能直接证明难度失衡，但不能声称战斗成功路径已通过。完整真人首30秒敌我理解、Android/iOS 真机流畅度、跨设备画质、真实 IAA、最新 REA 实时执行同样需要单独证据。不要增加武器/大地图作为掩盖，优先让真实初学者看见敌人并完成首次命中。
