---
description: "One-world E2B composition fixture for a key-gated Loader smoke over FS, Bash, PTY, and LSP in one remote sandbox."
kind: "package-library"
---

# @deepseek-ai/dsh-e2b-composition

English | [中文](README.zh.md)

## Summary

`dsh-e2b-composition` is test-support infrastructure that owns the one-world E2B composition e2e. It has no product API: [`src/index.ts`](src/index.ts) is an empty module that exists so the fixture has its own workspace dependency edges, keeping `dsh-fs-e2b` and `dsh-subprocess-e2b` out of the shared `dsh-e2b` package manifest.

The tests boot [`tests/fixtures/composition/cordis.yml`](tests/fixtures/composition/cordis.yml) through `runLoaderSmoke` and verify that FS, Bash, PTY, and LSP share one remote sandbox. Every case is gated by `E2B_API_KEY`; without a key the suite self-skips.

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

This package is not imported by product code. Run it as the own package of the e2e fixture:

```text
pnpm exec vitest run packages/test-support/e2b-composition
```

Set `E2B_API_KEY` to exercise the real remote sandbox. Without the key Vitest reports the suite as skipped rather than failed.

<a id="understand-the-implementation"></a>
## Understand the implementation

The fixture's `cordis.yml` names every bare plugin it loads. Its `bin.ts` drives the one-world composition through the real Cordis Loader and prints a JSON report that the e2e asserts. The fixture's dedicated manifest lists those plugins as devDependencies so `verify-cordis-config` can prove every config row has an owning package and so the test package never adds edges to the production E2B graph.

<a id="further-exploration"></a>
## Further Exploration

- [E2B provider family map](../../e2b/README.md) — the package family this fixture exercises.
- [Loader smoke helper](../loader-smoke/README.md) — the subprocess harness the e2e uses.

<a id="model-experience"></a>
## Model Experience

None, as this is test infrastructure that registers no model context; the fixture exercises already-shipped plugins without adding model-visible behavior.

#### KV Cache effect

No direct invalidation: it contributes no request tokens and never mutates a request prefix, so provider cache reuse is unaffected.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Requires a live E2B key** — the package deliberately has no keyless substitute for the live remote-world assertions.
- **Fixture-only surface** — `src/index.ts` is a marker; the package publishes no product API.
- **No invariant companion** — No runtime invariant companion is published; the fixture boots shipped plugins and owns no independent production event stream or mutable data.
- **Platform-neutral runner contract** — the e2e runs on every CI lane but self-skips without `E2B_API_KEY`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This fixture exists because `dsh-e2b` must devDepend on both `dsh-fs-e2b` and `dsh-subprocess-e2b` for the one-world smoke, while those packages peer-depend on `dsh-e2b`. Owning the fixture in its own package is the smallest way to keep that test without a workspace cycle.

</details>
