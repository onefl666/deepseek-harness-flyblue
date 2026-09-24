# Agent Note: 将 0.1.7 候选版本与本项目集成

Status: implemented

[English](2026-09-24-upstream-sync-0.1.7-rc.1.md) | 中文

## Problem

本项目的 Plan 审阅、SSH 主机清单、MCP 传输、管理界面、CodeGraph、任务板、用量统计、工作区工具、Windows shell 控件及 effort slider 需要与上游 0.1.7 候选版本共存。上游现在也拥有 `dsh-ssh` 包和 `ctx.ssh`，并发布包含 V3→V4 读取器的 Session V4。直接合并会造成 SSH 所有权冲突，还可能拒绝本项目历史上的必需 Plan 事件，或悄然移除用户可见的功能。

## Decision

本项目遵循已发布的上游 profile、agent preset、插件兼容性、PTC 和客户端扩展接口。主机清单位于 `@deepseek-ai/dsh-ssh-hosts`，使用 `ctx.sshHosts`；上游 POSIX 远程运行时保留 `@deepseek-ai/dsh-ssh` 和 `ctx.ssh`。主机清单继续使用 `ssh` Typert 命名空间、`ssh_list` 与 `ssh_exec` 工具，以及 `$DSH_HOME/dsh-ssh.json` 存储。Cordis 装载会等待清单加载，并拒绝无效的存储数据。原有 preset ID 和默认启用状态保持稳定。

V3→V4 读取器将本项目历史上的 `plan/approved` 和 `plan/handoff` 事件，与上游冻结的已发布 V3 事件集合分开验证。普通和 zstd V3 日志在读取时保持不变；首次写入会发布 V4 后继文件。未知必需 V3 事件仍会被拒绝。当前 V4 事件新增项另见[持久化确认记录](../../../../docs/persistence-changes/2026-09-24-fork-plan-events.zh.md)。

本项目保留三种 Plan 交接选项和单次执行凭据、MCP SSE 与连接状态、客户端管理分区及其余自定义工具。生成目录、快照和双语记录遵循各自的生成器与回放流程。

## Alternatives considered

**将主机清单复用为 `ctx.ssh`。** 拒绝：上游将该服务用于生命周期和职责不同的 POSIX 远程运行时。独立的 Cordis 键允许两个服务存在于同一 profile，同时保留原有浏览器和工具协议。

**将本项目事件加入上游已发布的 V3 事件集合。** 拒绝：该集合记录上游发布时的内容。独立的扩展验证器接纳本项目历史文件，同时保持已发布清单不变，并继续拒绝未知必需事件。

**以二元上游评审取代 Plan 审阅。** 拒绝：它无法区分执行、压缩与保留三种选项，也无法保留本项目的单次执行交接。

## Consequences

两个 SSH 服务可以同时挂载，已存储的本项目会话可向前迁移且不改写 V3 代文件。上游 Loader 或 UI 扩展点改变时，维护本项目的用户可见扩展需要检查真实 profile 组合与客户端快照。真实模型 API 行为需要凭据，不在无密钥本地验收范围内。
