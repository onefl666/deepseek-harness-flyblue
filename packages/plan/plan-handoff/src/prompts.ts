/**
 * Package-owned execution prompts. Planning guidance stays deployment
 * `section` config; these strings run after an approved review.
 *
 * @module @deepseek-ai/dsh-plan-handoff/prompts
 */

import type { PlanExecutionSelection } from './types.ts'

/** Review option that approves and starts a fresh sibling session. */
export const APPROVE_EXECUTE = 'Approve and execute'

/** Review option that approves, compacts this session, then executes. */
export const APPROVE_COMPACT = 'Approve and compact context'

/** Review option that approves and executes with the planning transcript. */
export const APPROVE_KEEP = 'Approve and keep context'

/** Review option that stays in plan mode and returns feedback. */
export const REFINE_PLAN = 'Refine plan'

/** Labels that leave plan mode, in overlay order. */
export const APPROVE_LABELS = [APPROVE_EXECUTE, APPROVE_COMPACT, APPROVE_KEEP] as const

/**
 * Setting names the review declares on its presentation intent: values a
 * capable UI collects beside the decision, all of them describing the fresh
 * execution session the clear path opens. The route names are read together —
 * a UI that offers a model offers its provider, id, and effort as one choice —
 * and every name is absent when the reviewer left that choice alone, which
 * keeps the execution session on what the planning session inherited.
 */
export const PLAN_REVIEW_SETTINGS = [
  'provider', 'model', 'reasoningEffort', 'agentPreset',
] as const satisfies readonly (keyof PlanExecutionSelection)[]

/**
 * Leading marker of an execution session's title, so a user reading the
 * session list can tell which planning session produced it. Applied once: a
 * base title that already carries it is left alone. Not deployment-owned — it
 * is host copy of the same class as {@link APPROVE_LABELS}.
 */
export const EXECUTION_SESSION_TITLE_PREFIX = '【执行计划】'

/**
 * Build the model-visible execution prompt after approval.
 *
 * @param input.plan - the approved markdown, required on compact/clear because
 *   those paths drop or replace the planning transcript.
 * @param input.contextPreserved - true when the planning history remains on
 *   the surface (keep, or compact after the summary lands).
 * @returns the user-message text steered into the execution turn.
 */
export function approvedPlanPrompt(input: {
  plan: string
  contextPreserved: boolean
}): string {
  const history = input.contextPreserved
    ? 'History is usable; if it conflicts with the plan below, the plan is authoritative.\n\n'
    : 'This turn has no planning conversation. Execute solely from the plan below.\n\n'
  return (
    history
    + 'Read the approved plan before any edit. Then execute it top-to-bottom with full tool access. '
    + 'Verify each step before the next. Do not re-plan or ask for another approval.\n\n'
    + input.plan
  )
}

/**
 * One-line tool-result narration for an approved execution mode.
 *
 * @param execution - the reviewer's chosen handoff.
 * @returns the text block the model sees as the successful tool result.
 */
export function approvedResultText(execution: 'clear' | 'compact' | 'keep'): string {
  switch (execution) {
    case 'clear':
      return 'Plan approved — a fresh session will execute it without this planning conversation.'
    case 'compact':
      return 'Plan approved — this session will compact the planning discussion, then execute the plan.'
    case 'keep':
      return 'Plan approved — plan mode exited; this session keeps the planning history '
        + 'and runs the approved plan as the next turn.'
    default: {
      const exhausted: never = execution
      return exhausted
    }
  }
}
