---
description: "Web CodeGraph 索引界面：「代码索引」设置页与空白会话的停靠提示；面向 CodeGraph 体验的使用者与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-codegraph

[English](README.md) | 中文

## 概述


CodeGraph 索引生命周期的 Web GUI。插件注册名为「代码索引」的 `settings.section`，以及 `conversation.input.dock` 条目 `codegraph-index`。

设置页通过 `ctx.settingsScope` 读写 `codegraph.autoInit`，显示当前会话 cwd 的索引状态，并可立即初始化。提示条只出现在空白会话：cwd 尚未索引、自动 init 关闭、且本会话尚未点「忽略」。初始化调用 `codegraphIndex.init`；忽略记在会话作用域 store。init 进行中时条显示进度。打开已有历史会话不会出现提示条。

host 的 `@deepseek-ai/dsh-codegraph-index` 服务负责状态、进程和自动 init。本包从不写入会话日志。


-----

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在 Web 客户端挂载本插件后，「代码索引」设置区块会出现在设置中，索引提示会出现在 cwd 尚无 `.codegraph/` 索引的空白会话的停靠区。

可从设置页或停靠提示启动索引；两者都会调用 `codegraphIndex.init`。忽略提示只会记录该会话的忽略状态。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

插件注册 `settings.section`（id `codegraph`，order 25）与 `conversation.input.dock`（id `codegraph-index`，order 5）。设置页通过 `ctx.settingsScope` 读写 `codegraph.autoInit`；停靠提示只在会话为空白、其 cwd 未索引、自动 init 关闭且本会话未忽略时渲染。忽略状态记在会话作用域 store。Host 服务 `@deepseek-ai/dsh-codegraph-index` 负责状态、进程与自动 init；本包从不写入会话日志。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [CodeGraph 子系统参考](../../../docs/subsystems/codegraph.zh.md) —— 索引生命周期与探索工具。
- [CodeGraph 包组](../../codegraph/README.zh.md) —— host 索引管理器与模型工具。

<a id="model-experience"></a>
## 模型体验

无，因为本浏览器插件不注册面向模型的提示词、schema 或会话事件。

#### KV Cache 影响

无；提示条和设置页不进入模型请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **「忽略」只对当前会话生效** — 同一仓库的下一次空白会话仍会再问。要永久不再问，请打开自动 init，或先把 `.codegraph/` 建好。
- **仅 Web GUI** — CLI 与 headless 用户仍需自行运行 `codegraph init`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>

**运行时不变式：** 不发布伴生入口。设置页与停靠提示不持有持久状态：释放由 HMR 安全用例证明，关闭状态是会话级存储，索引事实来自 Remote 轮询。
