/**
 * Pure types of the plan domain: the ONE home of the `plan` projection-key
 * declaration and the plan session-event vocabulary, free of this package's
 * host-side value imports.
 *
 * @module @deepseek-ai/dsh-plan-handoff/types
 */

/**
 * How an approved plan should start execution after plan mode leaves.
 * `clear` opens a sibling session; `compact` and `keep` continue here.
 */
export type PlanExecution = 'clear' | 'compact' | 'keep'

/**
 * What the review chose for the session an approved plan executes in: the
 * execution selection the review collected beside its decision, as the review
 * answer carried it.
 *
 * Only the `clear` path reads this. `compact` and `keep` execute in the
 * planning session, whose route the reviewer's own selection already moved, so
 * these fields describe a session that does not exist yet. Every field is
 * optional and its absence means the reviewer left that choice alone, which
 * leaves the inherited value in force.
 */
export interface PlanExecutionSelection {
  /** Provider route the fresh execution session starts on; absent keeps the inherited route. */
  provider?: string
  /** Provider-owned model id the fresh session starts on; ignored without a provider. */
  model?: string
  /** Adapter-owned reasoning effort for that route; absent uses the model's own default. */
  reasoningEffort?: string
  /** Agent preset the fresh session composes; absent composes the planning session's preset. */
  agentPreset?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Whether plan mode is in force from this point on: log-only, non-surface,
     * whole-value replace. The last `plan/mode` wins; a log with none folds to
     * inactive.
     */
    'plan/mode': { active: boolean }
    /**
     * An approved plan left this session for a fresh sibling: log-only.
     */
    'plan/handoff': { childSessionId: import('@deepseek-ai/dsh-session/types').SessionId; mode: 'clear' }
    /**
     * Recorded when a review approves a plan: log-only. The plan markdown
     * stays on the `exit_plan_mode` tool argument.
     */
    'plan/approved': { execution: PlanExecution; title: string }
  }
}

/**
 * The plan projection's wire value. `active` is the logged state in force
 * (the last `plan/mode`, inactive before the first); `pending` is true while
 * a logged `/plan` selection (`command/run`) targets a state other than
 * `active` and no later `plan/mode` event has recorded that state. Capability
 * absence (plan-handoff not composed) is the key's absence, never a value.
 */
export interface PlanProjection {
  active: boolean
  pending: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Plan collaboration state folded from `command/run` (name `plan`) and `plan/mode` events. */
    plan: PlanProjection
  }
}
