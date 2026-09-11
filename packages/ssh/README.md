---
description: "SSH host inventory and one-shot command execution: the Host capability and its optional model-facing tools; for users and maintainers of the SSH subsystem."
kind: "package-group"
---

# ssh/ — SSH host inventory and execution

English | [中文](README.zh.md)

## Summary
SSH host storage and one-shot command execution, split into the Host capability and the model-facing consumer. The `ssh` Typert service owns secret-bearing host records and dispatches each command at most once; the tool plugin registers `ssh_list`/`ssh_exec` only when mounted.

| Package | Role | ctx key |
|---|---|---|
| [`ssh/`](ssh/README.md) | Host storage and one-shot execution. | `ssh` |
| [`tool-ssh/`](tool-ssh/README.md) | Registers `ssh_list` and `ssh_exec` on `ctx.tools`. | (registers on `ctx.tools`) |

The capability owns credential storage and the at-most-once rule; the tool plugin owns the model-visible schemas and registers nothing when the service is absent.
>
## Related documentation

- [SSH subsystem reference](../../docs/subsystems/ssh.md) — host records, the execution contract, and the at-most-once dispatch boundary.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
