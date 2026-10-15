# 《鹈鹕海岸冒险》V3 QA 报告

本报告由当前 run 的 receipt、QA gates、摘要、报告、manifest、CI 回执与工厂检查生成。目标：**鹈鹕海岸冒险**；工作区：`/Users/kker/.codex/worktrees/pelican-feel-v3/妖怪夜市/runs/pelican-coast-v2-20261014/workspace`；attempt：**20**；修复路线：**formal-fixer**。

当前构建 SHA-256：`3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`。修复代码 hash：`c45d85100a4e1bb619c45d0ec28d77e354bf601edcd1ad8262870bdd0cacd91c`。H5 可作为开发/真机试玩候选下载；**未达到生产发布条件**。

## 当前门禁

| 门禁 | 状态 | 证据范围 |
| --- | --- | --- |
| 默认浏览器旅程 | PASS | startup → 五关 → 结算 → replay |
| 感知门禁 | PASS | 独立视觉/可感知证据 |
| Runtime 产品旅程 | PASS | 默认入口与 declared loop |
| 运行时 wiring | PASS | 入口文件实际连线 |
| 设备 / 原生 / 广告 / 真人发布门槛 | BLOCKED | 见 readiness 和 blockers |

候选包是 H5 单文件开发/试玩材料。WeChat、Douyin、TapTap 原生包、TapTap 实际广告、实体手机性能与后台恢复、独立玩家乐趣/留存和生产发布仍是 **BLOCKED**。桌面模拟和工程指标不替代这些验收。

## 低成本复用范围

沿用用户授权源码 revision 54adc1fb64155f9dd7c1c90ecae7b8185ac540b8（Author-authorized three H5 implementations），复用已锁定的 Three.js 0.186.0 和现有 H5/工厂工具；没有新建引擎、后端或服务。复用范围与平台限制以研究记录为准，原生平台和真实广告仍未验证。 Three.js 授权：MIT; WebLite 决策：APPROVED; 许可/归属要求：Retain full Three.js MIT copyright and license in vendor and standalone HTML.；Record npm tarball integrity and exact module SHA; do not pull a floating CDN version.。

## 五项玩法体验

| 关注点 | 结论 | 本轮证据 |
| --- | --- | --- |
| 1 · 跳跃与安全绕行 | 跳跃对 mastery/三星有贡献，但不是一星通关或金鱼奖励的强制条件。 | 实际跳障奖励金鱼对象：WebKit l1-jump-l1-o1 @ 19.73s；Chromium l1-jump-l1-o1 @ 19.73s。无跳安全路线仍捕到 bonus 鱼：WebKit l1-jump-l1-o1，Chromium l1-jump-l1-o1（轨迹阶段分别为 running/running）。至少一条安全路线轨迹仍在进行，不能作为完成局报告。 |
| 2 · 前 30–60 秒 | 首个可见收获、第一次金鱼与首局半分钟内可见进展。 | WebKit：首鱼 1.86s：首金 8.26s；30s 时 12 鱼 / 3 金 / 1 次跳障，首关 40.0s 完成。Chromium：首鱼 1.86s：首金 8.26s；30s 时 12 鱼 / 3 金 / 1 次跳障，首关 40.0s 完成。游戏计时来自实际事件；自动化运行墙钟不当作手机性能数据。 |
| 3 · 五关差异（雨 / 夜） | 目标、路程、速度、跳跃 mastery、天气与本轮结算。 | 由当前 levels.mjs 配置和当前 QA summary 逐关读取，见下表。 |
| 4 · 重玩与 mastery | 挑战目标、三星结算、个人最佳与重开是否可见。 | 实际三星 3★；个人最佳 17 鱼 / 5 金 / 1 跳。两浏览器的路线卡保存并显示纪录；风险报告各覆盖五关并观察到 replay。 |
| 5 · 节奏与风险回报 | 奖励路径选择与关卡节奏是否形成升级。 | 鱼点仍按 16 m 间隔生成，主循环 cadence 有重复感；第 4 关切到 rain，第 5 关 dusk 并加长路程、提速、提高目标。现有证据未显示独有的夜间玩法规则，主要是天气/时间表现与风险密度变化。 |

## 独立体验审计与证据边界

独立审计文件：`runs/pelican-coast-v2-20261014/evidence/v3-engineering/experience-audit-final20.json`；SHA-256：`219f956e292771d5eebdf7a7f357911e328cb20a2ee143e17aaa83436b73d113`；绑定 attempt **20** 与 H5 build hash `3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`。审计按“改动、观察、推断、未知”分别记录，不把模拟结果写成人类体验结论。

### 1. `jump-benefit-and-safe-detour`

**相对基线/本轮改动：** 相对授权54adc1基线（原main已有一般跳跃与随机金鱼），V3把跳跃连到可跳路障、mastery/三星计数，并新增路障后9米的奖励金鱼；绕行分支仍可拿同一奖励。；完整V3另加入固定关卡路障/鱼道、雷达提示和重玩目标；attempt20仅移动紧凑HUD/路线卡，不改变跳跃或奖励规则。

**观察到：** 双引擎正常触控首关：l1-o1于18.80游戏秒/约141m以jumped=true通过，奖励鱼l1-jump-l1-o1于19.73秒/147.94m被抓；其后l1-o3即使jumped=false，31.06秒/232.95m仍抓到对应奖励鱼。；分开的无跳重玩：0跳，安全通过l1-o1与l1-o3，并分别在19.72及31.06秒收下两条bonus金鱼；截图时仍在跑，未冒称该分支通关。；V3源码将bonus鱼放在路障后9m；每条golden bonus按fishPoints记7分（普通金鱼5分+bonus2），仍是一条普通可收集金鱼；首关无跳自然通关可得2星，三星要求至少跳1个路障。

**推断：** 跳跃的可辨认收益是留在当前路线直过路障并累积mastery/三星条件；安全绕行需要换道，但不会剥夺这份鱼/金鱼奖励，因此不是独占货币。；现有数据支持机制公平性和两种可行路线，不能推断玩家觉得跳跃值得风险或更有乐趣。

**未知：** 真人对跳跃时机、绕行代价、碰撞风险和三星门槛的偏好/失败率未知。

**审计结论：** 机制及安全替代路线有当前双引擎证据；主观风险回报价值未验证。

### 2. `first-minute-catch-avoid-success-reward`

**相对基线/本轮改动：** 相对基线的随机开放骑行，V3把第一关改为有目标/雷达/掌握条/完成结算的有限旅程，并把首批鱼和障碍排成可读首分钟；已有基础跳跃与鱼收集不算新功能。；完整V3增加首鱼提示、行人预警、可跳障奖励/绕行提示、星级结算与重开入口；attempt20只改紧凑屏幕排版。

**观察到：** Chromium/WebKit fresh browser正常触控、stateInjection=false：首鱼1.858秒/13.94m，普通金鱼8.26秒/61.93m，首次避开行人约12.14秒/91.04m，首个跳过路障约18.80秒，后置金鱼约19.73秒/147.94m。；同一首关轨迹约40秒到300m，以17鱼、5金鱼、1跳障、零碰撞结算3星；两引擎结果约40.00秒。游戏时钟与runner墙钟分开，runner首鱼约1.9秒不是手机性能。

**推断：** 关键循环在首分钟内完整出现：捕获→看预警换道→跳/绕路障取舍→收奖励→通关/星级反馈。截图和事件证明呈现顺序，不证明新手理解或觉得节奏好。

**未知：** 没有自由真人新手观察或理解度测量；没有实体手机触控/性能验证；没有作者或玩家主观有趣度认可。

**审计结论：** 首分钟可观察流程由当前自然输入证据覆盖；理解与主观体验未验证。

### 3. `five-stage-operation-fishing-rain-night`

