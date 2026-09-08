# Agent Note: 用量统计跳过无法读取的会话并予以报告

Status: implemented

[English](2026-08-21-usage-stats-skips-unreadable-sessions.md) | 中文

## Problem

`usageStats.stats()` 在一次请求内折叠全部本机会话日志，只要有一份日志无法解释，整次扫描就会失败。实际触发场景是本构建不认识的事件词汇（`vision/describe`）——这是较新 harness 写出的会话：读取侧拒绝是[会话日志版本机制](../architecture/2026-08-10-session-log-version-mechanism.zh.md)所规定的行为，但仪表盘把它当成整体失败。用户只能看到 `无法更新统计: session "…" contains event type "vision/describe" …`，健康会话的统计也全部不可见，直到外来日志消失。

## Decision

逐会话解释失败按“跳过”处理，而不是请求失败。`UsageStatsService.stats()` 按会话捕获实时折叠或冷 inspect 的失败，将 `{ id, error }` 记入新增的 `UsageStatsSkippedSession` 列表后继续扫描；快照新增的 `skippedSessions` 字段携带该列表（按 id 排序），其余计数均不包含这些会话。失败的冷读取按持久化 revision 缓存，同一份无法读取的日志不会在每次刷新时被重复 inspect；revision 变化后会重新 inspect。失败的实时折叠会丢弃缓存投影，下一次扫描从 seq 0 重建。列出失败（`sessions.list()` / `listSnapshots()`）仍会使整次请求失败，保留现有错误提示条和重试路径。`buildUsageSnapshot` 保持纯折叠，`stats()` 在返回边界追加跳过列表。

仪表盘弹出瞬时 Toast——zh `已跳过 {count} 个无法统计的会话`，en `{count} sessions could not be counted and were skipped`——并在面板内持续列出每个会话 id 及失败原因（含拒绝消息中的原始日志路径）。后续一次加载不再跳过任何会话时提示消失。计数照常渲染，全部会话失败时为零。Host 保持安静（不写控制台噪音），信息由提示承载。

## Alternatives considered

**继续让整次请求失败** — 未采用，因为只要会话目录混用了不同 harness 版本，一份外来日志就会让仪表盘长期不可用；而剔除不可读会话后，其余会话的统计仍然精确。

**仅在全部会话都失败时才失败** — 未采用，因为部分结果本来就可直接使用，而“全失败”特例反而会掩盖“什么都没统计到”的事实。

**通过会话推送通道传递失败，而不是放进快照字段** — 未采用，因为仪表盘是请求/响应型消费者；旁路通道会引入生命周期与重连耦合，而这些数据下次刷新本来就会被替换。

**静默跳过无法读取的会话** — 未采用，因为静默丢弃会话会扭曲总量，而拒绝消息是判断哪份日志来自较新 harness 的唯一线索。

## Consequences

仪表盘现在可以承受较新 harness 写出的日志：其余会话照常计数，提示列出出错日志及原因。wire 结果 schema 新增一个必填字段，Host 与 Web 产物必须一起重建（预发布阶段接受这一约束）。跳过缓存以 revision 为键：瞬时读取错误会一直保持跳过，直到日志被重写，因为 revision 变化才是内容已变的持久信号。仪表盘决策由[仪表盘功能 note](../feature/2026-08-18-local-usage-history-dashboard.zh.md) 拥有；拒绝机制本身由[版本机制 note](../architecture/2026-08-10-session-log-version-mechanism.zh.md) 拥有。
