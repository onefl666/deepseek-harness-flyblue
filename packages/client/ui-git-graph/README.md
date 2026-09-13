---
description: "Browser settings section for one workspace's Git working tree, branches, and commit graph; for users and maintainers of the Git experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-graph

English | [中文](README.zh.md)

## Summary


Browser settings section for one workspace's Git working tree, branches, and commit graph. It registers `git-graph` in `settings.section`, reads `workspaceGit.status()`, `graph()`, and `branches()` through generated remotes, and offers stage, unstage, confirmed discard, branch switching, and branch creation.

The section follows the workspace of the session being worked in and can be pointed elsewhere. Repository identity arrives with the graph answer, so a workspace outside every work tree is its own empty state, and lanes are assigned by a pure function and drawn as SVG. Git access and safety remain owned by `@deepseek-ai/dsh-workspace-git`.


-----

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Model Experience

None, as this browser-side Git projection registers no model-visible content.

#### KV Cache effect

None; rendering Git state and history does not participate in provider requests.

## Known Limitations and Deferred Work

- The graph covers the history reachable from HEAD; other branches appear in the branch card and in commit decorations.
- The chosen workspace lives in the component, so closing and reopening the settings panel returns to the open session's workspace.
- Commit rows have a fixed height, so a row whose ref labels exceed the available width clips them; the row's tooltip carries the full list.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The client panel only projects immutable RPC snapshots and owns no independent runtime state.
