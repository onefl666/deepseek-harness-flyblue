# Agent Note: Usage statistics skip unreadable sessions and report them

Status: implemented

English | [中文](2026-08-21-usage-stats-skips-unreadable-sessions.zh.md)

## Problem

`usageStats.stats()` folded every local session log inside one request, so one log it could not interpret rejected the whole scan. The practical trigger is a session written by a newer harness whose event vocabulary this build does not know (`vision/describe`): the read-side refusal is the sanctioned behavior owned by the [session-log version mechanism](../architecture/2026-08-10-session-log-version-mechanism.md), but the dashboard treated it as total failure. The user saw `无法更新统计: session "…" contains event type "vision/describe" …` and none of the healthy sessions' accounting, until the foreign log disappeared.

## Decision

Per-session interpretation failures are skips, not request failures. `UsageStatsService.stats()` catches a live fold or a cold inspect failure per session, records `{ id, error }` in the new `UsageStatsSkippedSession` list, and continues; the snapshot's new `skippedSessions` field carries the list (ordered by id) and every other count omits those sessions. A failed cold read is cached by persistence revision so the same unreadable log is not re-inspected on every refresh; a changed revision is inspected again. A failed live fold drops the cached projection so the next scan rebuilds from sequence zero. Listing failures (`sessions.list()` / `listSnapshots()`) still reject the whole request, keeping the existing error banner and Retry path. `buildUsageSnapshot` stays a pure fold; `stats()` appends the skip list at the return boundary.

The dashboard pops a transient Toast — zh `已跳过 {count} 个无法统计的会话`, en `{count} sessions could not be counted and were skipped` — and renders a persistent in-panel notice listing each session id with its failure, including the raw log path from the refusal message. The notice clears when a later load skips nothing. Counts render as usual, zeroed when every session failed. The Host stays silent (no console noise): the notice carries the information.

## Alternatives considered

**Keep rejecting the whole request** — rejected because one foreign log permanently bricks the dashboard for users whose session home mixes harness versions, and the surviving sessions' accounting is still exact without the unreadable one.

**Fail only when every session fails** — rejected because the partial result is already actionable, and an all-failed special case would hide that nothing was counted.

**Deliver failures over a session-feed push channel instead of the snapshot field** — rejected because the dashboard is a request/response consumer; a side channel adds lifetime and reconnect coupling for data the next refresh replaces anyway.

**Skip unreadable sessions silently** — rejected because silently dropping sessions misstates totals, and the refusal message is the only clue which log was written by a newer harness.

## Consequences

The dashboard survives logs written by newer harnesses: every other session still counts, and the notice names the offending log and reason. The wire result schema gained one required field, so Host and Web artifacts must be rebuilt together (the pre-release stance accepts that). Skip caching keys on revision: a transient read error stays pinned until the log is rewritten, because a revision change is the durable signal that content changed. The dashboard feature note [owns the dashboard decision](../feature/2026-08-18-local-usage-history-dashboard.md); the version-mechanism note [owns the refusal itself](../architecture/2026-08-10-session-log-version-mechanism.md).
