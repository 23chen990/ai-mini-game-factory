# 工厂接入／Codex 说明

在 `ai-mini-game-factory/.agents/skills/romance-story-editor/` 保存完整目录即可作为仓库范围的 Skill 说明。现有 Factory CLI/Agent 未必自动加载它；切勿因为文件存在而宣称已经连接工作流。由规划者显式选择“主类型 narrative”，将本 Skill 作为只读审校或经批准的 Builder/Fixer 剧情编辑附加规则；动作、经营、解谜任务不加载。

- 与 `gameplay-loop-review` 分工：它诊断互动核心循环和第一体验，本 Skill 修改人物、对话、知识与恋爱关系。
- 与 `game-playtest` 分工：它检查默认入口、正常点击、屏幕可见、存档、结局与重新游玩；本 Skill 提供逐场变化和待验证前缀。
- 与 Factory 的正式 QA→Fixer 流程分工：条件、关系状态、解释器、存档、多文件跨模块修改一定升级处理；`story_guard.py` 只能接受字词级安全变更。
- 永远不修改 `runs/<other_game>`。引用媒体先走工厂来源核验。阅读器截图和 JSON 行为是不同证据层。
- 仅用 Python3 标准库与 Node 内建模块；无付费 API、新后端或额外外部依赖。自动报告不可代替用户真人验收。

## 一次修订的交付结构

`editorial/triage.json`、`editorial/voice-ledger.md`、`editorial/patch.json`、`editorial/candidate/STORY.json`、`editorial/structural-report.json`、`editorial/replay-report.json`、`editorial/actual-player-review.md`（未测标 NOT_RUN）。这些是建议的项目工作区目录；Skill 自身不自动创建、提交或上传游戏文件。

## 文本补丁示例（speaker 与 lineId 必须由编辑者核对）

```json
{
  "schemaVersion": 1,
  "sourceSha256": "<来自完整正式源的真实 SHA-256>",
  "edits": [
    {
      "path": "/scenes/ENTRY_WAKE/body/3/text",
      "before": "……你叫谁？",
      "after": "……等等，你刚才叫我什么？",
      "reason": "玩家刚醒来先确认自己被如何称呼，不新增信息",
      "lineId": "ENTRY_WAKE.r4.body.004",
      "speaker": "P"
    }
  ]
}
```

`text` 行强制同时核对 `lineId` 和 `speaker`；`title`/`label` 无这两项。编辑者不得靠程序从错误下标“自动填对”以规避人物身份复核。补丁只创建新候选，不覆盖原稿。真实结构测试仍不能断言这句话是否合乎剧情。
