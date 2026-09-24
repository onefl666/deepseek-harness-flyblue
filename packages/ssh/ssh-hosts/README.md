---
description: "SSH host inventory and command execution capability; for users and maintainers of the SSH subsystem."
kind: "package-reference"
---
# @deepseek-ai/dsh-ssh-hosts

English | [中文](README.zh.md)

## Summary


SSH host storage and one-shot execution. `ctx.sshHosts` exposes list, put, delete, and exec through the loopback-only `ssh` Typert namespace; `ctx.ssh` owns the separate POSIX remote runtime. Host records live in `$DSH_HOME/dsh-ssh.json` with owner-only file and directory modes; browser listings omit passwords and private-key paths.

Plugin activation waits for persisted hosts to load; an invalid host file rejects activation.

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

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Host records are validated at mutation boundaries, and command connections have no durable secondary projection.
