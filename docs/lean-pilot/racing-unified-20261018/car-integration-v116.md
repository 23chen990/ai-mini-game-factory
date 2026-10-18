# 极速飞驰 V11.6：六车型接入与永久本地所有权

目标游戏：`qq-speed / 极速飞驰`。生成工作区：`runs/h5-qq-mobile-20261013/workspace`。

本页记录 V11.6 attempt 11 的六车型接入、实际运行证据和验收边界。基础车与五款用户提供的 GLB 已接入首页、原生开赛及工程结算/重玩路径；车库浏览器检查为 6/6 PASS，六车型各 600 帧的隔离物理轨迹精确一致。完整浏览器 smoke 已 PASS，第 1 关真实 DNF 与点击重玩重新开赛已观察；完整 30 关加每日挑战的自然通过仍为 BLOCKED，真实手机和真实广告 SDK 为 NOT_RUN，`publishable: false`。完整验证索引见 [V11.6 说明](README-v116.zh-CN.md)和[本次验证摘要](verification-summary-v116.json)。

## 本次构建身份

| 字段 | 值 |
| --- | --- |
| 版本 / 界面修订 | `V11.6` / `racing-v116-garage` |
| 构建 attempt | `11` |
| buildHash | `c60652cca51624b1efb8fbb4cc183e17a741c89e3e39c313113d7f9e74dab3f1` |
| inputHash | `9936cef6259c01abb7315dce82fd07a1bafa3e30e7dbdea862422c9a4e351855` |
| 单文件 HTML | `racing-two-button-c60652cca516.html`，13,338,723 字节 |
| HTML SHA-256 | `d246537f3cdba7081350f1a5de3e4956e7a05c50be74659e40f003a5945f44ab` |

这些身份来自本次[构建收据](evidence-v116/build-receipt.json)。本页的 `evidence-v116/` 链接为本次证据归档位置；归档完成状态见[验证摘要](verification-summary-v116.json)。旧版 `README.zh-CN.md`、`verification-summary.json` 和 `evidence/` 保留各自的历史版本与结论。

本构建保留 30 张主线地图和 10 条物理近道，近道关卡为 05、10、12、13、16、18、22、25、27、30。最终产物的[几何审计](evidence-v116/geometry-30.json)确认对应的原生道路；[AI 审计](evidence-v116/ai-150.json)覆盖 30 关、每关 5 台原生物理对手，共 150/150 完赛。上述为工程验证，不代表真人通过率。

## 车型与资产

稳定 ID、名称和所有权政策来自 [cosmetics.mjs](../../../templates/web-lite/h5-source-mobile-v1/racing/cosmetics.mjs)。资产尺寸与三角形数来自[五车型清单](../../../templates/web-lite/h5-source-mobile-v1/racing/assets/user-cars-manifest.json)和[基础车清单](../../../templates/web-lite/h5-source-mobile-v1/racing/assets/original-racer.manifest.json)；GLB 字节数与 SHA-256 已按当前文件核对。`1 MiB = 1,048,576 字节`，表内三角形数仅指车辆资产。

| 稳定 ID | 车型 | 获得方式 | GLB 字节数 | MiB | 三角形 | 车漆 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `starter` | 初始赛车 | 初始免费拥有 | 1,270,084 | 1.211 | 17,473 | 支持已有车漆 |
| `custom-01` | 银紫超跑 | 完成该车激励视频后永久拥有 | 2,700,636 | 2.576 | 63,998 | 保留原材质 |
| `custom-02` | 荧光跑车 | 完成该车激励视频后永久拥有 | 1,381,344 | 1.317 | 18,000 | 保留原材质 |
| `custom-03` | 黄金方程式 | 完成该车激励视频后永久拥有 | 1,173,568 | 1.119 | 18,000 | 保留原材质 |
| `custom-04` | 赤焰超跑 | 完成该车激励视频后永久拥有 | 1,129,904 | 1.078 | 18,000 | 保留原材质 |
| `custom-05` | 蓝白拉力 | 完成该车激励视频后永久拥有 | 1,407,812 | 1.343 | 18,000 | 保留原材质 |

表中的激励视频是已实现的领取契约；当前交付配置没有真实广告 SDK，默认隐藏领取入口，未拥有的新车型可预览。模拟 SDK 的领取验证不表示真实广告已开通。

基础车文件为 `original-racer.glb`，新增文件依次为 `custom-racer-01.glb` 至 `custom-racer-05.glb`，均位于 `templates/web-lite/h5-source-mobile-v1/racing/assets/`。名称可以调整，存档依赖稳定 ID。未知 ID 不进入所有权或装备状态。

五款新增资产均已烘焙为 `+Y` 向上、`+Z` 朝前、地面 `Y = 0`、车长约 `4.8 m`，运行时比例为 `1`。银紫超跑的清单使用单独的 64,000 三角形资产上限，其余新增车使用 18,000 上限；该差异没有改动驾驶参数或浏览器性能验收门槛。[资产清单](../../../templates/web-lite/h5-source-mobile-v1/racing/assets/user-cars-manifest.json)记录具体归一化、简化、贴图和来源身份。

