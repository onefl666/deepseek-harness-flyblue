# Agent Note: Clearing deprecated subdependency warnings

Status: implemented

English | [中文](2026-09-20-deprecated-subdependencies-cleanup.zh.md)

## Problem

`pnpm install` reported `[WARN] N deprecated subdependencies found`, naming twelve deprecated package versions. Most came from maintained upstreams that still request old ranges: the desktop Electron packaging chain, the keyless E2B/MCP test fixtures, and two root development tools. The warning was accurate but had no safe cross-major upgrade path, and leaving it unexplained made every install look unhealthy.

## Decision

Directly controlled dependencies moved off the deprecated closures, and the remaining upstream-owned versions are recorded in the workspace settings as an explicit, documented allowlist.

### Eliminated versions

- `packages/e2b/e2b` uses `e2b` 2.49.1 instead of 2.29.1, moving from `glob@11` to `glob@13`.
- `packages/mcp/mcp-client` uses `@modelcontextprotocol/server-filesystem` `^2026.8.31`, moving from `glob@10` to `glob@13`.
- `apps/web` dropped `http-server`; `serve:preview` now runs `vite preview --host 0.0.0.0 --port 4173` through the Vite dependency the package already owns, removing `html-encoding-sniffer@3` and `whatwg-encoding@2`.

`packages/mcp/mcp-client/package.json` also publishes `lib/types/**/*.js`; its `./types` export resolves an emitted runtime file, so the manifest now matches the workspace publication invariant and publishes the file it exports.

### Remaining allowlist

`pnpm-workspace.yaml` lists the remaining upstream-owned versions under `allowedDeprecatedVersions`, one comment per entry naming the still-maintained upstream that pulls it and the condition for deleting the entry: `boolean@3`, `glob@7`, `inflight@1`, `lodash.isequal@4`, `node-domexception@1`, `prebuild-install@7`, `rimraf@2`, and `tsconfck@3`.

The workspace deliberately does not add cross-major `pnpm.overrides` for these ranges. Overriding `glob@7` to `glob@13`, `@electron/asar@3` to `@electron/asar@4`, or `html-encoding-sniffer@3` to a newer major would bypass exact pins in the Electron packaging chain. It also leaves `autoInstallPeers` enabled: `electron-builder-squirrel-windows` is a required peer of `app-builder-lib`, so disabling peer auto-install would change hundreds of workspace installs to avoid one deprecated range.

Alpha lines were not adopted for this cleanup. `electron-updater` 7.0.0-alpha and `vite-tsconfig-paths` 7.0.0-alpha were the only lines that would change `lodash.isequal` and `tsconfck`, respectively; both would replace a maintained stable dependency with an alpha release for a warning-only benefit.

### PLUGIN_TIMINGS

Rolldown's `PLUGIN_TIMINGS` is a performance diagnostic, emitted when a plugin exceeds its build-time threshold; it is not a correctness warning. The repository's `tsdown.config.ts` is unchanged, and the existing output remains. Its main contributors are workspace-wide Typert generation (`dsh-typert-generator`) and dependency resolution (`tsdown:deps`), which are inherent to this build.

## Alternatives considered

**Cross-major workspace overrides.** Rejected: it would silence the warning by crossing exact packaging-chain pins, moving risk into `electron-builder` and the desktop artifact without a matching upstream release.

**Disabling `autoInstallPeers`.** Rejected: the deprecated `electron-builder-squirrel-windows` closure appears because the Electron packaging stack declares it as a required peer; a global switch would change peer installation for the whole workspace.

**Upgrading `electron-builder`, `@yao-pkg/pkg`, or `vite-tsconfig-paths` now.** Rejected: the latest stable releases still carry the same ranges, and the only changed lines are alpha.

**Leaving the warning unaddressed.** Rejected: it is noisy on every install, and the allowlist records exactly which upstream owns each remaining version and when it can be removed.

## Consequences

`pnpm install` no longer prints the deprecated-subdependency summary. The remaining eight ranges are visible debt with named owners and removal conditions instead of an unexplained warning. The desktop packaging and root development-tool closures keep their reviewed pins, and the E2B and MCP fixture upgrades preserve their package tests and host typecheck.

## Verification

- `pnpm install` installs without the deprecated-subdependency summary.
- `pnpm why glob@7.2.0 glob@7.2.3 glob@10.5.0 glob@11.1.0 whatwg-encoding inflight` shows only the allowlisted `glob@7` and `inflight`.
- `pnpm run typecheck` and `pnpm exec vitest run packages/e2b packages/mcp/mcp-client` pass.
- `pnpm run verify-package-dependencies` and `pnpm run verify-vendored-links` pass. The full `hygiene` aggregate is currently blocked by unrelated pre-existing README/package-invariant failures in the dirty worktree.