**相对基线/本轮改动：** 相对授权基线开放骑行，V3加入5个有限关卡、明确速度/终点/捕鱼目标/障碍行与各自固定鱼道；原始一般跳跃机制被用于路障，不是新增的操作类型。；完整V3加入行人、动态汽车/面包车、可跳路障组合、雨景与暮色目标；L4雨天车道弹簧频率13.7（普通14.5，约低5.5%），L5仅暮色照明/更长路线/更高金鱼目标，没有夜间专属动作。

**观察到：** 五关同用三车道左右变道、上滑跳跃、靠近自动捕鱼和雷达预警。L1 300m/7.5m·s⁻¹/4障碍行；L2 420m/8/6行且行人交替；L3 540m/8.8/8行，汽车、面包车、行人与路障混排；L4 630m/9.2/11障碍条目/9个不同距离组，雨景且三星需2跳；L5 720m/9.6/13条目/11个距离组，暮色、目标24鱼/3金鱼/2跳。；五种预设鱼道分别为[1,1,2,2,1,0,0,1]、[1,2,2,1,0,0,2,1]、[1,0,1,2,2,0,1,2]、[1,2,0,2,0,1,2,1]、[1,2,0,2,0,1,0,2]（0/1/2=左/中/右）；首三鱼从中道开始，障碍安全规则会覆盖不安全路线。；current20双引擎正常输入五关流程可运行。跨关的操作仍是同一动作集；源码/浏览器结果没有夜间专属动作。

**推断：** 实用差异来自要预判哪条车道可走、在哪类障碍前换道、是否把路障留给跳跃；路线和速度递增提供轻量变化，但更像同一玩法的障碍编排，非五种独特操作。；雨天约5.5%响应差异可能难以感知；暮色的视觉暗化和多一条金鱼目标不能当成新的玩法机制。；设计范围推断：暮色不额外引入与照明无关的独立操作，以避免功能扩张并保留连续骑行的同一操作节奏；这是范围取舍，不是玩家需求或可玩性结论。

**未知：** 玩家能否察觉雨天响应差异/认为公平；真实手机夜景道路可读性；各关新鲜感和难度梯度都无真人评分。

**审计结论：** 关卡数据与操作路径差异可复核；动作多样性/雨夜新鲜感仅部分成立。

### 4. `replay-three-stars-best-fish-routes-feedback`

**相对基线/本轮改动：** 相对授权基线的开放骑行/泛成就，V3新增逐关解锁与完成、3星门槛、跳障mastery、每关best字段、鱼道重试和campaign重玩；attempt20紧凑路线卡把这些目标重新排版。；best在鱼数、金鱼、跳数、分数四字段分别取历史最大值，stars取历史最高；earned jump后UI继续指向对应奖励鱼。

**观察到：** current20正常触控首关结算/保存页面展示3星、路线卡17鱼纪录及全海岸3/15星；可重开/回选路线，重玩不需整页刷新。；无跳五关campaign两引擎都是每关2星，共10/15；跳障路线Chromium为15/15，WebKit为14/15。WebKit L4为27/28鱼、6/3金鱼与3跳，得到2星；Chromium L4为29鱼、7金鱼、3跳得3星。；结算/路线卡展示捕鱼、金鱼、跳障、无碰撞及时间目标；失败按碰撞/路程/鱼量等原因反馈。source updateBest逐项max，不会让更差记录覆盖单项best。

**推断：** 三星、鱼路与纪录提供可理解的短期重玩目标；逐项best可跨局保留各指标峰值，但并不必然代表同一局同时达成这些峰值。双引擎L4一鱼差异说明15/15一致性尚未达到。

**未知：** 无长期留存、真人路线偏好、跨设备保存或重复疲劳数据；无论自动campaign完成几次都不能证明长期重玩动机。

**审计结论：** 短期保存/重玩/反馈有证据；WebKit三星差异和长线动机仍未定。

### 5. `pacing-gaps-and-risk-reward`

**相对基线/本轮改动：** 授权基线main按16+随机0–18m生成鱼距；V3改为每16m一条普通鱼并把障碍位置/鱼道/金鱼目标作者化，形成可复现节拍和关卡风险段。；V3叠加随关递增的速度/路程/障碍量、路障后奖励与三星风险条件；尝试20没有改这些节奏参数，只重新排版紧凑HUD。

**观察到：** 普通鱼固定每16m；按各关速度相当于约1.67–2.13游戏秒一条。障碍距离组相邻间隔：L1为22–63m，L2为52–58m，L3为61–76m，L4为56–69m，L5为50–68m（多数中后关约5–9秒一组，依关速换算）。；目标速度7.5→9.6m/s、距离300→720m、障碍组数4→11；同一关内速度恒定。危险提示最多约4.5秒，奖励鱼固定在可跳路障后9m。雨画面和道路/车辆可见；暮色全帧车灯外路面较暗，HUD、雷达和发光鱼仍清楚。

**推断：** V3把基线有抖动的鱼距收紧为规则节拍，可能更易学但也更机械；关卡障碍行间距提供短休息和局部密集点，结构上未见渐进加速或动态难度。；路障后鱼把“保持车道跳过”与“换道绕行”接起来；奖励并非独占（见第1项），因此风险主要关系跳障计数/操作偏好，不应夸成硬币门控。

**未知：** 真人主观紧张/休息/重复感、公平感和夜景可读性均未测；缺实际玩家失误率及手机亮度环境。

**审计结论：** 节拍与间隔参数有代码/轨迹证据；风险回报和张弛感没有体验评分。

### 五关鱼道与当下操作选择

| 关 | 名称 | 固定鱼道（0/1/2 已映射为左/中/右） | 路线决策 | 观察 |
| --- | --- | --- | --- | --- |
| 1 | 海岸出发 | 中 → 中 → 右 → 右 → 中 → 左 → 左 → 中 | 中路前三鱼；先在90m行人处观察横穿方向，再围绕140m中路路障选择跳或侧绕，追固定鱼路。 | 先行人后路障。 |
| 2 | 行人出没 | 中 → 右 → 右 → 中 → 左 → 左 → 右 → 中 | 76/134/192m行人左右交替，随后246/356m路障；预留相邻车道并在绕人后回到鱼线。 | 行人交替横穿。 |
| 3 | 危险公路 | 中 → 左 → 中 → 右 → 右 → 左 → 中 → 右 | 100m车辆、161m行人、222m面包车+中路路障同组，之后汽车/路障与面包车交错；以雷达预判车辆线和可跳道。 | 汽车/面包车与行人/路障混排。 |
| 4 | 雨中骑行 | 中 → 右 → 左 → 右 → 左 → 中 → 右 → 中 | 雨景中225m面包车与中路路障同组，410m汽车/面包车并列；三车道变道/跳跃规则不变，但转向回中稍缓且三星要求2跳。 | 雨景混障，三星需跳两障；WebKit跳障路线少1条鱼得2星。 |
| 5 | 夜间赶海 | 中 → 右 → 左 → 右 → 左 → 中 → 左 → 右 | 暮色下210m面包车与中路路障同组、516m汽车/面包车并列，障碍更密、速度更快、金鱼目标更高；无专属夜间输入。 | 暮色、稀有金鱼目标和更长路线；未见专属夜间动作。 |

鱼路遇到不安全车道时由安全规则覆盖。设计取舍（推断）：暂不增加第二套夜间操作系统，避免额外操作/判定成本，并把注意力留给固定鱼道选择、危险提示可读性和连续骑行；现有审计没有证据证明玩家需要夜间专属动作。暮色远处道路可读性仍需实机复核。

### 首分钟观测时序

| 游戏秒 | 事件 | 来源 |
| --- | --- | --- |
| 1.858 | first ordinary fish caught | experience-chromium and experience-webkit normal-input event reports |
| 8.258 | first ordinary golden fish caught | both current20 engines |
| 12.139 | first pedestrian avoided | both current20 engines |
| 18.802 | first barrier jumped and cleared | both current20 engines; normal trusted touch |
| 19.726 | post-barrier bonus golden fish caught | both current20 engines |
| 40.001 | first level completed and three-star settlement | both current20 engines; 17 fish, 5 golden, 1 jump |

