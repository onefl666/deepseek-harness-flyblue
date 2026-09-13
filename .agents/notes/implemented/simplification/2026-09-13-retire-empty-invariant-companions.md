# Agent Note: The fork retires its fifteen empty invariant companions and declares MIT

Status: implemented

English | [中文](2026-09-13-retire-empty-invariant-companions.zh.md)

## Problem

`pnpm run hygiene` failed four of its sixteen gates on this branch, and each failure was a repository fact rather than a missing tool:

- **Empty invariant companions.** Fifteen packages published a `src/invariant.ts` whose installer body was `const install: InvariantInstaller = () => {}`, together with the complete `./invariant` publication wiring: the `exports` entry, the `files` entry, the `@deepseek-ai/dsh-invariants` peer and dev dependency, the `runtime-diagnostics/invariants` project reference, the `tsdown` entry, and the `tsconfig.base.json` path mapping. `AGENTS.md` states that an empty installer is invalid and that a package without an independently observable relation must omit the companion and its wiring and record why in its README.
- **Non-MIT license declarations.** `packages/schedule/task-board`, `packages/workspace/workspace-files`, and `packages/workspace/workspace-git` declared `BSD-3-Clause`, and `packages/ssh/ssh` and `packages/ssh/tool-ssh` declared `Apache-2.0`. `verify-dsh-package-licenses` requires every `@deepseek-ai/dsh*` manifest to declare MIT.
- **A module-scope value import of an optional peer.** `packages/plan/plan-handoff/src/handoff.ts` imported `ManualCompactionError` as a value from `@deepseek-ai/dsh-compaction` while that peer is marked optional in `peerDependenciesMeta`. A tree without compaction therefore failed to load the planning plugin instead of reporting the capability as unavailable.
- **A materialized symlink read as a configuration file.** `apps/cli/tests/profiles/acp/cordis.yml` is recorded in the index as a symlink (mode 120000). This checkout had `core.symlinks=false`, so Git wrote the link target as a 59-byte text file, and `verify-cordis-config` parsed that path string as a Loader document and rejected it as a non-array root.

## Decision

**The empty companions are retired, not filled.** Every artifact of the fifteen companions was deleted: `src/invariant.ts`, the four `tests/invariant*.spec.ts` files that existed only to cover them, `exports["./invariant"]`, `lib/invariant.js` in `files`, the `@deepseek-ai/dsh-invariants` peer and dev entries, the `runtime-diagnostics/invariants` reference in each package `tsconfig.json`, the `lib/types/invariant.js` entry in each package `tsdown.config.ts`, and the nine explicit `/invariant` path mappings in `tsconfig.base.json`. The client packages needed no path-mapping removal: the `@deepseek-ai/dsh-client-*/invariant` wildcard stays because other client packages still own real companions. Each README now carries the omission reason the gate matches, in the form the repository already uses (`**Runtime invariant:** No companion is published. …`).

**Five packages now state their schemastery project reference.** `packages/schedule/task-board`, `packages/session/usage-stats`, `packages/ssh/ssh`, `packages/workspace/workspace-files`, and `packages/workspace/workspace-git` import `@deepseek-ai/schemastery` but never referenced `vendor/schemastery`. Their declaration redirect arrived transitively, because `packages/runtime-diagnostics/invariants/tsconfig.json` references that project and every one of them referenced `invariants`. With the companion reference retired the import resolved through `tsconfig.base.json` paths to the vendored source, which `rootDir` rejects and which carries strict-mode errors of its own. Each of the five now references `../../../vendor/schemastery` directly, the spelling `packages/codegraph/codegraph-index` and `packages/codegraph/tool-codegraph` already use. The five were found by scanning every retired package for the import rather than by rebuilding until the compiler stopped complaining.

**The five manifests declare MIT.** No LICENSE file, README, or other repository document ever described those five packages as BSD-3-Clause or Apache-2.0, and every other DSH manifest in the repository declares MIT, so the fields were copy-paste drift rather than a licensing decision. Regenerating `THIRD_PARTY_NOTICES.md` is unaffected: that table is derived from third-party runtime dependencies.

**`plan-handoff` classifies the compaction rejection structurally.** The module-scope value import is now a type-only import of `ManualCompactionError` and `ManualCompactionErrorCode`, and `isCancelledCompaction` reads the error's published `name` and `code` instead of its constructor identity. That preserves the distinction the handoff needs: a `cancelled` code is the agent's own signal aborting mid-compaction, which is different from this caller's abort reason, and only it returns `compact-cancelled` without steering the plan. Classifying a value by its published name and code is the pattern the repository already uses for `AbortError` and for `ENOENT`. This follows the gate's own ordering — import as a type, or restructure so module scope needs nothing — rather than a dynamic `import()`, which would only move the failure to first use.

