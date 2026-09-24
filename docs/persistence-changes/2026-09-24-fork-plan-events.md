---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-24-fork-plan-events

English | [中文](2026-09-24-fork-plan-events.zh.md)

## Summary

Register the fork's durable `plan/approved` and `plan/handoff` event types in the current V4 Session inventory.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

These event roots add types without changing the V4 header or existing event payloads. The V3-to-V4 reader separately validates the fork's historical Plan events and leaves the upstream released V3 event set frozen. A V3 log with another unknown required event is rejected; current readers accept the two Plan events after migration. Older readers without these extensions can reject them.

<a id="verification"></a>
## Verification

`packages/session/session-format-v3-to-v4/tests/migration.spec.ts` verifies both historical Plan payloads survive migration, malformed variants fail, and an unknown required V3 event is rejected. `packages/session/session-persistence-jsonl/tests/v3-restart-migration.spec.ts` verifies read-only recovery and first-write V4 successor publication for plain and zstd V3 files: the Plan events remain available, the V3 file bytes and metadata remain unchanged, and another unknown required event is rejected.

<a id="dev-note"></a>
## Dev Note

None.
