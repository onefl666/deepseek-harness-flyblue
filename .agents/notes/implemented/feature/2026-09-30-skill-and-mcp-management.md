# Agent Note: Built-in skill and MCP server management

Status: implemented

English | [中文](2026-09-30-skill-and-mcp-management.zh.md)

## Problem

The Web GUI had no surface for the two things a user most needs to change about their harness: which skills are installed, and which MCP servers it connects to. Skills could only be managed by hand-editing directories under `$DSH_HOME/skills` or a project's `.agents/skills`, and enablement had no expression at all outside a skill's own `disable-model-invocation` frontmatter. MCP servers could only be added by writing an `mcp-client` row into a `cordis.yml` patch layer and restarting. `dsh-mcp-client` exposed no connection state, so nothing could show whether a declared server was actually up.

## Decision

Two new packages, each a Host half plus a browser half, both enabled in the shipped Web profile: `@deepseek-ai/dsh-skill-manager` and `@deepseek-ai/dsh-mcp-manager`. Each registers one `settings.section` (`技能`, order 30; `MCP 服务器`, order 35) over its own Typert Remote namespace (`skillManager`, `mcpManager`). Each browser half injects the matching `remote.<namespace>` service, which only the `dsh-api-remotes` client assembly provides by importing and `$mount`ing both generated contributions; leaving a namespace out of that mount list parks the browser entry on boot.

**Skills: the manager owns directories, not the registry.** It reads the same four roots `dsh-skill-filesystem` discovers, writes new skills into the scope's shared `.agents/skills` root, and expresses enablement as location: a disabled skill moves into a root-local `.disabled/` area. The provider inspects only depth-one entries, so a parked skill is invisible, and the rename's `unlinkDir`/`addDir` events are ones the provider's watcher already treats as catalog changes — which is why every mutation is live without touching `SkillRegistry` or any core package. `resolveProjectRoot` was exported from `dsh-skill-filesystem` so a workspace scope cannot resolve a different project than discovery reads.

**MCP: one mount per stored record.** The manager keeps one JSON registry per scope and mounts one `dsh-mcp-client` instance per enabled record into a child fiber it owns, the shape `dsh-acp` already uses. `list` reconciles before answering, so a definition edited outside the GUI converges on the next read. Declared `cordis.yml` rows are listed and toggled through `Entry.update({ disabled })`, which Cordis applies **in memory** — only `EntryTree.create/remove/move` write a config file back — so the defining file stays authoritative and no GUI action rewrites user configuration. The namespace's delete verb is `uninstall`, not `remove`: the Client namespace service refuses a wire method that collides with its own interface (`remove` is a Cordis service lifecycle member), and the mount throws at activation, so the verb follows `skill-manager`'s.

**`dsh-mcp-client` gained three capabilities**: an `sse` transport for servers mid-migration; `minProtocolVersion`, a floor checked against the version the server answers `initialize` with (captured by observing the documented response, because the SDK hardcodes its own version and exposes no accessor); and an `mcp/status` event every instance emits on connect, disconnect, give-up, and disposal, which the manager caches and the browser receives through the forwarded-event allowlist.

One primitive was promoted rather than copied a third time: `SearchField` in `ui-primitives`. Nothing else was shared — the two pages' rows, stores, and RPC surfaces differ.

Motion follows the repository's interruptible-animation rule: every retargetable state (hover, dismissal, the clear affordance, the scope picker) is a CSS `transition` on a persistent element, so a reversal continues from the computed value; `@keyframes` is used only for staggered entrances and the skeleton pulse, and every page carries one `prefers-reduced-motion` guard over its subtree.

## Alternatives considered

- **A single shared "manager list" primitive or package.** Rejected: the two pages differ in row content (skill source and enablement versus connection state, transport, and target), and the repository already records that a second consumer promotes an atom into `ui-primitives` rather than a page skeleton into a new package.
- **A shadow skill provider at rank 0 to suppress disabled names.** Rejected: the registry resolves duplicate names by nearest layer first, and the shipped Web profile mounts `skill-filesystem` inside each preset's standing scope, so a host-plane shadow cannot suppress a preset-layer skill. Moving the directory works in every layer and needs no service-definition change.
- **Persisting MCP enablement by rewriting the user's patch layer.** Rejected: a GUI toggle would then reformat a user-owned YAML file, and the declared state would have two homes.
- **Pinning the negotiated MCP protocol version.** Not possible: the SDK sends `LATEST_PROTOCOL_VERSION` in its `initialize` request and keeps the answer private, so the field is honestly a floor rather than a pin.
- **Four packages (host and client split).** Rejected in favour of the dual-face shape `@deepseek-ai/dsh-api-session-controller` already proves, with both new names added to the dependency policy's `clientFaceExclude` — the same mechanism that package uses — because their Host halves have real runtime dependencies.

## Consequences

- A GUI toggle never rewrites user configuration; a declared MCP row's toggle is process-local and a restart restores the file's declared state, which the page states.
- Skill enablement is visible on disk as a directory location, so it survives a Host that is not running and is legible to a user inspecting the tree.
- Workspace-scope MCP servers are stored and toggled per project but register their tools on the host plane, so they are visible to every session while mounted. True per-session isolation needs an agent-lifecycle hook that does not exist today; the README records it as a known limitation rather than hiding it.
- `clientFaceExclude` now names four packages, so their manifests are outside the dependency gate's coverage. That is the price of the dual-face shape and is called out in the pull request.
