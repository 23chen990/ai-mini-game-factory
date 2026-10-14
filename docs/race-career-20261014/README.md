# 《双键飞驰》V3：玩法寿命、道具、16 关、燃油 IAA｜Codex 开发交接
日期：2026-10-14；本分支：`feat/racing-career-items-iaa-20261014`；父分支：[Draft PR #14](https://github.com/23chen990/ai-mini-game-factory/pull/14)。

> **这不是正式通过的发布包。** 已完成独立关卡规则、道具/超车/AI 接入、源码构建改造与 Node 测试；尚未完成对本分支新构建的真实 H5 完赛 QA、后台恢复、真机性能和 TapTap 正式广告联调。保留 Draft，不要合并、部署、声称 QA PASS。

## 1. 为什么这么改

用户真实试玩认为上一版 1 圈约 42 秒，四张地图太简单、总是轻松第一、缺少弯道超车、道具和长期目标。PR #14 三个正常城市赛均第 1 名，发生最多 8 次撞车仍第一。原版四条闭合赛道沿 `Track` 构建，跨河桥梁/地形相互依赖，不应随意拉长几何路径。

我们复核了固定上游版本 `riba2534/claude-opus-5-5-demo@54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`：
- `qq-speed/src/main.js` 已有 `LAPS = [1,2,3,5]`、AI 新手/熟练/车神 3 档、6 车、`itemMode`、碰撞、名次、手动道具赛。**原始 AI 领先后 10 秒强制 DNF** 是多圈赛的大问题。
- `qq-speed/src/items.js` 原生实现 20 个道具箱（4 组 × 5 车道）、两物品容量、按排名加权、导弹/香蕉皮/盾/磁铁/氮气及 AI 使用逻辑。新 UI 不新增道具按钮，由独立策略决定何时生成原生 `nitroPressed`（item mode 原生将其视为 `items.use`）。
- `qq-speed/src/vehicle.js` `driftEnd` 含实际持续时间；`stats.drift` 是“开始漂移”计数，不可当有效漂移。原加速带 `pad` 事件和 `speedKmh` 可复用。
- `qq-speed/src/ai.js` 原生 AI 已能依赛道曲率调整速度/横向赛车线/直道氮气。
- `qq-speed/src/carModel.js` 已有 8 种车漆，没有必要做汽车改装商城。
- 《马里奥赛车 8 豪华版》任天堂官方教学：过弯内线与出弯小喷、捡箱后持有道具、落后更容易获得追赶型道具；不用新画几十种道具。https://www.nintendo.com/jp/ichikara/aabpa/index_en.html
- 《Beach Buggy Racing 2》官方展示 6 车竞速、每日漂移/障碍/1v1 挑战，用相同赛道和车辆支持不同赛事配置。https://play.google.com/store/apps/details?id=com.vectorunit.cobalt.googleplay
- CrazyGames 驾驶游戏变现指南主张不在行驶途中强制广告，赛后和自愿燃油恢复更合适。https://docs.crazygames.com/resources/monetizing-driving/
- TapTap 新手第一分钟或首关保护、激励广告奖励必须玩家主动确认。https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/minigame-ad-policy/

上述为**公开机制调研、合法访问的源码阅读、独立编写 H5 适配层**，不是获取任天堂/腾讯等商业游戏私有源码；此运行环境无可调用 REA 工具，不要伪造 REA 记录。

## 2. 已修改且提交的代码

- `templates/web-lite/h5-source-mobile-v1/racing/career.mjs`：16 关 / 4 章节配置，地图、1/2/3 圈、AI 档位、竞速/道具、目标、三星、解锁、8 种车漆星级门槛、稳定存档。先比较目标再解锁：只夺冠但没有捡道具、测速、有效漂移、弯道超车、打败 Boss 都不能直接通过特殊任务。
- `racing/items.mjs`：原版每组 5 道具箱瘦身为 2 个离散车道，保留原生三维实体和碰撞；氮气/导弹/护盾/磁铁/香蕉皮按情境自动使用；真实排名提升 + 弯道曲率 + 无碰撞才给一次弯道超车增益（道具模式额外道具，否则短小喷）。
- `racing/runtime.mjs`：统一阶段管理，赛前配置 AI/圈数/车漆/道具，赛中测速、有效漂移、补时、计时、末位淘汰（从活跃赛车数组删除末位 AI）、Boss、计分和原始游戏 10 秒 DNF 保护；直接复用原生 `game` 与车型。
- `racing/mobile.mjs`：原 PR #14 唯一真实默认运行入口新增选关、目标、车漆、油量、成绩和主动广告，双键和暂停保持原样；回选关可重新挑战，暂不新设第三驾驶按键。
- `fuel.mjs` 与 `tests/fuel.test.mjs`：从本仓库 Draft PR #12 沿用已审查规则；真实正式广告位未开通时**不限油、不会播放模拟广告冒充真实收入**；正式授权接入后，10 格、每场 -1、每 5 分钟恢复一格、主动看完整激励视频 +2，第一次完成关卡且超过 60 秒才提供广告入口。
- `tools/lean-pilot/racing-mobile-build.mjs`：输入哈希现在覆盖 `career.mjs`、`items.mjs`、`runtime.mjs`、`fuel.mjs` 与 `themes.mjs`，禁止修改子模块却复用旧 ZIP；使用已有原生 Three.js 构建 + esbuild 打包，进行**明确的中文和品牌文字替换**（11城、QQ飞车、SPEEDQQ.COM 等），但地图轮廓、吉祥物视觉及第三方资产来源仍需手工确认，不可仅凭字符串替换声明合法发布。
- `scope-check.mjs`：只放行已有 PR #14 的 `docs/race-two-button-20261014/` 与本次 `docs/race-career-20261014/` 两个具名证据目录，不更改原 QA、发布阈值或其他游戏。
- `tests/racing-career.test.mjs`、`tools/lean-pilot/tests/racing-build.test.mjs`：关卡计分、存档、道具、AI 淘汰、超车、广告边界和构建输入保护。

**重要**：PR #12 中用户后来反馈的本地 Codex 修复（燃油导出、后台、存档失败），**不在远端 PR #12 已提交代码里**；要由 Codex 将这些本地改动挑选合入本分支，不能覆盖当前新 `racing/mobile.mjs` 或双键输入。

## 3. 16 关和最小策略

- 第一关 1 圈，新手有免费起步加速；其余绝大多数 2 圈，后三关少量 3 圈，AI 档 0→1→2，不再全部 42 秒夺冠。
- 第 2、14 关：真正位于总赛程 45% 的速度检测点，比较采样时速（不是最高时速）。
- 第 3、11 关：有效弯道超车判定；第 4 关：`driftEnd.time > .22` 计数；第 5、6、10、15 关：原生道具拾取与自动使用；第 7 关：限时；第 9 关：原生加速带补时；第 12 关：两次真实 AI 末位淘汰；第 13、16 关：指定 AI 车神挑战。
- 三星与车漆是轻量离线成长，保存 `h5-mobile:qq-speed:career:v1`，油量保存 `h5-mobile:qq-speed:fuel:v1`；不做服务器、PVP、充值、签到账本。
- 比赛中只需左右驾驶和暂停。道具与收益由驾驶决策自动触发。广告只能在大厅和结算显示。
- 16 个配置关卡**不等于已验证的 16 个不同体验**；如果真实试玩发现某关无法达成，请根据 trace 定向改目标/AI，而不是直接通过 setTimeout 发星。

## 4. 真实完成与剩余阻塞要区分

**本轮本地已验证**：纯逻辑 `career.mjs` + `items.mjs` + `runtime.mjs` 在 Node 的模拟对象上共 15/15 规则测试通过；这些测试是离线逻辑，不是构建后的 H5 真机证据。GitHub 的新测试文件已入仓，必须等 CI 检查其对应版本的真实结果。

**尚未验证/必须交给 Codex**：
1. **P0** 从当前分支实际调用 `H5_PINNED_SOURCE_ROOT=/... node tools/lean-pilot/racing-mobile-build.mjs`。检查生成 H5 默认入口真实包含新 `racing/mobile.mjs`、17 个相关模块正确 bundling、`platform.json` 缺失安全回退；打开横屏 H5，进入首关；核对 hash 和不可变证据。新增文件应包含在所有 ZIP/standalone 格式里。
2. **P0** 通过正常触摸逐关验证：①首关 1 圈→星级→解锁第二关，②第二关 2 圈与测速点，③真弯道超车，④`driftEnd` 有效漂移，⑤道具箱实际拾取并在合适时机消耗，⑨加油站真正补时，⑫真淘汰，⑬ Boss，⑯最终 3 圈；此外其余关至少验证可进、无硬锁。不得改写 `player.finished` 或瞬移制造 QA 通过。
3. **P0** 联合旧燃油修复工作树，只 cherry-pick 尚未提交的必要边界：失败开赛不扣油、离线恢复、广告真实 `onClose.isEnded` 才加油、取消/超时/重复回调不加油；检查新入口 `runtime.mjs` 的燃油使能条件，仍保持 PENDING 不消耗。
4. **P0** 全部 `node --test templates/web-lite/h5-source-mobile-v1/tests/*.test.mjs tools/lean-pilot/tests/racing-build.test.mjs`、`pnpm lint`、`pnpm typecheck`、`pnpm pilot:scope` 及 GitHub CI。不要把已记录的工厂全仓旧失败隐藏为绿；只修新引入的错误和合理范围门禁。
5. **P0** 真正连接奖惩：检查道具自动使用不会抢普通氮气、超车触发与视觉同步；检查四张地图所有 2/3 圈赛不能因为 AI 提前完赛 10 秒直接结束；检查低端 Android 横屏稳态帧率/发热、刘海安全区、双拇指手感、背景切换时暂停清键。
6. **P1** 玩法调参依据必须来自正常试玩：同一关玩家是否总夺冠或总失败，弯道超车挑战是否卡住，导弹/护盾是否藏在队列里不触发，末位淘汰是否破坏赛车与排名；需要时调整数值，保留 raw trace。
7. **P1 法务** `qq-speed` 原项目 package.json 显示 ISC，但 GitHub 上的许可证和具体商用授权未在本轮重新验证；替换可识别的原地图、旗帜、气球吉祥物等专有形象，不因我们替换了文字就宣称素材可以商业使用。发布前做独立授权审核。

### 调试顺序（不要从头开发另一款游戏）

```bash
node --test templates/web-lite/h5-source-mobile-v1/tests/racing-career.test.mjs
node --test templates/web-lite/h5-source-mobile-v1/tests/fuel.test.mjs
node --test tools/lean-pilot/tests/racing-build.test.mjs
pnpm lint
pnpm typecheck
pnpm pilot:scope
H5_PINNED_SOURCE_ROOT=/绝对路径/合法来源源码 node tools/lean-pilot/racing-mobile-build.mjs
```

若上游源码和真正的 TapTap 广告许可尚未由用户提供，**不要生成假接入配置来让报告变绿**；只完成无广告试玩路径并明确 BLOCKED 项。

## 5. 分支/PR 协作规则

- 当前唯一工作主干：本分支；基线 PR #14，代码由 GitHub 直接提交；PR #12 原油量分支和 PR #11 旧挑战逻辑均**只读参考**。
- PR #14、#12、#11 保持 Draft，不合并、不篡改 QA。Codex 先拉取本分支，确认最新 commit，再以增量提交和追加证据推进本 Draft。
- 优先合入本地燃油修复的**具体 commit/diff**，不可直接用旧版本 `main.mjs` 覆盖新运行入口。不得删掉本分支的 stage/item/boss/survival/fuel 功能去“通过测试”。
- QA 完成时附 4 地图代表性正常比赛录屏、至少 1 次真实道具拾取和发射、一次加油失败分支、一步步关卡解锁及 SHA/构建哈希，否则仍 BLOCKED。
