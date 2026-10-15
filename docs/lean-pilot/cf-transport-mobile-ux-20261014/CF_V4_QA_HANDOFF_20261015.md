# CF《运输船任务挑战》V4｜2026-10-15 收口交接

> **状态：内部 H5 试玩候选。PR #15 保持 Draft。禁止直接合并、公开部署或声称实体手机/商业化通过。**

## 工作位置与隔离
- [仓库](https://github.com/23chen990/ai-mini-game-factory)，分支 `fix/cf-transport-mobile-identification-hud-20261014`，PR [#15](https://github.com/23chen990/ai-mini-game-factory/pull/15)。
- 固定上游 Three.js 原始源：`riba2534/claude-opus-5-5-demo@54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`。不要更新源版本，不要修改飞车、鹈鹕仓库/分支。
- 游戏候选 run ID：`h5-cf-challenges-20261013`。原 H5 运行环境、原生弹道与伤害和敌人 AI 没有被替换为假游戏，测试从未注入 hits、kills、HP 或时钟。

## 已经由真实源码 + Chromium 软件 WebGL 模拟触屏验证的任务
- 2026-10-15 [AWM 和 MP5 生存专项双 PASS](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38683062494)，同一 buildHash：`d4811a30d5eed9d3225d63d2f4e1e8029a79af4727dff4546569aa0df05ab7a3`。
- **AWM：** 原地图合法无遮挡约10m首战视线；单纯滑动瞄准发射 0 颗子弹；实际点击开火 2 次、原生 AWM 命中 2 次、击杀 1 名敌人、`won`。控制开镜/关镜、准星和结算均完成。
- **MP5 生存：** 真实左摇杆移动 51m、45 游戏模拟秒、0 次阵亡、`won`。结算阶段友军名称残留为 0。
- [2026-10-14 M4 新手首关历史真实通关](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38565196437)：第一次命中约 5.7 游戏秒，累计真实命中 3 次、胜利；未操作不自动刷分。
- 2026-10-15 [原五项浏览器基线复测](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38683514808)在准备菜单里发现教程被错误 CSS 隐藏；其余 4 项流程和首 30 秒真实命中、挂机生存失败约束通过。已用 `0ab2fe2a...` 单独修复：准备界面显示操作教程，战斗/暂停/结算隐藏。**[修复后 5/5 浏览器流程 PASS](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38684899484)**，另外四项 CF 扩展门禁也全部通过。最终运行 buildHash：`5cc9467ff86e82c4f0bb93605e7357a047114ae2ff9a28be5c6da0fc1eae5660`。该轮新手 M4 有真实早期命中但最终仅累计 2 次命中、未胜利；这是可用性波动，不能把回放成功谎称该轮 3 次命中通关，须真机继续复测。
- 内部候选单页 HTML、依赖和样式已内联。前一 AWM、生存双 PASS 的独立 ZIP SHA256：`f6372c49d23f552f42df5a758b8b01cf8231332ecec65a2b020647a2fbc54870`；HTML SHA256：`4a3ded05328980b00e5940c6f2f8eb9a84e7b78d9cdb06e11807f35578d6d782`。上述哈希仅适用于 AWM、生存专项成功的上一构建，不适用于最终 CSS 修复。**最新版独立 ZIP** SHA256：`6c7636d989da452eed374732b74453e540d31159a4aa09ce879db467e702094b`，HTML SHA256：`e37f2c0379121092c608b72bfd11d95779b91d5bff77bcc0eeab6077f479638f`，构建来自上述 5/5 浏览器基线成功的 0ab2 提交。Artifacts 仅保留 7 天，请及时下载保留。

## 限制与严格验收
- Chromium 桌面模拟手机触屏并非真机性能或真人理解证据。实体 iOS Safari、Android Chrome、2 位无指导玩家的首次 30 秒理解测试、慢机性能、真实 IAA、商业权利文件归档、平台审核均未完成。
- 原构建报告：`codeRights=GRANTED_USER_CONFIRMED`；`IPRights=NO_ISSUES_USER_CONFIRMED`；**`originalGrantDocument=NOT_ARCHIVED`**；`physicalMobile=NOT_RUN`；`liveIAA=NOT_RUN`；`commercial=PLATFORM_QA_PENDING`；`publishable=false`。
- 真机验收按顺序：T01 竖屏提示/横屏按钮；T02 右手滑动绝不偷开枪；T03 M4 3次有效命中通关；T04 红色敌人图标不穿墙/死后不残留、蓝色友军易辨；T05 AWM 开镜/放大/关镜；T06 按开火且真正 AWM 击杀赢；T07 MP5 生存 45 秒、移动20m、阵亡≤2；T08 暂停/恢复不持续开火；T09 结算重开、存档正确；T10 667×375、小屏、切前后台无控件遮挡。
- 在 Mac 解压仅含 `index.html` 与 `LICENSE.three.txt` 的试玩 ZIP，在该目录执行 `python3 -m http.server 8787 --bind 0.0.0.0`。手机与 Mac 在同一 Wi-Fi，用手机浏览器访问 Mac 局域网 IP 的 `http://<Mac-IP>:8787/index.html`。不能在手机里使用 Mac 的 `localhost`。
- 2 位真人不看教程由自己摸索 30 秒，记录敌我理解、正确移动/瞄准/射击、首次命中耗时、误触与失误。若无设备/真人必须报告 `NOT_RUN`，不得编造。

## CI 与 Agent 指令
- 临时 `.github/workflows/cf-mobile-qa.yml` 为固定上游原生浏览器 QA 特设，不在工厂 scope 白名单；通用 `npm run pilot:scope` 因此只拦截这份临时 YAML。**不能修改 `tools/lean-pilot/scope-check.mjs` 或放宽 CI。**完成最后基线、存证后从本 Draft 分支删除临时 YAML，让原工厂 CI 恢复。
- Agent 只负责以上真实手机/真人/权利证明的 **PASS / FAIL / NOT_RUN** 验收；如果发现复现的 bug，先提交设备、浏览器、复现步骤、预期 vs 实际、截图或视频，再做只针对 CF 的最小修复和回归。禁止加武器地图/改原版枪械伤害/注入击杀数/改胜利阈值/绕过测试/直接合并。
- 每一项请返回设备型号、系统、浏览器、证据、真实结果、对应构建 SHA、是否修改代码及 commit SHA。最终保持 **ENGINEERING DEMO（限定证据）** 与 **PUBLIC RELEASE（仍禁止）** 之间的清晰界限。
