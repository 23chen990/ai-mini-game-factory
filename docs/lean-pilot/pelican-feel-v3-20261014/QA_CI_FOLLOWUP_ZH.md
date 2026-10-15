# CI 取消起跳分支复测补充

目标仍是《鹈鹕海岸冒险》`runs/pelican-coast-v2-20261014/workspace`。H5 未修改，SHA-256 仍为 `3fd08a0a3a4b4f4a9fa644d6984a896e0114411d21952adbc5dc47999e9408c1`。

主报告中固定的 d9 CI 绿灯只属于该历史提交。[后续 cd808 CI](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38676747703) 的两浏览器五关流程均为18/18；WebKit体验22/22，Chromium体验21/22。失败项为 `safe-lane-change-cancels-buffer-without-fake-mastery`，没有浏览器异常。该失败保留为失败证据。

Chromium实际事件：18.0159游戏秒准备跳跃，18.2742自动起跳，18.3993才收到右转。测试在等待第一个完整触摸的协议确认时，已经用完准备起跳的剩余窗口。原断言正确拒绝了这条“起跳后转向”轨迹；跳障计数为0不能替代“没有起跳事件”。

修正仅在QA发送器：预先测量按钮位置并建立真实浏览器触摸通道，将两个触摸按同一协议流的顺序发出，随后统一等待确认。正常DOM指针事件另外记录 `isTrusted=true`、`pointerType=touch`、动作顺序 jump→right。它验证快速接续触摸的取消机制，不声称起跳后的单指慢操作还能取消。没有修改速度、时钟、1.45秒缓冲、碰撞、存档、自动起跳条件或游戏画面。

修正后两浏览器均以新目录记录完整22/22体验复测，errors=[]；所有截图和原始录像绑定均已校验SHA。WebKit在17.667秒先准备再转向，Chromium在17.4674秒先准备再转向；之后都以 `jumped=false` 通过同一个 `l1-o1`，无任何jump事件、无虚增掌握计数。精确事件、可信指针记录、报告和视频SHA见 [结构化复测记录](review-evidence/ci-cancellation-followup.json)。

新增三项协议顺序/延迟确认/WebKit坐标结束/非法输入回归后，鹈鹕专项为111/111，lint、typecheck通过。旧 d9 CI105项、cd808 CI108项、当前本地111项分别保留来源，不能合并成同一次CI结果。

本次新增证据作为原始2501文件快照之后的补充归档，保留失败CI原始ZIP、复测报告、原始录像和截图；没有覆盖此前已上传的快照或其manifest。最终提交的CI结果以 [PR #16 的 Checks](https://github.com/23chen990/ai-mini-game-factory/pull/16/checks) 和同一Draft附件中的精确源码回执为准；这里不预先标记后续提交通过。

实体手机、真实广告、原生包、真实应用后台与真人体验仍为BLOCKED；本轮不合并、不部署。