审计记录无跳五关路线完成 5 关、10/15 星并观察到免整页刷新重玩。跳障路线当前自然风险结算为 WebKit **14/15**、Chromium **15/15**。审计原始测量分别为 Chromium 15/15、WebKit 14/15；两引擎有一星差异，不能合并成相同结果。

前轮单独 pivot 的动作仍被车身/当前取景遮挡，现有对照没有独立验证它；本节的有限帧、桌面视频和姿态遥测不能替代这项可见性验证。

审计的完整源码/构建 SHA 清单经逐项复核。下表列出当前 H5 与相关源码的关键绑定；历史基线和截图等其余源项仍保存在 audit JSON 中。

| 当前源文件 / 构建角色 | 仓库相对路径 | SHA-256 |
| --- | --- | --- |
| exact current H5 build | runs/pelican-coast-v2-20261014/attempts/attempt-20/index.html | 3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1 |
| current V3 five-stage routes, fish-lane patterns and obstacle placements | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/levels.mjs | 249db22c4bdef2b836304346d8de9af62a9bfa62bb45cd8b48e98c586c2bfd5e |
| current V3 run loop, collision, control and local campaign settle/save | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/adventure.mjs | b31d66d2474def9559147b4cbbc4d108139a09905b400084a2f8d7788e0fe69c |
| current V3 barrier bonus, stars/mastery, best metrics and jump cue | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/engagement.mjs | f9ed065669b3eca038bd9cc7a238a2900d33f3e4795400beaa18091be2ce4999 |
| current V3 hazard forecast, safe-lane fish fallback and warning horizon | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/safety.mjs | f0babe85fe93ae1d50e13267e96782e25da13244468ba20190efffcfb107d22f |
| current V3 lane response and rain-frequency values | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/feel.mjs | 748dfc0514d66c29e3df6e8d9b7c528354426fe737a29f8d5da0c63102e1d04e |
| current V3 first-minute cues, controls, route cards and terminal/replay feedback | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/coast-ui.mjs | 02f6d568e4d762a9c8d3402aa711b900026563b4b62368944f187adb6cebaa5a |
| current attempt20 responsive compact layout | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/coast.css | dd3d1ddf4b5445f77d7c2f2179fce5dbb08ec9108cbb35205042d9ca137be348 |
| current V3 renderer and runtime integration | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/main.js | c117aa309b7a763ba91e6a62077f6575e3d4323393acf30db6eba8f4e68f58d2 |

### 五关配置与自然结算

| 关 | 名称 | 路程 / 速度 | 目标鱼 / 金鱼 | 天气 / mastery 跳数 | 本轮鱼 / 金 / 用时 / 结果 |
| --- | --- | --- | --- | --- | --- |
| 1 | 海岸出发 | 300 m · 7.5 m/s | 8 鱼 / 0 金鱼 | 晴 · 1 跳 | 20 / 5 · 40.0s · complete |
| 2 | 行人出没 | 420 m · 8 m/s | 12 鱼 / 1 金鱼 | 晴 · 1 跳 | 26 / 5 · 52.5s · complete |
| 3 | 危险公路 | 540 m · 8.8 m/s | 17 鱼 / 2 金鱼 | 晴 · 1 跳 | 34 / 7 · 61.4s · complete |
| 4 | 雨中骑行 | 630 m · 9.2 m/s | 20 鱼 / 2 金鱼 | 雨 · 2 跳 | 31 / 7 · 68.5s · complete |
| 5 | 夜间赶海 | 720 m · 9.6 m/s | 24 鱼 / 3 金鱼 | 黄昏/夜色 · 2 跳 | 36 / 6 · 75.0s · complete |

天气只描述当前关卡配置和渲染主题。第 5 关目前没有独有的夜间操作规则；这属于后续体验设计空间。鱼点 16 m 间隔由当前关卡源码读取，作为重复节奏记录，不从截图推断。

节奏取舍：本轮保留16m的基础捕鱼节拍，用不同鱼道、混合障碍段及跳/绕路线改变决策。固定节拍有利于预判，是否会疲劳仍缺真人数据；随机鱼距或动态难度并不能据此被认定更有趣，因此本轮不引入这两种系统。规律节拍的机械感作为明确局限保留，不标成已经由玩家验证解决。

## 风险奖励与重玩

| 浏览器 | 关卡 | 名称 | 目标障碍数 | 自然结算鱼/金/跳 | 存档星级 | 用时 | 桌面运行采样 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| webkit | 1 | 海岸出发 | 2 | 16/5/2 | 3★ | 40.0s | 58.5 fps / p95 25 ms |
| webkit | 2 | 行人出没 | 2 | 21/6/2 | 3★ | 52.5s | 58.7 fps / p95 24 ms |
| webkit | 3 | 危险公路 | 2 | 30/7/2 | 3★ | 61.4s | 59.2 fps / p95 24 ms |
| webkit | 4 | 雨中骑行 | 3 | 27/6/3 | 2★ | 68.5s | 58.9 fps / p95 24 ms |
| webkit | 5 | 夜间赶海 | 3 | 36/8/3 | 3★ | 75.0s | 59.2 fps / p95 23 ms |
| chromium | 1 | 海岸出发 | 2 | 16/5/2 | 3★ | 40.0s | 112.8 fps / p95 10 ms |
| chromium | 2 | 行人出没 | 2 | 21/6/2 | 3★ | 52.5s | 114.4 fps / p95 10 ms |
| chromium | 3 | 危险公路 | 2 | 30/7/2 | 3★ | 61.4s | 115.5 fps / p95 10 ms |
| chromium | 4 | 雨中骑行 | 3 | 29/7/3 | 3★ | 68.5s | 113.8 fps / p95 10 ms |
| chromium | 5 | 夜间赶海 | 3 | 36/8/3 | 3★ | 75.0s | 116.1 fps / p95 10 ms |

| 浏览器 | 目标障碍总数 | 五关覆盖 | 结算/存档 PASS 关数 | 最终重玩 |
| --- | --- | --- | --- | --- |
| webkit | 12 | 5/5 | 5 | 是 |
| chromium | 12 | 5/5 | 5 | 是 |

| 浏览器 | 跳障路线五关星级 | 合计 |
| --- | --- | --- |
| webkit | 3★ / 3★ / 3★ / 2★ / 3★ | 14/15 |
| chromium | 3★ / 3★ / 3★ / 3★ / 3★ | 15/15 |

跳跃奖励与安全绕行都取自正常触控事件轨迹。奖励金鱼并非跳跃专属：自然绕行轨迹在没有 jump/barrier-jumped 事件时仍捕到 `bonus=true` 金鱼；对照轨迹则记录跳跃、路障清除和随后获得的奖励鱼对象 ID。因而跳跃是 mastery/三星挑战的一部分，报告不把 bonus fish 描述为只能通过跳跃获得。

## 头部与动作观测

头部问题的根因记录为：原演示的初始状态没有 `yaw`，开始骑行前原生头部 IK 因此得到非数值变换。当前 `feel.mjs` 的 `syncRidePose` 在冷菜单初始化完整的有限姿态（yaw/lean/steer 为0），骑行时在原生 IK 更新前复制实际运行姿态。观测接口直接复制真实关节，未用有限值替换坏数据。原头颈/喙几何和 .355 颈长、28度目光保留；最初放大几何的假设已撤回。两浏览器四种尺寸的头部相关自然流程均有证据；后视角中朝前的喙在部分帧仍被身体遮住，不能据此宣称喙部独立动画已经验收。当前两引擎的 native pose 报告共检查 **12** 个姿态帧；前叉4×4矩阵、车身倾斜、头身角度与请求yaw均须为有限数才生成本报告。用户图像已绑定本run，但**原图对应的源代码revision未知**，不把它精确归到某个提交。

