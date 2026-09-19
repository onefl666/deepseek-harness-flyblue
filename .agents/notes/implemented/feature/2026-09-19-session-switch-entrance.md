# Agent Note: Interruptible entrance for the session switch

Status: implemented

English | [中文](2026-09-19-session-switch-entrance.zh.md)

## Problem

Selecting another Session in the Web GUI repainted the conversation column with no transition: the renderer remounts the column per selection, `ConversationRoot.module.css` declared no motion at all, so the switch read as a hard cut — most visibly when a live `plan/handoff` moves the page to the execution Session while the planning transcript is still on screen. Only the sidebar row of a newly mounted Session animated (`row-in`, 150ms), so the two halves of one switch moved differently.

## Decision

The conversation column owns one mount entrance: `.root` in `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css` runs `animation: conversation-enter 150ms var(--ds-ease-in-out)`, a keyframe fading `opacity` from 0, and `@media (prefers-reduced-motion: reduce)` sets `animation: none` for the same selector. Duration and curve deliberately match the sidebar row's `row-in` (`packages/client/ui-workspace/src/client/rows/Rows.module.css`), so one switch reads as one motion across both surfaces.

The column is remounted per selection (`SessionMaybeEntry`'s epoch key, plus strict session slots keyed by session id), so the entrance replays exactly when the Session changes, and a switch during the fade mounts a new column instead of retargeting the old one — no partially applied state survives and no script owns a clock. Nothing else moves: the `settling` composer hide stays a hard `visibility: hidden`, and the selected sidebar row keeps its untransitioned highlight.

## Alternatives considered

**View Transitions API.** Rejected: unused anywhere in `packages/client`, and a cross-fade needs the outgoing subtree kept alive through the transition, which the renderer unmounts before the new column exists.

**A `[data-ready]` two-phase CSS transition on a persistent element.** Rejected: the column does not persist across a switch, so the transition would need React state plus an animation frame to arm, making the column's visibility script-owned — a hidden tab or a missed frame would leave it at `opacity: 0`. The recorded interruptibility doctrine ([interruptible sliding thumb](2026-08-19-segmented-range-interruptible-thumb.md)) picks transitions for retargetable state motion on a persisting element; a mount entrance has no previous value to retarget.

**Animating the settling hide.** Rejected by [hero stays visible while a blank session opens](../../archived/bug-fix/2026-07-31-hero-visible-while-blank-session-opens.md): the fix there was to stop hiding content whose outcome is known, not to decorate the hide.

**Gating the plan-handoff follow until the execution Session runs.** Rejected: it would change the trigger the [plan handoff note](2026-08-19-plan-handoff.md) owns, and an execution turn that never starts would strand the navigation; the entrance already covers the blank-to-running frame change inside one fade.

## Consequences

Every Session switch — manual or followed — starts with a 150ms fade of the whole column (header, transcript, composer), and a reload fades the column in as it mounts. Reduced motion drops the fade without changing what renders. The motion is a fork-local addition to an upstream-owned package, so `packages/client/ui-conversation/tests/skeleton-styles.client.spec.ts` turns red when a re-import loses the declaration or its reduced-motion guard.

## Testing

The style spec pins the `.root` entrance on the shared curve, that every declared keyframe is referenced by an animation declaration, and that reduced motion drops it. `apps/web/tests/plan-handoff-follow.e2e.ts` drives the real host and browser: after a live `plan/handoff` the persisted selection cell names the execution Session, the planning transcript is gone, the column reports its fresh-session phase, its computed `animation-name` ends in `conversation-enter`, and emulating `prefers-reduced-motion: reduce` reports `none`.
