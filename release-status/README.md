# 游戏版本与发布证据台账

此目录是**人工核验的状态快照**，不是实时 GitHub CI 查询。更新任何状态时同步更新 `updatedOn`、`inspectedSha` 和证据；最新分支一旦新增 commit，旧结论不能自动继承。

运行：`node tools/release-status/validate.mjs`；回归：`node --test tools/release-status/validate-checks.mjs`。

## 状态定义

- `ci`：`passed` / `failed` / `pending` / `unverified`，必须对应 **inspectedSha 的实际 CI**，不可沿用父提交、其他 PR 或其他浏览器的绿色结果。
- `realDevice`：Android + iPhone 真机运行及触控性能验收；桌面浏览器模拟移动视口不算通过。
- `humanPlaytest`：目标玩家自然操作、可追溯视频/反馈；自动驾驶、seeded campaign、状态注入均不算通过。
- `realRewardAds`：正式平台的真实激励广告回调、失败/退出回滚、重复奖励防护经验证；mock callback 不算通过。
- `platformPackage`：目标发布平台实际可上传运行的包、资源合法性、网络/首包/性能符合要求；普通 H5 单页不算通过。
- `publicLaunchReady`：以上五项全部为 `passed` 才可为 `true`；验证脚本会拦截虚假标记。

## 协作与分支规则

**工厂 core 主干**与**独立游戏开发 PR**保持隔离；不要因 PR 多而一股脑合并。优先检查各游戏最新集成 PR 是否已经包含较早分支。每个游戏仅把一个已实际验证的 `branch + SHA + CI runs` 当作候选版本。对于真实广告暂不可验证的平台，应如实保持 `unverified`，不能将其误标为可正式商业发布。

## 当前阻断点（2026-10-19 观察）

- Racing PR #68：自动构建检查通过，但软件 WebGL 测试不能证明真机首屏性能；真人自然完赛、广告及发行包未验证。
- Pelican PR #69：新增开局障碍压力；修复一个 QA driver 的解析错误后，**还需要新 commit 的 CI 回归**。
- CF PR #64：独立首 30 秒场景曾出现真实发射而没有命中、脚本等待超时，需区分操作体验、游戏逻辑和自动化脚本原因。

最终的上线验收还要覆盖发行渠道的审核/素材版权/隐私合规；这些项目不由此脚本自动判定。
