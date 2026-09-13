---
description: "Web CodeGraph index surface: the「代码索引」settings page and the blank-session dock prompt; for users and maintainers of the CodeGraph experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-codegraph

English | [中文](README.zh.md)

## Summary


Web GUI for CodeGraph index lifecycle. The plugin registers a `settings.section` named「代码索引」and a `conversation.input.dock` entry `codegraph-index`.

The settings page reads and writes `codegraph.autoInit` through `ctx.settingsScope`, shows the current session cwd status, and can start init. The dock prompt appears only on a blank session whose cwd is not indexed, auto-init is off, and the user has not dismissed this session. Initialize calls `codegraphIndex.init`; dismiss is a session-scoped store. While init runs, the dock shows progress. Historical sessions never see the prompt.

The host `@deepseek-ai/dsh-codegraph-index` service owns status, spawn, and auto-init. This package never writes the session log.


-----

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the Web client; the「代码索引」settings section appears under Settings and the index prompt appears in the dock of a blank session whose cwd has no `.codegraph/` index.

Start an index from either the settings page or the dock prompt; both call `codegraphIndex.init`. Dismissing the prompt records the dismissal for that session only.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers `settings.section` (id `codegraph`, order 25) and `conversation.input.dock` (id `codegraph-index`, order 5). The settings page reads and writes `codegraph.autoInit` through `ctx.settingsScope`; the dock prompt renders only when the session is blank, its cwd is unindexed, auto-init is off, and this session has not dismissed it. Dismissal is a session-scoped store. The Host service `@deepseek-ai/dsh-codegraph-index` owns status, spawn, and auto-init; this package never writes the session log.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [CodeGraph subsystem reference](../../../docs/subsystems/codegraph.md) — the index lifecycle and the exploration tool.
- [CodeGraph package group](../../codegraph/README.md) — the host index manager and the model tool.

## Model Experience

None, as this browser plugin registers no model-facing prompt, schema, or session event.

#### KV Cache effect

None; the dock and settings page never enter the model request.

## Known Limitations and Deferred Work

- **Dismiss is this session only** — the next blank session for the same repository asks again. Permanent silence is auto-init or an existing `.codegraph/` index.
- **Web GUI only** — CLI and headless users still run `codegraph init` themselves.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The settings page and dock prompt own no durable state: disposal is proven by the HMR-safety spec, dismissed state is a session-scoped store, and index facts arrive from Remote polling.
