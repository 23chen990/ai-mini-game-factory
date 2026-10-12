# 门诊执行路线（规则V2）

先读 [本轮体验修正和交付边界](INTERNAL_DELIVERY_ZH.md)。一次操作就能挂机达标的旧版不再作为经营体验基准。

```sh
npm run pilot -- build my-clinic-v2
npm run pilot -- prepare my-clinic-v2
npm run pilot -- delivery my-clinic-v2
npm run pilot -- serve my-clinic-v2
```

不覆盖已有run。修复当前run时保留账本和原因；规则升版是显式的新实验，不是换名清空失败。运行依赖沿用原锁文件和Chromium，不调用模型。

文件边界：
- `templates/web-lite/clinic-queue-v1/`：配方代码、规则、移动交互、引擎测试。
- `examples/lean-pilot/clinic/`：请求和规格的绑定，保留原来的来源与局限。
- `tools/lean-pilot/`：实际构建、对照模拟、默认1倍浏览器验收、内部返工与交付校验。
- `.agents/skills/gameplay-loop-review/`：按体验模式和手机操作约定生成工作单，不是已经自动执行的模型审查。

给老板的HTML应来自 `delivery`。不以随手导出或旧通过记录代替当前版本。交付类型仍是内部行为检查后的试玩，不是真人体验或发布认证。
