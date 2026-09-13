---
description: "Web GUI settings row for the Windows shell preference (Git Bash vs PowerShell); writes the windows-shell namespace the next launch composes from; for users and maintainers of the win32 shell stacks."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-windows-shell

English | [中文](README.zh.md)

## Summary

Use this package to switch the Windows shell stack from the Web GUI. The General-settings row writes the durable `windows-shell` namespace through the host Settings API; the next launch mounts the preferred stack (Git Bash by default, PowerShell behind one pick). The row copy states the restart scope, because a running composition cannot swap its shell executor.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the settings packages (the [web-app bundle](../../bundle/web-app/cordis.patch.yml) ships it); the row then appears in General settings on every host that serves the `windows-shell` namespace. A POSIX host mounts no such namespace and the row hides itself; a remote (non-loopback) browser with Host persistence disabled hides it the same way.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/settings-store.ts` mirrors the shared settings describe view and writes the `shell` field with the view's revision; the accepted answer folds back into the mirror. `src/client/WindowsShellRow.tsx` renders the row over the `Menu` primitive with the two closed-vocabulary options. A value advertised outside the two stacks fails the row loudly instead of rendering a selector that cannot name it.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the shell stack the next launch mounts after the row's write; the row registers no prompt or schema of its own.

#### KV Cache effect

No direct invalidation. The write changes no running session's composition or prefix; a session created by the next launch establishes its own prefix from the stack that launch mounts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The row cannot switch a running composition; the host package's README owns the precedence and restart semantics.
- The selectable ids are restated client-side: importing the host package would pull `node:fs`/`yaml` into the browser bundle.

<a id="dev-note"></a>
### Dev Note

None.

**Runtime invariant:** No companion is published. The browser-only controller writes through the shared settings mirror, and the HMR-safety spec proves the row's contribution lifecycle.
