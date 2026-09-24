---
description: "SSH 主机清单与一次性命令执行：Host 能力及其可选的面向模型工具；面向 SSH 子系统的使用者与维护者。"
kind: "package-group"
---

# ssh/：SSH 主机清单与执行

[English](README.md) | 中文

## 概述
SSH 主机存储与一次性命令执行，分为 Host 能力与面向模型的消费方。`ctx.sshHosts` 拥有含凭据的主机记录，并保证每条命令至多派发一次；Typert 命名空间仍为 `ssh`。工具插件只在该服务挂载时注册 `ssh_list`/`ssh_exec`。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`ssh-hosts/`](ssh-hosts/README.zh.md) | Host 侧主机存储与一次性执行。 | `sshHosts` |
| [`tool-ssh/`](tool-ssh/README.zh.md) | 在 `ctx.tools` 上注册 `ssh_list` 与 `ssh_exec`。 | （注册到 `ctx.tools`） |

能力侧负责凭据存储与至多一次规则；工具插件负责面向模型的 schema，服务缺席时不注册任何工具。

## 相关文档

- [SSH 子系统参考](../../docs/subsystems/ssh.zh.md) —— 主机记录、执行约定与至多一次派发边界。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

None.

</details>
