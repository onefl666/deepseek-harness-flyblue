---
description: "Semantic code-index tools and the Web host index lifecycle over the bundled CodeGraph engine; for users and maintainers of the CodeGraph subsystem."
kind: "package-group"
---

# codegraph/ — semantic code-index tools

English | [中文](README.zh.md)

## Summary
Model-facing CodeGraph tools and the Web host index lifecycle over the bundled `@colbymchenry/codegraph` engine. No provider contract: the tools open the project's local `.codegraph/` index.

| Package | Role | ctx key |
|---|---|---|
| [`tool-codegraph/`](tool-codegraph/README.md) | Registers `codegraph_explore` (and optional extras) on `ctx.tools`. | (registers on `ctx.tools`) |
| [`codegraph-index/`](codegraph-index/README.md) | Web host index lifecycle: status, user init, optional auto-init. | `codegraphIndex` |
| [`command-codegraph-init/`](command-codegraph-init/README.md) | Human `/codegraph-init` over `ctx.codegraphIndex`. | (registers on `ctx.commands`) |

The child README owns the tool, prompt, and engine isolation contract. The index manager is host-plane, not a model tool.
>
## Related documentation

- [CodeGraph subsystem reference](../../docs/subsystems/codegraph.md) — the index lifecycle, the exploration tool, and the engine isolation boundary.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
