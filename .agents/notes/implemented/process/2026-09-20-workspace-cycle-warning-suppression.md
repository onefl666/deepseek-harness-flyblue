# Agent Note: Suppressing the workspace cycle warning with a release-family guard

Status: implemented

English | [中文](2026-09-20-workspace-cycle-warning-suppression.zh.md)

## Problem

`pnpm install` printed `[WARN] There are cyclic workspace dependencies` across eight groups. Every cycle used development or peer edges: package test harnesses drive each other, client packages share a browser test runtime, and vendored Cordis packages preserve upstream peer ranges. The install graph itself was acyclic when restricted to `dependencies` plus `optionalDependencies`, and the release-family builder already asserts that property.

## Decision

`pnpm-workspace.yaml` sets `ignoreWorkspaceCycles: true`. The setting stops pnpm's whole-graph advisory while the release-family assertion remains the guard that an install edge is cyclic: `scripts/release/families.ts` still throws `dependency cycle in release family` when a released dependency closure loops.

Several real development edges were also removed rather than hidden.

- `packages/client/ui-conversation` and `packages/client/ui-sidebar` no longer declare `@deepseek-ai/dsh-client-ui-workspace` in `dsh.client.inject` or devDependencies; neither package imports it.
- `packages/client/file-upload` no longer injects or devDepends `@deepseek-ai/dsh-api-remotes`; only the inject declaration had created that edge.
- `packages/client/connection` no longer devDepends `@deepseek-ai/dsh-api-session-controller`; its fixture spec now declares the small structural `ModelCatalog`, `ModelSelection`, and `SessionAssistantStreamFrame` shapes locally.
- The Windows ACL provider-chain spec moved into `dsh-sandbox-local`, which already has the production dependency on `dsh-sandbox-windows-acl`; the reverse development edge was deleted.
- The spawn-backend e2e and its harness moved into `dsh-tool-subagent`, which already devDepends `dsh-subagent-spawn-in-process`; the spawn package no longer devDepends the tool.
- The one-world E2B composition e2e and fixtures moved to the new `packages/test-support/e2b-composition` package, whose devDependencies cover the fixture's bare plugins. `dsh-e2b` no longer devDepends `dsh-fs-e2b` or `dsh-subprocess-e2b`, so those peer edges no longer point back into `dsh-e2b`.

After those removals the remaining non-trivial SCCs are the large client/browser-test-runtime component and the agent-loop/DeepSeek-provider component. Breaking the first would require redesigning the client test runtime API across dozens of packages; breaking the second would move real DeepSeek composition specs out of their owning package. The vendored `cordis` / `include` / `loader` peer ring is upstream metadata preserved by the vendoring policy.

## Alternatives considered

**Fake dependency manifests or `pnpm.overrides` to make the graph look acyclic.** Rejected: the warning would be hidden while the development architecture remained unchanged, and the overrides would alter package resolution.

**Breaking every remaining SCC.** Rejected: the known cuts cost more than the warning they remove. The client runtime deliberately boots the web roster and is devDepended by the packages it tests; moving that boundary is a test-architecture project, not an install cleanup.

**Turning off peer auto-install globally.** Rejected for the same reason as the dependency-warning cleanup: it would change installs for hundreds of packages to address a handful of development edges.

**Leaving `ignoreWorkspaceCycles` false and accepting the warning.** Rejected once the real removable edges were gone: pnpm's remaining report is whole-graph advice, and the release-family assertion is the behavior that must never fail.

## Consequences

`pnpm install` is quiet on both deprecated-subdependency and workspace-cycle warnings. The real development edges that were zero-coverage are gone, and the surviving cycles are documented. The trade-off is that pnpm no longer prints a generic warning when a future development or peer edge creates a new cycle; `scripts/release/families.ts` still rejects cycles that reach the released install graph, and a future check-all gate can add a minimum-cycle assertion if needed.

## Verification

- `pnpm install` prints neither `cyclic workspace dependencies` nor `deprecated subdependencies found`.
- A one-off Tarjan pass over workspace manifests reports only the large client and agent-loop SCCs after the directed edge removals.
- `pnpm run verify-package-dependencies`, `pnpm run test:gui`, and the targeted client/connection, sandbox, subagent, and E2B suites pass.
- `pnpm run verify-cordis-config`, `pnpm run verify-tsconfig-paths`, and `pnpm run verify-doc-graphs` pass after regenerating their outputs.
