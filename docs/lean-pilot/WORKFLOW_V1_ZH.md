# 一个工厂，共用主流程，四类体验配置

## 决策

不拆四个工厂：那会复制成本账本、证据归档、存档、安全、发布适配和修复逻辑。也不强迫四类游戏执行同一套玩法要求：叙事不需要顾客/生产，放置不一定需要倒计时，单局解谜不必有永久升级。

共用的是“限定方向 → 研究 → 规格 → 小片段实现与QA → 独立体验 → 扩展或停止”。切换的是主要玩家决策、研究问题、实现规格和体验验收。类型决定检查什么，模式决定研究多少，平台决定怎样包装和上线。三者独立，不能以游戏题材或广告类型决定算法。

初期只支持四个主类型，与原仓库已有profile名称一致：ACTION_FEEL、STRATEGIC_SYSTEM、NARRATIVE_AGENCY、PUZZLE_CLARITY。原先的SOCIAL_EMOTION/EXPLORATION_DISCOVERY没有被删除或悄悄映射；新入口遇到不支持的类型需明确分类/单独评审，不能落到经营模板。

混合玩法最多一个次类型，加一组hybrid-link用例而不是叠两条完整流水线。例如恋爱经营以玩家主要决策为准，剧情影响经营时写明实际交互，否则不增加第二条流程。

## 本轮实际落地

- 一个便携Skill `.agents/skills/gameplay-loop-review/`，一个策略实现脚本，四份具体类型配置。脚本负责路由与规格结构检查，Skill负责有证据的设计判断；均不保证游戏好玩。
- 同一工厂CLI新增`workflow`子命令，先于旧factory构造器执行，不开启Provider、不创建游戏工作区、不写文件。
- 同时修正旧`seed-to-game-blueprint`强制所有游戏走顾客/生产循环、旧`game-playtest`强制Canvas和经营测试的问题。保留既有Zod产物、冻结版本、权限和真实输入验收，不把新规格悄悄当成旧字段。
- 新/未知机制走discover；具有匹配独立复用收据的窄变更可走variant；已有问题走repair。没有收据不会把“已实现”当成“成熟”。核心/经济/控制/成长/存档/平台变更不得伪装成普通换主题。
- 规格检查找出循环断联、奖励没有具体意图、无反例、缺少可见后果、类型用例缺失、伪造/错配引用、把AI规格当人类评分等结构问题。自然语言质量仍需独立审核。

**边界：这是已接到现有CLI的工作单/规格前置层，不是把旧461KB编排器整体替换。旧factory new/run、被冻结的计划、自动Builder和发布链不会因Skill存在而自动改用新产物。** 先用真实任务验证，批准后再逐步将经过审核的规格映射到原product-experience-contract；不能把新JSON直接送给旧Zod解析器。用户得到的是可运行前置层和明确执行顺序，不是四个成熟游戏母版。

## 运行

无需安装依赖的入口（从仓库根目录）：

```sh
node .agents/skills/gameplay-loop-review/scripts/workflow.mjs plan examples/lean-pilot/workflow hospital.json
node .agents/skills/gameplay-loop-review/scripts/workflow.mjs draft examples/lean-pilot/workflow hospital.json
node .agents/skills/gameplay-loop-review/scripts/workflow.mjs check PRIVATE_ROOT request.json contract.json
node --test tools/lean-pilot/tests/workflow.test.mjs
```

已安装仓库锁定依赖后，同一实现通过原工厂入口调用：

```sh
pnpm factory workflow plan examples/lean-pilot/workflow hospital.json
pnpm factory workflow plan examples/lean-pilot/workflow action.json
pnpm factory workflow plan examples/lean-pilot/workflow story.json
pnpm factory workflow plan examples/lean-pilot/workflow puzzle.json
node tools/lean-pilot/workflow-integration.mjs
```

四份JSON都是规划示例，不是已执行游戏记录。draft默认空白DRAFT，check不能把空白变成通过。文案、数值和测试先由研究执行者形成，再进行结构检查；不能要求老板天天填写字段。

## 真正应该按什么顺序做

### 现在：先把一个经营循环研究、实现、验证好

1. 明确首个实验沿用医院项目还是独立研究片段；在读取真实源码前不绑定某个未知工作区。批准一个主要用户、一个平台、一个实际投入上限。web-lite可作为开发载体，不代表已验证微信/抖音/TapTap包。
2. 选一个主参考。CorsixTH可用于系统机制来源，不能用它的大型桌面UI作为手机前三分钟标准。必要时用一个真正可访问的轻经营参考校准手机操作。合法REA在研究早期帮助恢复未知规则，不等母版先做完。
3. 只做“到客—队列—调人—可见改善—付出代价—下一目标”闭环。固定输入分别尝试不干预、错误配置和合理配置，确保等待、人员动作、收益的差异真正发生。
4. 少量未经指导的真人检查第一动作是否理解、是否看懂改善、是否主动继续和事后是否觉得值得。机器人跑通不替代此步骤；研发预算两轮仍没改善就重新看核心假设，不堆系统。
5. 这个片段通过后才完善保存、手机和少量内容；再认证为可复用母版。不要边做四种母版边补四种平台。

### 第一轮有效之后：用第二个类型检验方法

以已有剧情项目的一小段做第二份work order，检查处境理解、选择后果、信息一致性和下一个期待。沿用同一证据、成本和QA结构，不照搬医院的队列和经营数值。第二个类型检验的是方法能否泛化，不是给第一个失败项目换名。

### 第一款可以发行后：商业闭环

选择一种实际发行平台；用它已有报表记录同平台/版本/渠道的新用户队列：曝光、详情转化、启动、首次价值、主动重玩、回访、广告/内购净收入和退款。避免在小样本上制定统一指标；不把个体帖子“6k曝光”“12%转化”硬编码。

广告实现本身需要验证自愿选择、取消/失败不扣资源、奖励仅发一次、奖励回到玩法。不能通过签到损失或无法退出夸大喜欢/留存。多款小收入产品也有客服/SDK升级/隐私合规/存档维护成本，记进总账。

## 保留、合并、停止

保留：工作区隔离、已有Zod契约、合法来源、真实输入、存档回归、预算证据、平台发布门槛。
合并：所有类型共用一份工单和同一套报告口径；复用同一Skill脚本，不再分别部署研究Agent、质量Agent、日报服务。
停止默认运行：每次全行业调研、同时三原型比赛、四类全量专用阶段叠加、所有平台同时打包、首次体验未成立前海量内容扩写。
暂不新增：数据库、自动任务生成、多模型评审集群、收益预测模型、强制REA常驻、四个新引擎。

## 给较弱Codex的文件边界和停止条件

先读本文件和Skill；先跑旧回归再改。类型数据在profiles.json；路由/规格检查在workflow.mjs；CLI只做转发。不要拷贝脚本去其他目录形成两套逻辑。修改任何profile标签时必须更新正反用例。改动原编排器、旧Zod字段、依赖、支付、FORM或发布配置需要单独评审。

下一次优先任务是**真实医院片段的源证据与对照用例**，不是再扩工单工具。没有目标权限、运行条件或真实用户数据就写缺口，不用合成fixture替代。运行预算只由当前执行环境实际管理，工作单不会控制别处的模型调用。

## 验证口径

新增单元/集成测试只证明工具路由与结构检查以及旧CLI转发有效。模拟复用凭证和human字段全部标为SYNTHETIC测试夹具，不是参与者证据。
当前Skill通过格式验证不等于认知质量已证实；应以至少一个真实经营片段和一个不同类型案例比较旧方案/新方案的具体问题发现、返工次数和实际体验。
