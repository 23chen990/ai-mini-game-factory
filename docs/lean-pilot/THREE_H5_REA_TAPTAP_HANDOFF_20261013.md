# 三款 H5 逆向实验与 TapTap 手机游戏交接（2026-10-13）

## 执行边界
研究分支从 PR #7 的 head `b4d34871854811943ef9f82d50006b0040507d50` 创建；PR #7 以 PR #3 为 base，PR #3 以 PR #2 为 base。不得改写、合并、覆盖这三个 PR。此次只向本研究分支追加脚本、自动化研究试验与文档；不新建工厂，不部署，不修改原作者仓库，不发布第三方代码与原始网页包。

## 真实源码定位（已通过 GitHub connector 阅读固定版本）
上游仓库：https://github.com/riba2534/claude-opus-5-5-demo
冻结 commit：`54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`。三项目源码都在同一仓库；每个 build.mjs 使用 esbuild 生成单 HTML。上游仓库未出现统一 LICENSE 文件；QQ speed / pelican-bike 的 package.json 写 ISC，但不能代替作者对全部内容的授权，CF 未标明确许可证。具体商业复用须书面核实；不要发布“QQ飞车”“穿越火线”名称、地图、商标、照搬角色造型、音效或 UI。

### 已发现并有行锚的机制
**竞速：** `qq-speed/src/vehicle.js`：`TUNE` 中漂移速度阈值 13 m/s、小喷时间窗 0.5 秒、前 0.2 秒精准小喷、氮气时间 2.8 秒、出弯干净结束判断 >0.22 秒；漂移增加集气、有上限为 2 的储存、可由小喷与氮气叠加；护栏碰撞按冲击速度惩罚并能终止漂移。`qq-speed/src/items.js`：领先/中段/末尾三套不同道具权重，例如末尾导弹32、氮气30、磁铁25、盾10、香蕉3；领先香蕉35/盾30。 `qq-speed/src/main.js`：过半圈标志与起点 0.75→0.25 跨越防作弊，结束屏统计漂移/小喷/碰撞。
**FPS：** `cf-transport-ship/src/bots.js`：Bot 反应时间简单 [0.55,0.90]、普通[0.38,0.62]、困难[0.20,0.34]、地狱[0.12,0.20] 秒；使用视野角、遮挡射线、最后见到位置、目标感知、不同移动状态。`cf-transport-ship/src/weapons.js`：武器差异化伤害、头部/肢体倍率、射速、散射、后坐力与换弹。`cf-transport-ship/src/game.js`：致死后复活倒计时 4 秒；有击杀链、音效、提示。`cf-transport-ship/src/touch.js`：已有左侧摇杆、右侧视角、开火、跳、蹲、换弹、切枪、开镜。`riba2534/claude-opus-5-5-demo` issue #4 有未关闭的“所有人没子弹无法结束比赛”故障报告；不可因外观成熟就宣称可上架。
**鹈鹕：** `pelican-bike/src/main.js`：速度钳制 15.5 m/s、5 档自动换挡和目标踏频 ~86 rpm、无手动转向 4 秒后可自动追鱼；鱼出生间隔 16–34 米、金鱼概率阈值 0.12、普通鱼 +1、金鱼 +5、成就鱼10/50和速度等。`pelican-bike/index.template.html`：有手机按钮、多个镜头、截图/画质操作，但并不等于已经真实手机验收。程序化模型在 `pelican-bike/src/bicycle.js`、`pelican.js`、`ocean.js`。

以上是**源码衍生事实**，尚非 REA 预测、真实浏览器运行观察或真人试玩。精确 SHA、行号由 `node tools/lean-pilot/three-h5-research.mjs anchors <上游固定commit目录> <输出.json>` 自动产出，版本不匹配则失败。

