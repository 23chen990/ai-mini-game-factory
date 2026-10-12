# 小游戏工厂：当前可执行入口

这是一个有明确覆盖范围的研发工厂，不是任意输入就能自动做好游戏的系统。一个入口共用证据与交付，不同玩法使用各自的验收。旧大编排器 `factory new/run` 未静默迁移。

## 最近的体验纠偏：不能再拿绿灯当好玩

用户报告旧门诊不知道下一步、没有紧迫感和手机操作问题。现在已改成规则V2的分批主动调度、直接点房间、竖屏重排，并在工厂执行少操作基线与默认1倍班次检查。实际结果请查当前PR与本提交CI，不使用旧成绩冒充。

[本轮内部交付、规格与边界](docs/lean-pilot/INTERNAL_DELIVERY_ZH.md)

[当前门诊执行说明](docs/lean-pilot/CLINIC_PIPELINE_ZH.md)

```sh
npm run pilot:test
npm run pilot -- build my-clinic-v2
npm run pilot -- prepare my-clinic-v2
npm run pilot -- delivery my-clinic-v2
npm run pilot -- serve my-clinic-v2
```

需要原仓库锁定依赖和Chromium才能执行完整浏览器流程。没有模型、REA或外部付费调用。单独 `export` 仍是开发诊断导出，不是交付批准。不覆盖已有run或清零失败账本。

## 保留的其他能力

原数字合并游戏：
```sh
npm run pilot -- init my-puzzle observatory
npm run pilot -- check my-puzzle
npm run pilot:browser -- my-puzzle
npm run pilot -- serve my-puzzle
```

玩法工作单和Skill：`.agents/skills/gameplay-loop-review/`，一个主类型和至多一个次类型。新 `experience` 定义主动/放置、手机方向与主操作，老工作单仍可读，但不能伪称已有新体验验收。

真实竞品研究优先于母版：[REA_GAMEPLAY_FIRST.md](docs/lean-pilot/REA_GAMEPLAY_FIRST.md)。REA离线桥接仍只是部分JavaScript静态格式，不是已安装或已跑过竞品。

没有修改FORM、原医院业务、main或发布。自动引擎和触摸证据不等于真人喜欢，母版仍为CANDIDATE，不自动放行上线。
