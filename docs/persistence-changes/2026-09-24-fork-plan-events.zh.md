---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-24-fork-plan-events

[English](2026-09-24-fork-plan-events.md) | 中文

## 概述

将本项目持久化的 `plan/approved` 和 `plan/handoff` 事件类型登记到当前 V4 Session 清单。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-24-fork-plan-events
baseline: false
changes:
  - root: "event:plan/approved"
    previous: null
    after: "6a1f1d4b3000bf1e6b82e4cd5330deec74b3f82d2a3160a570d464a679dfed19"
    decision: same-version
  - root: "event:plan/handoff"
    previous: null
    after: "e141db1aea6137e2bb084fb43a9ebaef359e470f8442dcd3d3e148d55876ff39"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

这两个事件根只新增类型，不改变 V4 头部或现有事件载荷。V3→V4 读取器单独验证本项目历史 Plan 事件，并保持上游已发布的 V3 事件集合不变。包含其他未知必需事件的 V3 日志会被拒绝；当前读取器在迁移后接受这两个 Plan 事件。未实现这些扩展的旧读取器可能拒绝它们。

<a id="verification"></a>
## 验证

`packages/session/session-format-v3-to-v4/tests/migration.spec.ts` 验证两个历史 Plan 载荷在迁移后保留、畸形载荷被拒绝，以及未知必需 V3 事件被拒绝。`packages/session/session-persistence-jsonl/tests/v3-restart-migration.spec.ts` 验证普通与 zstd V3 文件的只读恢复及首次写入时发布 V4 后继文件：Plan 事件保持可用，V3 文件字节与元数据不变，其他未知必需事件被拒绝。

<a id="dev-note"></a>
## 开发备注

无。