## 本轮实验命令与严谨状态
研究工具 `tools/lean-pilot/three-h5-research.mjs`：只提取 HTML 最大的 inline JS 到临时目录，不执行第三方 JS；锁定目标 URL，记录原始 HTML 和 JS 的 SHA256；比对冻结源码锚点，收到真实 REA 输出后才写 JSON 收据。校验器目前只作最小外层形状检查，不能证明工具二进制可信或内部结论正确；不能拿它冒充 PR #7 的正式 review gate。
分支 CI `.github/workflows/lean-pilot.yml` 新增仅对本研究 PR head 启动的 `three-h5-real-rea` job：先冻结上游源码比对，再使用临时目录安装 `rea-agents@6.4.0`、对自有 JS smoke 运行 `rea analyze-javascript-application`，最后对 3 个用户给定 CDN HTML 的最大 inline JS 运行同命令并记录退出码、摘要。原始包、分析报文和标准错误**不上传** GitHub，artifact 只允许摘要/哈希/来源行锚；失败保持失败，不以空报告充当 PASS。REA 对单 HTML 中的打包脚本能否静态分析、CLI flags/输出 schema 是否匹配，都属于**待 CI 实测事实**。该 workflow 非常规复用生产任务，后续整合时改为手动或分支限制。

## 与 PR #7 兼容的下一步
1. 从 PR #7 的基线读取 `research-to-build.mjs`，不要重新定义同名 gate，更不要将“源码中有数字”当成“玩法体验已复现”。
2. 将 16 项冻结源码 claim 按实际需要接到 `research.json`；每项提供准确路径、revision 和源文件 bytes/hash、可验证的状态转移。原研究报告是参考材料；不能一键将外部素材变成自有产品。
3. 当前 PR #7 的 `research-to-build.json` 严格要求 source/request/research/contract 对应、至少两种机制、三组共180秒反事实自然输入 (no-action / single-action / adaptive)，`qaStatus=NOT_RUN` 直到真的跑；竞速、FPS、休闲骑行应分别在不改老门禁的前提下建立新合同。注意不同类别并非都适合“180秒内无操作输掉”的同一胜负规则，遵循工厂的 profile 差异化。
4. REA 成绩表必须区分：工具启动成功、真实 Evidence、静态恢复的可对照字段、含动态输入的机制验证、失败及开销；只有通过上游比对的可定位规则才计正确，未知不算恢复。
5. 不编辑 PR #2/#3/#7，不自动合并，不自动授权商用。经过独立普通输入测试与真实移动端、真人验收后才能升级状态。

## TapTap 三项目决策
先做**原创轻量化鹈鹕式海岸骑行**，不是直接复刻原仓库：名字/视觉形象更换，围绕“骑行→选择鱼道/躲障碍→捕获→明确得分→升级能力→解锁新海岸”建立 3分钟可见循环。第一版控制只保留左右变道、跳跃/俯冲、自动前进，避免手机密集按钮；合理加失败后重开、局内目标、短关卡、进度存档、画质分档、暂停恢复。
竞速第二：核心漂移技巧有潜力，但需要重做赛车和地图表达、手机左右/漂移/氮气操作、赛车稳定性和性能，且品牌/IP 风险高；开发成本明显更高。
FPS 第三：多人射击的视觉预期高，移动端双摇杆+开火与敌方 Bot 调参工作大，当前上游有子弹耗尽故障报告且侵权风险高；不宜首发。
建议 Android 先做 WebView/Capacitor **仅供技术原型**，将 HTML 与 JS 打包入 APK 离线验证；与用户点击/截屏/返回/切后台/静音/安全区域/离线/60与30 FPS/发热/内存稳定的 QA 区分开。正式发布是否采用 Capacitor，要看设备性能、SDK、平台合规和代码授权。不要未经用户确认引入 SDK、IAA 或远程统计。
TapTap 中国站正式发行可能涉及游戏版号、软著/备案、实名和防沉迷等实际资质门槛；按照具体发行主体、地区、收费/广告形式和平台最新要求核对，不保证 APK 上传即上架。

## 工程交接判定
- GitHub 源码查证：DONE（固定 SHA + 16 具体候选 claim）
- 自有研究 CLI/测试文件与隔离 CI 定义：COMMITTED（等待真实 Actions 验证）
- REA 是否真正运行：以该研究 PR 的 Actions 日志为唯一基准；无成功日志前标记 **NOT_VERIFIED**。
- 三个 CDN 网页实际运行/真实触控/真人留存：NOT_RUN。
- 许可证及商用权利：NOT_CLEARED；TapTap 正式发布：BLOCKED。
