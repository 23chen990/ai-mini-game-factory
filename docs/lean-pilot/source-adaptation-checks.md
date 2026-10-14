# 已有源码改造：三个最小验收补充

适用于 `tools/lean-pilot/h5-mobile-build.mjs` 后续源码改造；不改造其他游戏，不新增引擎、Agent 或服务。实例为 `runs/pelican-coast-v2-20261014/workspace`，复现脚本在 `tools/lean-pilot/pelican-v2/`。

1. **手机 3D 镜头、画质和性能**：分别测试默认开始、骑行、暂停恢复与重开，覆盖小屏竖屏和横屏。相机跟随玩家或浮动世界坐标，主角处于下半屏，前方危险有反应窗口。核对真实 WebGL 合成/输出尺寸，不能只看 renderer pixelRatio；非整数像素比须区分逻辑 target 尺寸与整数 GL viewport。保留同机位对比和真实 RAF 帧时。先关闭昂贵后期/减少阴影，再降像素比。桌面模拟器成绩与实体手机成绩分别记录。

2. **配置关卡与障碍**：复用原版场景、主角和动画；每关配置距离、鱼/种类目标、人工编排障碍、计时和光照。原版演示玩法不得继续占据默认入口。使用小步积分和相对运动扫掠碰撞；变道时间、车身、行人横穿及跳跃高度共同约束安全路线。鱼必须有安全供应余量。保留已有奖励安全函数，不引入第二套广告或结算系统。

3. **公平性、完整通关与恢复**：纯逻辑测试验证高速碰撞、成功躲避的阴性分支、跳跃判定、安全可达路径和存档；独立新浏览器以正常触屏、默认速度验证每个实际关卡从开始到结算、重开和解锁。汽车、小货车、行人摔倒/停车/恢复、路障空中/地面分别留证。读状态可以，改分数、时间、碰撞或存档不能充当自然验收。后台验证必须观察到真实浏览器生命周期信号；没有信号的自动化环境应记录 BLOCKED 并保留真机验收。独立感知复核与真人是否愿意再玩分别记录。

样例命令：`node --test tools/lean-pilot/pelican-v2/core.node.mjs`；`node tools/lean-pilot/pelican-v2/qa.mjs campaign`；`node tools/lean-pilot/pelican-v2/qa.mjs collisions`；`node tools/lean-pilot/pelican-v2/visual-qa.mjs`。运行前使用该项目的 `prepare.mjs` 和 `build.mjs`，不要把其他游戏的工作区、存档或证据带进来。