骑行沿用原蹬踏、围巾和头部动画；变道采用保留横向速度的二阶弹簧，快速反向输入不会直接把车体位置跳到下一道。车身倾斜、航向和车头关节接入实际姿态，镜头跟随实际横移并保留滞后回正。规则测试覆盖帧率变化和反向连续性；双浏览器正常90ms触摸序列保留六组画面及前后状态、实际碰撞结算与重开。这些证据验证动作连线和可见的整体运动；独立前叉仍受后视遮挡限制，主观“更自然”的偏好仍须真人试玩。

PR #10、#13 与V3使用各自原有镜头。对照使用相同屏幕、按压时长和输入顺序；PR #10是侧视/持续按住转向，PR #13/V3是后视/单车道步进，因此不能声称三者镜头或操作语义完全相同，也不据此排名手感。输入方式原始记录：PR10: WebKit side-view; held steering / Chromium side-view; held steering；PR13: WebKit rear-view; one-lane steering / Chromium rear-view; one-lane steering；V3: WebKit rear-view; one-lane steering / Chromium rear-view; one-lane steering。`capture t+` 是开始后的采集墙钟，不是游戏秒；录像早于该时钟开始。按录像长度与最后RAF样本估算的时间偏移仅为近似，录制尾段误差未经量化，first-touch并非严格同步。provenance 引用的 120 张独立逐帧 PNG 均保留并已逐项校验。 视频、已校验原始帧和关节遥测仅证明桌面采样到的运动，不证明手机FPS或真人偏好。

## 工程检查与 CI

- Pelican 单测：**111/111，PASS**。
- Pelican lint：**PASS**；typecheck：**PASS**。状态取自最终工厂检查文件。
- 全仓检查：**FAIL**，2 项（FAIL 2）。失败项逐项按原始命令和摘要列出；只有证据字段明确标记 unrelated 时才归类为无关失败；本轮全仓结果不是全绿。
- 专项 CI：**PASS（仅 Pelican V3 WebKit + Chromium 专项 job）**。测试代码提交：`d9dfb242ace3424afbd7382ea85702c08930d839`；run：**38583073297**（[打开 workflow run](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073297)）。WebKit 与 Chromium CI 记录分别绑定当前 H5 hash `3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`；PR 快照只用于核对同一个 40 位 source head 和这两个专项 job 的状态。
- 该绿灯只说明上面的测试代码提交；后续报告/证据文档提交没有继承这次 CI 结果，也没有在这里标成已通过。
- 后续cd808源码的取消起跳测试失败、保持断言的输入时序修正和双浏览器自然复测，见 [CI取消分支复测补充](QA_CI_FOLLOWUP_ZH.md)。最终源码的CI状态与独立回执由PR #16及其Draft附件提供，不把历史绿灯沿用到后续提交。
- 规则计数按各自证据快照分别列示：当前本地工厂测试 111/111；专项 CI 回执在源码 head `d9dfb242ace3424afbd7382ea85702c08930d839` 上记录 105/105。该 CI 数字不代表它运行了后来新增的本地规则测试。
- CI通过真实菜单触摸选择既有“省电”画质，使用DPR1、Xvfb/Mesa和 `prefers-reduced-motion:reduce`；减少动画由既有CSS响应。它证明这一CI变体，未修改速度、碰撞、鱼或跳跃规则。默认动画、DPR3的本地双浏览器证据另行保留；历史默认软件图形路径中提示透明度为0的失败仍保留，未宣称根因已经修复。

| CI job | 实际状态 | head SHA | 精确 job 链接 |
| --- | --- | --- | --- |
| pelican-browser (webkit) | PASS | d9dfb242ace3424afbd7382ea85702c08930d839 | [打开本次 job](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073297/job/115917771733) |
| pelican-browser (chromium) | PASS | d9dfb242ace3424afbd7382ea85702c08930d839 | [打开本次 job](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073297/job/115917772342) |

| 引擎 | 达成关卡 | Campaign checks | Experience checks | Pelican 规则测试 |
| --- | --- | --- | --- | --- |
| webkit | 5 | 18/18 | 22/22 | 105/105 |
| chromium | 5 | 18/18 | 22/22 | 105/105 |

| 引擎 | CI artifact | artifact path | SHA-256 |
| --- | --- | --- | --- |
| webkit | pelican-v3-webkit-d9dfb242ace3424afbd7382ea85702c08930d839 | https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073297/artifacts/11904736138 | ad138f7f4fde70a9a58db0840949a44367bb423ac74eb1103f2af9b986a94477 |
| chromium | pelican-v3-chromium-d9dfb242ace3424afbd7382ea85702c08930d839 | https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073297/artifacts/11903569326 | fb82f5a9621f25788379263f64f032ca1c735e571552153da3da1bc73e7343af |

CI report bindings 已逐项与本 run 的本地文件 SHA-256 核验，并与 evidence manifest 中存在的条目交叉比对；具体相对路径列在下方证据表。

### 其他 PR/CI checks（不用于 Pelican V3 专项结论）

| 来源 | Check / job | 状态 | 链接 |
| --- | --- | --- | --- |
| PR snapshot | offline-engineering | PASS | [打开 check](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073341/job/115917770818) |
| PR snapshot | three-h5-real-rea | SKIPPED | [打开 check](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073341/job/115917773069) |
| PR snapshot | pelican-v32-real-h5 | PASS | [打开 check](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073341/job/115917770179) |
| PR snapshot | http-browser | PASS | [打开 check](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073341/job/115919004568) |

其他 checks/jobs 中 FAIL：**0** 项；这些状态单独保留，不替代 WebKit/Chromium 专项结果。

### 全仓失败项

| 命令 | 状态 | 原始摘要 | 证据路径 | SHA-256 |
| --- | --- | --- | --- | --- |
| pnpm test | FAIL | Actual final d9 source run: 973/975 assertions PASS; 169/188 files PASS. 17 node:test files are miscollected by Vitest as no test suite; stale-waiver assertion also reports blocking license risk; unrelated cut-stack natural-runtime QA times out after30000ms. These shared-factory/other-game failures remain FAIL and are not used as Pelican gameplay acceptance. | runs/pelican-coast-v2-20261014/evidence/v3-engineering/repository-tests-final-d9.log | ccc86b4226e610373352f51223c269292e0c9a38f10eb9471106f770315d4b7c |
| node --test (historical correct runner for17 node suites) | FAIL | 此前正确Node运行器218/222通过，4个mobile-pacing夹具因中文路径的URL编码产生ENOENT；不是鹈鹕游戏测试证据，原始结果保留。此次源文件未修改，未重复运行。 | runs/pelican-coast-v2-20261014/evidence/v3-engineering/factory-node-runner-retest.log | 2501059b63f1770ff4878db9408166c86becf24d16e7d3943c46f0c4926f7f7b |

明确标记为 unrelated 的失败：**2** 项。未带 scope/classification 的失败保留原始失败状态，不擅自归因。

## 修复路线与审计范围

- 路线：**formal-fixer**。本次是正式 Fixer 流程；判断依据：`Measured19 compact instrument starts122 before goals124.89; move to130 with all five readable goals preserved. Exactready-menu rows inherit fixed height and multiline text escapes; use intrinsic rows and auto card height. Preserve19 red probe and18 independent stopflags. Native model/camera/riding physics unchanged. Rebuild20 once then full dual natural QA and independent30cases.`。
- attempt：**20**；原始修复 thread：`01a13864-04f9-7b81-a7ce-634ccab315ce`；代码 hash：`c45d85100a4e1bb619c45d0ec28d77e354bf601edcd1ad8262870bdd0cacd91c`；build hash：`3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`。
- 明确省略的上下文：`unrelated games`、`full conversation`、`legacy REA logs`。
- 目标 workspace：`/Users/kker/.codex/worktrees/pelican-feel-v3/妖怪夜市/runs/pelican-coast-v2-20261014/workspace`。

