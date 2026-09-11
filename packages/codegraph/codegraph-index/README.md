---
description: "Host-plane CodeGraph index lifecycle: status, spawn, and optional auto-init; for users and maintainers of the CodeGraph subsystem."
kind: "package-reference"
---
# @deepseek-ai/dsh-codegraph-index

English | [中文](README.zh.md)

## Summary
Host-plane CodeGraph index lifecycle for the Web GUI. `ctx.codegraphIndex` exposes `status(sessionId)` and `init(sessionId)`; both read `session.header.cwd` and ignore client-supplied paths. `init` starts `codegraph init` and returns immediately; the UI polls `status` to `indexed` or `error`; one cwd shares one in-flight job; disposing the fiber aborts unfinished spawns.

The `codegraph` settings namespace holds `{ autoInit: boolean }` (default `false`); when true, `session/created` starts init for an unindexed session with a cwd. CLI, headless, and ACP assemblies never auto-init. The model-facing tools never run init: only a user click, `/codegraph-init`, or auto-init creates `.codegraph/`.

```yaml
- id: codegraph-index
  name: '@deepseek-ai/dsh-codegraph-index'
```


## Table of Contents

- [Service contract](#service-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Service contract

`status` and `init` require a live session. A missing cwd returns `{ projectPath: null, indexed: false, indexing: false }` and does not spawn. A failed engine probe or a non-zero init exit sets `error` to a readable stderr/stdout line; the caller may retry. Init is not written to the session log.

## Model Experience

Indirectly, through the model-facing tools in dsh-tool-codegraph.

#### KV Cache effect

None; this package never writes session events or prompt sections.

## Known Limitations and Deferred Work

- **Web host only** — CLI and headless users still run `codegraph init` themselves. Auto-init is absent unless this plugin is mounted.
- **Ignore is not stored here** — dismissing the new-session prompt is a client-session fact. Permanent silence is auto-init or an existing index.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
