---
description: "Durable Windows shell preference: owns the windows-shell settings namespace and the boot-time DSH_WINDOWS_SHELL seed; for users and maintainers choosing between the Git Bash and PowerShell stacks."
kind: "package-reference"
---

# @deepseek-ai/dsh-windows-shell

English | [中文](README.zh.md)

## Summary

Use this package to persist which Windows shell stack the next launch mounts. It owns the `windows-shell` user-settings namespace (`shell: gitbash | pwsh`, default `gitbash`) and exports the boot-time seed that turns the stored preference into the `DSH_WINDOWS_SHELL` composition fact. Web GUI users get the same effect through the [Windows Shell settings row](../../client/ui-windows-shell/README.md); this package is the headless and configuration surface.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The [base bundle](../../bundle/base/cordis.patch.yml) mounts it on win32 only (`disabled: process.platform !== 'win32'`); a POSIX host serves no `windows-shell` namespace, which is what hides the settings row there.

Precedence on win32, highest first: an explicitly set `DSH_WINDOWS_SHELL` variable (per-invocation override), a stored `shell: pwsh` preference, then the Git Bash default. The seed writes nothing unless the stored preference is `pwsh` — an unset variable already mounts Git Bash.

`seedWindowsShellEnvironment(env?, filename?)` reads the settings document (default: `settings.yaml` under the harness home) and seeds `env.DSH_WINDOWS_SHELL` per that precedence. `dsh`'s profile boot calls it before the first composition. A missing document or section changes nothing; a malformed document throws, naming the file.

The choice is restart-scoped (`applies: 'restart'`): exactly one shell executor may mount per host, and a session's tool roster locks once it turns, so the stored value changes what the next launch mounts, never a running composition.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/settings.ts` owns the schema and vocabulary constants; `src/boot.ts` the seed; `src/index.ts` registers the namespace through `ctx.inject(['settings'])` when the optional settings service is composed. The registration is an effect on the plugin's fiber, and an invalid stored section fails it loudly at registration time.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the shell executor and tool rows the next launch mounts from the stored preference; it registers no prompt or schema of its own.

#### KV Cache effect

No direct invalidation. Changing the preference alters no running session's composition or prefix; a session created by the next launch establishes its own prefix from the stack that launch mounts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The boot seed reads the settings document at its default location; a deployment mounting `dsh-settings-file` with an explicit `path` config must set `DSH_WINDOWS_SHELL` explicitly.
- A stored value outside the two stacks does not fail the seed — the settings provider's registration is the fail-loud authority moments later.

<a id="dev-note"></a>
### Dev Note

None.

**Runtime invariant:** No companion is published. The preference is one settings namespace the provider resolves at registration; the boot seed is a pure function over one document, proven by its matrix spec — no independent observation can diverge.
