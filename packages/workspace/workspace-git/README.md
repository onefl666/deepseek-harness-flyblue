---
description: "Workspace-scoped Git reads and mutations with confinement and confirmation rules; for users and maintainers of the workspace Git surface."
kind: "package-reference"
---
# @deepseek-ai/dsh-workspace-git

English | [中文](README.zh.md)

## Summary


Loopback Typert service for Git operations scoped by registered workspace ID. It exposes porcelain status, local branches, a bounded commit graph, branch creation and switching, and guarded stage, unstage, and discard operations, without exposing arbitrary process execution.

Every repository verb runs from the work-tree root, so a status path is usable unchanged as a mutation target whether the workspace is the repository root or a subdirectory. Branch switching requires a clean tree, no operation in progress, a known branch, and no conflicting worktree checkout; file operations reject empty, option-shaped, traversal, and `.git` paths.


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
- The graph walks the history reachable from HEAD in topological order and carries the repository it resolved; a workspace outside every work tree answers with a null repository, and the graph covers no branch beyond HEAD.
- Status paths are Git's own porcelain output, so an untracked directory holding only untracked files arrives as the single `dir/` entry Git emits for it.
- Each Git subprocess has a fixed 4 MiB output buffer in addition to the configurable timeout and graph-row bound.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The service is stateless across calls and re-reads repository state before every guarded Git operation.
