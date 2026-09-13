---
description: "Browser settings section for a bounded, read-only workspace file browser; for users and maintainers of the workspace-inspector experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace-inspector

English | [中文](README.zh.md)

## Summary


Browser settings section for bounded inspection of the first registered workspace. The plugin registers `workspace-inspector` in `settings.section`, lists one directory at a time through `workspaceFiles.tree()`, searches filenames through `workspaceFiles.search()`, and opens text previews through `workspaceFiles.preview()`.

The listing supports breadcrumb navigation, file-size labels, and a two-pane preview that shows the path, a version token, and a truncation mark when the Host reports one. All path authorization, link rejection, preview bounds, and version metadata remain Host responsibilities. The section is read-only; it displays RPC failures as an alert banner with retry.


-----

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Model Experience

None, as this browser-side workspace-file projection registers no model-visible content.

#### KV Cache effect

None; workspace browsing does not participate in provider requests.

## Known Limitations and Deferred Work

- The section always selects the first registered workspace and provides no workspace picker.
- The section does not expose create, rename, save, or delete controls.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The client panel only renders bounded workspace reads and owns no independent runtime state.
