# V11.6 冷启动修复：attempt 12

最新试玩构建为 `893226cc0792aaae4254b0a09fcdeb782d76efa5064f8703a810ca43eebe500d`。本页记录 2026-10-18 的本地验证检查点；新提交的远端完整检查以 [PR #68 的 Checks](https://github.com/23chen990/ai-mini-game-factory/pull/68/checks) 为准。此开发试玩继续保持 `publishable: false`。

## 解决的问题

上一提交 `99af424cf3584adc4f13fa607a837d56c1028c65` 的独立桌面冷启动，在原定 45 秒内仍停在倒计时。原始 CI 首次观测到 low/.35 已是点击后约 44.9103 秒，累计倒计时仅 1.092 秒。对应的[失败原始日志](evidence-v116-cold-fix/previous-ci-desktop-failure.log)、[完整冷启动任务结果](evidence-v116-cold-fix/previous-ci-cold-summary.json)和[分析](evidence-v116-cold-fix/previous-ci-cold-analysis.json)保留不变；同批触屏检查成功，context 任务仅用于诊断。

旧提交的主 smoke 也在独立桌面步骤等待原生倒计时结束时超过 45 秒；此前的六车型车库和 10 条燃油测试已通过，后续键盘及广告步骤尚未执行。其[原始 smoke 报告](evidence-v116-cold-fix/previous-ci-main-smoke.json)记录 `jsErrors: []`、未丢失上下文，失败采样仍为 low/.75；[主任务原始日志](evidence-v116-cold-fix/previous-ci-main-failure.log)和[最终任务收据](evidence-v116-cold-fix/previous-ci-main-summary.json)另行保留。失败后的截图诊断也曾超时，不替代原始 45 秒开赛失败。

此次只修改 `racing/session.mjs` 和其倒计时画质测试。倒计时连续出现至少四个可见长帧、累计至少四秒、平均间隔至少一秒时，可以直接采用**既有的 .35 像素比例下限**，避免每一档都重新等待四个多秒长帧。high→mid→low 的画质顺序保留，普通卡顿仍按原来的 .75→.5→.35 逐级处理。窗口尺寸变化按原生 `resize→setSize` 路径清零测量；暂停、隐藏、画质切换和异常时间采样也不会沿用旧计数。

没有改变原生渲染上下文、完整场景、相机、车辆状态、赛道几何、模拟时钟或 45 秒/18 秒测试门槛。八条新增针对性回归覆盖应急时机、渐进策略、单次尖峰、真实 resize、画质选择与比赛阶段；原十九条测试全文保留。正式修复交接和原始测试输出见[Fixer 收据](evidence-v116-cold-fix/fixer-handoff.json)。

## 这次实际运行了什么

| 检查 | 当前构建结果 | 范围 |
| --- | --- | --- |
| 倒计时、会话和构建源码回归 | 67/67 通过，0 跳过 | 27 条倒计时测试加 40 条会话/源码契约 |
| 实际 H5 指纹与 30 关节奏 | 2/2 通过 | 当前编译产物及实际路线数据 |
| 桌面完整 Chromium 冷启动 | 通过 | 首次点击后观测至比赛 30.3178 秒；键盘加速与转向通过原 18 秒断言 |
| 触屏完整 Chromium 冷启动 | 通过 | 首次点击后观测至比赛 10.1763 秒；原脚本没有触屏转向完整赛程 |
| CSS 显示规则 | 桌面和触屏各 12 组通过 | 三个尺寸、两类平台、竞速/道具模式 |
| 浏览器错误 | 两组均 0 | 当前两次实际启动 |
| 独立源码与证据复核 | [本地冷启动范围通过](evidence-v116-cold-fix/independent-qa.json) | 0 阻断项，保留 1 项视觉观察 |

上表的计时起点是脚本在点击后第一次采样，并非浏览器加载起点；ready→race 分别为 30.8208 秒和 10.9908 秒。原测试仍使用点击完成后开始的 45 秒截止时间。不同机器/运行的帧耗时不可直接作为同环境性能提升比例。

实际[桌面报告](evidence-v116-cold-fix/desktop-report.json)、[桌面截图](evidence-v116-cold-fix/desktop-last-state.png)、[触屏报告](evidence-v116-cold-fix/touch-report.json)和[触屏截图](evidence-v116-cold-fix/touch-last-state.png)均绑定当前 buildHash。软件 WebGL 降到 .35 时，桌面绘图缓冲为 478×268、触屏为 295×136；HUD 和触屏控件仍按原 CSS 尺寸显示，3D 场景清晰度会降低。这不是实体手机性能结论。桌面最后一张截图中，靠近相机的对手名字偏大，与底部集气条有交叠；已记录为视觉待验收事项，冷启动与键盘断言的结论不因此扩大为整体视觉通过。

## 构建与交付身份

| 字段 | 值 |
| --- | --- |
| attempt | `12` |
| sourceCommit | `1c68aa89607875406995a896101214a283bccfb6` |
| sourceTree | `93774f8a63f68d5816efb74ce258f5cb82c8c0ae` |
| buildHash | `893226cc0792aaae4254b0a09fcdeb782d76efa5064f8703a810ca43eebe500d` |
| inputHash | `e62b6b6114767a01ec1bee5985801a657bbebc7ed89a94c2127e6af27fc7da10` |
| 单文件 HTML SHA-256 | `cfffc0ca59989d6dd21325c8dd6168b4861cc6965a65dcfc9ede44d3722d9329` |
| 单文件 HTML 字节数 | `13,339,106` |
| 固定上游源码 | `54adc1fb64155f9dd7c1c90ecae7b8185ac540b8` |

[构建收据](evidence-v116-cold-fix/build-receipt.json)、[验证摘要](evidence-v116-cold-fix/verification-summary.json)和[证据清单](evidence-v116-cold-fix/manifest.json)记录各文件哈希。交付检查验证当前源码输入、实际游戏文件、ZIP 内容、HTML 字节和两个内嵌脚本；该完整性通过与自然完赛、实体手机、真实广告验收是不同结论。归档时远端完整工程检查尚在等待，因此交付清单中的工程门槛也保留 BLOCKED；最终远端结果查看对应提交的 PR Checks。

## 地图、车型与未完成验收

[十一项组件不变量](evidence-v116-cold-fix/component-invariance.json)确认：原生车辆物理、AI、赛道生成、30 关几何、道具表现、六个 GLB 和车型清单与 attempt 11 完全一致。30 关和 10 条物理近道、六车型车库及激励领取的详细说明仍见[attempt 11 归档](README-v116.zh-CN.md)。那一版的 150 台 AI 完赛、车库、完整 smoke、激励回调和自然比赛日志继续归属于 `c606…`；未把它们改名为本次新执行结果。

当前自然赛程覆盖声明明确为 `NOT_RUN`、空 races、`passed: false`；这是一份[缺失覆盖声明](evidence-v116-cold-fix/natural-coverage-not-run.json)，不冒充比赛记录。旧版本真实第一关 DNF 的原始证据仍在 `evidence-v116/natural-journey.json`。30 关加每日挑战的自然合格完赛、实体 Android/iPhone、真实广告 SDK 与商业发布验收仍未通过。

未配置真实广告 SDK 时，初始车可参赛，五款新增车可预览；正式激励领取按钮默认隐藏。真实 SDK 接入后，只有完整完成回调且本地保存成功才拥有车辆；车辆所有权保存在同一浏览器来源的本地存档中。五款导入模型保留原材质和静态车轮表面，未声称具有独立车轮动画。