## 证据与下载

ZIP SHA-256：`97c52ee04fa3bcb29500f1165ccdcfeee64d3d77d50207604fa2952ebee2510f`。H5 build SHA-256：`3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`。

| 材料 | 仓库内相对路径 | SHA-256 |
| --- | --- | --- |
| 构建 receipt | runs/pelican-coast-v2-20261014/build-receipt.json | 771082d72c7c4a0c4a4f96d820bc47839582d3f3f0389d033b97eb7e41c85feb |
| QA summary | runs/pelican-coast-v2-20261014/qa-summary-v3.json | 8e20d6324334f90e51cfc3ad04e2d250ef0006d632e85d60be0b6c28c16f2cd3 |
| QA report | runs/pelican-coast-v2-20261014/qa-report-v3.json | d9fdd710f3ecde6448d056cc3961b1b29655b11cdd7c81c5b593d4030120129d |
| Build report | runs/pelican-coast-v2-20261014/build-report-v3.json | efc4f9f712584c0bbb328796e57b37b65f6cae505e4f7e9ab69eb82624b4e088 |
| QA evidence manifest | runs/pelican-coast-v2-20261014/qa-evidence-manifest-v3.json | f74890b7e3e532cc6e85beae8bc39785e1575bb732d328747a023b2f64e7c6d7 |
| artifacts/perceptual-qa-gate-v3.json | runs/pelican-coast-v2-20261014/artifacts/perceptual-qa-gate-v3.json | c656a06f5abe71fc31525b1dd6cb0070908cf32555e359693cab1d08eb6ae268 |
| artifacts/runtime-product-gates-v3.json | runs/pelican-coast-v2-20261014/artifacts/runtime-product-gates-v3.json | 3b28f9d40c427240384551e378ccc7fcd2b96b3e7cbb4e6562223b82f75a2907 |
| artifacts/runtime-wiring-verification-v3.json | runs/pelican-coast-v2-20261014/artifacts/runtime-wiring-verification-v3.json | f2f8322d90c56ddd99aa6a91bbe3fa62e3e4115c656b37c5ef45dca437fdaeca |
| Factory checks | runs/pelican-coast-v2-20261014/evidence/v3-engineering/factory-checks-final.json | e41672503299a0050c6be925bed6a04095d4786a60234d9b9aceaf92250bdfcf |
| 独立体验审计 attempt 20 | runs/pelican-coast-v2-20261014/evidence/v3-engineering/experience-audit-final20.json | 219f956e292771d5eebdf7a7f357911e328cb20a2ee143e17aaa83436b73d113 |
| 独立审计源码 · exact current H5 build | runs/pelican-coast-v2-20261014/attempts/attempt-20/index.html | 3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1 |
| 独立审计源码 · current V3 five-stage routes, fish-lane patterns and obstacle placements | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/levels.mjs | 249db22c4bdef2b836304346d8de9af62a9bfa62bb45cd8b48e98c586c2bfd5e |
| 独立审计源码 · current V3 run loop, collision, control and local campaign settle/save | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/adventure.mjs | b31d66d2474def9559147b4cbbc4d108139a09905b400084a2f8d7788e0fe69c |
| 独立审计源码 · current V3 barrier bonus, stars/mastery, best metrics and jump cue | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/engagement.mjs | f9ed065669b3eca038bd9cc7a238a2900d33f3e4795400beaa18091be2ce4999 |
| 独立审计源码 · current V3 hazard forecast, safe-lane fish fallback and warning horizon | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/safety.mjs | f0babe85fe93ae1d50e13267e96782e25da13244468ba20190efffcfb107d22f |
| 独立审计源码 · current V3 lane response and rain-frequency values | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/feel.mjs | 748dfc0514d66c29e3df6e8d9b7c528354426fe737a29f8d5da0c63102e1d04e |
| 独立审计源码 · current V3 first-minute cues, controls, route cards and terminal/replay feedback | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/coast-ui.mjs | 02f6d568e4d762a9c8d3402aa711b900026563b4b62368944f187adb6cebaa5a |
| 独立审计源码 · current attempt20 responsive compact layout | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/coast.css | dd3d1ddf4b5445f77d7c2f2179fce5dbb08ec9108cbb35205042d9ca137be348 |
| 独立审计源码 · current V3 renderer and runtime integration | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/main.js | c117aa309b7a763ba91e6a62077f6575e3d4323393acf30db6eba8f4e68f58d2 |
| Dedicated CI run receipt | runs/pelican-coast-v2-20261014/github-ci-v3.json | 44551980d672b2ab08b4b7e1da3323761eaadf136a9288e7aa59cdd5f014c59b |
| Captured PR checks receipt | runs/pelican-coast-v2-20261014/github-pr-v3.json | b3f171823fb9fa5c41a07d6e97211708e14815e09cc9155fc954a06155831512 |
| CI report binding webkit | runs/pelican-coast-v2-20261014/evidence/ci-d9dfb24/webkit/attempts/attempt-1/qa-campaign-webkit/report.json | 42fdd69605a4a2a1f980b91caca213f68a166885448868eca561f9ba1877b8e0 |
| CI report binding webkit | runs/pelican-coast-v2-20261014/evidence/ci-d9dfb24/webkit/attempts/attempt-1/experience-webkit/report.json | 1d80423cab7e05476c20539b7928e3cf65a42abb04f398cc75da566277bbbad1 |
| CI report binding chromium | runs/pelican-coast-v2-20261014/evidence/ci-d9dfb24/chromium/attempts/attempt-1/qa-campaign-chromium/report.json | eeeb2a4db5ee12880632d083a46fc20c36f510361e7d16a4dc59ef4213ecc835 |
| CI report binding chromium | runs/pelican-coast-v2-20261014/evidence/ci-d9dfb24/chromium/attempts/attempt-1/experience-chromium/report.json | 245cec8d86f34c6bbd421f7f5ef4b4943f1ba351656f490605bcaf9dd9b32dd9 |
| 当前工作区 H5 | runs/pelican-coast-v2-20261014/workspace/game/index.html | 3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1 |
| Open-source / reuse research | runs/pelican-coast-v2-20261014/open-source-research-v3.json | 7c446f15f21d37ac1a79eda2e96e00be0a97dad0b30a951566ef01f638020f1b |
| 关卡配置源码 | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/levels.mjs | 249db22c4bdef2b836304346d8de9af62a9bfa62bb45cd8b48e98c586c2bfd5e |
| 冷启动 yaw reset 源码 | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/feel.mjs | 748dfc0514d66c29e3df6e8d9b7c528354426fe737a29f8d5da0c63102e1d04e |
| 头部/喙部源几何文件 | runs/pelican-coast-v2-20261014/workspace/source/pelican-bike/src/pelican.js | 5f9a79741a52a039bd0fb94c75e929b541c51f87b3cdbde3f6f086457aceded4 |
| H5 候选 ZIP | docs/lean-pilot/pelican-feel-v3-20261014/release-candidate/pelican-coast-v3-h5-candidate.zip | 97c52ee04fa3bcb29500f1165ccdcfeee64d3d77d50207604fa2952ebee2510f |
| 下载清单 | docs/lean-pilot/pelican-feel-v3-20261014/release-candidate/download-manifest-v3.json | a9770a266182b1ac18e684bc3c703503cf9b2f5edc45aca6e86c217f202d4219 |
| ZIP 包清单 | docs/lean-pilot/pelican-feel-v3-20261014/release-candidate/package-manifest-v3.json | 0e69889b1d693b1be4f744a0d757317dbc750f074aa155b9ce9ffdbe0ecfdeec |
| 自然体验 webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/experience-webkit/report.json | fea603f18093a766308b2bd2508001f0ac761e7f1b63746a73cc4211bd4eb405 |
| 五关风险 webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/risk-webkit/report.json | e528e4ccad4c9c411aafb8777fd56128564e570a32994dfbecbc2e7066169854 |
| 姿态观测 webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-state-webkit/report.json | 2c318007d9e1be4f3a274a7ed11517e7705547bead1d894b4370360e29f2c481 |
| 动作对照 webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/report.json | b1471af65189e8c34a59134e0961a2f22b753d10710081677224ce7bdfbba39a |
| 自然体验 chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/experience-chromium/report.json | 08297ecbd85a7bcace1fa9618fabb595e8b4a50e29204b9896e811790da2602c |
| 五关风险 chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/risk-chromium/report.json | bfe3414074ff68c7214075e31c194c090cc3882d52d42d054c0a06065b24d486 |
| 姿态观测 chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-state-chromium/report.json | b0f84adf452f57a64c050bbdd78e29a6c70a848f42985941d1b328dc43bcdbcd |
| 动作对照 chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/report.json | 382bafe92ef1ad17fef3bb19e9a94c508b266e9e16ca00f33ea199ef193d7962 |
| 对照源报告 PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/PR10/report.json | 33c167709462a7d7a0a6bf295f1ee23de500f4387ad2095938a893dc42a49147 |
| 对照源报告 PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/PR13/report.json | 5b869fda8b5ffb4a723b7c6e9a28f1f5cd06f230f4e1d02835d4a3b221480e21 |
| 对照源报告 V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/V3/report.json | e67e8d694e3f60a018a87e6f95dbedd3d936bbd1bdf7b6b1d5fb49525cbe8c42 |
| 对照源报告 PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/PR10/report.json | d9417a7f30cbec0f35e0a95e2d91c5ee7b8b3e45b0b88eb005ba34b0012e6920 |
| 对照源报告 PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/PR13/report.json | e32397b1b07e4f4d5f7048f24b7d5ef30c232ceb00b3eb40032ecddf15e41207 |
| 对照源报告 V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/V3/report.json | 1011cd23a9bf383012d20c42dc718eb63a92d083830735f1e5ca7e48e668ac54 |
| 对照帧 provenance | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/provenance.json | a853f81183bdcfdb909b6e1c98010f26d0d6ce09f1329d92eed9b1cc61fe2476 |
| 对照源帧 PNG PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR10-0820.png | 728ee5a6bb0daa4eda9e1d8469c87d02ac08211347453dac4e084788ba9769a2 |
| 对照源帧 PNG PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR10-1000.png | 9fbebbdfef3ec20cd24384de2547bb07e6a81872d705dfb8f2ae935239dadc6a |
| 对照源帧 PNG PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR10-1320.png | c3e970753b6c3b7e76bf89d0a30d22b061b76bcef3bead55a81c93c39b5b3086 |
| 对照源帧 PNG PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR10-1520.png | a461e0051db9bd6bf54518722baa27279db8f66cfbfc040a8fd3ae22be92e61c |
| 对照源帧 PNG PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR10-1750.png | f6070ae120b831793e0e4ab9e0aa4c5c242e39cb5b1f10c5cf913ed6d49100f6 |
| 对照源帧 PNG PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR10-2480.png | 1f367aca797deb51da3fb6793d01f0f1d0189df6c072be08aed0f037b3e18314 |
| 对照源帧 PNG PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR13-0820.png | 0f8fdffdd5a54ec193a465e95351a1865864b72ab6c5bad86743860ba0bed872 |
| 对照源帧 PNG PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR13-1000.png | 5f770864a62211db0d9ea22fd97a24032733ffa42a47404750f1010724d3529e |
| 对照源帧 PNG PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR13-1320.png | 1f0e1497b6852474b0895bf7c2591a76795da7ca6815c78756cc7f840f62b37d |
| 对照源帧 PNG PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR13-1520.png | 999bf0f0fdb9b551c9cd0682ffe305bc066c32a9b1e44ac7b23c06fb71290971 |
| 对照源帧 PNG PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR13-1750.png | 1d3bd8ad4b02308e972f0678fcfc65334d0fb5ae840711a1def40d53373d2e7f |
| 对照源帧 PNG PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-PR13-2480.png | 1fde5c34a4ef5b637f8b040b35e21e2e47f7eefac63a0d79a5a3f7461f03fe8b |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-0820.png | 4e9835a6b1ef2faa4f7966c3defec218a1df4b2c4d1775a3761ea5a9060eee3f |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-1000.png | ac8a99b8c211a5e5af326894b8700b82fcd35bb829412a6877676e4de08e9922 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-1320.png | ce22dda0b307095d316f8b0a12c93361e4a47bff9b3dc067594e242ec4bcae8c |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-1520.png | 79dfb2477c72b47bccfc9d5d4ffbcc3c3ae1ee2d24e73edb35fe8de90d7e8907 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-1750.png | 9b21e1a51af5aff2ce0440873e3a23264d2c60ee811479dd2643db1802477ba0 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-2480.png | 844caef65c2701589d04d74012a16c1685810909537e246f5daba13e1db57179 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-00.png | 5a9d4ad3fb540876db4dd48772f0f066dac9b4643cfbe85b8b575d02edc33b7e |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-01.png | abaac42c3a400d08f2b3751cecd12c27a64599604b58c051148bc5875ca12daf |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-02.png | dd1514d6bde55d982b4b4eef4d068ffb69197068f29bc912f12c19d6e0ff5de5 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-03.png | 332dc5507818193b9167a18eb4f7ddf5a6e8a0e02436483642544dc4865fe466 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-04.png | 96709a89dd658ea6d307bbd9ce9c16f55b101a5fbfe1b9687930b1009819048f |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-05.png | 9a0f5ad1537908ef16a9b4e9db0fea5c263e55fc819b3aec5a788f3aed48beeb |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-06.png | 5331fd34f663347c85fb82b6fc928aea5487b03df157a6a5040f6f2844308c00 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-07.png | ce22dda0b307095d316f8b0a12c93361e4a47bff9b3dc067594e242ec4bcae8c |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-08.png | ae0fcc68a7b017561c4c1174253c0add52ea71df93bdcb247ca2249f61a0f8c2 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-09.png | 7cea8dda5b242a3c70d0bb65cb40d50755bdd457f5df0e7080b5011555529b18 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-10.png | 79dfb2477c72b47bccfc9d5d4ffbcc3c3ae1ee2d24e73edb35fe8de90d7e8907 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-11.png | 635d55fa8028eb689ab07ddb437c5524a20780b46a9e254e828b36d174498a2b |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-12.png | ee611523c7cc1656df1f46dfb6f01a0c3acd342a96d077870e5b154ff4aa917f |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-13.png | d3673912511d7a93fd1336e48debf8cdbb00442f0b7910d1fecba7f4195b1b6b |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-14.png | 048d6a7379d6be09624b958d8caba381374a560fef8ed1fd723f4cc701f3413a |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-15.png | a099ae725817b1a42962b2a38b37b050c590912a43af5d385aa086acbc6489bb |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-16.png | f3332924c3e4b9b2abca1ba0ad56c2397b3ff977f163a271f0488ace4b43f30a |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-17.png | c784fc98a97595539a27fdf4b6cae1842f5a81ca0d13a5271c35af9548601be9 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-18.png | d2a7ba34eef7658b4fb13dfd8fed4f3abe70c9258e4a533fae4d9c6036d57fed |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-19.png | 7573bf17859b70b675b663f515a60f5aea98b70b996a494f582ef8ab2575f647 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-20.png | 3fedce9f17813e5118720f9e5ac80822fd8d86e14534aee9cc173a2d07bbbc89 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-21.png | e76cc6a2375230276f9f9148eb934297d2b746248b5a404c03dae0a2558cb3db |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-22.png | e1a1c77585c821a38bac0ed75c506d13dfb48e45d480de4b30218969343e9ed6 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-23.png | 6c5956f08236607bebfa62bf87fce4f7c9eaac7a304a8fba45a251b73b3cf0ec |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-24.png | b69473bcde064f36ebd475570b829a0b6940c0fe34e20a5945108918edc22200 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-25.png | 9e36e38620de85e070d80e2013992886e878f435014f8f4b059b8f737c135932 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-26.png | fd9352938400d4c109bbf43e6f8d305247eb6bf48faaf4ec387de13fc920223d |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-27.png | 25259d3d4adcb547752be4644c98cf8342c90ec60deca0df00d0d8d9f636db71 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-28.png | 91ffbcf9c161dc6d948a3c95bd55301f75faab0b266551c38931425dcee2aa49 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-29.png | 62b566f215dc778377d46d4fff4c4705c93ab81797650b0017bc016443fe1dbd |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-30.png | 26455db6e5f4dc9646c5b96eb32069b43938d005ea2180fbfccc6de90e717a6f |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-31.png | ea0add4ef045948adc245d5b576d2a77de374f934069e94706bd685d5239af75 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-32.png | fd8dbdd3a9232ae727fdc56bca3021b9dbc0cfab6f3eb8121d264cb3ca270847 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-33.png | 9656d046c0df149fcab0f9ee75f04aa7191fc4b6c454d1fe94d33f48bf7a65bc |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-34.png | 3823d80e23c8dcb40b5815014804e4a25820a9c626c8ad5cd1d33f4a109a1bf4 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-35.png | 0ef36be62be959fe80cece333e09c2544b872d665eeea65f513ba9253d9655de |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-36.png | ab1b8bfa165bef10ed042ad2553ee7501e5eb5ec0a7491c13e2dbade45b54db6 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-37.png | 39157078a586060ba7a0e3cd958e3f923fcaa5d698dd22db79a0a202e56eec24 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-38.png | 82452e9f327585fc0bb77813fac043eae95990edd7fe03c8d6299df7e39e1e76 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-39.png | 9cfb71aaae0ca96f151f2d00a001aef85c17b3e1df97b9a0ff9e936c3e209480 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-40.png | 3ff45d33c4ef04c4b6d55de004993c2182aefa55ebca0b616d91a872e10e2270 |
| 对照源帧 PNG V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/webkit-V3-temporal-41.png | 9165291376cfca912185d6403ad7b551552af7df44c6d49ed20926838bfb7809 |
| 对照源帧 PNG PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR10-0820.png | dd47e79560951b5f8b412237249fb639a5ca97fe47bb77283b4f7a40781f0957 |
| 对照源帧 PNG PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR10-1000.png | 42e4e4d080517f66a4b6e45cab1c2375c98c3213aee0a6ac49ec798cc72401ab |
| 对照源帧 PNG PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR10-1320.png | 1b3838d3cd9dc3459f085a80157704542256e8c9bff29ce6f14c95082053e1d8 |
| 对照源帧 PNG PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR10-1520.png | 3a55801dcd409607228197f81836bb16ff24bf5d88c00d50adff2d5dbb709fe9 |
| 对照源帧 PNG PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR10-1750.png | 21b775c82f15f0bf2dd3ba76dbd47c964b74b7925ac6a347676a52f26983b0ed |
| 对照源帧 PNG PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR10-2480.png | 344b133a108289575dad46a9c8e9aaeb040ab0691dee9f31c0baeb29da9b7582 |
| 对照源帧 PNG PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR13-0820.png | eb17110d252a2d305e537fbbfd47e17602e065add23baf639beafadf832d0efe |
| 对照源帧 PNG PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR13-1000.png | eaeaf4e53f5e66479613bc4fb167323edf0949af47c87a71bd3fd4876b195939 |
| 对照源帧 PNG PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR13-1320.png | c3da6497497f1c93168a43908fe179727ad5424b01795d1c5013a9b3dda6e50a |
| 对照源帧 PNG PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR13-1520.png | 3577812816a969c5412f20d48cc28faec47c7bc8890d57d1e8193c32b972d847 |
| 对照源帧 PNG PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR13-1750.png | e9522fd066705ebbbccce88d43abf3612a109d5a679e285f5c4917ba5c1548d8 |
| 对照源帧 PNG PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-PR13-2480.png | f2c8ce185d3d8f4df6919074fdb6b79045d910c596622ba64bcb610c4736e350 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-0820.png | f3c17e2540841de817a3c37293f2279722e067039b151f1d3a314e8927abc8ce |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-1000.png | 2c630bed1d6f8fb36d0446296e31ff7819a4720ef7e75544b836faaab566096c |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-1320.png | 58d75db982fee980d9dddc286420b8f1ed5a7cd392f9892ee91928ab80c97f16 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-1520.png | 697578fb25b73dbfe603d53d068d4100f217156aa7e77fd922291693866dd426 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-1750.png | 93e46060ec31de18665de51182c7562be8cd46ac5bdeba7cf89a9219b59e9cd2 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-2480.png | c4ba9c45c955b02a61d0be5378ac08b4f159bdeb44367e717663ef6e8bdd70da |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-00.png | f3c17e2540841de817a3c37293f2279722e067039b151f1d3a314e8927abc8ce |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-01.png | eb42360d6b76d45fcd04aee251d4fdaa6889b38a4fac7ab547c48af59e1e6b52 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-02.png | ffadad0042bec36f5fe228e027d7d6e7731ee8f822d45deefe5c222b25617ea6 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-03.png | 25d89373c27d37781cee21dd9217825b3d52bfcb93ebf6ef4352dee3a8c8d97e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-04.png | 64d0e652123b7e94db6554c8f2550b7136778a5165753e38bd92399643ded7d4 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-05.png | c953ad516c08bfef52e1f81667d3aca11126861661956c8efb1d08618b88268b |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-06.png | 0fe7fb4dad9e618eaeb24b85d89ad7753d1825383e447fc6c3179d4dc0b6031e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-07.png | 58d75db982fee980d9dddc286420b8f1ed5a7cd392f9892ee91928ab80c97f16 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-08.png | 0fab0f844dd84445772e024dfd7301cabcfdcfd5a8f7847a703e6864f43b880e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-09.png | be1fb237f2251a2b3a7c67974fd304d10752f69491f568fbb0569229f83d8652 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-10.png | 697578fb25b73dbfe603d53d068d4100f217156aa7e77fd922291693866dd426 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-11.png | 6118b6a66c982b2a8739fb4a2df712556684c03cf9ed51d593c602115abf92a6 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-12.png | 00aa933b5519c11fe65fd69adc662376d322dc411428198a7814454f587833fc |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-13.png | 6ed1d59ced96614574ae15fd6fbc779b4c67bc5dce0fda63025ff13b79a67aef |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-14.png | f09c32dd8fc92233ba83da3968d0dbb78e024236395a8825703b450406ed547e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-15.png | 053c13dd99dd8adc6c48dc32af125e27e67d704a6f792a03ea11a8064cddea08 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-16.png | 59ee08877875861f66309d241df7e49277a1064b7b07335bf3d6c42d8d7b67d9 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-17.png | 60fdc78d0d52cb95ffbeb15ad6f053db0dcd9ae68253141218d81360286e66bc |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-18.png | bc53237212e94d1293d3dabbc66168429507d90c9ef51728e79471e2258deb37 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-19.png | 83b45332706aa6ff32667ee05fe7fb0db035d60d0e2debafbb5948be3c1f2465 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-20.png | da6bd506911ed292e6acbffb2b09891d5a6587fd6ffbc988ce9cea1f2e5b9efc |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-21.png | 98e04edea85cde386c4251e476efce36b45eda072d0f6ecb64bb7f5adddc814e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-22.png | 5e6bb249f0e77936dba98c08cf8b154c6b235c382a6a25ebfb79769553f72c96 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-23.png | 6f0c88fe50d86e41960b2c353662082ebdc1934e8708bc6660198b4a5cbc9ff3 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-24.png | 1bcb565630ea52a512ca3bccded6860ee52bf6bc9f9cdccfc3b1845e5b750443 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-25.png | 556b96bdad5cf4087b4c046ebf70a8cee9e620a3031363fcdafd8dfe6c39234c |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-26.png | 653f82126de4663f2f86457abdb965837189b546d78511fd1175346783ad4b65 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-27.png | c3796ce4c74f9d8782cb85405e1b95f9480dc28f47a341a3c1aee94cf7a94229 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-28.png | 7241b410ded005e1097da4a13f949eaccdd439cc5ffddd3c839e7842b0cd0ec3 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-29.png | 09d2d186e9796c6b6634b814a3fad69505c701af49e51349a204246637191537 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-30.png | a4abc0594c2ee468cbc611afdec1b011ccd9f6581c5a4b27039cb02fcef9e694 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-31.png | 9121b00234fb8d4672904a2b418e7a600455e9cbff00f557a75498aaf6f74a8a |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-32.png | 8a9a81b5b0020db4356dcb0a847f99bf8be09db0589ab3ab5c7a604a10e96b29 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-33.png | 760822003ab33b005e6509d3365cca870b0a81ca1d20547a01847f07b96b875e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-34.png | 1df6847888bce891d40bb2b105c14670be2b6ae13cc0524e9471280e0022dc82 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-35.png | 0671c38a876e6b7a72cd2c82a1fcd87141a94ac83f654c40cf69b2e95a7efa77 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-36.png | 9849e24a7faf6065162a1956268ed59c7497626b2dd299080735dac17daede17 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-37.png | 5199213a2107ae7b2532f39acfa0236f860d709834344f95a41daf65f34eb2ff |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-38.png | f67916ef6f87f794784654a2851e448c6b810d017ae0daf1b242e88484fec617 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-39.png | 1f7f8c2771e055980ce8a39dc86ef65b4fa5ecf4c5b15d5538105dee2e95c10e |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-40.png | de692b04ca7e5e7b38ce99aed3457c1e9830d94ee86764f2ddd4bfdbf1d3ab96 |
| 对照源帧 PNG V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/chromium-V3-temporal-41.png | 1f738fbab405345f73d11e6a0ffbb05f1a3eb6e659d2a47f2137f5fccc69a2a6 |
| 对照图 comparison-strip / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/comparison-strip-webkit.png | be723874ae02d36d08d99707a199059fa3939a827dd27d10f85e98ef7d204e5b |
| 对照图 temporal-grid / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/temporal-grid-webkit-V3.png | 2c8aac6c8e3bcb421bdac8b6029be4db6332e04e6ec80d075978ab92337f4b14 |
| 对照图 comparison-strip / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/comparison-strip-chromium.png | fe9a1ecf3b7bf323a40d02fe2f1f1bb33043b07e33ecb8d913efddde5d88f35a |
| 对照图 temporal-grid / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/comparison-frames/temporal-grid-chromium-V3.png | 5e82502f3458279928215863190d07ed067c23712dabebdaf4a0586e662dd788 |
| 动作对照视频 PR10 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/PR10/page@5157862cf9f4362e3aa13b2d4d207698.webm | c380d1b92e3f4df71fde7bc5d07c6fdbb8febd6336b9fad0e8f7c15b552d7bdb |
| 动作对照视频 PR13 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/PR13/page@8d5892056695a23ad55569be7bbb4a67.webm | 8785fe3373f872832ba6d4c39a29eabca83acc5959c33cb2ab155e4123bcfea8 |
| 动作对照视频 V3 / webkit | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-webkit/V3/page@93fed77ce393a674a88a8e33abfd1e84.webm | c76825007129e9bdba3cb6fac6b8f9ba04a700faa5338df6ba68a0eb5ac311ca |
| 动作对照视频 PR10 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/PR10/page@56ba2e8f1db8fe7250280911b793c6b4.webm | fbdb6a5ce9d2cf13be977b26e640c86ad34781173e8f53faf21b7bbb22aff6d3 |
| 动作对照视频 PR13 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/PR13/page@892106f93084b911471f2dc7010ededf.webm | 269a5a4c96b5a5dd6d4e0a05bb07c95a56efc325d395c2ba86e8ea95b7fed755 |
| 动作对照视频 V3 / chromium | runs/pelican-coast-v2-20261014/attempts/attempt-20/feel-comparison-chromium/V3/page@553d80c67675c1caa5d98aee169bc6ec.webm | 6e32bb5f132ff92898a76aa92bb7067aed0a26ce70fabe5056cce71ffec1f1c2 |
| evidence-links-v3.json | docs/lean-pilot/pelican-feel-v3-20261014/evidence-links-v3.json | d1c44f53cabfc508dad8c5f8fa80b591fc71167ae40a11c7d1de70c744950d21 |

