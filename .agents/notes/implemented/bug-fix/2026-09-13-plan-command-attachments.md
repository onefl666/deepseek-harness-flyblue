# Agent Note: Plan command attachments

Status: implemented

English | [中文](2026-09-13-plan-command-attachments.zh.md)

## Problem

`@deepseek-ai/dsh-plan-handoff` replaces `@deepseek-ai/dsh-plan-mode` in shipped compositions, and its `/plan` registration declared `input: { hint: '[off|message]' }` without `attachments: true` while its handler read only `rawInput`. The Web composer and the host command executor both gate attachment admission on that declaration, so a `/plan` submission carrying an image or file was refused before the handler ran and plan mode never received the task material. The client fixture already advertised `attachments: true`, which is why the gap surfaced as a fixture-versus-host disagreement rather than a client error.

## Decision

`/plan` declares `input.attachments`, so the registry admits durably stored image and file blocks and passes them to the handler as `CommandInvocation.attachments` in submission order. The handler owns their grammar: the exact `off` argument with at least one attachment returns the error `Attachments cannot accompany /plan off.` before touching plan state, and every entering invocation with text, attachments, or both steers exactly one user message through `agent.steer()` whose blocks are the admitted attachments in submission order followed by the trimmed text block when the suffix is non-empty. A bare `/plan` with attachments therefore steers an attachment-only message, and a bare `/plan` with neither steers nothing.

## Alternatives considered

**Declare `attachments: true` without wiring the handler.** The refusal toast disappears but the admitted blocks are silently dropped, so the user believes the model received material it never saw.

**Carry attachments in a separate `agent.followup()` message, as `/goal` does.** That path produces two user messages and separates the task text from its images, so a model reading only the followup loses the instruction.

**Ignore attachments on `/plan off` instead of failing.** The user's composer submission then reads as accepted while the attachments are discarded, and the client keeps no draft to retry from.

## Consequences

Attachment admission follows the shared command path; no client change was needed because the generic claim, serialization, and release logic already handled it once the definition declared the capability. The dispatching composer keeps the draft and attachment cards when the handler returns an error, which is what makes the `/plan off` refusal recoverable.

## Testing

[plan-mode.spec.ts](../../../../packages/plan/plan-handoff/tests/plan-mode.spec.ts) drives the real `CommandRuntime` with a fake attachment store: `/plan sketch the layout` with an image and a file steers one `[image, file, text]` message, bare `/plan` with the same attachments steers one `[image, file]` message, and `/plan off` with attachments returns the error with `steer` uncalled and `ctx.planMode.get` still active.
