# Agent Note：改动同步进来的全局样式表之前先测量

Status: implemented

[English](2026-09-08-settings-dialog-global-stylesheet-measurement.md) | 中文

## Problem

上游同步之后，设置弹窗的交互开始卡顿。那次同步带来两张全局样式表，两者都按元素数量放大成本，因此各自都有一个听起来成立的说法：

- [`gradient-shadow-text.css`](../../../../packages/client/ui-theme/src/styles/gradient-shadow-text.css) 在 `body, body *` 上声明四个派生 elevation 自定义属性，每个值里还嵌着更多 `var()` 引用，因此每个元素都要按自己的描边色重新替换一遍。
- [`corner-shape.css`](../../../../packages/client/ui-theme/src/styles/corner-shape.css) 把 `corner-shape: superellipse(1.5)` 应用到 `*, *::before, *::after`，因此每个元素都按路径绘制圆角。

听起来成立不等于测出来的，而且两个候选修法性质不同：elevation 改写是视觉中性的，而改动圆角形状是用户可见的变更。

## Decision

[`apps/web/tests/settings-dialog.perf.ts`](../../../../apps/web/tests/settings-dialog.perf.ts) 是本次诊断工具。它启动真实组合，写入并打开一个 200 轮的会话，然后在页面内测四种变体——出厂样式表、把通用选择器上的 `corner-shape` 复位、把后代上的四个派生 elevation 属性回退、两者同时——跑两轮并反转页面顺序、每阶段重复取样，按字段取中位数。它报告 CDP 窗口指标、rAF 帧间隔，以及两次 CDP trace（仅弹窗、以及弹窗加转录区滚动），断言只用于确认被测界面仍然存在。

在 headless Edge 152、1680x700、2837 个节点上的实测：

- 派生 elevation 属性没有任何可测成本。同一文档的全量样式重算：出厂 7.5 ms，回退后 7.3 ms（约 3%），trace 的每一类都一致。
- `corner-shape: superellipse(1.5)` 是唯一有实测成本的因素。一次「打开弹窗、切换 section、关闭」：GPUTask 出厂 14–15 ms 对 4.5–4.7 ms，Paint 5.4–6.2 ms 对 3.0–3.7 ms。1.5 s 的转录区滚动：GPUTask 520–541 ms 对 222–232 ms（−57%），RasterTask 68–74 ms 对 57–60 ms。两种负载下的样式重算与布局都无变化，这与「只影响绘制的属性」一致。
- 没有任何变体复现出用户可见的卡顿：帧间隔 p95 为 4.2–8.4 ms，超过 33 ms 的帧为 0 或 1 个，弹窗打开中位数 34–63 ms（最冷的首次打开 98 ms）。

## Alternatives considered

**凭代码阅读就落地 elevation 改写。** 否决：回退变体的实测只有全量样式重算的约 3%，落在运行间噪声之内。让每条重绑 `--dsw-elevation-stroke-color` 的规则再声明一遍派生属性，换不到任何可测收益，却要让十四处组件样式表的视觉等价性承担风险。

**把 superellipse 当作原因并直接改掉。** 否决：探针在任何变体下都没有复现出帧卡顿。实测的 GPU 成本是真实的，但替换方案是用户可见的，应由所有者选择而不是代为推断。

**把探针加进 CI 的 web 车道。** 否决：一条必需的浏览器计时用例需要先在真实 CI 浏览器与运行器上反复取样才能带预算。未经校准的诊断属于手动车道。

## Consequences

elevation 改写没有依据，因此不做：每条重绑 `--dsw-elevation-stroke-color` 的规则保持现状。

superellipse 规则维持出厂状态，直到其所有者选定替换方案——移除或收窄它都会改变可见的圆角几何。上面的测量就是那次选择的依据：它把 GPU 与光栅时间归到圆角形状上，而没有归到 elevation 属性上；同时也表明本环境从未产生帧卡顿。能复现卡顿的机器上导出的 DevTools profile，才是把实测 GPU 成本与所报告症状连接起来的证据。

探针位于手动性能车道（`vitest.web.perf.config.ts`），不在 CI 车道中。浏览器计时预算需要先在 CI 浏览器与运行器上反复测量；该探针只有单一环境的样本，因此它只报告，不断言阈值。
