# 赛车 V3 完成报告（Draft PR #17）

目标游戏是《双键飞驰》V3（`qq-speed`），运行目录为 `runs/h5-qq-mobile-20261013/workspace`。本次交付绑定分支 `feat/racing-career-items-iaa-20261014`，当前提交 `45478d488c8be9eb0caa5256b72ba44abd7e2eab`，实际试玩包是 build16：

- build hash：`6795fa3e858661409397389327f89b743cb4e1ef1fe2c96231caa923bd14d696`
- source input hash：`540a22e3df5260df11837ebc2a29596299ae20e5d8fe009140a6aec5603244b3`
- [H5 QA ZIP](./playables/dual-key-racing-v3-qa-6795fa3e8586.zip) / [standalone H5](./playables/dual-key-racing-v3-6795fa3e8586.html)
- [交付清单](./evidence/delivery-manifest.json) 的完整性校验为 PASS；包仍明确标记 `publishable:false`。

自然驾驶使用正常双键触摸输入，没有写入玩家坐标、名次、进度、完成状态或星级。最新完整自然报告是 [natural-report-latest.json](./evidence/natural-report-latest.json)：16 个主线阶段中 01–15 真实通过，16 真实冲线但未达到指定车神前三门槛；因此主线自然门禁为 BLOCKED，未伪造每日挑战通过。

| 关卡 | 地图 / 圈数 | 最新真实结果 | 关键证据 |
|---|---|---|---|
| 01 | city / 1 | PASS，第 1 名，41.65s | 首关自然起步 |
| 02 | egypt / 2 | PASS，第 1 名，82.82s | 三次测速目标 |
| 03 | city / 2 | PASS，第 1 名，85.82s | 弯道超车 |
| 04 | aegean / 2 | PASS，第 1 名，87.40s | 有效漂移 |
| 05 | egypt / 2 | PASS，第 1 名，86.51s | 真实道具箱拾取 |
| 06 | city / 2 | PASS，第 1 名，86.97s | 2/2 拾取与碰撞恢复 |
| 07 | aegean / 2 | PASS，第 2 名，86.10s | 限时目标 |
| 08 | snow / 2 | PASS，第 3 名，73.61s | 自然前三 |
| 09 | egypt / 2 | PASS，第 1 名，80.86s | 加速带补时 |
| 10 | city / 3 | PASS，第 1 名，128.09s | [三圈自然录屏](./playables/natural-10-three-laps-6795fa3e8586.webm) |
| 11 | aegean / 2 | PASS，第 2 名，85.58s | 2 次真实弯道超车 |
| 12 | snow / 2 | PASS，第 2 名，72.82s | 末位淘汰存活 2/2 |
| 13 | city / 3 | PASS，第 1 名，122.41s | Boss 目标 |
| 14 | egypt / 2 | PASS，第 1 名，83.73s | 三次测速目标 |
| 15 | snow / 3 | PASS，第 1 名，111.34s | 3/3 道具目标 |
| 16 | aegean / 3 | BLOCKED，第 6 名，130.31s | 指定车神前三未达成 |

四张地图均有真实自然完成记录，多圈代表包括 city 三圈第 10 关、snow 三圈第 15 关，以及 [第 4 关双圈片段](./playables/natural-04-two-laps-6795fa3e8586.webm)。[第 6 关碰撞后恢复片段](./playables/natural-06-post-hit-recovery-6795fa3e8586.webm)保留真实碰撞、逆行恢复和继续驾驶过程。

画面“整个游戏忽明忽暗”的根因已经定位：移动 HUD 的原生 `#vignette` 在自动小喷/起步加速时给整个画面施加 opacity `0↔0.8` 的蓝橙渐变，碰撞时的 `#hitflash` 也曾大面积染红；曝光值保持约 `0.92`，没有发现 WebGL 重置、resize 或 context loss。build16 的移动路径隐藏全屏 vignette，将 hitflash 改为透明中央加 4px 内缩的边缘阴影，并把移动 bloom 固定为 `0.3`，保留尾焰、速度线、局部徽章和物理反馈。当前 844×390 Chromium 的起步加速与碰撞分支通过了独立精确复核；小喷/纯氮气/连续多次碰撞组合、真实后台切换和 Android/iPhone 仍没有足够证据，不能宣称全设备 PASS。详见 [闪烁复现矩阵](./evidence/matrix-flicker.json) 和 [闪烁分诊记录](./evidence/triage-flicker.json)。

旧燃油工作树的未提交差异已先做哈希和边界审查，再只合入必要的燃油生命周期修复；没有覆盖新的赛车入口。当前规则是确认原生倒计时后才扣油，失败开赛、后台、取消、超时、重复回调和存档失败不会虚报永久奖励；正式广告位未获批时保持不限油并显示清晰状态。审查证据在 [fuel-merge-review.json](./evidence/fuel-merge-review.json) 和 [old-fuel-diff.patch.gz](./evidence/old-fuel-diff.patch.gz)。

AI 调整只保留已经由自然轨迹支持的中段道具带、专家速度带和命名 Boss 下限 `1.58`；没有为了第 16 关失败而改写玩家物理、目标或名次。第 16 关四次自然复试分别落在第 5/6/5/6 名，属于真实可见失败，当前仍是需要后续独立调参和复测的阻塞项。

工程证据如下：

- 赛车专项最终日志为 113/113 通过；本次全量相关 Node 测试为 288 通过、3 个原生环境测试跳过、0 失败。
- `pnpm lint`、`pnpm typecheck`、`node tools/lean-pilot/scope-check.mjs` 均通过。
- 最新 GitHub [Racing V3 H5 smoke](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38691841132) 与 [Lean pilot verification](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38691841148) 均成功。
- 默认运行链为 `game/index.html` → `racing/mobile.mjs` → `driver.mjs` / `session.mjs` / `career.mjs` / `items.mjs` / `runtime.mjs` / `fuel.mjs` / `mobile.css`，包含启动、真实竞速、结算和 replay；旧 `main.mjs` / `engine.mjs` / `themes.mjs` 不在默认 HTML 入口。

仍被阻塞的正式项目：

1. 第 16 关指定车神前三和每日挑战没有自然 PASS；这是当前自然发布门禁 BLOCKED。
2. 无可用的 Android `adb` 真机桥接；iPhone 工具不可用且主机 Xcode license 未接受，所以真实触摸手感、帧率/发热、声音可听性、刘海安全区、来电/后台恢复均未验收。
3. `platform.json` 仍是 PENDING/null App ID/Space ID；没有 TapTap LIVE placement、真实 `createRewardedVideoAd` 调用或正式回读，因此广告条件 BLOCKED。工程 fixture 通过不等于 LIVE 通过。
4. 商用审查仍 BLOCKED：用户授权记录支持继续开发，但原作者授权原文、商业再分发范围和第三方 IP 权限未独立归档；地图控制点和场景装饰仍保留上游表达（例如 `layouts.js` 的固定哈希），ISC 包字段和文字替换不能作为商业清权。需后续取得明确权利或重建四张地图与场景表达。

本轮走的是 formal-fixer 路由，只修改与已验证问题因果相关的赛车 UI/QA 证据；没有重新开发双键、16 关、道具、漂移、AI、燃油或每日挑战。PR #17 保持 Draft，不合并、不部署、不上线。
