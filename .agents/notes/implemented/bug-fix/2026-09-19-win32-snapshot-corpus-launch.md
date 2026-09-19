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

Four more defects surfaced once the SDK corpus reached its assertions and the headless lane was read case by case.

`snapshots/session/pwsh-tool-turn` selects the confined pwsh stack by mounting `pwsh-sandbox`, and the distribution's win32 base mounts its Git Bash executor unless the environment selects that stack, so the same two-provider collision failed the tree with `service "shell" has been registered at <GitBashExecutor>`.

`snapshots/session/subagent-acp-diagnostic` built its mock-server argument with `decodeURIComponent(new URL(relative, 'file://' + process.env.DSH_SNAPSHOT_FILE).pathname)`. A URL pathname spells a win32 path `/D:/...`, and Node resolves a leading slash against the current drive, so the child died with `Cannot find module 'C:\D:\deepseek-harness-flyblue\...'` — the same defect the LSP launcher carried before it moved to `fileURLToPath`.

`snapshots/session/read-image-attachment-path` pinned a `fromRequest` pattern whose separator before `red.png` is a `/`, which only a POSIX request text satisfies; the replay provider reported `matched nothing in the request` and the scenario exited non-zero.

`cwdSpellings` in the shared normalizer held literal cwd spellings alone, so a cwd appearing inside an embedded JSON document — where every separator carries JSON's own escape — was never tokenized, and the generating machine's temporary path stayed in the compared request text.

## Decision

Fixture hydration writes the injected path in its JSON spelling (`JSON.stringify(cwd).slice(1, -1)`), which is the identity for a POSIX path and doubles the separators a JSON string needs on win32. The raw spelling stays where `{{cwd}}` is inserted into an already-parsed value rather than into JSON text (`materializeInput`).

`materializeProfilePatch` accepts resolution anchors and `snapshots/sdk/sdk.snapshot.ts` passes the application manifest it launches (`apps/cli/package.json`). A bare package the patch names is looked up through the patch first and the anchors second, then linked into the launch profile exactly as before, so a `lib`-mode launch resolves a corpus provider declared only as an application devDependency.

The scenario stands down the distribution's executor row: `snapshots/sdk/persistent-tools/cordis.yml` disables `gitbash-local` beside the other rows it replaces, because the `bash-local` it inserts owns the service. `snapshots/session/pwsh-tool-turn` does the same in both of its patches, because it mounts the confined pwsh executor and the distribution's Git Bash row is mounted by the base on every win32 launch that does not select the pwsh stack.

The mock-server argument is a file URL whose leading slash is removed when a drive letter follows it, and the base comes from the fixture path with a leading separator normalized, so one expression yields `D:/.../mock-acp-server.ts` on win32 and `/.../mock-acp-server.ts` on POSIX.

The replay pattern accepts either separator (`[\\/]`), which is the identity for the POSIX requests it already matched.

`cwdSpellings` also returns each spelling with its separators escaped, and the canonical path rewrite collapses a separator run that an escaped spelling leaves behind. Both are identities for a POSIX cwd, which has no separator to escape.

The shared headless composition (`snapshots/session/text-turn/cordis.yml`) narrows the win32 preset table to the one preset its pinned sandbox/approval pair selects. That row is inert on every other platform, where it is `disabled` by the base composition.

The corpora stand down on a host that cannot mount the confined composition: `recordedCorpusReplayable` is false on win32, each lane skips its scenarios on it, and `DSH_SNAPSHOT_ALLOW_UNSUPPORTED=1` runs them anyway. The ACP suite receives it as a caller-owned probe (`replayable`) beside `hasPwsh`, because that factory also registers the machinery its own unit spec drives in-process.

Three facts say the lane was never a Windows lane: the fork's Windows gates omit it (`ciWindowsObservationalGates` — "Linux owns required lint and snapshots; Windows omits those duplicates"), the upstream snapshot tier documents its required run on macOS and Linux, and `dsh-gitbash-sandbox` ships unmounted because no shipped win32 runner confines Git Bash. A win32 host running the corpus therefore reads platform divergence as failure, which is what the default now prevents.

## Alternatives considered

**Report the child's stderr on every JSON-RPC error.** The client is a product surface for SDK consumers; a plugin-tree failure is a runtime fault the caller sees as a failed handshake, and the retained tail exists for transport death. The harness-side fixes above remove the need: with the tree loading, `initialize` succeeds and no such error is raised.

