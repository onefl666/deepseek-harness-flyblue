---
description: "所选工作区 Git 工作树、分支与提交图的浏览器设置区块；面向 Git 体验的使用者与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-graph

[English](README.md) | 中文

## 概述


浏览器设置区段，显示一个工作区的 Git 工作树、分支和提交图谱。它在 `settings.section` 中注册 `git-graph`，通过生成的 remote 读取 `workspaceGit.status()`、`graph()` 和 `branches()`，并提供暂存、取消暂存、二次确认的丢弃，以及分支的切换与创建。

区段跟随当前正在使用的会话所属工作区，也可以指向别处。仓库身份随图谱应答一起返回，因此不在任何工作树内的工作区呈现为独立空状态；泳道由纯函数分配并以 SVG 绘制。Git 访问与安全仍由 `@deepseek-ai/dsh-workspace-git` 负责。

-----

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)

<a id="model-experience"></a>
## 模型体验

无，因为该浏览器端 Git 投影不注册模型可见内容。

#### KV Cache 影响

无；渲染 Git 状态和历史不参与提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- 提交图谱只覆盖 HEAD 可达历史；其它分支出现在分支卡片和提交引用装饰中。
- 选择的工作区只保留在组件内；关闭再打开设置面板会回到当前会话所属的工作区。
- 提交行高固定，因此一行中的引用标签超出可用宽度时会被裁切（完整列表见该行的悬停提示）。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>

**运行时不变式：** 不发布伴生入口。该客户端面板只投射不可变的 RPC 快照，不持有独立的运行时状态。
