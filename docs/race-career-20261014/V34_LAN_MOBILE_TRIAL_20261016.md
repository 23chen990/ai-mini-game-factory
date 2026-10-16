# 双键飞驰 V3.4｜Mac 局域网手机试玩（非公开部署）

本入口**仅适用于赛车**，不要使用鹈鹕游戏的 :4328 地址。

## 下载已验证的构建

1. 打开 [Racing CI #38842246865](https://github.com/23chen990/ai-mini-game-factory/actions/runs/38842246865)，下载附件 `racing-v3-h5-dbf8603a50002957f060388e7b65ed67205f4430`。
2. 解压 Actions 附件，在其中找到 `qq-speed-v3-h5.zip`，再解压至 Mac 任意独立文件夹，例如 `~/Desktop/racing-local-test`。该文件夹应**直接包含** `index.html` 和 `style.css`。不要把附件 ZIP 当成可点击的网页。
3. 在终端执行（只暴露到 Mac 所在局域网，手动结束）：

```sh
cd ~/Desktop/racing-local-test
python3 -m http.server 4329 --bind 0.0.0.0
```

4. 新开一个 Mac 终端，查询 Wi-Fi IP：

```sh
ipconfig getifaddr en0
```

若 Wi-Fi 不在 `en0`，在 Mac 系统设置 → Wi-Fi → 详细信息中查看 IP。手机和 Mac 连接**同一 Wi-Fi**，Safari/Chrome 打开 `http://<你的Mac局域网IP>:4329/index.html`。这是示例格式，不是现成公网地址。

5. 结束试玩请回到正在运行服务的终端按 `Ctrl+C`，避免持续开放。请勿做路由器端口映射、公开托管或 Cloudflare/ngrok 隧道。

## 需要注意的版本边界

以上附件对应**历史已通过工程验收**的 HEAD `dbf8603a`、buildHash `db811811...`；本轮失败反馈改动不在该历史附件里。要体验**最新代码**，需在 Mac 拉取 PR #18 的最新分支，安装仓库锁定依赖和固定原始赛车源，运行 `node tools/lean-pilot/racing-mobile-build.mjs`，然后到 `runs/h5-qq-mobile-20261013/workspace/game` 启动相同命令。不要混淆两者。CI 新提交成功后也可改下载新附件。

## 真人验收记录

四张地图各做一次自然驾驶；重点关卡 03/07/11/16 和当天每日挑战连续记录：设备/系统/浏览器、开始至失败视频、真实名次、技能任务计数、碰撞/救援次数、能否理解失败原因、是否想马上重试。**不能使用读取赛道中心线的合成驾驶结果代替真人记录。**

即使浏览器及 CI 全绿，iOS/Android 真机、TapTap LIVE IAA、第三方源码与素材商业授权依然未验收；禁止合并或公开发布。
