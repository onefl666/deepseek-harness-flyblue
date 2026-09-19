# Agent Note: One plan approval, one execution

Status: implemented

English | [中文](2026-09-19-plan-approval-single-execution.zh.md)

## Problem

`exit_plan_mode` had two owners of "start executing now". The keep-mode tool result told the model `carry out the plan starting with your next step`, and the plugin also steered its own approved-plan message once the source agent went idle. Only compact and clear called `exec.concludeTurn()`, so a keep approval continued the same turn: one recorded session showed the model running 74 edits and 77 shell calls in the approval turn, and then running the plan a second time from the steer after that turn finally ended. The duplicate was structural, not a race — the tool-result copy and the steer both described the same work, and nothing in the plugin owned which one executed.

Two smaller defects sat on the same path. `clearThenExecute` created the sibling execution session and then discarded the plan heading with `void title`, so the child carried no `session/title` at all; the first prompt-provider call also refuses a session with a `parentSession`, so the Web client's `displayTitleOf` fell through to `workspaceTitleOf(cwd)` and every execution session appeared in the sidebar under the workspace directory name. And the whole create-attach-title-steer sequence ran inside one `try` whose `catch` fell back to `compactThenExecute` on the source session: a failure after `agents.create` resolved therefore left an orphan child behind *and* ran the plan in the source session, which is the same double execution in a rarer shape.

Replacing `@deepseek-ai/dsh-plan-mode` with `@deepseek-ai/dsh-plan-handoff` had also changed user-visible copy without re-recording fixtures: 39 pinned snapshot files (4 Web, 26 session, 9 SDK) still described the retired plugin, so `pnpm run test:snapshot` and the Web e2e lane were red for a reason unrelated to any code defect.

## Decision

Every approval concludes the turn it was reviewed in. `exec.concludeTurn()` runs unconditionally after the review is accepted, and the plugin's steer is the only input that starts execution — one approval runs the plan exactly once, on every execution mode. `approvedResultText('keep')` states the fact (`plan mode exited; this session keeps the planning history and runs the approved plan as the next turn`) and carries no instruction to act, because the model-facing instruction lives in the steered `approvedPlanPrompt` alone.

A clear handoff names the child session `【执行计划】<planning session title>` through `ctx.sessionTitle.rename`, exported as `EXECUTION_SESSION_TITLE_PREFIX`. The base title is the source session's folded `session/title`, falling back to the approved plan's first heading; a base that already carries the prefix is used unchanged, so a plan reviewed inside an execution session cannot stack two prefixes. The rename is its own `try`/`catch` that logs and continues: a host without `ctx.sessionTitle`, or one whose rename is rejected, still gets the steered plan.

`clearThenExecute` splits its two failure domains. A rejected `agents.create` never produced a child, so it falls back to `compactThenExecute` on the source session. A failure *after* the child exists — workspace attach, title, `plan/handoff`, steer — detaches and disposes that child and rethrows; the caller logs it and no session runs the plan a second time. `attachSession` completing is what arms the detach.

The pinned fixtures were re-recorded from the current compositions (`DSH_SNAPSHOT=refresh pnpm run test:web`, then `pnpm run test:snapshot`) and the refresh diff was reviewed before it was kept: only `exit_plan_mode`'s description and the `plan:policy` section text may move when a plan plugin is replaced, and any other changed line is a regression wearing a refresh.

## Alternatives considered

**Suppress the duplicate inside `agent-loop`.** The loop cannot see which of two plugin-shaped inputs is authoritative, and repo policy keeps new behavior on documented extension points. The plugin that owns the approval owns the turn boundary.

**Keep in-turn execution for keep and skip the steer.** The model's continuation is not guaranteed to be the plan — a turn can end on a length stop, a tool error, or a user interrupt, and the plan then never runs. Steer-only has one path for all three modes.

**Title the child from the plan's first heading only.** The heading names the subject; the planning session's title is what the user already recognizes in the session list, and the heading remains the fallback for a session that was never titled.

**Let a post-create failure fall back to the source session.** That is the defect, not the recovery: the source session would execute the plan while the child it already created may also have been steered. Disposing the child and reporting the failure keeps the invariant that one approval runs the plan at most once.

**Give the child a fresh derived title rather than a host prefix.** Leaving the title unset is what produced workspace-name titles. A provider-generated title is a second model call racing the first execution turn for the session's cursor.

## Consequences

Keep approvals now end the planning turn, which is a visible behavior change: the approval message returns, the turn settles, and the execution turn starts after the plugin's steer rather than inside the reviewed turn.

`【执行计划】` is host copy of the same class as the `APPROVE_*` labels — a package constant, not a `Config` field. Its position is fixed at the front of the title, so a title truncated to `maxTitleBytes` keeps the marker.

A host that composes no `ctx.sessionTitle` gets an untitled execution session, exactly as before; this is recorded in the package README's Known Limitations. A `clear` failure after creation is now a rejected handoff instead of a degraded one, so the approved plan does not run until the user retries.

Cross-linked from [plan handoff after review](../feature/2026-08-19-plan-handoff.md), which still owns the review-and-execution decision and now states the unconditional turn end and the child title.

## Testing

[integration.spec.ts](../../../../packages/plan/plan-handoff/tests/integration.spec.ts) drives the real agent loop with a scripted adapter and the real `UserQuestionService`: a keep approval through `APPROVE_KEEP` produces exactly two model requests (planning, execution), exactly one `plan-handoff`-sourced `user/message`, and that message's seq after the first `turn/end`; reverting `concludeTurn` to the compact/clear-only condition makes the same test observe three requests.

[handoff.spec.ts](../../../../packages/plan/plan-handoff/tests/handoff.spec.ts) pins the title composition (source title, heading fallback, already-prefixed base), the missing-service and rejected-rename paths, and the rollback: a child whose steer fails is detached and disposed, the source session is never steered, and the call rejects. A rejected `agents.create` still steers the source session.

[plan-review.e2e.ts](../../../../apps/web/tests/plan-review.e2e.ts) clicks `Keep context` on the real card and asserts two `turn/start` events and one `plan-handoff` message in the replayed session.

The pinned fixtures are the third leg: `DSH_SNAPSHOT=refresh` followed by two consecutive `DSH_SNAPSHOT=replay` runs, for both the Web lane and the session snapshot lane.
