# Agent Note: The Windows shell preference — a settings namespace and Settings row that seed DSH_WINDOWS_SHELL at the next launch

Status: implemented

English | [中文](2026-09-13-windows-shell-preference.zh.md)

## Problem

Since the [gitbash stack note](2026-09-12-gitbash-windows-shell-stack.md), the win32 shell stack is selectable only through the `DSH_WINDOWS_SHELL` environment variable (per invocation) or profile patches (persistent). There is no durable, discoverable switch: the Web GUI exposes no surface, and editing `cordis.patch.yml` by hand is the only persistent channel.

## Decision

- New host package `@deepseek-ai/dsh-windows-shell` owns the durable preference: the settings namespace `windows-shell` (`shell: 'gitbash' | 'pwsh'`, default `gitbash`), registered `applies: 'restart'`, mounted by the base bundle on win32 only (`process.platform !== 'win32'` disables the row).
- `runProfile` (apps/cli/src/profile-boot.ts) calls `seedWindowsShellEnvironment()` before the first compose: it reads `<harness home>/settings.yaml` and seeds `process.env.DSH_WINDOWS_SHELL = 'pwsh'` only when the stored preference says pwsh and the variable is unset. An explicitly set variable keeps its per-invocation override (the same precedence family as `DSH_PERMISSION_MODE ?? 'workspace-write'`); a missing document or section leaves the Git Bash default; a malformed document fails loud, naming the file.
- No `disabled:` expression changed anywhere. The seed fills the one composition-time fact channel the existing rows already gate on, and the vendored loader's `with(ctx){eval}` fallback to the real `process` carries it to bundle rows and preset rows alike.
- Restart-scoped by design: one shell executor may mount per host (the duplicate service registration throws), and a session's tool roster locks once it turns (the agent-preset `recompose` contract), so a mid-run switch cannot be honored. The Settings row states the restart scope in its copy.
- New client package `@deepseek-ai/dsh-client-ui-windows-shell` adds the General-settings row (slot id `windows-shell`, order 1) over the shared settings describe mirror: two fixed options, a revision-fenced `remote.settings.mutate` whose answer folds back into the mirror, hidden when the namespace is absent (POSIX host) or persistence is disabled (non-loopback memory mode), and failed loudly when the advertised value is outside the two stacks.
- The row's selectable ids are the closed product vocabulary restated client-side on purpose: importing the host package into the browser bundle would pull `node:fs`/`yaml`, and deriving the options from the wire schema would clone `permissionDefaultOf`'s machinery for an enum that cannot grow without new executor packages.

## Alternatives considered

- **Live switching (mutate the env and recompose)** — needs whole-tree and preset-scope recomposition and is unsafe for any running session (roster lock); rejected. Restart-to-apply matches the env-var channel it replaces, which also required a relaunch.
- **A `/shell` slash command alongside the row** — rejected by the owner for this change; the Settings row is the single surface.
- **Schema-derived row options** — the right pattern where the enum is host-configurable (permission presets); rejected here as machinery without a varying input.
- **Reading the settings document from the `!!js disabled` expressions** — expressions must stay cheap and pure, and this would couple the loader to the settings format; rejected in favor of the env seed.

## Consequences

- Precedence on win32: explicit `DSH_WINDOWS_SHELL` > stored `windows-shell.shell` > Git Bash default.
- A settings-file provider mounted with an explicit `path` config bypasses the boot seed (the seed reads the default `<harness home>/settings.yaml` location); such a deployment sets the env variable explicitly. Documented in the package README.
- The seed is deliberately lenient about a stored value outside the two stacks (the provider's registration is the fail-loud authority moments later) and fail-loud about malformed YAML.
- `packages/bundle/base/tests/base.spec.ts` was repaired in the same change: it had evaluated the shell rows with an env-less scoped `process` since `5604f88834` (`TypeError: Cannot read properties of undefined (reading 'DSH_WINDOWS_SHELL')`), and its expectation table predated the Git Bash default. It now pins platform × env for every shell row plus the new preference row.
- No session event, model-visible input, or tool-surface text changed, so no recorded-session snapshot was added (same verdict as the gitbash stack note); the roster facts are pinned by `windows-shell.spec.ts` and `base.spec.ts`.
