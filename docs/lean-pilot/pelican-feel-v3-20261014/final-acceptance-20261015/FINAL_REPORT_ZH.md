# 《鹈鹕海岸冒险》最终技术验收与手机试玩交接

**可以开始小范围内部真人试玩；尚不满足正式发布条件。** 手机实际操作与主观体验由你完成；本轮没有声称真机、锁屏或真人盲测已经通过，也没有以自动化绿灯代替“好玩”。

验收日期：2026-10-15（北京时间）。目标游戏唯一运行区：`/Users/kker/.codex/worktrees/pelican-final-acceptance/妖怪夜市/runs/pelican-coast-v2-20261014/workspace`。工作分支：`chatgpt/pelican-feel-v3-20261014`；[PR #16](https://github.com/23chen990/ai-mini-game-factory/pull/16)。本次游戏源码与构建基准：`26e1e0c65894babf674710af256268be6009aed1`。最终交付提交及最新对应 CI 链接见 PR 顶部的本轮验收记录和本次最终回复。

## 现在怎么用手机打开

手机和 Mac 在同一可互访 Wi-Fi，Mac 保持运行，打开 [手机试玩入口](http://172.16.133.209:4328/game/index.html)。备用 `http://kkerdeMacBook-Pro.local:4328/game/index.html`。服务器监听 `0.0.0.0:4328`；Mac 已通过该局域网地址取得与 CI 哈希一致的游戏。**手机是否能穿过所在网络的设备隔离仍为 NOT_RUN。**

先自由玩三局，再试快速反向、跳跃配合转向、横竖屏、暂停、切 App/锁屏返回和刷新。反馈“设备/系统/浏览器、哪里不顺、当时操作、是否想重玩”，有问题附截图或录屏即可。完整最简说明：[PHONE_TEST_ZH.md](PHONE_TEST_ZH.md)。不需要先连接调试线、开通平台账号或部署公网。

## 实际检查和变更范围

- 开始时已检查远程分支，仍是交接的 `26e1e0c`；原目录是其他工厂分支，因此建立隔离验收工作树。没有回退游戏、覆盖其他小游戏或改动原目录现有文件。
- 从成功的工厂 CI 下载实际试玩包，核对 CI 原始 hashes.txt、两引擎原始五关报告、HTML 内嵌构建身份。**原样复用 H5；未本地重建、未更换 Three.js、未改规则、存档、平台适配、工厂流程或修复次数。**
- 新增内容仅位于本目录：验收脚本、Zod 验证的 triage/复现矩阵、报告、证据、手机说明和空白盲测表。没有生成游戏修复补丁，未进入新 formal FIX；不把 QA 脚本修正说成游戏修复。
- 启动默认 HTTP 路径，从干净存档用正常可信触摸验证：开始、真实捕鱼/连击、连续自由横移、长按、快速反向、31px 非整数位置拖动、取消手势、上滑跳跃配合转向、暂停/继续、真实失败、结算、重玩、下一关、刷新保存、320×568 与横屏布局。
- 额外用已有 QA 驱动在本机连续自然通完五关，记录各关画面和帧时。工程故障注入单独验证 WebGL context lost/restored，不用它冒充自然后台或手机证据。

默认运行入口是成品 `workspace/game/index.html`。其构建接线为固定授权源 `src/main.js` → `coast.beforeRide` → `adventure.advance`，原生鹈鹕/自行车姿态动画继续运行；`coast.afterRide` 负责镜头、表现与 UI。相应仓库输入在 `tools/lean-pilot/pelican-v2/runtime/` 的 `coast-ui.mjs`、`adventure.mjs`、`levels.mjs`、`feel.mjs`、`safety.mjs`、`engagement.mjs`。实际默认启动→五关循环→结算→重玩已留证，没有另做一套游戏实现。

## 测试结果与保留的未通过项

| 检查 | 实际结果 |
|---|---|
| 鹈鹕 Node 专项 | **122/122 PASS** |
| 全仓 lint / typecheck | **PASS / PASS** |
| 本机 Google Chrome 155.0.8059.80 | **26/26 PASS** |
| 本机 Playwright WebKit 26.5 | **26/26 PASS**；不是实体 iPhone Safari |
| 本机连续五关 | **28/28 PASS**，约 303.9 秒，五关全部自然通关，errors=[] |
| 网络与图形不可用分支 | **6/6 PASS**，冷启动/加载后/本地文件分开记录 |
| 默认资源与控制台 | 两引擎无外部 Three.js/图片/字体请求，无失败 HTTP 响应，无控制台 error/warning 或 pageerror |
| 窗口后台自动暂停 | **BLOCKED**；原 lifecycle 有3项未通过，补充真实 App 激活探测有2项未通过；两次都没有得到实际 blur/hidden 事件，不能当作已复现游戏故障或已通过 |
| `pnpm test` 全仓 Vitest | **FAIL**；170/188 文件、974/975 断言通过。17个现有 node:test 文件被 Vitest 判定无套件，另1项共享工厂日期样本已过期。失败文件与共享代码相对 `26e1e0c` 均无修改，孤立复跑同样失败；未越界修复 |
| 实体手机 | **NOT_RUN**；已按你更新后的P1交由你操作 |
| 两名首次玩家盲测 | **HUMAN_PLAYTEST=NOT_RUN**，未招募、未访谈、未编造评分 |

原始失败未隐藏：[全仓日志](final-tests.log.txt)、[共享失败定位](shared-test-baseline.json)、[后台 triage](background-triage.json)、[后台复现矩阵](background-reproduction-matrix.json)。手动暂停、GPU 丢失和窗口后台是不同分支，前两者通过不能替代后者。

## 修复前后证据

**没有发现需要修改 H5 的已确认游戏缺陷。** 本轮修正了两个新验收脚本的实验分支，全部保留失败版本。

1. 初始三星脚本在129.495m为 `l1-o1` 准备跳跃，却在130.245m立即按右转，按规则取消了起跳；它得到18鱼、5金鱼、0跳障、二星，随后错误要求三星。复测脚本保持原路线直到真正越过 `l1-o1` 并捕到 `l1-jump-l1-o1` 奖励鱼，两引擎均得到17鱼、5金鱼、1跳障、最长11连、三星。游戏字节未改，取消起跳负例仍保留。证据：[初次失败](evidence/chromium/report.json)、[初次二星截图](evidence/chromium/04-natural-settlement.png)、[复测三星截图](evidence/chromium-retest/04-natural-settlement.png)、[精确分支复现矩阵](qa-driver-reproduction-matrix-after.json)。
2. 初始网络脚本把已加载页面的 reload 错称为冷启动，并假定它必然离线失败。复测改用独立干净 context、禁用 ServiceWorker、唯一 URL，实际记录首次离线导航失败，联网重试恢复。没有增加缓存或改网络策略。证据：[初次网络失败](evidence/network-initial/report.json)、[复测](evidence/network/report.json)、[网络矩阵](network-reproduction-matrix.json)。

## 环境与性能

MacBook Pro `MacBookPro18,1` / Apple M1 Pro / 16GB / 16核GPU，macOS 26.7.1，Node v24.14.0，pnpm 11.19.0。安装 Safari 26.6.2；本轮自动化测的是上表 Chrome 和 Playwright WebKit，Safari App 本身未操作验收。

`devicectl` 未发现设备，`xctrace` 只有 Mac 与模拟器，Android SDK 的 `adb devices -l` 为空。**真实手机型号、系统、浏览器、截图、帧时、热衰减和锁屏结果均未填写，状态 NOT_RUN。**

第一关三星路线使用390×844、DPR3、默认均衡画质；实际画布/合成器均为585×1266。两引擎连续约40秒采样，不含故障注入：

| 浏览器 | 平均 FPS | P50 帧时 | P95 帧时 | >50ms 帧 |
|---|---:|---:|---:|---:|
| Chrome 155.0.8059.80 | 60.0 | 16.7 ms | 16.7 ms | 0 |
| Playwright WebKit 26.5 | 60.0 | 17.0 ms | 22.0 ms | 0 |

另一次已有 Playwright Chromium 驱动的连续五关运行使用该 Mac 的独立浏览器刷新路径，约119 FPS，不能与上表60 FPS采样混算，更不能外推手机：

| 关卡 | 结果 | 平均 FPS | P95 帧时 |
|---|---|---:|---:|
| 1 | 通关 | 119.1 | 8.8 ms |
| 2 | 通关 | 119.3 | 8.9 ms |
| 3 | 通关 | 119.4 | 9.6 ms |
| 4 | 通关 | 119.5 | 9.7 ms |
| 5 | 通关 | 119.6 | 9.8 ms |

这里只报告桌面 RAF 帧时、实际渲染统计与约5分钟运行。手机 GPU 时间、发热后的性能、低端机、真实系统 context 丢失仍待实测；CI 软件 GPU 的约5 FPS同样不能当作手机结果。

## 实际画面审查

已查看本机完整画面、正常操作录像和绑定同一构建的关卡画面：连续拖动保留分数横向坐标，骑车有姿态/前叉/镜头随动；主角在下方、中心前方道路可见，横竖屏与小屏按钮/三星目标没有被裁出视口；奖励提示在所查画面未遮住前方必须观察的中心路线。真实刘海、底部手势条、浏览器工具栏与手指遮挡未验证。

首鱼约1.86秒、首金鱼约8.26秒、真实跳障约18.27秒、对应奖励鱼约19.72秒；前30秒已包含可操作的追鱼、连击、行人和可选跳障分支。第二关行人方向、第三关车辆、第四关雨天与两次跳障挑战、第五关暮色与金鱼目标确有变化。**这些是可观察内容，不是玩家觉得有趣、理解正确或愿意重玩的结论。** 详见 [体验观察与未知项](experience-observations.json)。

## H5 发布条件

静态部署结构可用：1,017,458字节独立 HTML，无运行时 CDN 依赖，Three.js MIT 完整文本同时存在于 HTML 和 `LICENSE.three.txt`。200 KiB/s、200ms延迟的新页面约 6.03 秒准备完成；已加载游戏断网继续、下载后的独立文件离线启动均实测。没有 ServiceWorker 离线首开承诺；冷离线 HTTP 首导航失败是已记录的限制，恢复网络后重试可用。

原作者授权按仓库既有用户确认继续有效；没有重开授权审批。原件/具体署名条款尚未归档，应在正式平台材料中补齐。Three.js MIT 已保留，未新增其他素材或商业依赖。

TapTap H5 真实宿主、账号资格/应用配置、平台包上传与审核未验收。广告实际状态为**尚未接入**：没有有效 appId/广告位实测配置，点击后如实提示，可直接重玩，没有模拟广告、收益或虚假奖励。账号是否已开通并未臆测。[TapTap 官方形态与上线流程](https://developer.taptap.cn/agents/) 区分 H5 与 Tap 小游戏，并要求手机自测和玩家测试；[官方广告文档](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/) 另需广告/财务配置。本轮没有登录平台、开通服务、花钱、部署生产或合并 PR。

**正式发布仍为 BLOCKED**：手机启动/触摸/后台/锁屏/安全区/性能证据、真人盲测、平台宿主与材料审核尚缺；有广告的版本还缺真实SDK/广告配置及回调验证。广告未接入不阻止本地无广告内部试玩。

## 交付文件与构建身份

- [最新原样 H5 试玩包](pelican-coast-h5-26e1e0c.zip)，HTML SHA-256：`84c968357921563b57bb63df85f55eca3c8f9b7d4e69ef92c2186676f083a441`。
- ZIP SHA-256：`6f4f0057515ffada6e8a83f7368e1585361dffe97e3a91d39374abd92ce33a2a`；内嵌代码构建身份：`bc2ed9913cc5c46fbf9a08a4e49a5a8b8dd5ed5e8636eb4342b00f38e462c0f4`。详见 [CI 导入凭据](artifact-import.json)。旧 release-candidate 目录是历史证据，不能替代本包。
- [自然操作与三星录像](evidence/chromium-retest/local-acceptance.webm)、[完整五关连续录像](evidence/local-five-level-soak/five-level-campaign.webm)、[三星截图](evidence/chromium-retest/04-natural-settlement.png)、[小屏截图](evidence/chromium-retest/09-small-running.png)、[横屏截图](evidence/chromium-retest/07-landscape.png)。桌面证据均未冒充手机录屏。
- [手机最简步骤](PHONE_TEST_ZH.md)、[两人中文盲测表](HUMAN_BLIND_TEST_ZH.md)、[机器可读验收汇总](acceptance-summary.json)、[证据哈希清单](evidence-manifest.json)。
- 源码基准CI：[双浏览器54+54](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38729546772)、[工厂构建与打包](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38729546759)。本轮交付提交的 CI 单独列在 PR 顶部，不把旧绿灯改称新提交已通过。

**最终回答：已经具备开始内部真实玩家试玩的技术条件。** 当前无需增加玩法或重构；你只需先用真实手机打开链接、跑三局并反馈，随后让两名未经指导的首次玩家试玩。手机兼容、后台/锁屏及主观乐趣是否达标，必须由这些实际反馈决定。
