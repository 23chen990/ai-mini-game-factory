# V11.6 渲染开销修复：attempt 13

本次试玩构建为 `3a1bd6000047d8310718ca3ee39c7602b311a07eb5c2d2c08e950fee399cadf5`。2026-10-18 的本地实际桌面与触屏冷启动均通过原生产检查，桌面键盘响应也通过。新提交的远端完整检查在归档时仍为待执行，请核对 [PR #68 的 Checks](https://github.com/23chen990/ai-mini-game-factory/pull/68/checks)。当前仍是 `publishable: false` 的开发试玩。

## 为什么需要这次修复

attempt 12 的本地冷启动成功后，提交 `4746f395815ea8986d438e2dee6437b81fa76fa9` 的独立远端桌面检查仍在原 45 秒开赛门槛失败。首次观测到 low/.35 已提前到点击后首次采样起约 23.6162 秒，但之后约 21.0983 秒中，原生倒计时仅由 0.3133 推进到 1.5217 秒，未进入比赛。原 18 秒键盘断言尚未执行。原始[失败日志](evidence-v116-render-fix/previous-ci-desktop-failure.log)、[实际报告](evidence-v116-render-fix/previous-ci-desktop-report.json)和[完整冷启动收据](evidence-v116-render-fix/previous-ci-cold-summary.json)保留原字节。

同批触屏检查通过；context 任务只有诊断用途。这些结果不能代替桌面生产门槛。旧版均属于构建 `893226…`，没有改名为本次构建的运行结果。

旧版完整 main smoke 随后也在桌面开赛的同一 45 秒等待处失败。10 条燃油检查和六车型车库步骤已经通过，广告与后续比赛检查未执行。失败采样仍为 `countdown / cdT=1.7693 / raceTime=0 / low/.35 / antialias=true`，页面可见并有焦点，`jsErrors:[]`。原始[主任务日志](evidence-v116-render-fix/previous-ci-main-failure.log)、[smoke 报告](evidence-v116-render-fix/previous-ci-main-smoke.json)和[终态收据](evidence-v116-render-fix/previous-ci-main-summary.json)分别保留。

源码和实际报告共同确认：桌面渲染器在创建时启用了默认绘图缓冲的多重采样。后续降到 low、移除后期处理和降低像素比例后，这个创建时选项依然为真。高画质已有独立的四重采样离屏缓冲，因此可以单独去掉默认缓冲的这部分开销。详细证据和推断边界见[根因分析](evidence-v116-render-fix/render-rca.json)。

旧构建的同场景 no-MSAA 对照在本地约 18.029 秒进入比赛，而该构建此前的正常桌面运行约为 30.3178 秒。这是一个顺序运行的诊断对照，`productionGate:false`；只用于支持修复假设，不计入新构建验收，也不表示所有设备都有相同比例的提升。[诊断原报告](evidence-v116-render-fix/previous-no-msaa-diagnostic-report.json)

## 实际改动

产品代码只调整 `racing-mobile-build.mjs` 中既有的固定上游适配器：所有设备在原生渲染器创建时使用 `antialias:false`。设备上统一执行这项策略，没有针对自动化浏览器或软件 GPU 的分支，也没有在运行中拦截或重建 WebGL 上下文。

高画质的 `HalfFloat` 离屏缓冲继续请求 `samples:4`，保留场景渲染、泛光和输出后期处理。设备实际支持的采样上限仍由驱动决定。桌面 mid、触屏 mid、low 的既有质量策略、保存的画质偏好和主动选择保持原行为。

构建后的实际 `main.js` 与 attempt 12 对比，**唯一字节变化是 `antialias: !IS_TOUCH` 变为 `antialias: false`**。原生时钟、倒计时、输入、相机、完整场景、赛道、物理和终点逻辑均未改变。原 45 秒开赛与 18 秒键盘检查脚本也保持逐字节一致。[实际组件不变量](evidence-v116-render-fix/component-invariance.json)

测试中有一条既有构造参数断言随产品策略改为 `false`，其余原测试内容保留；另加四条针对构造参数、画质路径、离屏采样和固定源码锚点的回归。源码与测试共两文件变化，独立审查确认没有扩大范围。[Fixer 交接](evidence-v116-render-fix/fixer-handoff.json)、[独立源码审查](evidence-v116-render-fix/independent-source-review.json)

## 本次实际验证

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 构建适配、倒计时和会话源码回归 | 71/71 通过，0 跳过 | 构建 25、倒计时 27、会话 19；保留修复前 5 条失败的原始输出 |
| 实际 H5 指纹与 30 关节奏 | 2/2 通过 | 使用当前编译产物和当前输入哈希 |
| 正常桌面 Chromium 冷启动 | 通过 | 首次点击后采样到进入比赛 18.3439 秒；原 18 秒键盘加速与转向断言通过 |
| 正常触屏 Chromium 冷启动 | 通过 | 首次点击后采样到进入比赛 9.1541 秒；该原脚本不含触屏转向完整赛程 |
| CSS 显示规则 | 桌面、触屏各 12 组通过 | 三个尺寸、两类平台、竞速和道具模式 |
| 浏览器异常 | 两组均为 0 | 两次当前实际构建运行 |
| 单文件内实际高画质选择 | 通过 | 正常开始→暂停→选择“清晰”，两个实际离屏 target 请求 4 采样，保持同一原生场景、相机和上下文 |

计时起点是脚本点击后的第一次采样；ready→race 分别为桌面 18.7568 秒、触屏 10.7580 秒。原 45 秒截止时间仍从点击完成后开始计算。两份报告均为 `productionGate:true`、`experiment:null`，不是前述 no-MSAA 诊断模式。[桌面报告](evidence-v116-render-fix/desktop-report.json)、[触屏报告](evidence-v116-render-fix/touch-report.json)

当前真实默认上下文均为 `antialias:false`。持续卡顿后，既有 .35 像素预算仍会降低清晰度：桌面绘图缓冲为 478×268，触屏为 295×136，CSS 控件尺寸保持原样。这些是软件 WebGL 环境的观察，不是实体手机性能结论。[桌面截图](evidence-v116-render-fix/desktop-last-state.png)、[触屏截图](evidence-v116-render-fix/touch-last-state.png)

独立高画质检查直接加载上述 SHA-256 对应的完整单文件，通过可见按钮开始、暂停，并在可见设置中用键盘选择“清晰”。实际观察到默认上下文仍为 `antialias:false`，两个 1366×768 的 HalfFloat target 均请求 4 采样，三个后期处理步骤及泛光保留，画质正常保存；场景仍为 1,187 个对象和 6 台赛车，game/renderer/context/scene/camera 对象身份不变。设备最大采样能力为 4，未读取底层 renderbuffer 的实际分配，不能把请求值扩大为硬件采样分配结论。[完整记录](evidence-v116-render-fix/high-quality-qa.json)、[实际暂停截图](evidence-v116-render-fix/high-quality.png)

高画质检查第一次在操作界面前遇到 Chromium 对 13.3 MB 响应正文的取证缓存淘汰；这是采集器失败。原始[错误记录](evidence-v116-render-fix/high-quality-bootstrap-qa.json)和命令、日志均保留。修正只移除对 inspector 响应正文缓存的读取，改为记录服务器实际发送的原始字节哈希；没有修改游戏、浏览器参数或高画质断言，随后实际 UI 检查通过。

桌面截图中，靠近相机的对手名称“氮气小王子”仍偏大并占据下方前景。此项继续列为视觉待验收事项；本次冷启动和输入检查通过并不授予整体视觉通过。当前自然赛程、视觉、实体设备和真实广告验收状态继续分开记录。

## 构建、源码与交付身份

| 字段 | 值 |
| --- | --- |
| attempt | `13` |
| sourceCommit | `b0dfe56f171930165cb04ef9cce8773ba339d31d` |
| sourceTree | `270e584ad9234b37fd4fe15a684597ce89d2a63f` |
| buildHash | `3a1bd6000047d8310718ca3ee39c7602b311a07eb5c2d2c08e950fee399cadf5` |
| inputHash | `51c7e3422c5aee56309bc8f7b3c8579ad66d60cccd1ca5e0c7d3018506b93b8b` |
| 单文件 HTML SHA-256 | `6e5d09159c71f34517177d6eacbfaa281337b90717309051e3b6f6803041f6d1` |
| 单文件 HTML 字节数 | `13,339,105` |
| 固定上游源码 | `54adc1fb64155f9dd7c1c90ecae7b8185ac540b8` |

[构建收据](evidence-v116-render-fix/build-receipt.json)、[验证摘要](evidence-v116-render-fix/verification-summary.json)和[证据清单](evidence-v116-render-fix/manifest.json)绑定本次实际字节。交付完整性核对当前源码输入、ZIP 内实际游戏、完整单文件 HTML 和两个内嵌脚本；这与自然通关、真实设备或商业发布是不同门槛。

## 保留的地图、车型和验收边界

11 项组件比对确认原生车辆物理、AI、赛道生成、30 关几何、道具表现、六个 GLB 和车型清单与 attempt 12 一致；attempt 12 已与 attempt 11 核对相同组件。30 关、10 条物理近道和六车型的详细资料仍见[原接入与实测记录](README-v116.zh-CN.md)。历史工程运行属于其记录的构建，未冒充本次新执行。

本次自然覆盖声明为 `NOT_RUN`、空 `races`、`passed:false`，明确不是比赛完成记录。[当前缺失覆盖声明](evidence-v116-render-fix/natural-coverage-not-run.json)。旧版第 1 关的真实 DNF 原件仍在原归档；完整 30 关加每日挑战的自然合格完赛尚未通过。实体 Android、iPhone 和真实广告 SDK 仍为 `NOT_RUN`，商业发布保持阻断。

未接入真实广告 SDK 时，初始赛车可以直接参赛，五款新增车型可以预览，激励领取按钮默认隐藏。接入后只有有效完成回调且本地所有权保存成功才授予车辆；所有权保存在同一浏览器来源的本地存档中。五款导入模型保留各自材质和静态车轮表面，初始车保留独立车轮动画。
