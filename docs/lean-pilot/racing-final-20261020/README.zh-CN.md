# 极速飞驰最终修复与验收交付

**结论：代码修正、同包浏览器验收和交付包已完成；产品/平台发布状态仍为 `BLOCKED`，不能提审。** 没有把未完成的真人难度、实机、资源授权或真实广告验证写成通过，也没有完成正式 FIX/RELEASE 闭环。

唯一候选：`racing-web-qa-20261020.1`，分支 `chatgpt/racing-unified-20261018`，[统一 PR #68](https://github.com/23chen990/ai-mini-game-factory/pull/68)。运行时代码固定到 `042c21168f0ac433b721e7b95b01d2bcbfce64e1`；其后的本目录证据提交不改变运行时输入。最终 Git 提交及对应 CI 见 PR 最新交付评论/草稿发行说明。

|状态|结果|
|---|---|
|可运行浏览器包|已生成并验收下列限定范围|
|WEB_RC 产品验收|**BLOCKED**：竞争压力/自然高关卡/视觉与真人验收未闭环|
|PLATFORM_RC|**NOT_BUILT**：仅有通过本地结构预检的 H5 staging ZIP，不是正式平台候选|
|READY_TO_SUBMIT|**false**|
|路线|formal-fixer，保留原 attempt 13 历史，本次实际修正 attempt 14、15、16|

## 下载与哈希

可运行 ZIP/单文件 HTML 和完整证据包上传到本仓库草稿交付；GitHub 登录后可从 PR 交付评论进入。草稿不是公开商业发布。ZIP 解压后在其目录运行 `python3 -m http.server 4173 --bind 127.0.0.1`，浏览器访问 `http://127.0.0.1:4173/`。不要混用不同端口/网址后声称存档丢失；本地持久化以来源隔离。

- `racing-web-qa-20261020.1.zip`：8,380,623 字节，SHA-256 `bef79e3ae40631fec6dce8c4770346ab190d426db28503320bd2cb4e232ee77a`。
- `taptap-h5-staging-20261020.1.zip`：8,380,815 字节，SHA-256 `208e94eb74728dd7eb2340d1baaec5fa712d7b55b14f5bf2c043afe01afbb4b6`。只有单一游戏目录包装不同，内部运行时文件相同；**不是 PLATFORM_RC**。
- 同内容独立 HTML：SHA-256 `c8d9077d0bee73af9d27e1a100130ea728c6178aced3648f05731fe2ed15ff8f`。
- 默认分离资源 `index.html` SHA-256 及 ZIP 每文件清单见 `evidence/delivery-manifest.json`、`evidence/provenance.json`。
- 构建指纹 `40cf9871719d1154d7d855a805f157f5c00a88b23d6700f90c119717772c7542`；输入指纹 `8e09f4831d99d7ab35af02394e360b1f20429142dde8b8ae18578d84bed9efd5`。
- 官方 CLI 最终 ZIP 预检：8 项、唯一 `jisu-feichi/` 根目录、0 violations、0 warnings；不是后台绑定、实机验收或审核通过。

## 实际落地的修正

1. 物理 AI 不再在获得加速带/小喷/氮气后按未加速 vmax 主动刹掉奖励。仍由同一个 PlayerCar 更新速度、轨迹、碰撞和终点；没有改坐标、名次、进度、赛车物理参数或按玩家领先度追赶。
2. 激励广告超时后隔离没有请求关联 ID 的旧单例，避免旧视频迟到关闭错误授予第二次请求；此页该 provider 需刷新后重新初始化。基础免费游戏不受影响。
3. 加载阶段的旧关闭事件不发奖；show Promise 必须成功，期间同步到达的第一条关闭结果才可结算；show 失败即使先收到 isEnded 也不发奖。保留取消、重复点击/回调、异常、超时与存储失败测试。
4. 修正 TapTap H5 横屏数值 0 的 readiness 兼容，仍要求真实权限元数据；不填写假 App ID/广告位。
5. 车/车漆/关卡解锁补充本机边界，暂停设置说明同浏览器同网址持久化、清除数据丢失、不支持跨设备恢复。
6. 比对本机暖构建和 CI 冷构建时发现兼容桥副本过时；修正构建器每次同步该副本，加入幂等/冻结测试不变的 RED→GREEN 测试。没有重写冻结验收文件。最终 8 个运行时文件逐字节匹配冷构建；测试仍完整保留执行，只不装入玩家 ZIP。

只改 10 个源/测试文件，复用现有构建器和适配器；没有重做 30 关、替换 6 车、引入依赖、恢复双键/练习模式或新增工厂 Agent/Gate。额外上下文只传给三个范围明确的只读审计任务，主线程验收其 Zod 输出；原始审计和修正说明保留在 `worker-acceptance.json`。未向审计任务传输整段会话或其他游戏文件；完整录像、无关历史和平台私有账户响应不进入修复上下文。

## 验收事实与边界

- 最终生成源测试 **420/420**，0 skip；构建器 **28/28**；原生玩家物理 **12/12**；30 个实际 Track 构造、150 名物理对手均正常完赛。10 条近道都有真实入口/出口通过记录，没有强制投影/跳进度。逐关宽度、高差、弯道、加速带、道具位置和 AI 耗时见 `COURSES.zh-CN.md`，不是仅比路线哈希。
- 相同固定种子下，30 关第三名 AI 完赛时间均比起始版本改善，改善约 0.26–5.30 秒。第 1 关最快 AI 131.392→128.000 秒。**这不是玩家胜率，也不等于难度合格。** 两个原生转向/刹车利用率实验对首关各只改善约 1 秒。第三个“取消曲率预刹车”实验虽把首关最快缩到 119.575 秒，但 150 辆车的撞墙事件从 5 增至 525、漂移从 2934 次降到 86 次、小喷从 1608 次降到 41 次。没有把这种更快但横冲直撞的策略塞进发行候选；三次实验及拒绝理由见 `evidence/ai-experiments.json`。需要更好的线路/制动策略，不能宣称只需真人确认就已解决代码问题。
- 最终构建自然可见操作覆盖 **01–12 关**，均使用基础车、正常可信触摸与真实赚取的同源存档，均以第 1 名完成；第 1 关 119.88 秒并正常重玩，第 10 关 196.21 秒、第 12 关 133.12 秒且均实际完成 2/2 次近道。第 6 关记录到 1 次自然道具拾取。第 5/8/10 关有真实失位再追回，不是改排名或进度。13–30 关仍没有自然验收。
- 这 12 局均 **0 有效漂移 / 0 小喷 / 0 氮气**，每局 8–32 次碰撞，仍然获胜。这是 AI 压力不足的直接证据，不把自动驾驶结果叫真人胜率，也不能因完整完赛就宣布体验合格。短程可信多点触摸另外观察到了真实漂移与反打，不把“按过按钮”当成功使用资源。
- 第 10、12 关后，真实存档油量耗尽，现有脚本的 45 秒“开始按钮可用”等待超时；不是第 10/12 关失败或游戏卡死。没有改油量、时钟或等待阈值来造通过。第 10 关后经过真实时间恢复，使用原样存档已继续完成 11、12；耗尽后无广告恢复的独立证据见 `evidence/fuel-recovery.json`。高关卡与长周期续玩仍保持未验收。
- 另一个无方向操作的正常比赛得到 0 星，并从实际按钮重玩。前一构建 attempt15 的第 4 关真实落败及首次探针失败原样保留；最终 16 的通过不覆盖旧失败，也不把自然随机/输入时序差异归功于只改兼容构建副本的 attempt16。原始触摸轨迹、截图、录像和失败记录都在验收证据包。
- 6 车 × 3 横屏尺寸，以及竖屏基础车，共 **19** 个实际首页截图。原模型轮毂/烘焙高光与低面数环境仍有风格差异；没有用特效掩盖，也没有为赶版本冒险切割重制合并车轮。五款导入 GLB 的车轮仍是静态源网格，只有基础车有独立轮组。
- 可信触摸事件验证：左漂→紧急右反打（实际 steer 约 +0.998→−0.997，漂移结束）→释放归零；多指暂停、横竖屏暂停/恢复通过。自动化窗口切页没有产生 hidden/blur 事件，**真实系统后台恢复未通过该观察方法验证**，不能把无事件当成功。该首次失败/诊断保留。
- SDK 替身下，超时、迟到单例、取消、完成、刷新恢复、加载期旧回调、show 失败共 7 个界面场景通过；真实广告和真实收入 **NOT_RUN**。相邻关卡、补给、储存失败等工程套件见同构建 CI 工件，注入结算的结果明确属于工程而非自然失败证据。

### 设备与性能

本机 Apple M1 Pro/macOS；Chromium **151.0.7922.34** / Metal 与 macOS WebKit **26.5**。不是 Android/iPhone 真机。表中是本机局域进程加载和 5 秒 rAF 样本，不代表手机、网络首包或持续热机表现。

|环境|视口/画质|首次可操作|p50/p95 帧间隔|渲染比例|
|---|---|---:|---|---|
|桌面 Chromium|1366×768 / mid|2436 ms|8.3 / 9.2 ms|1|
|触控模拟 Chromium|844×390 / low|1304 ms|8.3 / 9.2 ms|1|
|小横屏 Chromium|667×375 / low|1915 ms|未单独持续采样|1|
|macOS WebKit 触摸视口|844×390 / low|未记录独立首载|33 / 39 ms|1|

触摸帧样本 JS heap 约 82.5 MB、桌面约 140.6 MB；不含完整 GPU/进程峰值。采样时另有自然驾驶任务运行，WebKit 该次仅约 30 fps，不能挑用先前约 60 fps 的记录冒充最终结果，也不能据此推断 iPhone 性能。所有上述渲染缓冲保持视口分辨率，没有靠降到极低像素比例宣称画质达标。

### 全库门禁没有隐瞒

`pnpm typecheck` 通过；赛车/H5 及新验收脚本定向 lint 通过。`pnpm lint` 仍有 **58** 个错误，均在两份未修改的历史 high-quality 探针；`pnpm test` 的 Vitest 错收 63 个 node:test 文件，另有 1 个未修改的过期日期 waiver 断言失败。保留原始失败，不改历史证据或工厂其他模块来制造全绿。赛车独立 CI 的通过范围不能替代全库通过。

运行时代码提交 042c2116 的三条 CI 均已通过：[赛车构建/浏览器](https://github.com/23chen990/ai-mini-game-factory/actions/runs/39384825010)、[独立冷启动](https://github.com/23chen990/ai-mini-game-factory/actions/runs/39384824937)、[Lean Pilot](https://github.com/23chen990/ai-mini-game-factory/actions/runs/39384824969)。最后证据提交的 CI 会另做同包哈希核验并随交付附上，不能用本段冒充那个提交的运行结果。解压最终玩家 ZIP 后也实际执行了 Chromium 驾驶、7 个广告界面场景和 WebKit 启动检查，见 `evidence/package-*.json`。

既有 raw.githack 预览入口本次 HTTP 实测返回 **403**（`evidence/preview-http.txt`），即使预览分支内容/哈希已更新，也不把它报告为当前可访问的试玩网址。使用交付 ZIP 本地启动；没有绕过站点限制或声称已部署新域名。

## 合并与上架

PR #68 仍基于 V10 分支，**未合入 main**；直接 retarget 会带入 781 文件的历史差异。文本试合并无冲突不等于范围安全，完整链和保留/回退实验见 `MERGE-PLAN.zh-CN.md`。

TapTap 优先走 DOM/WebGL H5 通道，而非无 DOM 的 Tap 小游戏 VM。已登录账户没有可无歧义绑定的《极速飞驰》条目；没有擅用别的草稿。H5 SDK/广告位/应用后台约束、权利链、资质和实机均未齐备；`platform.json` 保持 PENDING。**浏览器 ZIP 和本地预检 staging ZIP 均不是正式提审包。**

一次性人工清单、源代码/六车许可和平台来源见 `PLATFORM-AND-RIGHTS.zh-CN.md`。真实玩家步骤见 `HUMAN-ACCEPTANCE.zh-CN.md`。图标、封面插画草案和原始浏览器运行截图在 `materials/`；隐私与商店文案草案已经准备，但没有把缺主体/SDK信息的草案当成合规上线材料。

## 复现

在此分支安装锁定依赖；获取已固定的上游 revision（权限仅限已有授权范围），通过现有 `tools/lean-pilot/racing-mobile-build.mjs` 构建。不要在别的游戏 workspace 运行本轮脚本。

```sh
pnpm install --frozen-lockfile --ignore-scripts
H5_PINNED_SOURCE_ROOT=/absolute/path/to/pinned-source node tools/lean-pilot/racing-mobile-build.mjs
RACE_NATIVE_PROJECT="$PWD/runs/h5-qq-mobile-20261013/workspace/source/qq-speed" node --test --test-isolation=none templates/web-lite/h5-source-mobile-v1/tests/*.test.mjs
node tools/lean-pilot/racing-geometry-audit.mjs
node tools/lean-pilot/racing-ai-pace-audit.mjs
node tools/lean-pilot/racing-native-player-qa.mjs
RACE_QA_STAGES=1 RACE_QA_VIDEO=1 RACE_QA_LABEL=human-review-new-evidence node tools/lean-pilot/racing-career-qa.mjs
node docs/lean-pilot/racing-final-20261020/browser-checks.mjs touch
node docs/lean-pilot/racing-final-20261020/browser-checks.mjs ads
```

重跑写新标签并保留旧失败。`qa-final.json`、`player-acceptance-gate.json` 和 `reproduction-matrix-final.json` 已按现有 Zod Schema 验证，整体 false/BLOCKED 不因部分通过而被覆盖。
