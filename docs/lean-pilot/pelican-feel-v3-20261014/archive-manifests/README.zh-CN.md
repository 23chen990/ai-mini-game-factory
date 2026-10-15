# V3 第20轮证据下载说明

目标仅为 `runs/pelican-coast-v2-20261014/workspace` 的《鹈鹕海岸冒险》。

- 可直接下载的 H5 ZIP、构建哈希和内容清单位于上一级 `release-candidate/`。
- 关键截图、16段 MP4、四张对比图及来源清单位于上一级 `evidence-media/`。
- `pelican-v3-key-recordings-and-comparisons.zip` 还包含120张实际全帧 PNG 以及清单绑定的原始录像、报告。完整大文件保存在同一 PR 的 Draft 附件入口：<https://github.com/23chen990/ai-mini-game-factory/releases>。登录仓库协作者账号后选择 `pelican-v3-h5-candidate-20261014-a20`（release ID 412804280）。使用列表入口避免 GitHub 更新 Draft 时临时地址改变；保持 Draft，未发布或部署。
- `pelican-v3-historical-attempts-01-19.tar.part*` 保留历史失败与被替代版本，不代表当前构建通过。当前第20轮及完整原始 QA 使用另一组 `pelican-v3-current20-and-all-qa-evidence.tar.part*`，仍保留各自原始状态与哈希。

下载某一组全部分卷和同名 manifest 后，按 `archive.parts` 顺序逐一检查 SHA-256 和 `sizeBytes`，再按顺序拼接为 TAR 并解包。不要将历史和当前分卷混在一起。当前归档使用标准 TAR 硬链接去重，相同字节的文件保留所有原始路径；应使用支持硬链接的 TAR 工具。归档内 `archive-index-*.json` 列出每个原始文件的 SHA-256。`node_modules`、`.git`、`__pycache__` 和 `.DS_Store` 不属于交付证据，未归档。

比较图的 `capture t+` 是开始之后的采集墙钟，不是游戏时间。视频偏移为近似值，录像尾部误差未经量化；PR #10 与 PR #13/V3 的镜头及转向语义不同，不能据此作严格速度或偏好排名。

实体 iPhone/Android、真实广告、移动应用后台/来电/锁屏、原生小游戏包、真人趣味性和留存仍为 BLOCKED。菜单原生手指拖动未获得证据；可信触摸定位器的自动滚动选关另行记录。部分后视角遮住独立前叉，车体倾斜/车道轨迹/镜头复合动作有画面证据，不能据此宣称独立前叉视觉验收通过。
