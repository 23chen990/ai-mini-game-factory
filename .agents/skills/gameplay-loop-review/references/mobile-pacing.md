# 手机操作与主动节奏

## 规格不只写一句话

在 request.experience 声明 mode（active-dispatch/idle/action/narrative/puzzle）、primaryOrientation（landscape/portrait）、portraitHandling（reflow/pause-and-rotate）、primaryInput（scene-tap/direct-control/choice-tap/board-tap）、defaultSpeed=1、minTargetPx（本试点不小于44）。

firstSession.checkpoints 至少3个，按时间递增：id, withinMs, visibleCue, sceneTarget, input, visibleResult, nextReason。首个可操作信号在10秒内。这些时间是本工厂新试点的实验要求，不是全部游戏的科学定律。

## 主动调度的否定性测试

同一来客与资源下，比较不操作、一次调度、一次投资、固定岗位、根据状态调整。不只测开局一次，覆盖其他操作时机和多种来客。通关判定与界面目标必须用同一个实际条件。不得用操作次数本身作为赢的条件。

压力需有原因、可见预告、可反应窗口和补救效果。长队、等待时间、处理节奏需对应真实状态；不用强制刷新助理的方式造忙。这项标准不套到明确要求放置的游戏。

## 测试不知道玩法不等于人不知道

脚本能点中对象只能证明入口工作。使用可见数值的脚本策略仍是脚本，不是真人盲测。独立查看开局、危机、补救、结算画面后记录还有哪些不确定。