## 首页预览、领取与装备

[CarGarage](../../../templates/web-lite/h5-source-mobile-v1/racing/garage.mjs) 管理首页待选车型；[原生接线](../../../tools/lean-pilot/racing-mobile-build.mjs)中的 `previewCar(id)` 加载实际 GLB 并替换首页演示车模型。预览成功必须同时满足 `status === 'ready'` 和返回 `carId` 与请求一致。锁定车型可以预览，但不能写为装备车型，也不能从该预览直接开赛。

领取流程分开保存所有权和装备选择：

1. 首页选中尚未拥有的车型，且存储、平台广告配置和 SDK 可用时，允许主动发起该车的激励视频。
2. 广告适配器确认完成后，`watchCarAd(id)` 将该稳定 ID 写入 `ownedCars`。本次存储写入成功才返回领取完成。
3. 车库重新确认实际模型已展示，再通过 `setCar(id)` 保存 `car` 字段；`configure(game)` 将已拥有的装备车型写入原生 `settings.car`。
4. 后续选择已拥有车型或刷新恢复不再要求重复观看广告。

取消、报错、超时、缺少 SDK、重复请求及无效 ID 不授予车型。所有广告共用互斥状态；请求期间切关、进入比赛或本局身份变化后，迟到的完成回调不能继续授予。等待模型期间离开首页、进入比赛或开始广告时，旧预览按过期动作处理，不补发恢复预览。相关状态检查位于 [runtime.mjs](../../../templates/web-lite/h5-source-mobile-v1/racing/runtime.mjs) 和 [garage.mjs](../../../templates/web-lite/h5-source-mobile-v1/racing/garage.mjs)。

永久领取成功后，如果模型展示或装备保存随后失败，已经写入的所有权继续保留；界面分别反馈“已领取”与“尚未装备”。如果最初的所有权写入失败，则保持锁定，不能显示已永久拥有。这两种失败不能混为一谈。[首页处理](../../../templates/web-lite/h5-source-mobile-v1/racing/mobile.mjs)负责显示实际结果。

## 本地存档与兼容

车型沿用 `h5-mobile:qq-speed:career:v1` 存档，在已有星星、成绩、关卡开放与车漆字段中增加或恢复 `ownedCars` 和 `car`。[loadCareer](../../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs)与 [restoreCosmetics](../../../templates/web-lite/h5-source-mobile-v1/racing/cosmetics.mjs)过滤未知 ID、去重并始终保留 `starter`；无效或未拥有的已选 ID 回到基础车。合法的新车型所有权和选择会在刷新后恢复。

八种车漆继续使用原有 `ownedSkins` 政策。旧存档没有该字段时，按旧星数门槛补回原先已取得的车漆；已有的合法车漆所有权保留。新增车型声明 `paintable: false`，使用提供的材质并隐藏车漆选择；存档中的 `skin` 和 `ownedSkins` 不会因此被清除，切回基础车仍可使用。[注册与恢复规则](../../../templates/web-lite/h5-source-mobile-v1/racing/cosmetics.mjs)

油量继续使用独立的 `h5-mobile:qq-speed:fuel:v1`。现行油量结构保留旧版 10 格向 30 格的迁移规则，合法旧余额按三倍换算，并保留时间与广告冷却锚点。车型领取与装备只写生涯存档，不消耗、补充或重置油量，也不改星星、成绩、已开放关卡和比赛次数。新用户在首次需要写油量前，原始油量键可以为空，内存和界面仍是满油；这不是丢档。[fuel.mjs](../../../templates/web-lite/h5-source-mobile-v1/fuel.mjs)、[车型保存方法](../../../templates/web-lite/h5-source-mobile-v1/racing/runtime.mjs)

“永久拥有”指当前浏览器来源的本地持久化所有权。实现没有账号云同步；不同来源、设备或清除本地存储后的恢复不属于现有承诺。单文件与 HTTP 页面之间的测试存档复制必须标为工程夹具。

## 真实模型与共同物理

首页预览、实际玩家开赛和结果展示都接入同一车型 ID 的实际模型；其他对手继续使用基础车。模型加载、展示和释放位于 [user-car.mjs](../../../templates/web-lite/h5-source-mobile-v1/racing/user-car.mjs)、[car-asset-cache.mjs](../../../templates/web-lite/h5-source-mobile-v1/racing/car-asset-cache.mjs)及[构建接线](../../../tools/lean-pilot/racing-mobile-build.mjs)。缩略图只服务选车界面，实际赛车模型身份另行读取核验。