**`rescope-vendor` tolerates a worktree-deleted path.** The gate builds its scan list from `git ls-files`, so a tracked path deleted from the worktree but not yet staged is still listed, and reading it aborted the whole check with `ENOENT` instead of reporting residue. The scan list now drops paths absent from the worktree, which holds no pre-rescope token by definition. This is reachable from any contributor's unstaged deletion, not only from this change.

**This checkout materializes symlinks.** `core.symlinks` is set to `true` in the repository config and the eleven index entries recorded as mode 120000 are real links again. The gate's verdict was correct: it read a regular file whose contents are a path. The same eleven links carry `CLAUDE.md`, `.claude/skills`, three `CLAUDE.md`/`AGENTS.md` fixtures, and three ACP snapshot sidecars, and the three ACP profile e2e tests boot `apps/cli/tests/profiles/acp/cordis.yml` by path, so a checkout that materializes links breaks those lanes as well.

## Alternatives considered

**Fill the fifteen companions with a real check.** `AGENTS.md` names the checks that do not qualify — service presence, plugin metadata, effects, and fixed examples — and these packages hold no second live relation to compare: the Git service re-reads repository state before every guarded operation, the SSH service validates host records at mutation boundaries, the usage and index surfaces are derived projections, and the client panels render RPC snapshots. A check invented to satisfy the gate would assert a relationship that cannot diverge.

**Keep the companions and relax or silence the gate.** `verify-package-invariants` is upstream-owned and its rule already caught a real defect class; deleting the rule to keep fifteen no-op registrations would remove the signal for every future package.

**Keep `instanceof` and promote compaction to a hard dependency.** Compaction is optional by design: the handoff must keep working, and keep the plan visible, in a composition that mounts no compaction engine. Making it required would delete the ``resolveCompaction`` fallback and the `kept` outcome.

**Reference `vendor/schemastery` only where the compiler failed.** Naming the failing projects would have left the other packages dependent on whatever reference happened to redirect their import. The reference belongs to the package that imports the vendored project.

**Stage the deletions so `git ls-files` stops listing them.** Staging repairs one gate run on one machine and leaves the crash in place for the next contributor who deletes a file before running `hygiene`.

**Relax `verify-cordis-config` or skip it on Windows.** The gate read exactly what the filesystem held. Fixing the checkout keeps the gate's meaning intact, which the alternative would trade away.

**Delete only `src/invariant.ts` and keep the project reference.** `verify-package-invariants` rejects a package that keeps the `runtime-diagnostics/invariants` reference without a companion, so the reference had to go with the source.

## Consequences

The five fork packages lose a published `./invariant` subpath. Nothing mounts these companions — no bundle or profile row names them, and the only `/invariant` rows in `packages/bundle/sdk-minimal/cordis.patch.yml` belong to `dsh-session`, `dsh-agent`, `dsh-scope`, and `dsh-agent-loop` — so no runtime composition changes and the packages' runtime behaviour is identical. A consumer that imports `<package>/invariant` must drop the import.

A package that imports a vendored project must now state the project reference itself. The implicit redirect through `runtime-diagnostics/invariants` was a side effect of a reference that had nothing to do with the importing package, and it is gone for every package that referenced that project.

`plan-handoff` depends on the compaction error's published name and code rather than on its constructor identity. A differently-named error that carries `code: 'cancelled'` would be classified as a cancelled compaction; a `ManualCompactionError` renamed in the compaction package would stop being classified and would fall into the `kept` outcome, which steers the plan and logs a warning.

`rescope-vendor` reports residue for a tree with unstaged deletions instead of aborting, so a deletion no longer masks every other residue finding in the same run.

Coverage is unchanged. Each retired companion's only spec was deleted with it, and no remaining test or source file imports a retired subpath.

## Verification

`pnpm run hygiene` reports 16 passed, 0 failed. `pnpm run typecheck`, `pnpm run lint` (0 warnings, 0 errors), and `pnpm run test:docs` (16 passed) are green, and `verify-config-catalog`, `verify-cordis-catalog`, `verify-doc-graphs`, `verify-export-jsdoc`, `verify-scoped-events`, `verify-tsconfig-paths`, `verify-package-readme-limitations`, and `verify-translation-pairing` each pass. The 203 tests across the twelve spec files of `@deepseek-ai/dsh-client-ui-git-graph`, `@deepseek-ai/dsh-workspace-git`, and `@deepseek-ai/dsh-plan-handoff` pass.
