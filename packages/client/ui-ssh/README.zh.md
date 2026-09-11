---
description: "SSH 主机清单与逐条命令执行的环回浏览器设置区块；面向 SSH 体验的使用者与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-ssh

[English](README.md) | 中文

## 概述
用于 SSH 主机清单和单条命令执行的 loopback 浏览器设置区段。插件在 `settings.section` 中注册 `ssh`，通过 `ssh.list()` 加载不含密钥的主机，通过 `ssh.put()` 创建和编辑主机记录，并通过 `ssh.delete()` 删除主机。所选主机驱动命令控制台：通过 `ssh.exec()` 一次发送一条命令，每条命令追加一个包含捕获流和退出状态的终端块。

控制台从不自动重试：分发后失败保留已捕获的部分输出，并警告结果未知，因为结果不确定的非幂等命令不得自动重复。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)

<a id="model-experience"></a>
## 模型体验

无，因为该浏览器端 SSH 投影不注册模型可见内容。

#### KV Cache 影响

无；浏览器 SSH 操作不参与提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- 区段一次只执行一条命令；不提供交互终端、流式输出或取消。
- 命令历史仅限本次会话，设置面板关闭后重置。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>
