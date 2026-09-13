# Agent Note: Plan-mode guidance directs intent analysis, parallel subagent exploration, and early clarification

Status: implemented

English | [中文](2026-09-13-plan-mode-exploration-subagent-guidance.zh.md)

## Problem

The shipped `plan:policy` sections (three `agent-presets` copies plus the base bundle patch) told the model to "explore first" and to reserve `ask_user_question` for user-owned choices, but said nothing about how to explore a large workspace: the guidance never mentioned delegation, so a planning agent read files serially in its own context even when the question fanned out across subsystems, spending main-context budget on survey reading a fresh-context subagent could have done. The asking rule also leaned one way — do not ask what you can find out — without directing the model to surface intent ambiguity early, when the answer changes what deserves exploring at all.

## Decision

- The four shipped copies of the plan guidance (`presets/standard`, `presets/cordis`, `presets/ptc` `agent.cordis.yml`, and `packages/bundle/base/cordis.patch.yml`) are edited in lockstep; the bundle's pre-existing fourth-paragraph wording drift ("only to keep the request shape stable") is preserved on purpose.
- The second paragraph now opens with intent analysis — restate the goal, separate what the user asked from what the model merely assumes — and states the working order explicitly: explore, then plan; code only after approval.
- A new third paragraph directs subagent decomposition: split a request that spans several subsystems (or lands in an unfamiliar workspace) into independent, self-contained subtasks; dispatch several `subagent` calls in one response so they explore in parallel; read directly only what sits at the center of the change and delegate the surrounding exploration; give each child a complete standalone prompt. The paragraph states the load-bearing fact that subagents do not inherit plan mode, so the no-mutation rule reaches them only through the prompt the parent writes.
- The asking paragraph now directs asking early — as soon as an ambiguity changes what to explore or plan, not after the exploration is done — while keeping inspection-first for code facts.
- The decision-complete paragraph adds citing the file paths exploration found, so delegated findings land in the plan instead of dying in child transcripts.
- The guidance lives in the deployment `section`, not in `tool-subagent`'s own prompt section: the subagent tool's section (order 2800) already teaches the mechanics (background default, batching independent delegations in one message) and applies in every mode; the plan section adds the when-and-what that is specific to planning. All four compositions carrying this section mount `subagent`/`subagent_fork`, so naming the tool is grounded everywhere the text ships.

## Alternatives considered

- **Teach exploration fan-out in `tool-subagent`'s order-2800 section instead** — wrong scope: that section is mode-neutral and already carries the batching mechanics; plan-specific direction (explore before planning, delegate the surroundings, keep the center) would bloat every non-planning request with plan-only advice. Rejected.
- **A dedicated `plan:exploration` prompt section in the plugin** — new machinery for text that is deployment-owned by design (`PlanModeConfig.section` is the one home for plan guidance). Rejected.
- **Mode-neutral wording that never names the `subagent` tool** — the section ships only in the four compositions above, all of which mount the tool, and the existing section already names `exit_plan_mode`, `todo_write`, and `ask_user_question` by name; vague wording would weaken resolvability for no portability gain. Rejected.

## Consequences

- The pin for this model-visible text now exists where keyless replay reaches it: `snapshots/web/plan-review` gains `plan-policy.expected.md`, extracted from the rendered `system/message` by the section's own first and last sentences and compared with `compareOrRefreshGolden`. The headless corpus cannot own this pin: its scenarios pass the task as argv, `/plan` command dispatch happens in the client composer, and no headless scenario carries plan mode. That gap is why the web scenario holds the golden.
- `plan-handoff` unit tests are unaffected (they use a placeholder `section`), and no README or docs page quotes the shipped text, so no documentation changes ride along.
- The guidance is soft: sandbox and approval policy remain the enforcement authorities for mutation, and the child-side restriction travels in the delegation prompt by design — plan state is per-session, and children are separate sessions.
- Every future edit to the shipped section must re-run `DSH_SNAPSHOT=refresh` on the plan-review scenario and review the golden diff; the scenario's closed fixture inventory enforces the golden's presence.
