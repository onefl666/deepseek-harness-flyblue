---
description: "面向模型的 SSH 主机列举与命令执行工具；面向 SSH 子系统的使用者与维护者。"
kind: "package-reference"
---
# @deepseek-ai/dsh-tool-ssh

[English](README.md) | 中文

## 概述


`ctx.sshHosts` 的可选模型消费者。SSH 服务存在时，插件注册用于无密钥主机发现的 `ssh_list` 和用于单次远程命令执行的 `ssh_exec`；服务不存在时不注册任何工具。

`ssh_exec` 把一个已配置主机 ID 和命令转发给服务。它依次返回捕获的 stdout 与 stderr；如果连接在分发后丢失，还会追加 `[result unknown]`。该标记提示调用方不要自动重复可能非幂等的命令。


-----

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

只有 `ctx.sshHosts` 可用时，模型才会看到生成的 [`ssh_list` 和 `ssh_exec` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ssh)。

#### Token 影响

两个工具注册期间，每次请求承担固定 schema 成本。

#### KV Cache 影响

注册状态和 schema 顺序不变时前缀保持稳定；添加或移除 SSH 服务可能使从第一个变化的 schema token 起的复用失效。

### 工具结果

#### 模型看到的内容

`ssh_list` 为每个已配置主机返回别名和 `user@host:port` 地址，不包含密钥。`ssh_exec` 返回服务捕获的输出流，并在适用时附带明确的未知结果标记。

#### Token 影响

结果成本随数据变化；命令输出受 SSH 服务配置的各输出流上限约束。

#### KV Cache 影响

工具结果追加在已缓存请求前缀之后，不会直接使其失效。

### UI 呈现

#### 模型看到的内容

无。主机列表使用通用只读卡片，命令执行使用从主机 ID 和命令参数派生的终端卡片。

#### Token 影响

直接 token 影响为零，因为卡片只在客户端渲染。

#### KV Cache 影响

无；UI 呈现位于模型请求之外。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- 工具不能创建或编辑主机记录；主机配置仍由 loopback 浏览器操作完成。
- 在 Host 服务支持加载已配置密钥材料之前，SSH 私钥执行不可用。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>

**运行时不变式：** 不发布伴生入口。工具注册跟随可选的 SSH 服务生命周期，一致性由工具注册表持有。
