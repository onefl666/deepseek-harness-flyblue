# Agent Note: Plan-review execution settings

Status: implemented

English | [中文](2026-09-20-plan-review-execution-settings.zh.md)

## Problem

An approved plan executed on whatever route the planning session happened to hold. A reviewer who wanted the work done by another model, at another thinking intensity, or under another agent preset had to leave plan mode, change the session, and plan again — and the preset could not be changed at all, because a session's composition is fixed from the moment its conversation starts.

## Decision

The `plan-review` intent now declares `settings: string[]` — the names the review collects beside the decision — and `AskUserQuestionAnswerItem.settings` carries the values back. `PLAN_REVIEW_SETTINGS` names four: `provider`, `model`, `reasoningEffort`, and `agentPreset`. Every one is optional, and an answer carrying none leaves the execution on what it would have inherited anyway, so an untouched card is the behavior that shipped before it.

**The route goes through the session's own model RPC; the preset goes through the answer.** The card stages both and commits them by different roads, because the two execution sessions are different sessions:

- Model and thinking intensity. The composer entry's inject face exposes `commitModel`, which calls `session.selectModel` — the same call the composer's model seat makes — and the card makes it before it answers, so a route that cannot be installed never leaves a plan approved to run on the old one. `keep` and `compact` execute in this session, so that call is the whole change. `clear` executes in a session that does not exist yet, so the same values ride the answer and become the child's `agentOptions`.
- Agent preset. Only a session created from scratch can adopt a composition, and only the Host creates that session, so the id rides the answer into `clearThenExecute`'s `meta.agentPreset` and its creation-time mount. A review outlives the roster it read: an unknown or broken preset falls back to the planning session's own composition with a warning, because refusing the handoff would strand an approval the user already gave.

Presentation is composed, not coupled. `question.planReview.model` and `question.planReview.agentPreset` are declared children of the question composer entry; `ui-model-selection` and `ui-agent-preset` each register a controlled occupant over the directory and roster they already own. The cross-package edges are type-only. The card renders the preset seat only in its fresh-session step, because only that path can use one. `ModelSelect` splits into `ModelMenu` — presentational, taking the store and an apply verb — plus two hosts, so the composer seat and the review card share one control rather than two menus that drift.

## Alternatives considered

**Have the plan plugin read the durable selection.** The obvious source is the `modelSelection` projection, but its state type is merged by `@deepseek-ai/dsh-api-session-controller/types`, so reading it would put a dependency from a plan plugin onto the BFF assembly. Carrying the committed route in the answer keeps the edge pointing the way it already does.

**Apply the preset after the child exists.** Rejected: `AgentPresets.select` refuses a session whose conversation has started, and the handoff steers the child as soon as it creates it.

**Let the Host apply the route for every path.** Rejected: for keep and compact the session is already reachable only through the session controller's own selection path, and a plugin-owned second path beside it would be two answers to one question.

**Expose the execution choice as a plan-handoff Remote instead of the answer.** Rejected: it makes the model domain aware of the review's lifecycle, and it would need the model seat to reach a service it has no other reason to know.

## Consequences

`AskUserQuestionAnswerItem` and the `plan-review` intent each gain one optional field; the generic question flow, `ask_user_question`, and every intent that declares nothing are unaffected. `ui-user-questions` now requires `remote.session`. Because `session.selectModel` also writes the deployment default, a reviewed route becomes the model later sessions start on — the behavior the composer's model seat already has. A `clear` child now starts on the planning session's committed route instead of its creation-time options, which is what its title and its inherited composition already claimed.

## Testing

Package tests pin the intent's declared settings and that an answer's collected values reach the child's options and preset. `handoff.spec.ts` covers the route override, a half-answered route, a blank effort, a chosen preset, an unknown one falling back, a broken one falling back, and a deployment with no roster. `user-questions.spec.ts` rejects blank and repeated setting names and pins that an answer's settings survive the waterfall. `plan-review-panel.client.spec.tsx` covers the staged share, the commit before the answer, a refused commit leaving the review unsettled, the fresh-session step answering with the preset, stepping back out of it, and answering a continuing path immediately. The two seat specs cover staging without writing, and `model-select.client.spec.tsx` stays the regression judge for the menu extraction. `snapshots/web/plan-review` re-records the card's aria golden.
