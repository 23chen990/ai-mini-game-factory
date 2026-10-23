# 极速飞驰平台与权利交接

核对日期：2026-10-20。唯一目标 `runs/h5-qq-mobile-20261013/workspace`。本轮没有上传 TapTap、写入 App ID、创建广告位或提交审核。

## 选用 H5 通道，不冒充 Tap 小游戏包

现有 Three.js + DOM HUD 应走 TapTap **H5 小游戏**通道，保留浏览器版本。Tap 小游戏 JS VM 不提供 DOM/BOM，需要另一套 UI/平台实现；不能给 HTML 增加 game.json 就称为原生小游戏包。微信、抖音未改动、未验证，后续各自隔离实现，不阻塞本轮 H5 工程交付。[官方 AI 开发指南](https://developer.taptap.cn/agents/)、[小游戏运行环境](https://developer.taptap.cn/minigameapidoc/dev/tutorial/overview/)。

只读使用临时缓存的官方 CLI 2026.10.19，没有修改全局安装。当前账户已登录且能读取开发者概览，但没有标题明确匹配《极速飞驰》的游戏；不能擅自绑定某个同名不明的草稿。账户原始响应留在忽略目录，不上传 GitHub。

当前 CLI 的 H5 上传参数是 `--screen-orientation 0`（横屏），1 是竖屏。桥接 readiness 已接受两种合法值，未把任何未验证配置标为可用。原 `platform.json` 保持 `PENDING / NOT_RUN`，App ID、广告位为空。

官方 CLI 本地预检实际发现：直接以 `index.html` 为 ZIP 根的浏览器包违反 `single_game_directory_required`。已把同一份运行时文件包装到唯一 `jisu-feichi/` 目录；最终 `taptap-h5-staging-20261020.1.zip` 的 `archive_preflight.violations` 和 `warnings` 均为空，8 个文件逐字节等于浏览器包。第一次失败与修正后结果分别保存在 `evidence/taptap-h5-preflight-before.json`、`evidence/taptap-h5-preflight.json`。这是**本地结构预检包**，没有上传、绑定版本、接通真实广告或成为 `PLATFORM_RC`。测试只不装入玩家下载包，冻结验收文件及全部测试执行均保留。

H5 与 Tap 小游戏的广告契约不能互相代用：目前代码支持显式配置的 `tap` 桥，单元/浏览器 SDK 替身验证回调安全；尚无本 App 的 H5 SDK 文档/真实权限读回证明。必须取得账户生成的 H5 接入契约，再核对 load/show、关闭结果、单例请求关联和生命周期。没有真实视频或收益证明。[H5 广告开通要求](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/)。

运行时依赖与资源清单见 `evidence/runtime-inventory.json`：Three.js 0.169.0 的 MIT 原文保留在交付 ZIP；esbuild 是构建工具，Playwright/Wrangler 不是玩家运行时。最终锁定源的 `npm audit --omit=dev` 返回 0 已知漏洞，但这不是全面安全保证或游戏素材授权。音效/音乐由已记录 SHA-256 的 WebAudio 源码实时生成，未发现外部音频文件；其源代码和旋律/内容权利仍随原始授权一并核实，不能因为程序合成就自动认定商业许可。

## 必须保持阻塞的发布问题

1. **原始代码及内容授权**：上游固定为 `riba2534/claude-opus-5-5-demo@54adc1fb64155f9dd7c1c90ecae7b8185ac540b8`。有用户确认作者许可的历史记录，但授权原件未归档；package.json 的 ISC 字段不能替代完整许可与权利链。上游对 QQ 赛车同人、官方地图风格的自述不能作为商业授权。保留作者来源，不能仅删除署名或改标题掩盖问题。
2. **模型**：5 款模型只记录 user-provided；基础 Hunyuan 模型未归档当时服务条款及输入权利。每款需要来源、作者/提供者、源文件和哈希、商业改编/分发许可、署名要求；缺证据则替换，不能视为已授权。具体六组 SHA-256 见 `platform-license.json` 和构建收据。
3. **内容与平台规则**：默认 UI 已叫《极速飞驰》，没有显示 QQ 名称；打包 HTML 中仍有隐藏的原始菜单“同人”文字及原作者链接。它们不是截图里当前首页，但残留内容与上游表达仍须做权利/原创性清理。官方审核规范排除二次创作同人游戏；当前不能宣称已经满足该要求。[审核规范 §1.6、§6](https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/review-standards/)。这是发布阻塞，不是对侵权作出法律裁决。
4. **包体规则适用范围**：CLI 已验证 H5 ZIP 的单一游戏目录及入口布局；公开运行环境和审核页分别有不同包体数字、工具及登录要求。不能把非 DOM 通道的 60 MB，或另一审核段落的 20 MB，未经确认套用到本 App H5。需由当前 H5 后台/契约确认压缩后上限、资源域名、缓存策略、登录及防沉迷要求后再验收。本地预检不是后台规则全部通过。
5. **商标与资质**：《极速飞驰》不是已完成商标排查的名称。运营主体、隐私联系人、备案/软著/可能适用的出版、实名及防沉迷要求必须由主体确认并与后台一致。本材料不提供法律豁免判断。[开发者协议 §8.4](https://developer.taptap.cn/minigameapidoc/tap-operation/platform/development-agreement/)。

## 一次性人工操作清单

- 确认本游戏应使用/新建的准确 App ID（现有登录无需重新索要账号密码）；完成主体认证、财务信息和本游戏广告开通，提供官方 H5 SDK 接入契约及真实广告位元数据，**不要把密钥写进 Git**。
- 提供源代码作者书面授权、六款模型的权利资料；无法提供的素材明确选择替换。原作者不能授予其本不拥有的品牌/第三方游戏内容权利。
- 确认运营主体、联系/删除请求渠道、名称与资质、当前平台所需备案/软著等资料，完成隐私政策和 SDK 数据清单。
- 连接 Android、iPhone 实机，在真实 TapTap H5 入口完成广告完整/取消/无填充、后台回前台、旋屏、音频恢复、存档及低端设备热稳定性测试。
- 完成这些项目后才能进行授权目标的 H5 dry-run、上传、版本状态读回和审核资料绑定。**上传成功不等于已绑定包体，更不等于已提交/通过审核。**

## 最小安全后续流程

保持现有通道；不要为复用错误 API 临时改成原生 VM。先补齐目标 App 的 H5 契约和权利链，再做必要的桥接修正/同包真机验收。已有奖励事务和本机存档代码可复用。H5、微信、抖音配置和产物保持独立；本轮没有新增 Agent、Gate 或更改工厂流水线。
