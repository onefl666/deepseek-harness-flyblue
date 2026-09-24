---
description: "SSH host inventory and command execution capability; for users and maintainers of the SSH subsystem."
kind: "package-reference"
---
# @deepseek-ai/dsh-ssh-hosts

English | [中文](README.zh.md)

## Summary


Host-owned SSH host storage and one-shot command execution. `ctx.sshHosts` exposes the loopback-only `ssh` Typert namespace with list, put, delete, and exec methods; it is independent of the POSIX remote runtime on `ctx.ssh`. Host records are stored in `$DSH_HOME/dsh-ssh.json` with owner-only file and directory modes; browser listings omit passwords and private-key paths.

`exec` dispatches a command at most once. A connection failure before dispatch rejects the call. A lost connection or timeout after dispatch returns `result: "result-unknown"`, so a caller can avoid replaying a command whose remote effect is uncertain.


-----

## Table of Contents

- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `connectTimeoutMs` | `15000` | Maximum connection-establishment time. |
| `execTimeoutMs` | `60000` | Maximum time for one dispatched command. |
| `outputLimitBytes` | `2097152` | Capture bound applied independently to stdout and stderr. |
| `idleTimeoutMs` | `1800000` | Reserved idle-connection lifetime. |

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-ssh`, which owns the model-visible schemas, results, and presentation.

#### KV Cache effect

The service adds no request tokens; loading or unloading its tool consumer can change the visible tool-schema prefix.

## Known Limitations and Deferred Work

- Private-key paths can be stored but are not yet loaded into `ssh2` command connections; current execution requires password-compatible server authentication.
- `idleTimeoutMs` is reserved for connection pooling; commands currently open and close one connection per call.
- Durable host loading begins asynchronously during service construction, so callers should not treat an immediate empty list during startup as proof that no hosts are configured.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Host records are validated at mutation boundaries, and command connections have no durable secondary projection.