车型配置仅包含外观与所有权元数据，没有速度、加速、转向、漂移、氮气或碰撞参数。原生玩家仍由相同的 `PlayerCar` 构造器及共同的物理参数驱动；换车不改变真实道路进度、名次或终点规则。原生物理更新保存模型引用，但不读取网格尺寸或材质来计算驾驶性能；显示同步负责模型位置、旋转和效果。在本次最终产物中，[车库报告](evidence-v116/car-garage.json)已核对六个实际模型身份；各车使用相同输入和时间步长执行 600 帧，完整物理轨迹与基础车精确一致。该结果验证换车不改变此探针覆盖的驾驶计算，不证明所有设备上的渲染性能相同。

五份新增上传模型为合并的车身/车轮表面，没有接入独立轮节点或轮骨骼。清单将它们标为 `static-source-mesh`，运行时返回空的独立 `wheels` 列表，保留原有轮形与材质，不假造单独轮转或转向动画。基础车保留已有的四个独立机械车轮节点与相应动画。[新车模型实现](../../../templates/web-lite/h5-source-mobile-v1/racing/user-car.mjs)、[基础车轮记录](../../../templates/web-lite/h5-source-mobile-v1/racing/assets/original-racer.manifest.json)

[隔离物理探针](../../../tools/lean-pilot/racing-car-physics-probe.mjs)可在可见开赛后，通过当前 `game.player.constructor` 和实际模型引用创建独立车辆，以固定赛道、复位、输入和时间步长比较轨迹。它不更新画面、不写现有玩家、不推进真实比赛、不结算或修改存档；本次六车轨迹均得到 SHA-256 `edb7e2c1c066bea82c076d1bed05027a16dd510a79d2e4a910437bd4458ea324`。输出明确标为合成工程证据，不能代替自然驾驶或渲染验收。

## 平台广告与验收边界

当前模板 [platform.json](../../../templates/web-lite/h5-source-mobile-v1/platform.json) 为 `PENDING / NOT_RUN`，`appId`、广告位 `spaceId` 和方向配置为空，没有随源码提供可用的真实广告 SDK 配置。可用入口必须由目标平台提供完整配置和 SDK；不可用时隐藏广告领取按钮，基础车继续免费可用。

[requestRewardedVideo](../../../templates/web-lite/h5-source-mobile-v1/themes.mjs)只把关闭回调中的 `isEnded === true` 视为完成。创建广告、加载成功、调用展示方法或测试手工触发回调，都不能冒充平台真实广告完成。浏览器 QA 的模拟 SDK、强制存储失败、跨来源存档复制以及提前调用原生结算必须逐项标为工程夹具。

本次验收范围如下；测试数量存在重叠，不能相加为总通过数。

| 范围 | 本次结果与证据 | 边界 |
| --- | --- | --- |
| GLB 运行与资源释放 | [18/18 PASS](evidence-v116/car-runtime-18.tap) | 模型身份、材质、解码缓存、预览切换与资源生命周期；浏览器位图解码使用桩 |
| 真实六模型及车库流程 | [6/6 PASS](evidence-v116/car-garage.json) | 首页、开赛、工程结算与重玩中的模型身份；含模拟广告、存储失败和提前 DNF 夹具 |
| 六车型共同物理 | [6 台 × 600 帧，精确一致](evidence-v116/car-garage.json) | 独立车辆的合成轨迹；不推进真实比赛 |
| 最新仪器与车型构建契约 | [18/18 PASS](evidence-v116/instrumentation-usercar-build-18.tap) | 含当前 8 项仪器回归和 10 项车型构建检查 |
| 完整浏览器 smoke | [PASS，10 个视图记录](evidence-v116/smoke.json) | 含预置生涯、摆场与提前 DNF；原有 45 秒/18 秒门槛保留 |
| 独立桌面冷启动 | [PASS](evidence-v116/desktop-cold-start.json) | ready 到 race 为 36.6515 秒；软件 WebGL 下降至 pixelRatio 0.35，HUD 清晰，3D 场景变糊 |
| 第 1 关真实 DNF 与重开 | [已观察](evidence-v116/natural-journey.json)、[重开状态](evidence-v116/loss-replay.json) | 原生约 300 秒 DNF，进度 92%、第 6 名、0 星；该局未通关 |
| 完整生涯自然通过 | `BLOCKED` | 仅观察第 1 关，尚未完成 30 关加每日挑战的合格完赛覆盖 |
| 真实广告 SDK、真实手机 | `NOT_RUN` | 尚未提供实际平台配置或设备验收 |

本次自然报告为 `passed: false`、`errors: []`，`actionsFit: true`：844 × 390 视口内，结果页重玩/返回大厅按钮均高 44 像素，纵向 317–361。正常点击重玩后，原生状态和页面阶段均为 `race`，同一 `race-01` 的新局已前进至 `0.2 s`，快照车速为 `90.5221 km/h`。这记录真实失败后的恢复路径，不构成自然完赛通关。详见[本次说明](README-v116.zh-CN.md)。

[V11.5 恢复说明](README.zh-CN.md)和[既有验证摘要](verification-summary.json)保留历史阻断，不作为本次自然终局的证据。本次 smoke 和桌面冷启动的 PASS 仅覆盖各自明确测试的范围；商业发布条件仍未满足。
