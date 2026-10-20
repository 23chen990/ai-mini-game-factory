# 鹈鹕海岸冒险 · V7 展翅路线

**内部 H5 开发候选，不是已批准发布版本。** 唯一开发分支 `feat/pelican-v7-pressure-20261018`，继续 Draft PR #69。本次源代码比较基线为 `aeb96387503937be6ace92a597f04ba4f7464b08`（见证据中的 `baseline-selection.json`）；PR #37 的 V6 `aec166bfd5cab0d2f3e63bd09e2ac2c73a072af7` 是其祖先，未回退或覆盖。

目标 run：`pelican-coast-v2-20261014`。本次独立 checkout 的生成目录：
`/Users/kker/Documents/ChatGPT/ai-mini-game-factory-pelican-v7/runs/pelican-coast-v2-20261014/workspace`。

## 改什么，不改什么

- **一个新技巧**：原跳跃键轻点仍是原跳跃；按住在下降段展翅最多 0.55 秒，松手下降。空中仍可自由转向，不能穿车，不能无限飞、自动连跳或自动收鱼。原鹈鹕骨架展翅、绿色按键和剩余翼力条显示真实物理状态。
- 五关各有两个可选空中鱼线；第一条只教按住，后续鱼线横向偏移，需要空中调整。空中鱼真实碰撞取得 3 分；原 +9 米跳障金鱼和存档键、三星条件不变。绕行不扣空中鱼连击。
- 车流预告分“远处准备（琥珀色）”与“近处危险（红色）”，仍保留车辆图标和倒计时，不隐藏障碍。解决旧雷达将未来车流全部标红、压缩可读换道窗口的问题。
- 雨关仅把 335/367/607 米三条原有普通鱼移到跳障准备、落地与终点出口；第二关把 79 米现有鱼放到左侧准备线，避免“提前转向反而漏鱼”的跨浏览器差异。不增对象、不降三星门槛。
- 无尽在原有固定种子和安全出口约束下增加四种组合顺序：车流、空中支线、错位障碍、鱼群。速度上限、确定性和清理机制保留；不按表现、付费或广告操纵死亡。
- 首页“出发”置于路线与收藏之前；收藏折叠，不删除贝壳、外观或历史纪录。展翅/空中捕鱼反馈沿用低位紧凑提示，避免新特效遮路。

不新增按钮、货币、后台、依赖、引擎或游戏平台宣称。没有把旧版称为“完全没有挑战”：基线不操作约4.56秒就会失败，本次主要增加可选技巧上限与清晰反馈。没有做大型曲线路网/地形系统：已有画面和操控保留，先验证一个可玩动作分支。

## 问题证据与推测边界

| 问题 | 观察/证据 | 本次判断 |
|---|---|---|
| 基线缺少空中技巧选择 | 基线 `input()` 在空中忽略跳跃；原有自由转向和近失反馈已可用 | 新技巧是可验证的深度假设；不是“真人更喜欢”的结论 |
| 未来危险被同时标红 | 夜关原浏览器路线在约 62.84m 失败，38m 附近三侧预告均红；物理模型存在可行路线 | 区分预告/迫近，不改物理或死亡概率 |
| 雨关风险奖励脱节 | 修正警告后的真实流程：0 碰撞、3 跳、7 金鱼、25/28 普通总数，2 星 | 保留门槛，修正三条现有鱼的引导；用同一 QA 重测 |
| 新提示遮路 | attempt 2 展翅截图约 80px 高中央提示挡住前路 | 红测后归入既有紧凑提示组，实际截图约 41px 高 |
| 展开收藏被裁切 | attempt 5 两引擎真实点击都失败，详情在 flex 中缩成仅标题 | 保留展开高度、允许短屏卡片滚动；原有钱包/穿戴验证不删除 |
| 首页分散注意力 | 基线外观、钱包排在开始按钮之前 | 将收藏变为可选折叠入口，保留真实购买/保存测试 |

### 精简竞品研究

仅研究官方开发者/发行商材料，**没有声称实际试玩竞品**。

