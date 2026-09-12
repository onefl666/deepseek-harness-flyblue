---
description: "The local Git Bash executor for deployments and maintainers choosing, configuring, or debugging unconfined POSIX-dialect command execution on Windows over the shell seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-gitbash-local

English | [中文](README.zh.md)

## Summary

`dsh-gitbash-local` is the Git Bash executor for Windows: every command runs as a fresh, non-interactive `<bash.exe> -c` process — the same one-shot POSIX dialect as `dsh-bash-local`, with the executable resolved to a Git for Windows install — so the model's Linux-trained commands work unchanged. It inherits `dsh-bash-local`'s mechanics and owns only Git Bash discovery plus the argv seam. Commands run with the harness process's own authority: this executor confines nothing, and the windows-acl restricted-token chain cannot confine the msys runtime at all. The model-facing `bash` tool talks to it once mounted.

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

Mount this executor when a Windows composition needs POSIX-dialect command execution — the distribution's default win32 stack. It registers as `ctx.shell`, and the model-facing `bash` tool works over it immediately: an agent calls the tool, and the command runs as a fresh `bash -c` process with the budgets below.

### When to choose it

It is the Windows counterpart of `dsh-bash-local`: choose it where the model's commands are POSIX-shaped and the host is Windows. The executor resolves the Git Bash executable from an explicit `gitBashPath`, well-known Git for Windows install locations (`Program Files`, `Program Files (x86)`, a per-user install), the installation a PATH `git.exe` names, or a Git `bin` directory on PATH — never `System32\bash.exe` (the WSL launcher) or a WindowsApps alias. Mounting off win32, or on a Windows host where no install resolves, fails at load with an actionable message.

### Minimal configuration

Load the executor with the budgets you want; every field has a default, so the smallest composition is the plugin entry alone. The settings provider (when composed) layers a user section over this entry, so budgets can change at runtime without a reload (see [Adjusting budgets at runtime](#adjusting-budgets-at-runtime)).

```yaml
- id: bash
  name: '@deepseek-ai/dsh-gitbash-local'
  config:
    gitBashPath: C:\Program Files\Git\bin\bash.exe
    timeoutMs: 120000
```

| Field | Default | Meaning |
|---|---|---|
| `cwd` | `process.cwd()` | Default working directory for commands |
| `timeoutMs` | `120,000` | Default foreground timeout, in milliseconds |
| `maxTimeoutMs` | `600,000` | Cap for per-call timeout overrides |
| `maxOutputBytes` | `64,000` | Per-stream in-memory output cap; overflow spills to a temp file |
| `maxSpillBytes` | `67,108,864` | Per-stream full-output spill cap |
| `graceMs` | `3,000` | Grace period for kill escalation and post-exit pipe draining |
| `gitBashPath` | resolved | Explicit Git Bash executable; else well-known install locations, then PATH-derived |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-gitbash-local) is the exhaustive source for every accepted field and its JSDoc.

### Running commands

Run a command with `run` and read its output from the result; a nonzero exit, a timeout, or a cancellation resolves descriptively, and only infrastructure failures reject. The command string rides as one argument to `-c`, exactly the POSIX `bash -c` contract: bash parses the text itself, Windows working directories mount transparently (`pwd` reports the msys view, `pwd -W` the Windows path), and UTF-8 passes through unchanged in both directions. The environment is the inherited model-friendly set — `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` — with explicit caller-provided entries still winning.

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'ls -la | head' }))
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### Background processes

Call `start` to run a command in the background; it returns a handle immediately and no timeout applies. `readOutput()` merges the stream deltas into one consuming read, marking stderr under a `[stderr]` section; `kill()` terminates the provider-managed range; `done` settles when the direct command closes and never rejects. Job ids, ownership, polling, and notices belong to the generic `ctx.jobs` runtime, which the tool layer registers the handle with.

<a id="adjusting-budgets-at-runtime"></a>
### Adjusting budgets at runtime

When a settings provider is composed, this executor registers the capability's shared `shell` settings namespace — the same one the POSIX family uses, because a host composes exactly one provider of `ctx.shell` — with this class's own schema, so a stored `gitBashPath` re-resolves the executable live. A user section in `settings.yaml` layers over the composition entry and the next command runs with the new budgets. Values the schema cannot judge — positive and finite numbers, and the `graceMs` timer bound — are refused at the write, leaving the running executor on its last good section (the refusal labels name the shared `bash-local` mechanics the fields belong to).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design of the executor and points at the code that realizes it; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

