# Agent Note: Windows defaults to the Git Bash shell stack behind DSH_WINDOWS_SHELL

Status: implemented

English | [中文](2026-09-12-gitbash-windows-shell-stack.zh.md)

## Problem

This distribution's primary host is Windows, but the model's command corpus is overwhelmingly POSIX-shaped: the shipped win32 stack mounted the confined PowerShell executor (`pwsh-sandbox` + `tool-pwsh`), so every Linux-trained command had to be translated or retried. The fork needed the model to run its commands through Git for Windows' `bash.exe` — with the platform's shell stack still selectable — without breaking the seam's one-executor-per-host rule or the shipped permission stack.

## Decision

The shell capability gains two providers, and the win32 composition defaults to the unconfined Git Bash stack:

- `@deepseek-ai/dsh-gitbash-local` (`GitBashExecutor extends LocalBashExecutor`) owns only the Windows deltas: fail-loud Git Bash discovery (pure `resolveGitBashPath` in `src/resolve.ts` — explicit path, well-known install locations, the installation a PATH `git.exe` names, then a Git `bin` directory on PATH; `System32`/`WindowsApps` `bash.exe` is never taken because it is the WSL launcher, and a bare `bash` is never returned), the `gitBashPath` settings re-probe, and the argv seam. All mechanics are inherited. `dsh-bash-local` grew two subclass hooks: the settings section installs the concrete class's `static Config`, and an empty `onSettingsChanged()` fires on document change.
- `@deepseek-ai/dsh-gitbash-sandbox` mirrors `pwsh-sandbox` call-for-call and is complete, but NO shipped composition mounts it (see the spike evidence below).
- The base bundle and the four agent presets gate their shell rows on `process.platform` **and** `process.env.DSH_WINDOWS_SHELL`: unset/`gitbash` mounts `gitbash-local` + `tool-bash` (and the minimal preset's `terminal-bash`/`persistent-bash`) on win32; `pwsh` restores the upstream confined stack; POSIX rows are unchanged. The vendored loader evaluates `!!js` `disabled` expressions through `with(ctx){eval}`, so unshadowed identifiers reach the real `process` — `process.env` reads work; `apps/cli/tests/windows-shell.spec.ts` pins both platforms × both env values through the real compose algorithm.
- `dsh-terminal-bash`'s bash dialect on win32 resolves Git Bash (win32-only branch of `resolveConfig`, which gained `platform`/`env` parameters for cross-host unit pinning), so the minimal preset's persistent bash stack works on Windows without a row-config change.
- `vitest.config.ts` gains a Git Bash probe: on hosts where the twins' suites self-skip (every non-Windows lane), their src files are coverage-exempt — the same membership contract as the pwsh probe.

## The msys confinement spike (why the default stack is unconfined)

`SandboxGitBashExecutor` over the real `dsh-sandbox-local` win32 chain (windows-acl restricted-token runner) dies at startup, deterministically, in both modes:

```text
bash: *** fatal error - CreateFileMapping S-1-5-21-…-1001.1, Win32 error 5.  Terminating.
```

The msys runtime must open/create its SID-named shared-memory section before `main()` runs; the restricted token denies it. This is structural (the restricting-SID design is what makes the DACL grants meaningful — a token-less DACL-only variant is not confinement), so no shipped Windows runner can confine Git Bash today. `gitbash-sandbox` therefore stays unpublished in composition, and the default win32 stack accepts unconfined shell execution.

## The permission adaptation

`dsh-permission-presets` failed loud over the unconfined executor ("presets bundle a sandbox mode … misconfiguration"), which would have made the default win32 profiles unbootable. The service's assertion is relaxed to the honest minimum: an unconfined executor may mount only preset tables whose every entry is `danger-full-access` (the one mode doing nothing enforces); anything else is refused by name. The base bundle splits the `permission` row in two: the full table wherever the executor confines, and `permission-unconfined` (`unconfined-ask`: danger-full-access + ask, explicit `defaultPreset`) on the default win32 stack. The `fs` capability keeps its own `fs-sandbox` confinement; the approval flow is unchanged; `DSH_WINDOWS_SHELL=pwsh` restores the full table.

## Alternatives considered

- **Per-call dialect selection (both `bash` and `pwsh` tools mounted simultaneously)** — requires a dialect field on the shared `ShellExecRequest` plus a dispatching provider, touching the core seam and both consumers; rejected for coupling against the seam's one-executor contract.
- **Patch-only selection (no environment variable)** — the official mechanism alone; rejected as the sole channel because this distribution's owner wants per-invocation switching without editing profile files.
- **`sandboxMode: 'danger-full-access'` advertised by the unconfined executor** — would let the full preset table mount, but the tool's escalation surface would then offer confinement modes the executor never enforces; rejected as a lie to the model.
- **WSL `bash.exe`** — a real Linux bash, but a different filesystem view from the Windows-side `fs` capability; rejected for view splitting.
- **A new confinement runner that tolerates msys** — a project of its own with security-sensitive verification; deferred (and `gitbash-sandbox` is ready for it).
- **Relaxing the permission assertion to "any presets, unconfined executor"** — would let the switcher promise `workspace-write` the executor cannot deliver; rejected for the same honesty reason as the sandboxMode lie.

## Consequences

- On Windows the model's default shell tool is `bash` over Git Bash, byte-identical in schema and rendering to the POSIX stack; its commands run with the harness process's authority — shell confinement comes from approval policy, not the sandbox. This is the fork's explicit tradeoff; `DSH_WINDOWS_SHELL=pwsh` restores full confinement per invocation, and profile patches restore it persistently.
- POSIX hosts and the `sdk-minimal` standalone tree are untouched; `gitbash-sandbox` ships tested but unmounted; the coverage gate enforces the twins fully on Windows hosts with Git for Windows.
- `pnpm dsh --profile headless` on a Git-Bash-less Windows host now fails at plugin load with an actionable message naming `gitBashPath` — fail-loud by design.
- A recorded-session snapshot was not added: no `SessionEventMap`, agent-loop, or tool-surface text changed (`tool-bash`'s description is unchanged, and the win32 roster change is pinned by `windows-shell.spec.ts`); this host has no `DEEPSEEK_API_KEY` to record one, and a `gitbash` scenario can be recorded later if a key becomes available.
- The recorded-session corpora cannot reproduce their committed fixtures on this stack: `bash` advertises `sandbox_permissions` and `justification` only under a confining executor, and `permission-presets` refuses a `workspace-write` table here, so the pinned tool schema and preset diverge. [Recorded-session corpora on the win32 stack](../bug-fix/2026-09-19-win32-snapshot-corpus-launch.md) owns that boundary and what was fixed on the launch path.
