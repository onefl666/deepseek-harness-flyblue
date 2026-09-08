---
description: "Workspace-scoped Git reads and mutations with confinement and confirmation rules; for users and maintainers of the workspace Git surface."
kind: "package-reference"
---
# @deepseek-ai/dsh-workspace-git

English | [中文](README.zh.md)

## Summary


Loopback Typert service for Git operations scoped by registered workspace ID. It exposes porcelain status, local branches, a bounded commit graph, branch creation and switching, plus guarded stage, unstage, and discard operations without exposing arbitrary process execution.

Branch switching requires a clean working tree, no active merge, rebase, cherry-pick, or revert, a known local branch, and no conflicting checkout in another worktree. File operations reject empty, option-shaped, parent-traversal, and `.git` paths; discard also requires explicit confirmation.


-----

## Table of Contents

- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `timeoutMs` | `20000` | Maximum duration of one Git subprocess. |
| `graphLimit` | `500` | Maximum commits returned by one graph request. |

## Model Experience

None, as the loopback Git service serves browser requests and registers no model-visible content.

#### KV Cache effect

None; workspace Git RPCs do not assemble or send model requests.

## Known Limitations and Deferred Work

- Branch APIs cover local branches only; fetch, pull, push, remote configuration, tags, and conflict resolution are outside this service.
- Each Git subprocess has a fixed 4 MiB output buffer in addition to the configurable timeout and graph-row bound.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
