---
description: "Loopback browser settings section for SSH host inventory and deliberate command execution; for users and maintainers of the SSH experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-ssh

English | [中文](README.zh.md)

## Summary
Loopback browser settings section for SSH host inventory and one-command execution. The plugin registers `ssh` in `settings.section`, loads secret-free hosts through `ssh.list()`, creates and edits host records through `ssh.put()`, and deletes them through `ssh.delete()`. A selected host drives the command console, which sends one command at a time through `ssh.exec()` and appends one terminal block per command with its captured streams and exit status.

The console never auto-retries: a post-dispatch failure keeps the captured partial output and warns that the result is unknown, because an uncertain non-idempotent command must not be repeated automatically.


## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Model Experience

None, as this browser-side SSH projection registers no model-visible content.

#### KV Cache effect

None; browser SSH operations do not participate in provider requests.

## Known Limitations and Deferred Work

- The section runs one command at a time; it provides no interactive terminal, streaming output, or cancellation.
- Command history is session-local and resets with the settings panel.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
