---
description: "本地会话用量统计的 Web 设置仪表盘；面向用量统计体验的使用者与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage-stats

[English](README.md) | 中文

## 概述
`@deepseek-ai/dsh-usage-stats` 的 Web 设置仪表盘。插件注册现有的 `settings.section` 项 `usage-stats`，不增加一级导航。

页面初次请求最近 30 天，可切换到最近 7 天或手动刷新。KPI 卡、可见消息热力图、每日 Token 堆叠柱、模型圆环与排行，以及 Token 桶明细均适配设置内容列；可展开表格包含全部模型和每日数据。刷新和范围切换保留已提交数据并显示 busy 状态，过期响应被忽略，更新失败提供重试；Host 无法解释的会话会从统计中排除并另行报告。

## 目录

- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="model-experience"></a>
## 模型体验

无，因为该浏览器插件只呈现 Host 派生数据，不增加模型可见内容。

#### KV Cache 影响

无；它不参与提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 页面只在挂载、切换范围或用户手动操作时刷新，不自动轮询。
- 可视化使用五种现有语义系列色；标签、固定顺序、无障碍摘要和完整表格在不依赖颜色时保留相同区分。
- 页面刻意不展示费用、余额、套餐、额度和模型价格，因为 Host 服务无法证实这些信息。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>
