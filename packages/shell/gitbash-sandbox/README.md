---
description: "The sandbox-consuming Git Bash executor: wraps every command through ctx.sandbox and reports denial/enforcement facts, for deployments that compose a confinement runner the msys runtime tolerates."
kind: "package-reference"
---

# @deepseek-ai/dsh-gitbash-sandbox

English | [中文](README.zh.md)

## Summary

`dsh-gitbash-sandbox` is the confining twin of `dsh-gitbash-local`: it registers as `ctx.shell` in place of the local executor, requires a `ctx.sandbox` provider plus `ctx.sandboxPolicy`, and wraps the exact Git Bash argv through `ctx.sandbox.confine`, reporting the selected mode, enforcement, and denial facts on every result. It inherits all local process mechanics and mirrors `dsh-pwsh-sandbox`'s classification dialect. It is NOT part of the shipped compositions: the windows-acl restricted-token chain cannot start the msys runtime, so no shipped Windows runner can confine Git Bash today (see Known Limitations).

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

Mount this executor — in place of `dsh-gitbash-local` — when a composition runs Git Bash commands and a confinement runner exists that the msys runtime tolerates. It takes the local executor's config verbatim; the sandbox default (mode + workspace root) lives on `ctx.sandboxPolicy`, and the runner choice is the `ctx.sandbox` provider's config.

```yaml
- id: bash
  name: '@deepseek-ai/dsh-gitbash-sandbox'
  config:
    graceMs: 3000
```

Every run resolves the per-call policy (the calling session's, else the deployment policy), confines the exact `<bash.exe> -c <command>` argv, and stamps `result.sandbox` facts; `danger-full-access` bypasses confinement entirely. A broken or missing runner fails closed with `SANDBOX_UNAVAILABLE` — never an unconfined execution. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-gitbash-sandbox) lists every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`SandboxGitBashExecutor` extends `GitBashExecutor` and is a deliberate call-for-call mirror of `dsh-pwsh-sandbox` (jscpd-ignored for that reason): `resolve()` stamps the complete per-call policy, `run()`/`start()` wrap the inherited `argv(spec)` through `ctx.sandbox.confine`, and per-process confinement facts retained until settlement drive `onProcessDone`'s denial/runner-failure classification. Classification helpers mirror the pwsh twin's; the provider supplies denial signatures and runner-failure rules per wrap — the windows-acl dialect already includes `permission denied`, the text msys bash prints for a denied write.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `SandboxGitBashExecutor`: policy stamping, confinement wrap, fact stamping |
| [`src/helpers.ts`](src/helpers.ts) | Denial/runner-failure classification (mirror of the pwsh twin's) |
| — | No runtime invariant companion is published; this package exposes no independent event sequence or mutable data relation beyond contracts enforced at its owning seam. |
| `tests/` | Exercised behavior: wrapping, policy hand-off, fail-closed propagation, fact stamping (a fake sandbox provider makes them deterministic) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [gitbash-local](../gitbash-local/README.md) — the executor whose argv and mechanics this twin confines.
- [pwsh-sandbox](../pwsh-sandbox/README.md) — the twin this package mirrors call-for-call.
- [sandbox capability](../../sandbox/sandbox/README.md) — the confinement seam, runners, and policy vocabulary.
- [Bash executor subsystem](../../../docs/subsystems/shell.md) — the executor contract in full.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-bash`: confinement denials render as failed results with the sandbox denial markers, and the escalation surface appears when this executor is mounted (its `sandboxMode` is defined).

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


- **No shipped Windows runner can confine msys** — the windows-acl restricted-token chain kills the msys runtime at startup (`CreateFileMapping` denial), so this executor is mounted by no shipped composition; it becomes usable when a runner exists that the msys runtime tolerates. Evidence and the default-stack decision live in the gitbash-windows-shell-stack Agent Note.
- **Classification mirrors the pwsh dialect** — denial signatures and runner-failure rules come from the `ctx.sandbox` provider's wrap; a future backend with a different dialect supplies them per wrap.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
