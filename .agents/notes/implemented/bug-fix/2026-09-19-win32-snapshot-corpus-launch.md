# Agent Note: Recorded-session corpora on the win32 stack

Status: implemented

English | [中文](2026-09-19-win32-snapshot-corpus-launch.zh.md)

## Problem

`pnpm run test:snapshot` is the keyless replay lane CI runs in `lib` mode on a built tree (`ciConsumerGates` composes `snapshotGate(validatedBuild)`, whose script sets `DSH_EXAMPLE_MODE=lib`). On this distribution's win32 default composition that lane was red in two corpora: all 18 `snapshots/sdk` cases and 75 of 97 `snapshots/session` cases.

Every SDK case failed before its first assertion as the SDK client's `JsonRpcResponseError: cannot create effect on inactive context`. That message names neither the defect nor the plugin: `HarnessSdkJsonRpcServer.handleRequest` serves `initialize`, `initialize` mounts `LlmDeepSeek` when no adapter is registered, and the mount asserts on a context whose plugin tree never finished loading. The loader's own report is on the child's stderr, which the client retains but reports only for a timeout or an exit.

Three launch defects hid behind that one message.

`hydrateReplayFixtures` substituted the scenario cwd into its JSONL fixtures verbatim. The substitution is inside a JSON string, so a POSIX path is valid JSON and a win32 spelling is not: `C:\Users\...` injects `\U`, `\A`, `\L` and the replay provider rejects line 1 with `SyntaxError: Bad escaped character in JSON`, failing the `llm-replay` entry before the tree finishes. Every case in the corpus was affected and the failure was deterministic.

`@deepseek-ai/dsh-llm-replay` is declared only as a devDependency of `apps/cli`, and `healProfilesModuleFallback` links `dependencies` and `peerDependencies` alone. A `src` launch hides that gap because tsx resolves workspace packages through the `paths` map; the `lib` launch reaches plugins through `$DSH_HOME/profiles/node_modules` and cannot import the provider at all. `materializeProfilePatch` already links a patch's bare packages into the launch profile, but only through the patch's own module-resolution paths, which do not contain a dev-only workspace package.

`snapshots/sdk/persistent-tools/cordis.yml` inserts `bash-local` while this distribution's win32 base mounts `gitbash-local`, whose executor extends `LocalBashExecutor`. Both construct the `shell` service, so the tree fails with `service "shell" has been registered at <LocalBashExecutor>`. The scenario's own disable list already stands down the profile rows it replaces (`bash-sandbox`, `pwsh-sandbox`, `permission`); the distribution's row postdates it.

## Decision

Fixture hydration writes the injected path in its JSON spelling (`JSON.stringify(cwd).slice(1, -1)`), which is the identity for a POSIX path and doubles the separators a JSON string needs on win32. The raw spelling stays where `{{cwd}}` is inserted into an already-parsed value rather than into JSON text (`materializeInput`).

`materializeProfilePatch` accepts resolution anchors and `snapshots/sdk/sdk.snapshot.ts` passes the application manifest it launches (`apps/cli/package.json`). A bare package the patch names is looked up through the patch first and the anchors second, then linked into the launch profile exactly as before, so a `lib`-mode launch resolves a corpus provider declared only as an application devDependency.

The scenario stands down the distribution's executor row: `snapshots/sdk/persistent-tools/cordis.yml` disables `gitbash-local` beside the other rows it replaces, because the `bash-local` it inserts owns the service.

The shared headless composition (`snapshots/session/text-turn/cordis.yml`) narrows the win32 preset table to the one preset its pinned sandbox/approval pair selects. That row is inert on every other platform, where it is `disabled` by the base composition.

## Alternatives considered

**Report the child's stderr on every JSON-RPC error.** The client is a product surface for SDK consumers; a plugin-tree failure is a runtime fault the caller sees as a failed handshake, and the retained tail exists for transport death. The harness-side fixes above remove the need: with the tree loading, `initialize` succeeds and no such error is raised.

**Make the SDK snapshot lane launch from source, as the headless lane does.** It would sidestep both the fallback and the resolution gap, but it also stops exercising the `lib` launch the same gate uses everywhere else, and the client legitimately prefers built output when it exists.

**Promote `@deepseek-ai/dsh-llm-replay` to an application dependency.** No shipped composition mounts it; it exists for this corpus alone, and a product install should not carry a test provider to make one test lane resolve.

**Escape `{{cwd}}` at tokenize time instead.** The committed fixtures are normalization fixed points shared with the POSIX lanes, and the token is not what is invalid — the substituted value is.

## Consequences

The SDK corpus now boots on win32: `initialize` returns `serverInfo`, and the 18 cases fail only where their recorded composition diverges from this distribution's win32 stack.

That divergence is not closed and is the honest boundary of this change. 67 headless cases pin a `bash` tool schema carrying `sandbox_permissions` and `justification`, which the tool advertises only when the mounted executor confines; the win32 default is the deliberately unconfined Git Bash executor. The 18 SDK cases pin a `workspace-write` sandbox mode and preset, which `permission-presets` refuses to mount on an executor that cannot enforce it — the reason the distribution ships `permission-unconfined` at all. Neither can be pinned by configuration, because both follow from the executor's confinement capability.

Reproducing the committed fixtures on win32 therefore requires recordings made on win32, which would diverge from the POSIX recordings the Linux lanes compare. Whether this distribution skips the recorded corpora on win32 or keeps them red is open; until it is decided, the lane's win32 failures are platform divergence, not a regression.

## Testing

`DSH_EXAMPLE_MODE=lib pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts` went from 18 boot failures to 18 composition mismatches, each reporting a session-log or request-header difference rather than `cannot create effect on inactive context`. Booting the scenario child directly (`--profile sdk` with the materialized patches and an `initialize` frame on stdin) returns `serverInfo` where it previously returned the error and a `llm-replay` import failure on stderr.

`snapshots/session/headless.snapshot.ts` went from 75 to 73 failures with the narrowed win32 preset table, and 15 cases pass. The remaining 67 share one signature, the missing escalation schema.

`pnpm run verify-cordis-config` passes over all 145 config files, and `pnpm run typecheck` passes.