The executor is the Git Bash Service Provider for the `ctx.shell` seam: a subclass of `LocalBashExecutor`, so every mechanic — request/spec defaulting, deadline fusion and cause classification, the terminal environment, the background read merge — is the POSIX implementation, inherited. This package owns exactly the Windows deltas: fail-loud executable discovery (a bare `bash` is never returned, because on Windows it may resolve to the WSL launcher and mount a different filesystem view), the `gitBashPath` settings re-probe, and the argv-level seam a confining subclass wraps.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `GitBashExecutor`, `Config`, settings wiring, argv seam |
| [`src/resolve.ts`](src/resolve.ts) | Pure `resolveGitBashPath`/`candidateGitBashPaths` executable resolution |
| — | No runtime invariant companion is published; this package exposes no independent event sequence or mutable data relation beyond contracts enforced at its owning seam. |
| `tests/` | Exercised behavior: budgets, classification, resolution, background handles, a real-Loader composition smoke |

### Main flow

A call runs through three steps: the inherited `resolve()` fills `workdir`/`timeoutMs`/`stdoutMaxBytes` from config (capping the per-call `timeoutMs` override; its refusal labels name `bash-local`, the owner of the shared schema); the executor builds the Git Bash argv — `<resolved bash.exe> -c <command>` — and spawns through `ctx.subprocess` with explicit byte caps and the `graceMs`, through the inherited `runArgv`/`startArgv` hooks; the settled outcome is classified and projected into a `ShellRunResult`. Windows reports forced termination as exit 1 without a signal, so signal-stamped facts do not apply; the timeout/abort classification is platform-independent. `$$` inside a command is an msys pid — Windows pids come from `/proc/$$/winpid`.

### Invariants and ownership

- Executable resolution is a pure function of `(configured, env, platform)`: a non-empty explicit value wins verbatim; `System32` and `WindowsApps` PATH entries never contribute their own `bash.exe`; discovery fails loudly instead of returning a bare `bash`.
- The `shell` settings section installs the concrete class's schema (the parent constructor reads `this.constructor`'s `static Config`), so `gitBashPath` persists as part of the section and re-probes the filesystem only when the stored value differs from the one the current executable was resolved from.
- Environment layering is the inherited fixed order: terminal overrides first, then the caller's `env`, then the trusted `dshEnv` snapshot last; the subprocess service scrubs ambient credentials and inherited `DSH_*` names independently.
- A background process belongs to the subprocess service: it survives an executor-only reload and is killed and joined when the service disposes.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the executor contract is not enough. They move from the seam to the POSIX parent and the bash tool.

- [shell seam](../shell/README.md) — the executor contract this provider implements, including the request/spec split.
- [bash-local](../bash-local/README.md) — the POSIX parent whose mechanics this executor inherits.
- [gitbash-sandbox](../gitbash-sandbox/README.md) — the confining twin; compose it when a sandbox runner exists that tolerates the msys runtime (the shipped windows-acl chain does not).
- [tool-bash](../tool-bash/README.md) — the model-facing `bash` tool over this executor.
- [Bash executor subsystem](../../../docs/subsystems/shell.md) — request/spec vocabulary, results, and the service contract in full.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-bash`, which renders this executor's bounded stdout/stderr tails, background-process deltas (through the generic job runtime), spill-file paths, and infrastructure failures. The `bash` tool's description and rendering are byte-identical to the POSIX stack — the platform difference is only the executable behind the seam.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when this executor is a poor fit. They are current package constraints, not a roadmap.

- **Unconfined by itself — and unconfineable by the shipped chain** — commands run with the harness process's authority; the windows-acl restricted-token runner cannot start the msys runtime at all (`CreateFileMapping` denial at startup), so on the default win32 stack confinement for shell commands comes from approval policy, not the sandbox (see the gitbash-windows-shell-stack Agent Note). The `fs` capability keeps its own confinement.
- **No persistent shell or PTY** — every call starts a fresh `bash -c`; the persistent terminal stacks live on the `ctx.terminal` seam.
- **MSYS path conversion applies to native child invocations** — when a command invokes a native Windows executable, msys rewrites POSIX-looking arguments into Windows paths (usually desirable); a command that must pass a leading-slash flag to a native executable needs `MSYS2_ARG_CONV_EXCL` discipline of its own.
- **A background provider-failure note is single-delivery** — the executor injects the stage-neutral `subprocess failed before reporting an outcome: …` into exactly one `readOutput()` delta; a reader that discards that delta cannot recover it.
- **Windows termination reports no signal** — a force-killed process settles as exit 1 with `signal: null`; `kill()`-initiated stops still stamp `killed` directly.
- **Scoop/chocolatey shimmed installs may not resolve** — a `git.exe` shim on PATH does not name its installation directory; set `gitBashPath` explicitly for package-manager layouts the candidate order does not cover.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The win32 default composition and the msys×restricted-token evidence live in the gitbash-windows-shell-stack Agent Note (`.agents/notes/implemented/feature/`).

</details>
