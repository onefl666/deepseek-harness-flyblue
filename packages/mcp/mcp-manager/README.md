---
description: "MCP server management over the mcpManager Remote: a per-scope registry, live mount control over dsh-mcp-client, connection status, and the「MCP 服务器」settings section that drives it."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-manager

English | [中文](README.zh.md)

## Summary

Use this package to install, remove, enable, and reconnect MCP servers from the Web GUI. It owns one JSON registry per scope and mounts exactly one `dsh-mcp-client` instance per enabled record into a child fiber of its own, so a toggle is a mount or a dispose and the MCP plugin keeps owning its own connection, reconnect budget, and tool registrations. It also lists the `mcp-client` rows a composition declares and can toggle those for the current process without rewriting the file. The Host half serves the `mcpManager` Remote; the browser half renders the「MCP 服务器」settings section.

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

Mount it beside the tools capability the MCP clients register into.

```yaml
- name: '@deepseek-ai/dsh-mcp-manager'
```

| Method | Effect |
|---|---|
| `list` | The scope's stored servers, the declared `cordis.yml` rows, and the protocol versions this build accepts |
| `save` | Create or replace one stored definition and reconcile its instance |
| `remove` | Delete one stored definition; its instance is disposed by the next reconcile |
| `setEnabled` | Run or stop one stored server, persisting the choice |
| `restart` | Dispose one stored server so the next reconcile mounts a fresh instance |
| `setStaticEnabled` | Run or stop one declared row for this process only |

Stored servers live in `<dshHome>/mcp-servers.json` for user scope and `<project>/.dsh/mcp-servers.json` for workspace scope, written atomically under a cross-process lock. A missing document is an empty registry; a malformed one refuses the call rather than dropping servers.

A row reports `connected`, `reconnecting`, `failed`, `stopped`, or `disabled`, taken from the `mcp/status` events every `dsh-mcp-client` instance emits and cached between calls. A definition whose instance cannot start is reported as a failed row with its message instead of failing the listing, so the page still answers while a server is down.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

- **One mount per record, owned by this service.** `ctx.plugin(McpClient, config)` puts each instance in a child fiber the manager disposes, which is the same shape `dsh-acp` uses to give a session its MCP servers.
- **`list` reconciles before it answers.** Every listing disposes mounts the registry no longer asks for and mounts enabled records that have none, so a definition edited outside the GUI converges on the next read.
- **Declared rows are toggled in memory.** `Entry.update({ disabled })` never writes a config file — only `EntryTree.create/remove/move` do — so the row's defining file stays the source of truth and a restart restores what it declares.
- **Namespace uniqueness spans everything.** `dsh-mcp-client` reserves a server name per registration scope and every instance here shares one, so a save or enable is refused when the name is already held by another registry, another mount, or a declared row.

</details>

## Further Exploration

- [MCP package group](../README.md) — the group this package manages and the bridge it drives.
- [MCP client bridge](../mcp-client/README.md) — the `Config` contract, transports, and reconnect policy each stored definition becomes.
- [Remote assembly](../../api/remotes/README.md) — how clients consume `mcpManager` without importing the Host implementation.

-----

<a id="model-experience"></a>
## Model Experience

### Management mutations

#### What the model sees

This package registers no tool, prompt section, or request-context contribution. Its effect is indirect and intentional — enabling a server mounts a `dsh-mcp-client` instance, whose tools then enter the `mcp__<server>__<tool>` namespace the model already sees.

#### Token effect

The package adds no request tokens of its own; the named consumer owns every visible byte.

#### KV Cache effect

None; this package neither assembles nor sends a provider request. Mounting or disposing an instance changes the tool set a session resolves, which is the MCP plugin's own registration behaviour.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Workspace-scope servers are not session-isolated** — a project registry is stored and toggled per project, but a mounted instance registers its tools on the host plane, so those tools are visible to every session while it runs. True per-session isolation needs an agent-lifecycle hook that does not exist today.
- **A declared row's toggle is process-local** — it is live for the running Host and is deliberately not persisted; the defining file remains authoritative.
- **Workspace registries mount lazily** — a project scope is reconciled when the page lists it or a mutation addresses it, because the service cannot enumerate the workspaces a deployment will use.
- **No per-server health probe beyond the connection itself** — `restart` is the only manual recovery, and it reuses the plugin's own startup path.

<a id="dev-note"></a>
### Dev Note

The manager deliberately does not bridge MCP resources or prompts, and it does not re-implement reconnect policy: `dsh-mcp-client` already owns both, and duplicating either here would create a second truth about a server's state.
