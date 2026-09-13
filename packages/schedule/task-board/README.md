---
description: "Durable local task board: model-facing tools and the Host service behind the Web task-board section; for users and maintainers of the task-board experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-task-board

English | [中文](README.zh.md)

## Summary


Host-authoritative task ledger persisted at `$DSH_HOME/task-board/ledger-v2.json`. The `taskBoard` Typert service lists, creates, archives, renames, and permanently removes tasks. Writes use the repository atomic-write helper and a file lock; reads return copies rather than the mutable in-memory records.

Create, archive, update, and delete calls accept a browser-generated request id. Repeating an id during one Host process returns the first recorded result. Titles are trimmed and must remain non-empty. Removal requires an archived task.


-----

## Table of Contents

- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `tickMs` | `30000` | Reserved scheduler-check interval in milliseconds. |

## Model Experience

None, as the service stores browser-owned tasks and registers no prompt, message, tool, or session event.

#### KV Cache effect

None; task-board RPCs do not assemble or send model requests.

## Known Limitations and Deferred Work

- The package stores task state but does not yet schedule or record task execution; `tickMs` is accepted but has no runtime effect.
- Request-id deduplication is process-local and is not restored from the durable ledger after a Host restart.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Ledger writes are validated and serialized at each operation boundary, so there is no second live projection to compare.
