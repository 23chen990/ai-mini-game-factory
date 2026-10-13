# 三款 H5 挑战试玩交接

本轮从 [PR #10](https://github.com/23chen990/ai-mini-game-factory/pull/10) 的 `b3e9e41dbafd9fecff972e0838aec8bed8220afc` 继续，分支 `codex/three-h5-challenges-20261013`，[Draft PR #11](https://github.com/23chen990/ai-mini-game-factory/pull/11)，功能提交 `0fa0c00fbd94cf9a246b6311a8b77808113359c5`。沿用原 Three.js 场景、操作、手机 UI、暂停、存档与广告生命周期；没有重新开发三款游戏。三个旧 run 保持原样，新挑战分别位于：

- `runs/h5-pelican-challenges-20261013/workspace/game`
- `runs/h5-qq-challenges-20261013/workspace/game`
- `runs/h5-cf-challenges-20261013/workspace/game`

| 游戏 | 挑战 | 真实状态判定 |
| --- | --- | --- |
| 鹈鹕 | 海岸抓鱼：90秒8分 | 原 `S.fish` 分数，金鱼计5分 |
| 鹈鹕 | 限时冲刺：45秒5分 | 同一抓鱼玩法，缩短时间 |
| 鹈鹕 | 腾跃追鱼：90秒8分＋3次跳跃 | 本局分数和原引擎实际接受的 `S.jumps` 增量 |
| 赛车 | 城市完赛：一圈，最多150秒 | 玩家本人 `finished`，AI 完赛不能代替玩家 |
| 赛车 | 海岛领奖台：爱琴海一圈前三 | 原赛道、实际玩家名次和完赛状态 |
| 赛车 | 漂移练习赛：城市一圈＋2次有效漂移 | 原 `player.stats.drift`，按钮点击数不代替有效漂移 |
| 射击 | 步枪熟悉：M4起手，60秒3次命中 | 原玩家 `stats.hits` |
| 射击 | 狙击尝试：AWM起手，90秒1次击杀 | 原玩家 `stats.k`；允许换武器，未宣称限定武器击杀 |
| 射击 | 小队生存：MP5起手，45秒最多2次死亡 | 原玩家 `stats.d`；生存完成给3积分，不冒充击杀数 |

成功和失败均可重开，选中挑战及完成记录单独保存；旧成绩格式和隔离规则保留。新 run 使用自己的存档键，不自动搬迁旧 run 的成绩。挑战只读取原游戏指标，未新增地图、Bot、物理或武器系统。正式广告仍隐藏，未创建 TapTap 应用、上传或提审。

## PR #9 / #10 去重结果

| 内容 | 本轮处理 |
| --- | --- |
| [PR #9](https://github.com/23chen990/ai-mini-game-factory/pull/9) 的三关 JSON | 尚未接入游戏的方案；仅借鉴少量目标，降低时长和改造范围，实际九个挑战见上表 |
| #9 的 `h5-rewarded-guard.mjs` | 与 #10 现有激励视频、并发保护和幂等发奖职责重复；不引入、不 cherry-pick |
| #10 的 `themes.mjs`、广告测试、`platform.json` | 保留；当前仍是权限待确认的隐藏入口，fixture 通过不等于真广告通过 |
| #10 的源码构建与手机 UI | 直接复用同款已测源码 HTML；新增可选缓存路径会检查旧 run 身份、冻结输入和完整 buildHash，不重新编译原场景 |
| #10 的 REA 对照、源码机制和 PR #7 证据门禁 | 继续引用原成果，未重跑 REA、未改门禁阈值。新的 request/contract/runId 走原 `research-to-build` 原型门禁，发布仍受阻 |

修改范围是已有 `h5-source-mobile-v1` 的挑战判定、三张选择卡和独立挑战记录，以及已有构建助手的 PR #10 缓存复用选项。没有新增引擎、工厂流程、广告模块或运行依赖。源 HTML、广告模块和冻结输入的实际哈希见 [检查记录](evidence-index.json)。

## 试玩与验证

[中文手机验收页](mobile-acceptance.html) 使用三个本地端口 4317/4318/4319；本机已启动的入口是 `http://172.16.133.209:4316/mobile-acceptance.html`，手机和电脑需同一 Wi-Fi。[未发布 Draft Release](https://github.com/23chen990/ai-mini-game-factory/releases/tag/untagged-45efe3944aa730a1cb75) 提供三个 ZIP，每包约230–290KB，`index.html` 是完整独立 H5，可用静态 HTTP 服务托管。完整 QA 附件另存为74.6MB ZIP，四个远端 SHA-256 已与本地核对。它们是未发布的测试包。

独立 QA 使用 WebKit 手机尺寸、可见按钮和正常输入；动作、截图、失败及中断日志都保留。旧哈希上的证据不会被改写成新哈希；抓鱼的45秒标题问题有原始 QA、一次修复、精确状态补测。详细观测、覆盖缺口和包哈希见检查记录及随包 evidence。

实体手机和真人30秒理解测试尚未进行，未收到新的真机反馈；浏览器模拟不代替真人或真机。抓鱼和射击的部分任务实测未达目标，不能据此证明无法完成，也不能宣称已验证所有成功分支。整仓 `pnpm test` 的既有 Node/Vitest 收集问题和过期豁免失败继续可见；并发期间另一次无关 cut-stack 超时已单独复测通过，没有改它的测试或门禁。

## 复现与下一步

有本机 PR #10 原 run 时，在空的新挑战 run 上执行（不能覆盖既有 run）：

```sh
H5_PR10_BASELINE_RUN=h5-pelican-mobile-20261013 pnpm pilot build h5-pelican-challenges-20261013 pelican-bike
H5_PR10_BASELINE_RUN=h5-qq-mobile-20261013 pnpm pilot build h5-qq-challenges-20261013 qq-speed
H5_PR10_BASELINE_RUN=h5-cf-mobile-20261013 pnpm pilot build h5-cf-challenges-20261013 cf-transport-ship
pnpm pilot check h5-pelican-challenges-20261013
pnpm pilot serve h5-pelican-challenges-20261013 4317 你的局域网IPv4
pnpm pilot export h5-pelican-challenges-20261013
```

无缓存时，原 `H5_PINNED_SOURCE_ROOT=/固定版本源码路径` 构建入口仍可用。已有经过修复的 run 继续使用 `check/serve/export`；源构建历史回执不覆盖，当前版本由 `current-adaptation.json` 绑定。当前 `prepare/delivery` 只支持 clinic，不用于这些 H5。冻结测试、预算、证据和输入不得重置。

下一步先让玩家试玩，按游戏、设备、操作和现象做定向修复。广告等待对应 TapTap H5 AppID 和广告位确认后沿用 #10 模块联调，届时再核验完成、取消、失败、超时与重复领取。原作者授权沿用用户确认记录，审核资料保持待办。PR #2/#3/#7/#8/#9/#10 均不修改、不合并；本轮只同步独立 Draft PR 和未发布试玩附件。
