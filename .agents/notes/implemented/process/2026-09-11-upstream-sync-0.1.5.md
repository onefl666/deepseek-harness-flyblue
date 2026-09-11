# Agent Note: Upstream sync to the 0.1.5 release cycle

Status: implemented

English | [中文](2026-09-11-upstream-sync-0.1.5.zh.md)

## Problem

The fork sat 852 commits behind upstream again — the whole 0.1.5 release cycle. The merge brought the new Session format generation (v3, with `isSeeded`/`delegationDepth` headers), the move of the system prompt out of `EpochHeader` into a `system/message` surface event, the deprecation of synchronous Session event reads, per-platform shell tool selection in the shipped presets, a boot-time activation audit for every composition entry, a 100-word limit on package README Summaries, and web scaffold authentication. After the mechanical merge, 44 conflicts remained and the tree neither type-checked nor linted: fork plugins and tests still called the removed APIs, the effort-slider entry failed the new activation audit, the plan command lost its localized client face, and the fork's web e2e tests booted a 401 page or seeded sessions that never reached storage.

## Decision

Adapt the fork to the current upstream APIs and keep fork behavior where the two diverge, mirroring the [2026-09-08 sync](2026-09-08-upstream-sync-adaptation.md). Generated catalogs are regenerated rather than hand-merged; conflict sides are chosen per file: fork behavior for plan-handoff and the fork plugin roster, upstream where the fork side was stale (the session-log note had accidentally reverted to v0-era prose; upstream's current text now carries the fork's one usage-dashboard sentence).

**API migrations.** `EpochHeader.system` is gone: the plan-handoff integration spec now asserts the `system/message` surface node (append on first assembly, replace-in-place on mode flips) exactly as upstream's plan-mode spec does, and the usage dashboard seeds headers without `system`. The PTC dispatch event renamed to `tool/ptc-dispatch`; an invalid `plan/approved` payload needs the double cast the stricter event union now requires. Fork UI spec doubles gain the new `usePanelInfo` standard prop. The fork's eleven production `snapshotEvents()` call sites keep their behavior under line-scoped `typescript/no-deprecated` waivers, as the [deprecation decision](../architecture/2026-09-09-deprecate-synchronous-session-event-reads.md) allows.

**Product fixes.** Persistence write handles are now owned by the agent loop, so the usage dashboard's cold-session seed hands its buffered events to `sessionPersistence.create()` itself, and a stored session no longer auto-attaches an Agent when opened in the UI — the standalone-compaction spec resolves one through `sessionController.resolveAgent()`. The composer menu's built-in command face keys off the command's `definitionId`, so plan-handoff registers the upstream `@deepseek-ai/dsh-plan-mode` id and keeps the localized Plan label, claim token, and icon. The effort-slider's host half moves from a load-time `inject: ['webServer']` to runtime `ctx.inject()`, because the new activation audit rejects any entry still pending in a server-less boot such as `dsh --profile web --help`.

**Test and snapshot adaptation.** The web scaffold now serves behind authentication, so the fork's three web specs navigate to `authenticatedUrl`. The presets e2e asserts the platform-selected shell tool (`pwsh` on Windows, `bash` elsewhere) with each platform's persistent-shell description, adds the fork's `ssh_exec`/`ssh_list` to the standard-preset roster — the composition has shipped them since the SSH work — and guards the POSIX-only owner-mode check behind a platform branch. The seeded v3 fixture gains the required `isSeeded`/`delegationDepth` header fields. The lifecycle, codegraph-index, standalone-compaction, and usage-stats goldens are refreshed: the fork's blank-session index banner now renders in the hero, command labels follow the upstream localized face, and the settings chrome renames "Session log" to "More actions". Seven fork package READMEs trim their Summary sections to the new 100-word limit on both language sides with pairing records re-recorded.

## Alternatives considered

**Take upstream's plan-mode wholesale.** Rejected for the same reason as the previous sync: the binary approve/decline review cannot express the fork's execute/compact/keep paths.

**Make the effort-slider entry conditional in the patch instead.** Rejected: the row must exist wherever the web client roster loads, and runtime injection expresses "mount the asset route when a server binds" without a second composition variant.

**Platform-split the presets locally to keep `bash` on Windows.** Rejected: the platform selection is upstream product behavior with sandbox executors per platform; the fork mirrors it in tests instead of forking the preset.

## Consequences

The fork compiles, lints, builds, and passes its adapted suites against the 0.1.5-cycle upstream: plan-handoff (92 tests), usage-stats, the SSH/task-board/workspace/codegraph server packages, the fork client UI packages (205 tests), the four fork web e2e specs in replay, the perf suites the host can run, and the full doc gate set (34 gates). The merge commit records the 852-commit range with conflicts resolved per the rules above.

Three Windows-host limitations remain outside this change, in the same class as the previous sync's environment prerequisites: snapshot fixtures stored as symlinks materialize as text pointers under `core.symlinks=false` and break the ACP corpus locally; recorded sessions that call `bash` replay as `UNKNOWN_TOOL` because the win32 preset disables `tool-bash`; and the pwsh-7-dependent suites stay red without that binary. CI's POSIX matrix owns these signals.
