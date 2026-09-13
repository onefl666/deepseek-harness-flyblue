# Agent Note: SectionChrome owns the settings-section top matter

Status: implemented

English | [中文](2026-09-13-section-chrome-primitive.zh.md)

## Problem

`pnpm run duplication` failed with four tsx clones: `ui-ssh`, `ui-task-board`, and `ui-workspace-inspector` each carried a hand copy of the same settings-section top matter — the `<header>` with heading, one-line description, a meta row, and the ghost refresh button that swaps to a spinning glyph and the `refreshing` caption while busy — plus the `role="alert"` failure strip with its retry button. The CSS was copied with it: identical `.header`, `.title`, `.intro`, `.headerMeta`, and `.error` rules, and spin keyframes whose only per-package difference was the name chosen to avoid collisions. This is the copy-a-control failure the [shared client control primitives](../architecture/2026-09-05-shared-client-control-primitives.md) decision forbids: a plugin cannot import another plugin's component, so the copy was the cheapest move available to each author.

## Decision

The top matter is one primitive, `SectionChrome` in `dsh-client-ui-primitives`, not a `SectionHeader` + `SectionErrorBar` pair. Extracting the pair removes the markup clones but keeps the wiring cloned: every section passes the same `busy`, `onRefresh`, and `error` props and the same four-key labels object to the two atoms, and the identical call-site suffix still exceeded jscpd's 60-token minimum. Composition does not deduplicate when the composition itself is copied, so the frame is one component: `labels` carries refresh-control and failure-strip copy, `meta` takes the caller's counts, pills, and switchers as nodes, `refreshDisabled` carries caller-specific disable reasons (the inspector before a workspace registers), and retry reuses the refresh handler because all three sections already retried by refreshing.

Per-package stylesheets keep only what the page still owns: `.counts` and `.workspacePill` for meta content, and — in `ui-ssh` only — the `.spin` class its console run button still animates. The shared rules and the `prefers-reduced-motion` guard moved into `SectionChrome.module.css`; `ui-task-board` and `ui-workspace-inspector` dropped their spin keyframes entirely because the refresh glyph was their only animation user there besides the row and pulse animations that remain.

## Consequences

- Call sites order props labels-first, then title, intro, and meta, then state and callbacks. With `meta` differing per section, no identical run between call sites reaches the jscpd line and token minimums; a future shared prop that lengthens the run re-trips the gate, which is the gate working, not a formatting accident to hide.
- `ui-git-graph` and `ui-usage-stats` still render their own headers. They were outside the failing gate, and the git graph header differs in inputs (a workspace switcher, `panel.busy`, `panel.error`); both can adopt `SectionChrome` without prop changes when next touched.
- DOM, accessible names, and disabled logic are unchanged — the refresh control keeps the `refresh` aria-label while busy and computes `disabled` as `busy || refreshDisabled` — so the three sections' suites pass unmodified and no session snapshot updates.
- `atoms.client.spec.tsx` covers the frame: heading and meta placement, refresh activation, the busy caption with disabled control and spinning glyph, `refreshDisabled`, and the failure strip with retry. `section-chrome-styles.client.spec.ts` pins the reduced-motion guard, the error-tint tokens, and the no-literal-color rule the per-package style suites enforced for this markup.

## Alternatives considered

**A `SectionHeader` + `SectionErrorBar` pair.** Rejected as the primary design for the wiring-clone reason above; the failure strip is not independently consumable today, and a second consumer that needs it alone can split the pair then, accepting its own call-site duplication.

**Inline `jscpd:ignore-start` markers at the three call sites.** The config supports them, but the flagged text was an un-owned shared control, not irreducible parallel wording; hiding it leaves a fourth copy for the next section author.

**Passing the locale seat's `t` function into the primitive.** Rejected: atoms take complete localized label props and own no language fallback ([decision](../architecture/2026-08-23-locale-owned-client-ui-copy.md)); a `t`-typed parameter would couple the primitive to the slot locale vocabulary.