**Make the SDK snapshot lane launch from source, as the headless lane does.** It would sidestep both the fallback and the resolution gap, but it also stops exercising the `lib` launch the same gate uses everywhere else, and the client legitimately prefers built output when it exists.

**Promote `@deepseek-ai/dsh-llm-replay` to an application dependency.** No shipped composition mounts it; it exists for this corpus alone, and a product install should not carry a test provider to make one test lane resolve.

**Escape `{{cwd}}` at tokenize time instead.** The committed fixtures are normalization fixed points shared with the POSIX lanes, and the token is not what is invalid — the substituted value is.

**Synthesize `SIGTERM` when the harness itself terminates a win32 command.** It would make the model-visible result match the POSIX marker, but the subprocess outcome reports the platform's own facts, and a fabricated signal would tell the model the process died from something that does not exist on that host. This note records the difference instead.

**Put the host predicate inside `defineAcpSnapshotSuite`.** Tried first, and it skipped the machinery that `suite.spec.ts` drives in process — 8 failures, because those specs assert the suite's own write-back against tests that then never ran. The probe belongs to the caller that knows its host, which is also how `hasPwsh` is threaded.

**Mark each diverging scenario `platform: posix`.** It is the per-scenario mechanism the lane already honors, but it means editing some seventy fixture manifests to record a host policy, and it would drop the scenarios that do pass on win32 — 15 headless and 9 ACP — whose failures are how the launch defects in this note were found. The corpus stands down as a unit instead, and the override keeps those runs available.

## Consequences

The SDK corpus now boots on win32: `initialize` returns `serverInfo`, and the 18 cases fail only where their recorded composition diverges from this distribution's win32 stack.

That divergence is not closed and is the honest boundary of this change. 67 headless cases pin a `bash` tool schema carrying `sandbox_permissions` and `justification`, which the tool advertises only when the mounted executor confines; the win32 default is the deliberately unconfined Git Bash executor. The 18 SDK cases pin a `workspace-write` sandbox mode and preset, which `permission-presets` refuses to mount on an executor that cannot enforce it — the reason the distribution ships `permission-unconfined` at all. Neither can be pinned by configuration, because both follow from the executor's confinement capability.

Two further differences run through the headless failures and are not defects of the launch path. A command the harness terminates reports `[killed by signal: SIGTERM]` on POSIX and the exit code Node observes on win32, where termination is `TerminateProcess` and carries no signal; the subprocess outcome contract reports what the platform gives it. And the fixtures still pin the retired `dsh-plan-mode` text for `exit_plan_mode`, while the composition mounts `dsh-plan-handoff`, whose description and `execution` parameter differ.

Reproducing the committed fixtures on win32 would require recordings made on win32, which would diverge from the POSIX recordings the Linux lanes compare. The corpora therefore stand down there by default: `pnpm run test:snapshot` on win32 keeps the corpus-integrity assertions and reports the scenarios as skipped, and `DSH_SNAPSHOT_ALLOW_UNSUPPORTED=1` runs them for anyone diagnosing the divergence this note records. POSIX and macOS hosts see `recordedCorpusReplayable` true and behave exactly as before.

## Testing

`DSH_EXAMPLE_MODE=lib pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts` went from 18 boot failures to 18 composition mismatches, each reporting a session-log or request-header difference rather than `cannot create effect on inactive context`. Booting the scenario child directly (`--profile sdk` with the materialized patches and an `initialize` frame on stdin) returns `serverInfo` where it previously returned the error and a `llm-replay` import failure on stderr.

`snapshots/session/headless.snapshot.ts` went from 75 to 73 failures with the narrowed win32 preset table, and 15 cases pass; the same counts hold after the normalizer change, so the escaped cwd spelling and the separator collapse alter no case that already passed.

The four later fixes were verified case by case: `pwsh-tool-turn`, `read-image-attachment-path`, and `subagent-acp-diagnostic` each stopped failing at launch or at the replay pattern and now fail on the composition differences above, and the tokenized path left the `ptc-workspace-context` request text.

`pnpm run test:snapshot` reports 23 passed and 110 skipped on win32, and `DSH_SNAPSHOT_ALLOW_UNSUPPORTED=1` runs the whole corpus again — 96 failures across the three lanes (73 headless, 18 SDK, 5 ACP), the divergence this note records and nothing else. `pnpm run test packages/test-support/session-snapshot` passes 343 tests with the probe in the suite options, which the factory-internal predicate would have broken.

`pnpm run verify-cordis-config` passes over all 145 config files, and `pnpm run typecheck` passes.
