---
description: "通过 mcpManager Remote 管理 MCP 服务器：每作用域注册表、对 dsh-mcp-client 的实时挂载控制、连接状态，以及驱动它的「MCP 服务器」设置分区。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-manager

[English](README.md) | 中文

## 概述

用本包在 Web GUI 中安装、移除、启用与重连 MCP 服务器。它按作用域各拥有一份 JSON 注册表，并为每条已启用记录在自己拥有的子 fiber 中恰好挂载一个 `dsh-mcp-client` 实例，因此开关就是一次挂载或一次释放，MCP 插件继续拥有自己的连接、重连预算与工具注册。它还会列出组合声明的 `mcp-client` 行，并能仅对当前进程切换这些行而不改写文件。宿主半边提供 `mcpManager` Remote；浏览器半边渲染「MCP 服务器」设置分区。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把它挂在 MCP 客户端所要注册进的 tools 能力旁边。

```yaml
- name: '@deepseek-ai/dsh-mcp-manager'
```

| 方法 | 作用 |
|---|---|
| `list` | 该作用域已存储的服务器、`cordis.yml` 声明的行，以及本构建接受的协议版本 |
| `save` | 新建或替换一条存储的定义，并调和其实例 |
| `remove` | 删除一条存储的定义；其实例会在下次调和时被释放 |
| `setEnabled` | 运行或停止一台已存储的服务器，并持久化该选择 |
| `restart` | 释放一台已存储的服务器，使下次调和挂载全新实例 |
| `setStaticEnabled` | 仅对当前进程运行或停止一条已声明的行 |

已存储的服务器位于用户作用域的 `<dshHome>/mcp-servers.json`，以及工作区作用域的 `<项目>/.dsh/mcp-servers.json`，在跨进程锁下原子写入。文档缺失等同空注册表；文档损坏则拒绝该调用，而不会丢弃服务器。

一行会报告 `connected`、`reconnecting`、`failed`、`stopped` 或 `disabled`，取值来自每个 `dsh-mcp-client` 实例发出的 `mcp/status` 事件，并在两次调用之间缓存。实例无法启动的定义会被报告为带消息的失败行，而不是让清单失败，因此服务器宕机时页面仍能作答。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 —— 点击展开</summary>

- **每条记录一个挂载，由本服务拥有。** `ctx.plugin(McpClient, config)` 把每个实例放进一个由管理器释放的子 fiber，这与 `dsh-acp` 为会话提供 MCP 服务器时是同一形态。
- **`list` 先调和再作答。** 每次列出都会释放注册表不再要求的挂载，并挂载尚无实例的已启用记录，因此在 GUI 之外编辑过的定义会在下次读取时收敛。
- **已声明的行只在内存中切换。** `Entry.update({ disabled })` 从不写配置文件 —— 只有 `EntryTree.create/remove/move` 会写 —— 因此该行所在文件仍是唯一权威，重启会恢复文件所声明的状态。
- **命名空间唯一性覆盖所有来源。** `dsh-mcp-client` 按注册作用域保留服务名，而这里每个实例共享同一作用域，因此当该名称已被另一份注册表、另一个挂载或某个已声明行占用时，保存或启用会被拒绝。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [MCP 包分组](../README.zh.md) —— 本包所管理、并驱动其桥接的分组。
- [MCP 客户端桥接](../mcp-client/README.zh.md) —— 每条存储定义所变成的 `Config` 契约、传输与重连策略。
- [Remote 组装](../../api/remotes/README.zh.md) —— 客户端如何在不导入宿主实现的前提下使用 `mcpManager`。

-----

<a id="model-experience"></a>
## 模型体验

### 管理改动

#### 模型看到什么

本包不注册任何工具、提示词分区或请求上下文贡献。它的影响是间接且有意为之的 —— 启用一台服务器会挂载一个 `dsh-mcp-client` 实例，其工具随后进入模型已经看到的 `mcp__<服务器>__<工具>` 命名空间。

#### Token 影响

本包自身不增加请求 token；可见的每一个字节都由上述消费者负责。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。挂载或释放实例会改变会话解析出的工具集合，那是 MCP 插件自身的注册行为。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **工作区作用域的服务器没有按会话隔离** —— 项目注册表按项目存储与切换，但已挂载实例会把工具注册到宿主 plane，因此只要它在运行，这些工具对所有会话可见。真正的按会话隔离需要目前尚不存在的 agent 生命周期钩子。
- **已声明行的切换只作用于本进程** —— 它只对当前运行的宿主生效，并且刻意不持久化；所在文件始终是权威。
- **工作区注册表惰性挂载** —— 项目作用域会在页面列出它或某次改动指向它时才调和，因为服务无法枚举部署将会用到的工作区。
- **除连接本身外没有逐服务器健康探测** —— `restart` 是唯一的手工恢复手段，它复用插件自身的启动路径。

<a id="dev-note"></a>
### 开发备注

管理器刻意不桥接 MCP 资源或提示词，也不重新实现重连策略：`dsh-mcp-client` 已经拥有这两者，在此重复任何一个都会产生关于服务器状态的第二份真相。