- [Alto's Adventure · 发行商](https://noodlecake.com/games/altos-adventure/)：单键动作与连招/纪录启发“同键多层技术”，不复制动作数值、画面、地形。
- [Jetpack Joyride · 开发者](https://www.halfbrick.com/games/jetpack-joyride-classic)：不同危险要求不同响应；本作低障碍可跳，车辆仍须绕行。
- [Ski Safari · 开发者商店页](https://apps.apple.com/gb/app/ski-safari/id503092422)：追逐压力与连续动作启发节奏变化；不增加雪崩或坐骑系统。

来源、观察/推断/未知、失败归因、恢复与禁复制范围在证据包的 `evidence/v7-review/failure-pressure-contract.json`。复用仍限已有授权鹈鹕原始资源、Three.js MIT 与本仓库设施；同目录 `open-source-research.json` 保留版本与许可证证据。

## 工程路由与评审成本

采用 **formal-fixer**：涉及核心物理、奖励、多个模块，以及原 PR 的已失败 QA。沿用当前 Builder/Fixer 连续记录，所有失败报告保留；每次改动只构建一次，未重复构建不变代码。没有委派修补小缺陷。

沿用已有独立感知 QA，而非新建 Agent/Gate/阶段。四问记录：
1. 具体失败：attempt 2，218 原生测试通过且自然空中捕鱼成功，但实际展翅提示遮挡道路。
2. 原因证据：新增反馈类未加入既有紧凑 CSS 选择器；同一路径截图与盒高测试可区分 CSS 归类问题和相机/物理问题。不能据此推断真人满意度。
3. 更小方案：作者直接修 CSS（已做）；但作者不能自行签署既有 independent perceptual gate。只对确定构建的相关像素/轨迹进行一次只读 QA，避免加载全部历史或新增常驻 Agent。CI 只在既有体验检查中补一局新技巧和短无尽；完整七局对比在本地两引擎执行，保留原 CI 超时上限。
4. 实验与保留/回退：相同 110m 展翅分支对比遮挡、真实触摸/捕鱼与终点重试；紧凑提示不遮路且新动作可达才保留。若失败保留 BLOCKED、针对证据修改，不降低验收。无新付费服务或运行依赖；评审仅现有工作单和截图/哈希，不转发整段对话。

本次故意不载入/修改赛车、CF、其它游戏、共享模型策略、无关录屏或全历史对话。

## 如何试玩

**无需重新构建：** 本目录 [playtest/index.html](playtest/index.html) 是当前已实际试玩的完整单文件H5，不是占位页。

```sh
python3 -m http.server 4367 --directory docs/lean-pilot/pelican-v7-20261020/playtest
```

浏览器打开 `http://localhost:4367/`。如4367已有本次run预览服务，不要重复启动，直接打开 `http://localhost:4367/game/index.html`。两者HTML的SHA-256相同，见 [证据索引](evidence/index.json)。无需广告权限即可免费玩、失败、结算和重试。

### 从授权源重建

在仓库根目录先安装锁定依赖。准备脚本须取得已授权固定源；CI 展示完整的固定 SHA 下载步骤。

```sh
pnpm install --frozen-lockfile --ignore-scripts
H5_PINNED_SOURCE_ROOT=/absolute/path/to/authorized-source node tools/lean-pilot/pelican-v2/prepare.mjs
REPAIR_HYPOTHESIS='Fresh checkout of reviewed V7 candidate' node tools/lean-pilot/pelican-v2/build.mjs
node tools/lean-pilot/pelican-v2/serve.mjs 4367
```

打开 `http://localhost:4367/game/index.html`。构建器会拒绝重复构建相同代码，已有构建直接启动服务。旧构建工具receipt中的 `baselineCommit=b3e9e41` 指固定授权原始源的历史缓存基点，不是本次选择的PR69源代码比较基线；两者的源哈希/选择记录分别保留。单文件 HTML 位于 run 的 `workspace/game/index.html`，含 Three.js 许可，可离线试玩；不等于微信/抖音/TapTap 平台包。

触屏：左右轻点微调，按住或拖动自由转向；跳跃键轻点跳，按住展翅，松手落地。桌面也支持方向键与空格。看得到的低路障可跳，车辆不可飞越。免费重试始终保留。

## 尚未验证的产品目标

8–12 名独立玩家三局、真实手机性能/热量/系统后台、主动重试/乐趣/广告意愿：**NOT_RUN**。脚本四种操作水平不是四组真人，也不能证明留存或收入。

真实广告 SDK **NOT_INTEGRATED**，广告按钮不伪装可用；奖励仍只接受可信完整播放回调。微信、抖音、TapTap 平台适配与发布包 **NOT_PACKAGED**。继续 Draft，不合并、不发布。完整本次测试、前后轨迹与剩余阻塞见 `QA.md` 和证据目录。


## 交付与边界

- [QA结果与前后指标](QA.md)，[完整七局基线录像](evidence/before-seven-rounds.webm)，[当前八局录像](evidence/after-eight-rounds.webm)。录像是脚本正常输入，不是独立真人。
- [校验索引](evidence/index.json) 包含每个导出文件的源路径、大小和SHA-256；[证据包](evidence/review-bundle.tar.gz) 保留原run相对结构、所有尝试的JSON、选定截图与真实失败。视频未经剪辑或重绘。
- 开发沿用 [Draft PR #69](https://github.com/23chen990/ai-mini-game-factory/pull/69)。检查当前HEAD的CI，不能使用旧绿色记录替代。[当前PR检查](https://github.com/23chen990/ai-mini-game-factory/pull/69/checks)。
- 这是一份可试玩、可审查的内部开发候选。后台生命周期、尚未自然覆盖的后续斜向空中鱼线、独立真人/真机和真实平台SDK仍是阻塞或明确未验收项；不宣称完整正式FIX/发布门禁已通过。
