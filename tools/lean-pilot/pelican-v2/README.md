# 鹈鹕海岸冒险 v2 — PR #10 的独立源码改造

目标游戏：鹈鹕海岸冒险。唯一目标工作区：`runs/pelican-coast-v2-20261014/workspace`。默认入口：`workspace/game/index.html`。赛车、射击和旧 PR 的工作区均不修改。

使用已授权原版的 Three.js 场景、鹈鹕、自行车、骨骼/IK、骑行和海岸资源；在该项目内增加三个很小的模块：关卡配置 `runtime/levels.mjs`、可测试规则 `runtime/adventure.mjs`、原版对接与中文界面 `runtime/coast-ui.mjs`。不新增游戏引擎、后端或运行时依赖。广告适配器和奖励安全函数逐字复用 PR10。

```sh
pnpm install --frozen-lockfile --ignore-scripts
# 只读源仓库，必须是以下不可变 revision；用户已确认修改、商用和 IAA 授权。
git clone https://github.com/riba2534/claude-opus-5-5-demo /tmp/pelican-author-source
git -C /tmp/pelican-author-source checkout --detach 54adc1fb64155f9dd7c1c90ecae7b8185ac540b8
H5_PINNED_SOURCE_ROOT=/tmp/pelican-author-source node tools/lean-pilot/pelican-v2/prepare.mjs
node --test tools/lean-pilot/pelican-v2/core.node.mjs
node tools/lean-pilot/pelican-v2/capture-baseline.mjs
node tools/lean-pilot/pelican-v2/artifacts.mjs
node tools/lean-pilot/pelican-v2/build.mjs
node tools/lean-pilot/pelican-v2/qa.mjs all
node tools/lean-pilot/pelican-v2/visual-qa.mjs
node tools/lean-pilot/pelican-v2/lifecycle-qa.mjs
node tools/lean-pilot/pelican-v2/capture-comparison.mjs
node tools/lean-pilot/pelican-v2/bind-qa.mjs
node tools/lean-pilot/pelican-v2/serve.mjs 4328
```

先安装 Playwright 的 WebKit/Chromium（若本机尚无浏览器）。`all` 在一个新浏览器中顺序完成五关、碰撞和重开检查，后续检查使用前面的真实通关解锁，不导入/改写存档；另存三份分段报告及完整动作前缀。也可分别运行 `campaign` / `collisions` / `safety`。浏览器 QA、性能采样和全仓检查应串行运行，避免自动化触屏/截图在并发负载下延后。`lifecycle-qa.mjs` 会打开独立 Chromium 窗口；若宿主不发送真实焦点/可见性信号，后台验收保持 BLOCKED。

`prepare` 已完成时复用同一 run；源码从固定 preimage 派生。`build` 每次实际修改只构建一次、计一次 attempt，未改代码会明确拒绝重复构建；恢复工作直接复用 `build-receipt.json` 的成品执行 QA。失败 attempt 的文件保留在 `attempts/`。`artifacts.mjs` 是首次建档命令，复测期间不要重置已有 triage/matrix 或冻结合同。

独立 QA 按 `qa-review-workorder.json` 看过实际截图并输出通过的 `perceptual-qa-report.json` 后，运行 `node tools/lean-pilot/pelican-v2/finalize-qa.mjs` 和 `node tools/lean-pilot/pelican-v2/deliver.mjs`。后者只生成开发试玩包、对比图及证据包，不执行工厂 RELEASE，也不把真机未验收状态改为通过。交付记录在 `docs/lean-pilot/pelican-v2-20261014/`；失败原始证据继续保留。

路由为 **formal-fixer**：默认镜头、合成管线与核心关卡流程跨模块，并有已验证 QA 问题；不声称是 direct-builder 的局部修复。存储的线程与尝试号见 run 下 `repair-state.json`。故意不加载赛车/射击、PR9 非必要设计、历史 REA 日志或无来源录屏。

默认接线：`src/main.js → coast.beforeRide → adventure.advance` 处理关卡和碰撞；原版继续骑行姿态/动画；`coast.afterRide` 负责固定构图、障碍表现和 UI。原版自由演示模式、持续按键转向、随机捕鱼、旧 cameraUpdate/adaptQuality 不在默认冒险路径上；残留源定义是兼容代码，不代表仍可控制默认核心循环。旧的可写 `window.__pelican` 调试入口不进入交付包；`window.__coast` 仅返回状态与渲染统计副本。

自然验收只用 `locator.tap()` 和真实浏览器操作，策略只读取玩家可见的三车道路况/鱼提示；没有改分数、开锁存档、跳过碰撞、快进或设置通关状态。同机位基线截图是明确标记的 fixture，不用于自然通关。`bind-qa` 仅把已执行报告转换为现有 Zod natural-flow 合同，不驾驶游戏；感知通过必须来自独立 QA。

这是 H5 开发试玩。微信/抖音原生小游戏包尚未制作，TapTap H5 广告尚未接入，实体 iPhone/低端手机性能、真实后台切换及真人意愿需另行验收。不得把桌面浏览器模拟、合成事件 fixture、Draft PR 或下载包称为生产发布。
