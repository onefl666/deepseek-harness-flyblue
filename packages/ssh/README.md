---
description: "POSIX SSH providers and user-owned host inventory: remote filesystem, processes, sandbox, and one-shot commands."
kind: "package-group"
---

# ssh/ — SSH providers and host inventory

English | [中文](README.zh.md)

## Summary
This family runs files, processes, terminals, and sandbox enforcement on one POSIX SSH host while the Harness stays local. Separately, `ctx.sshHosts` stores user-owned hosts for one-shot commands; its Typert namespace remains `ssh`, and the optional tool consumer registers `ssh_list`/`ssh_exec`. The two services can be composed together.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Responsibility | Service |
|---|---|---|
| [`ssh`](ssh/README.md) | Connection, helper identity and transport lifecycle | `ctx.ssh` |
| [`fs-ssh`](fs-ssh/README.md) | Remote file identity, reads and guarded atomic mutations | `ctx.fs` |
| [`subprocess-ssh`](subprocess-ssh/README.md) | Executable lookup, processes, control streams and terminals | `ctx.subprocess` |
| [`sandbox-ssh`](sandbox-ssh/README.md) | Remote file-effect confinement and enforcement facts | `ctx.sandbox` |
| [`ssh-hosts`](ssh-hosts/README.md) | User host inventory and at-most-once command dispatch | `ctx.sshHosts` |
| [`tool-ssh`](tool-ssh/README.md) | Optional `ssh_list` and `ssh_exec` model tools | `ctx.tools` |

<a id="related-documentation"></a>
## Related documentation

- [SSH subsystem](../../docs/subsystems/ssh.md) — remote execution coordinates and user-host command semantics.
- [POSIX SSH decision](../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.md) — alternatives, consequences and verification requirements.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Remote capability implementations retain the shared asynchronous terminal and cancellation interfaces. Local path access must never be inferred from a remote path string.

</details>
