---
description: "Skill directory management over the skillManager Remote: list, install, edit, uninstall, and enable or disable the skills a user and project scope own, plus the「技能」settings section that drives it."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-manager

English | [中文](README.zh.md)

## Summary

Use this package to manage skills from the Web GUI instead of editing directories by hand. It reads the same four roots `dsh-skill-filesystem` discovers, writes new skills into the scope's shared agent root, and expresses enablement as location: a disabled skill moves into a root-local disabled area the provider's depth-one discovery never descends into. Every mutation lands on disk, so the provider's own watcher publishes the change and no restart is required. The Host half serves the `skillManager` Remote; the browser half renders the「技能」settings section.

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

Mount this package beside the tools capability it writes for. The Host half registers the `skillManager` Remote namespace; the browser half registers one settings section.

```yaml
- name: '@deepseek-ai/dsh-skill-manager'
```

Every Remote call carries a scope — `{ kind: 'user' }` or `{ kind: 'workspace', cwd }` — and answers with the scope's refreshed listing, so a client never predicts a filesystem outcome:

| Method | Effect |
|---|---|
| `list` | Roots, the create target, and every skill found, ordered by name |
| `read` | One skill's stored document, split into frontmatter and body |
| `create` | Author a new skill under the scope's shared agent root |
| `installFromDirectory` | Copy an existing skill directory into that root |
| `installFromGit` | Shallow-clone a repository and copy the skill it carries |
| `update` | Rewrite the owned frontmatter fields and the body |
| `uninstall` | Delete a managed skill |
| `setEnabled` | Move a skill between its root and the root's disabled area |

The managed roots are `$DSH_HOME/skills` and `$DSH_AGENTS_HOME/skills` for user scope, and `<project>/.dsh/skills` and `<project>/.agents/skills` for workspace scope, where the project root is the nearest ancestor holding `.git`. New skills are written to the `.agents/skills` root. A skill found anywhere else — a bundled provider, a preset-shipped directory — is listed with `managed: false` and refuses every mutation.

### Failures

Each refusal carries a stable code: `skill-manager/not-found`, `skill-manager/conflict`, `skill-manager/read-only`, or `skill-manager/rejected` with the actionable reason. A skill whose frontmatter names no usable skill is skipped from a listing rather than failing it.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

- **The manager owns directories, not the registry.** It never calls `ctx.skills`; it reads and writes the roots the provider scans, which keeps the two from drifting and lets a deployment disable the host `skill-filesystem` row without disabling management.
- **Enablement is a rename.** `discoverRoot` inspects only depth-one entries, so `<root>/.disabled/<name>/SKILL.md` is invisible; the rename is same-filesystem and therefore all-or-nothing, and its `unlinkDir`/`addDir` events are the ones the provider's watcher already treats as catalog changes.
- **The project-root rule has one home.** `resolveProjectRoot` is exported by `dsh-skill-filesystem` and called here, so a workspace scope cannot resolve a different project than discovery reads.
- **The scope's answers are its own.** Every mutation returns the refreshed listing rather than a diff, so the browser applies one server-derived value per operation.

</details>

## Further Exploration

- [Skill subsystem reference](../../../docs/subsystems/skills.md) — the registry, provider contract, and local discovery priority this package manages around.
- [Local filesystem skill provider](../skill-filesystem/README.md) — the discovery this package's roots and disabled area are designed against.
- [Remote assembly](../../api/remotes/README.md) — how clients consume `skillManager` without importing the Host implementation.

-----

<a id="model-experience"></a>
## Model Experience

### Management mutations

#### What the model sees

This package registers no tool, prompt section, or request-context contribution. Its effect is indirect and intentional — a skill enabled or disabled here changes what the `skill` tool and the per-session catalog advertise on the next read.

#### Token effect

The package adds no request tokens of its own; the named consumer owns every visible byte.

#### KV Cache effect

None; this package neither assembles nor sends a provider request. Enabling or disabling a skill changes the *next* tool catalog a session publishes, which is a session-log event owned by `dsh-tool-skill`.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Shipped skills are read-only** — a skill under the bundled root or inside a preset's own `skills/` directory is listed with its source label but cannot be moved or deleted, because the manager only renames inside roots it owns.
- **Workspace scope needs a project directory** — a deployment with no registered workspace can only manage user-level skills.
- **Git installs require the `git` executable** — the install path shells out to it; a machine without git reports `skill-manager/rejected` with the clone failure rather than degrading.
- **Frontmatter formatting is not preserved through an edit** — unknown keys survive an `update`, but their comments and layout do not.

<a id="dev-note"></a>
### Dev Note

The disabled area is a manager-owned convention living inside each skill root, not a provider feature: the provider is untouched by this package, and a skill parked there is simply a depth-two entry it never inspects.