### 外部链接与访问权限

链接是否无需登录未独立验证；GitHub 草稿、PR 和 CI 产物链接可能需要登录及仓库访问权限。

| 项目 | 链接（访问限制待验证） |
| --- | --- |
| pullRequest | [打开链接（可能需登录）](https://github.com/23chen990/ai-mini-game-factory/pull/16) |
| h5Zip | [打开链接（可能需登录）](https://github.com/23chen990/ai-mini-game-factory/raw/refs/heads/chatgpt/pelican-feel-v3-20261014/docs/lean-pilot/pelican-feel-v3-20261014/release-candidate/pelican-coast-v3-h5-candidate.zip) |
| chineseReport | [打开链接（可能需登录）](https://github.com/23chen990/ai-mini-game-factory/blob/chatgpt/pelican-feel-v3-20261014/docs/lean-pilot/pelican-feel-v3-20261014/QA_REPORT_ZH.md) |
| keyMedia | [打开链接（可能需登录）](https://github.com/23chen990/ai-mini-game-factory/tree/chatgpt/pelican-feel-v3-20261014/docs/lean-pilot/pelican-feel-v3-20261014/evidence-media) |
| draftAssetHub.url | [打开链接（可能需登录）](https://github.com/23chen990/ai-mini-game-factory/releases) |
| ciTestedSource.url | [打开链接（可能需登录）](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38583073297) |

链接来源：`docs/lean-pilot/pelican-feel-v3-20261014/evidence-links-v3.json`。

## 未完成的发布条件

以下项目继续保持 BLOCKED：实体 iPhone/Android 与低端机性能、真实切后台/锁屏/来电恢复、原生菜单手指拖动（finger-pan）、TapTap 广告、WeChat/Douyin/TapTap 原生包、人类玩家体验与留存、生产发布。QA summary 的 blocker：

- Physical iPhone and Android playtest, low-end performance, thermal behavior, and long-session stability are BLOCKED / NOT RUN.
- Real mobile app background, lock-screen, call interruption, and return behavior remain BLOCKED; desktop browser or injected lifecycle events do not close this gap.
- Live TapTap advertising is BLOCKED / NOT INTEGRATED; no ad reward is simulated.
- WeChat and Douyin native mini-game packages are BLOCKED / NOT PACKAGED.
- Independent human enjoyment, usability, and retention playtesting are BLOCKED / NOT RUN.
- Production release is BLOCKED. This artifact is an H5 device-playtest candidate only.
- safety/webkit: environment-background-check-unavailable:tab-blur-pauses
- safety/webkit: environment-background-check-unavailable:background-manual-resume
- safety/chromium: environment-background-check-unavailable:tab-blur-pauses
- safety/chromium: environment-background-check-unavailable:background-manual-resume

## 生成器覆盖清单

1. `meaningful-jump-versus-safe-detour`
2. `first-30-to-60-seconds`
3. `five-stage-differences-rain-and-night`
4. `replay-and-mastery`
5. `pacing-and-risk-reward`
