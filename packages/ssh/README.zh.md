---
description: "POSIX SSH 提供方与用户主机清单：远端文件系统、进程、沙箱及一次性命令。"
kind: "package-group"
---

# ssh/ — SSH 提供方与主机清单

[English](README.md) | 中文

## 概述
本家族将文件、进程、终端及沙箱执行放在同一台 POSIX SSH 主机上，Harness 保留在本地。另由 `ctx.sshHosts` 存储用户主机，供一次性命令使用；其 Typert 命名空间仍为 `ssh`，可选的工具消费方注册 `ssh_list`/`ssh_exec`。两项服务可以同时组合。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 职责 | 服务 |
|---|---|---|
| [`ssh`](ssh/README.zh.md) | 连接、辅助程序身份及传输生命周期 | `ctx.ssh` |
| [`fs-ssh`](fs-ssh/README.zh.md) | 远端文件身份、读取及带保护的原子修改 | `ctx.fs` |
| [`subprocess-ssh`](subprocess-ssh/README.zh.md) | 可执行文件查找、进程、控制流及终端 | `ctx.subprocess` |
| [`sandbox-ssh`](sandbox-ssh/README.zh.md) | 远端文件效果限制及执行信息 | `ctx.sandbox` |
| [`ssh-hosts`](ssh-hosts/README.zh.md) | 用户主机清单与至多一次命令派发 | `ctx.sshHosts` |
| [`tool-ssh`](tool-ssh/README.zh.md) | 可选的 `ssh_list` 和 `ssh_exec` 模型工具 | `ctx.tools` |

<a id="related-documentation"></a>
## 相关文档

- [SSH 子系统](../../docs/subsystems/ssh.zh.md) — 远端执行坐标及用户主机命令语义。
- [POSIX SSH 决策](../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.zh.md) — 替代方案、影响及验证要求。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

远端能力实现保留共享异步终端及取消接口。绝不能从远端路径字符串推断本地路径访问能力。

</details>
