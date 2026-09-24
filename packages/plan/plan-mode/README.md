---
description: "Plan mode with reviewed keep, compact, or fresh-session execution; for users and maintainers of the planning experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-plan-mode

English | [中文](README.zh.md)

## Summary


Plan mode asks an agent to explore and design before execution, then presents the finished plan for review. Enter with `/plan`, optionally with a message and ordered attachments; leave with `/plan off`, or choose whether an approved plan executes with current, compacted, or fresh context. Its guidance does not restrict tools, so configure sandbox mode and approval prompts for enforced limits.


-----

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Durable state](#durable-state)
- [Review and execution](#review-and-execution)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Configure `section`, enter with `/plan` or `/plan <message>`, and review the plan when the agent calls `exit_plan_mode`. Images and files attached to `/plan` keep their selection order. `/plan off` leaves directly; attachments on that command are rejected before the state changes. The exit tool requires Markdown beginning with a `#` heading. Every tool remains callable while planning.

<a id="durable-state"></a>
### Durable state

`plan/mode` (`{ active: boolean }`) is a log-only, whole-value-replace `SessionEventMap` member. `foldPlanMode(events)` returns the last logged value or `false`. `ctx.planMode.set` / `get` commit immediately when idle; an open turn stays pending until the next accepted in-turn pre-step.

An approved review also appends `plan/approved` `{ execution, title }`. A clear handoff appends `plan/handoff` `{ childSessionId, mode: 'clear' }` on the source session.

<a id="review-and-execution"></a>
### Review and execution

`exit_plan_mode` stays registered in both states. In plan mode it asks through `ctx.userQuestions` with four options:

- `Approve and execute` — conclude the current turn, then after the source agent is idle, create a sibling session (same cwd, model, and preset), attach it to the same workspace, title it `【执行计划】<planning session title>`, log `plan/handoff`, and steer the full plan into the child.
- `Approve and compact context` — conclude the current turn, then `compactNow` on this session, then steer the full plan. The Chat view shows `Compacting context…` from the standalone `compaction/start` until the checkpoint lands; only then does the plugin steer. Compaction is resolved through `AgentPresets.serviceFor(agent, 'compaction')` (the shipped isolated preset realm) or host `ctx.compaction`. Cancellation skips the steer. Failure or a missing engine falls back to keep.
- `Approve and keep context` — conclude the current turn, then steer the full plan into this session as the next turn.
- `Refine plan` — stay in plan mode; feedback returns as a failed call.

The review declares `provider`, `model`, `reasoningEffort`, and `agentPreset` settings. A capable UI collects them beside the decision; absent values retain the inherited selection. A reviewed route becomes the fresh session's agent options on the clear path; for keep and compact, the client commits the model selection to this session before answering. An agent preset applies only to the clear path; an unknown or broken one falls back to the planning session's composition with a warning.

Every approval concludes the current turn before the handoff runs, so the plugin's steer is the only input that starts execution and one approval runs the plan exactly once.

A TUI or other host without `ctx.agents.create` treats clear as compact-then-steer. A clear whose child was created but whose handoff then failed detaches and disposes that child rather than executing the plan in the source session.

`@deepseek-ai/dsh-client-ui-plan` selects the child when it sees a live `plan/handoff` on the session on screen, or when that child later appears in the session list; a user navigating away after the event does not cancel the pending selection, and historical replay does not switch.

<a id="configuration"></a>
### Configuration

```yaml
- id: plan-mode
  name: '@deepseek-ai/dsh-plan-mode'
  config:
    section: |
      You are in plan mode. Explore and write a decision-complete execution spec
      through exit_plan_mode.
```

`section` is required and non-empty. Unknown keys fail at load.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The last `plan/mode` event determines resumed plan state. The plan projection combines logged commands and state for the composer chip. The tool records `plan/approved` before scheduling the handoff; an idle agent then receives one plugin-sourced execution prompt. The fresh-session path records `plan/handoff` before steering the child, so the Web client can follow the live event. The submitted Markdown remains in the native tool call or PTC dispatch history for the plan card.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Plan subsystem](../../../docs/subsystems/plan.md) — state and review semantics.
- [Tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-plan-mode) — model-facing schema.

## Model Experience

### Plan policy system prompt

#### What the model sees

While plan mode is active, the model sees the deployment's exact `section` text as the `plan:policy` section at prompt order 500; inactive mode contributes no text.

##### Plan policy

```markdown
You are in plan mode. Explore and write a decision-complete execution spec
through exit_plan_mode.
```

#### Token effect

Inactive mode adds no tokens; active mode adds the configured section to every request.

#### KV Cache effect

The section is stable within plan mode, but entering or leaving changes the system prompt from order 500 onward.

### Human command

#### What the model sees

`/plan`, `/plan off`, and their terminal results stay outside model history. A trimmed suffix other than the exact `off` argument, or a bare `/plan` carrying admitted attachments, becomes one user message through `agent.steer()` after plan mode is selected: admitted image and file blocks in selection order, then the trimmed text block when the suffix is non-empty. `/plan off` with attachments fails before the mode changes, so the dispatching composer retains the originals.

#### Token effect

The steered message costs the same history tokens as submitting that content separately. Bare `/plan` without attachments and `/plan off` add none; bare `/plan` with attachments has the normal image and file-handle cost, and an active exit that the last request header already described adds the retained switch notice.

#### KV Cache effect

The user message is append-only conversation growth. Entering or leaving plan mode changes the earlier policy section; a notice is appended after the reusable request prefix.

### Exit tool and execution prompt

#### What the model sees

The [`exit_plan_mode` schema](../../../docs/tool-catalog.md#deepseek-aidsh-plan-mode) stays available in both states. Approval returns `{ approved: true, execution }` and a mode-specific confirmation. After idle, a plugin-sourced user message carries the approved plan and tells the model to execute it.

#### Token effect

The stable schema is paid according to ToolRuntime mode. Keep adds one execution prompt. Compact replaces earlier surface nodes with a summary, then adds the full plan. Clear starts a new session whose first model-visible input is that prompt.

#### KV Cache effect

Mode transitions do not change the tool catalog. Compact replaces a surface prefix. Clear is a new session prefix.

## Known Limitations and Deferred Work

- **Clear needs a session factory** — without `ctx.agents` the path falls back to compact-then-steer, which is the TUI/headless case.
- **Execution session title needs `ctx.sessionTitle`** — without that service the child keeps its default derived title; the handoff still steers the plan.
- **Compact needs a reachable engine** — without `AgentPresets.serviceFor(agent, 'compaction')` or host `ctx.compaction` the path keeps context.
- **No plan files** — the approved markdown lives on the tool argument and is copied into the execution prompt; there is no `local://` artifact.
- **Soft guidance only** — a model that ignores the section can still mutate; configure sandbox and approval independently.
- A selection made after the turn's final accepted pre-step is lost if the process exits before another accepted in-turn pre-step.
- Compaction uses the generic summarizer; the steered plan is the authoritative source after compact.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
