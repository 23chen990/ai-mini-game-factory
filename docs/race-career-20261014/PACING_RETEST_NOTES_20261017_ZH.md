# PR65 再验记录：低画质仍卡顿的处理

实际目标仍为 qq-speed / runs/h5-qq-mobile-20261013/workspace/game，未改其它游戏。

## 不隐藏失败
`bbcf1217086b52540cfa6e0b012642a17235fbe7` 的独立冷启动 run `39043961761`：touch 通过；desktop 失败。desktop artifact `12104194843` 表明倒计时阶段已从 mid 降到 low，composer=false，但全分辨率软件 WebGL 仍未在原 45 秒门槛内开赛。因此上次保护确实接入，但不足以关闭整个桌面问题。

此次在 low 仍连续四帧超过 250ms 时，仅将 3D drawing-buffer 的 pixel ratio 按 0.75、0.5 两步降低，最低 0.5。UI CSS、视口大小、相机画幅、输入坐标、物理步长、倒计时本身、名次与存档均不改。正常 30FPS 不触发此兜底；暂停/隐藏清除累积证据。它不是根据 CI/SwiftShader 名称写的特殊分支。

新增 4 条负/正回归：修复前 2/4 失败，修后 4/4 通过；累计本轮新增本地单元 25/25（赛段、完成率、质量、分辨率、范围注册）。这不替代同提交真实 H5 浏览器复验。

另一个失败 run `39043961816` 只有一个范围阻断：新增 `.github/workflows/racing-cold-start-qa.yml` 未列入 EXACT。已仅注册这一精确路径；未改旧 BASE_COMMIT、未放宽工作流目录、未跳过其他游戏或 package 限制，新增 3 条范围回归。

本地与 CI 并行是独立测试进程，不是 AI 子代理。当前环境没有子代理启动接口。所有真人 iPhone/Android 指标仍 NOT_RUN，PR保持 Draft。
