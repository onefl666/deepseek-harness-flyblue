# Agent Note: Upstream sync adaptation for the fork's plugin set

Status: implemented

English | [中文](2026-09-08-upstream-sync-adaptation.zh.md)

## Problem

This fork carries custom plugins — plan-handoff, CodeGraph, SSH, task-board, usage-stats, the workspace inspector, and the effort slider — on top of a vendored Cordis runtime. The upstream branch advanced 3255 commits past the fork's merge base, and the merge left the tree in a state that neither type-checked nor built:

- Custom plugins called Session APIs the upstream had replaced: `session.events` became `session.snapshotEvents()`, the `plan` projection moved to `stateSchema` plus `wire.view`, and `sessionPersistence.listSnapshots`/`inspect` became `list` plus `open(id, 'read')`.
- The upstream deleted whole packages (`client/runtime`, `host/apiproxy`, several examples), but the merge left their build artifacts and package manifests behind. Those stale directories hid real type errors and later made `tsdown` resolve a nonexistent root entry.
- The upstream added repository gates the fork did not satisfy: README frontmatter and Summary/Table-of-Contents/Dev-Note skeletons, `corner-shape: round` on full-round radii, hairline neutral borders, TOC anchors that resolve, and a type-equiv manifest.
- Two conflict resolutions had silently taken the upstream side where the fork's behavior was the point: the `plan` projection test file and the ui-user-questions carrier contract.

## Decision

Adapt the fork's plugins to the current upstream APIs, and keep the fork's product behavior where the two diverge. The work splits four ways.

**Server-side API migration.** `plan-handoff` folds over `session.snapshotEvents()` and registers its unit with `stateSchema` and `wire: { viewSchema, view }`; the removed `seedLength` option is gone from session creation. `usage-stats` reads stored logs through `open(id, 'read')` and takes usage from the `assistant/message` settlement or the last usage chunk in an `assistant/attempt` stream. `codegraph-index` uses the string `'codegraph'` settings namespace, since the `settingsNamespace()` factory no longer exists.

**Client-side carrier migration.** The upstream replaced the runtime's `PendingWait` carrier with a domain-owned `PendingQuestion` class. The fork's `contract/slots.ts` adopts that carrier while keeping its multi-approve plan review: `approve` stays a `string[]`, `PlanReview` keeps `approves` and `refine`, and `planReviewOf` still requires every named approve label to name a real option with at most one refine option besides. Imports move to their new homes — `SlotRegistry` to `ui-renderer/client`, `ClientContext` to `cordis`, `defineStore` to `client-store`, `WorkspaceListState` to `WorkspaceSnapshot`.

**Stale-artifact removal.** Every package the upstream deleted is removed from the tree, including the `client/runtime` directory whose leftover `node_modules` made `tsdown`'s workspace glob fall back to the root entry.

**Gate compliance.** Fork READMEs gain the frontmatter and skeleton the doc standard requires, their TOCs link the sections that actually exist (Chinese sides link the English anchors, which the pairing gate compares), full-round CSS radii pair `corner-shape: round`, neutral solid borders drop to 0.5px, and the generated catalogs and pairing records are regenerated together.

## Alternatives considered

**Take the upstream plan-mode plugin instead of adapting plan-handoff.** The upstream replaced plan mode with a binary approve/decline review, which cannot express the fork's three execution paths (execute, compact, keep). Adapting the fork's plugin preserves those answers; adopting upstream would silently remove two of them.

**Keep the stale package directories and let the build ignore them.** The artifacts hid the real type errors during the merge and broke `tsdown`'s workspace resolution once the source was fixed. Removing them is what made the failures visible and fixable.

**Re-record the pairing files without bringing the Chinese sides along.** The pairing gate compares structure and link targets, not just hashes, so a hash-only re-record fails on the first structural divergence and leaves the pair dishonest in review.

## Consequences

The fork's custom plugins compile and test against current upstream APIs, and the repository gates pass (`typecheck`, `lint`, `doc-sync`, the adapted package tests). Fork behavior is preserved: the plan review still offers every execution path, standalone compactNow still renders a running row, and the workspace inspector still exposes its own Remote surface.

Two classes of failure remain outside this change. Tests that need PowerShell 7 (`pwsh`) fail on hosts that ship only Windows PowerShell 5, and `build-exe-for-python-sdk` asserts a specific `pnpm` path. Both are environment prerequisites, not fork regressions.
