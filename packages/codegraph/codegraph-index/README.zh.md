---
description: "Host 侧 CodeGraph 索引生命周期：状态、进程与可选自动初始化；面向 CodeGraph 子系统的使用者与维护者。"
kind: "package-reference"
---
# @deepseek-ai/dsh-codegraph-index

[English](README.md) | 中文

## 概述


Web GUI 的 host 平面 CodeGraph 索引生命周期。`ctx.codegraphIndex` 提供 `status(sessionId)` 与 `init(sessionId)`。两条方法都只读 host 上的 `session.header.cwd`，不接受客户端传来的路径。`init` 启动 `codegraph init` 后立即返回；UI 轮询 `status`，直到 `indexed` 或 `error`。同一规范化 cwd 共享一个进行中的任务。服务 fiber dispose 时会中止未完成的 spawn。

`codegraph` 设置命名空间保存 `{ autoInit: boolean }`（默认 `false`）。`autoInit` 为 true 时，`session/created` 会对带 cwd、尚未建索引的会话启动 init。CLI / headless / ACP 组装不挂本插件，因此不会自动 init。

面向模型的 `@deepseek-ai/dsh-tool-codegraph` 插件仍然从不执行 init。只有用户点击、`/codegraph-init`，或本 host 的自动 init 路径会创建 `.codegraph/`。同级 [`dsh-command-codegraph-init`](../command-codegraph-init/README.zh.md) 是面向用户的命令消费方。

```yaml
- id: codegraph-index
  name: '@deepseek-ai/dsh-codegraph-index'
```


-----

## 目录

- [服务约定](#service-contract)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="service-contract"></a>
## 服务约定

`status` 与 `init` 要求会话仍在线。没有 cwd 时返回 `{ projectPath: null, indexed: false, indexing: false }`，且不拉起进程。引擎探测失败或 init 非 0 退出时，`error` 为可读的 stderr/stdout；调用方可重试。init 不会写入会话日志。

<a id="model-experience"></a>
## 模型体验

间接，经由 dsh-tool-codegraph 中面向模型的工具。

#### KV Cache 影响

无；本包从不写入会话事件或提示词段。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅 Web host** — CLI 与 headless 用户仍需自行运行 `codegraph init`。未挂本插件时没有自动 init。
- **「忽略」不记在这里** — 关掉新建会话提示条是客户端本会话事实。要永久不再询问，请打开自动 init，或先把索引建好。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>
