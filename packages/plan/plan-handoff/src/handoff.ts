/**
 * Post-approval execution: keep this session, compact it, or open a sibling.
 *
 * @module @deepseek-ai/dsh-plan-handoff/handoff
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type { ManualCompactionError, ManualCompactionErrorCode } from '@deepseek-ai/dsh-compaction'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: resolves ctx.sessionTitle for the optional title child.
import type {} from '@deepseek-ai/dsh-session-title'
// Type-only: resolves ctx.workspaceRegistry and the Workspace entity type.
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type { PlanExecution } from './types.ts'
import { EXECUTION_SESSION_TITLE_PREFIX, approvedPlanPrompt } from './prompts.ts'

/**
 * The session's compaction engine: the preset isolate first, then the host
 * plane. Shipped presets mount `compaction` behind `isolate`, which
 * `ctx.get('compaction')` on the agent or plan-handoff fiber cannot see.
 *
 * @param host - plan-handoff service context (not the source agent scope).
 * @param agent - session whose mounted composition to search.
 * @returns that session's engine, or undefined when none is composed.
 */
function resolveCompaction(host: Context, agent: Agent) {
  return host.get('agentPresets')?.serviceFor(agent, 'compaction') ?? host.get('compaction')
}

/** Approved plan waiting for the source agent to become idle. */
export interface PendingHandoff {
  execution: PlanExecution
  plan: string
  title: string
}

/** Result of one idle handoff attempt. */
export type HandoffOutcome =
  | { kind: 'kept' }
  | { kind: 'compacted' }
  | { kind: 'cleared'; childSessionId: SessionId }
  | { kind: 'compact-cancelled' }
  | { kind: 'cleared-fallback' }

/**
 * Whether a rejection is the compaction service reporting its own cancellation,
 * which is the agent being cancelled mid-compaction rather than this caller's
 * own abort reason.
 *
 * `@deepseek-ai/dsh-compaction` is an optional peer, so its error class is not a
 * loadable value in this package; the class stamps its name on every instance
 * and `cancelled` is the one code this handoff reacts to, so the check reads
 * that published contract instead of the constructor.
 *
 * @param error - value the compaction call rejected with.
 * @returns true when the rejection is a cancelled compaction.
 */
function isCancelledCompaction(error: unknown): error is ManualCompactionError {
  return error instanceof Error
    && error.name === 'ManualCompactionError'
    && 'code' in error
    && (error as { code?: ManualCompactionErrorCode }).code === 'cancelled'
}

/**
 * Steer the approved-plan prompt into an idle agent.
 *
 * @param agent - idle execution agent.
 * @param plan - approved markdown.
 * @param contextPreserved - whether planning history remains visible.
 */
export function steerApprovedPlan(
  agent: Agent,
  plan: string,
  contextPreserved: boolean,
): void {
  agent.steer(createUserMessage({
    content: [{ type: 'text', text: approvedPlanPrompt({ plan, contextPreserved }) }],
    source: {
      kind: 'plugin',
      plugin: 'plan-handoff',
      form: 'notice',
      summary: 'Execute the approved plan.',
    },
  }))
}

/**
 * Compact this session then steer the full plan. Cancellation skips the steer.
 *
 * @param host - plan-handoff service context, used to resolve compaction.
 * @param agent - idle source agent that can runMaintenance.
 * @param plan - approved markdown, embedded after compaction.
 * @param signal - forwarded to compactNow.
 * @returns compacted, cancelled, or kept when no compaction service exists.
 */
export async function compactThenExecute(
  host: Context,
  agent: Agent,
  plan: string,
  signal: AbortSignal,
): Promise<Extract<HandoffOutcome, { kind: 'compacted' | 'compact-cancelled' | 'kept' }>> {
  const compaction = resolveCompaction(host, agent)
  if (compaction === undefined) {
    steerApprovedPlan(agent, plan, true)
    return { kind: 'kept' }
  }
  try {
    await compaction.compactNow(agent, signal)
  } catch (error: unknown) {
    if (isCancelledCompaction(error)) return { kind: 'compact-cancelled' }
    host.logger.warn('dsh-plan-handoff: compaction failed; executing with current context: %o', error)
    steerApprovedPlan(agent, plan, true)
    return { kind: 'kept' }
  }
  steerApprovedPlan(agent, plan, true)
  return { kind: 'compacted' }
}

/**
 * Create a sibling session that inherits cwd, model, and preset, then steer.
 *
 * The child is created, attached to the source's workspace, titled, recorded by
 * `plan/handoff`, and only then steered. A failure after creation detaches and
 * disposes the child instead of falling back to the source session, which would
 * execute the plan twice; the source-session fallback is reserved for a child
 * that was never created.
 *
 * @param host - the plan-handoff service context (not the source agent scope).
 * @param source - idle planning agent.
 * @param plan - approved markdown; the child's first model-visible input.
 * @param title - the approved plan's first heading; a fallback base for the
 *   execution session title when the source session carries none.
 * @returns cleared, or fallback compact/keep when create is unavailable.
 */
export async function clearThenExecute(
  host: Context,
  source: Agent,
  plan: string,
  title: string,
): Promise<Extract<HandoffOutcome, { kind: 'cleared' | 'cleared-fallback' }>> {
  const agents = host.get('agents')
  if (agents === undefined) {
    await compactThenExecute(host, source, plan, new AbortController().signal)
    return { kind: 'cleared-fallback' }
  }

  const presets = host.get('agentPresets')
  const presetId = presets?.composedPreset(source.ctx)
  const childId = SessionId(`session-${randomUUID()}`)
  let handle: AgentHandle
  try {
    handle = await agents.create({
      sessionId: childId,
      meta: {
        ...source.session.header.cwd === undefined ? {} : { cwd: source.session.header.cwd },
        parentSession: source.id,
        ...presetId === undefined ? {} : { agentPreset: presetId },
      },
      agentOptions: { ...source.options },
      ...presets === undefined || presetId === undefined
        ? {}
        : {
          setup: async (agentCtx: Context) => {
            await presets.mount(agentCtx, presetId)
          },
        },
    })
  } catch (error: unknown) {
    // Nothing was created, so the source session is still the only place the
    // approved plan can run.
    host.logger.warn('dsh-plan-handoff: failed to create execution session; falling back: %o', error)
    await compactThenExecute(host, source, plan, new AbortController().signal)
    return { kind: 'cleared-fallback' }
  }
  const cwd = source.session.header.cwd
  const workspaces = host.get('workspaceRegistry')
  let workspace: Workspace | undefined
  let attached = false
  try {
    if (workspaces !== undefined && cwd !== undefined) {
      workspace = await workspaces.resolveByPath(cwd)
      if (workspace !== undefined) {
        await workspace.attachSession(childId)
        attached = true
      }
    }
    applyExecutionTitle(host, source, handle.agent, title)
    source.session.append('plan/handoff', { childSessionId: childId, mode: 'clear' })
    steerApprovedPlan(handle.agent, plan, false)
    return { kind: 'cleared', childSessionId: childId }
  } catch (error: unknown) {
    host.logger.warn('dsh-plan-handoff: execution session failed after creation; discarding it: %o', error)
    if (attached && workspace !== undefined) {
      try {
        await workspace.detachSession(childId)
      } catch (rollbackError: unknown) {
        host.logger.warn('dsh-plan-handoff: workspace detach rollback failed: %o', rollbackError)
      }
    }
    try {
      await handle.dispose()
    } catch (rollbackError: unknown) {
      host.logger.warn('dsh-plan-handoff: execution session disposal failed: %o', rollbackError)
    }
    throw error
  }
}

/**
 * Name the execution session after its planning session.
 *
 * The base is the source session's folded title, so the child reads as
 * `【执行计划】<planning title>`; a `session/title` already carrying the prefix
 * is left unchanged. A missing title service, or one that rejects the rename,
 * leaves the child at its default derived title rather than failing the
 * handoff.
 *
 * @param host - the plan-handoff service context.
 * @param source - idle planning agent whose title names the child.
 * @param child - the created execution agent.
 * @param title - the plan's first heading, used when the source has no title.
 */
function applyExecutionTitle(host: Context, source: Agent, child: Agent, title: string): void {
  const titles = host.get('sessionTitle')
  if (titles === undefined) return
  const base = titles.get(source.session)?.title ?? title
  const composed = base.startsWith(EXECUTION_SESSION_TITLE_PREFIX)
    ? base
    : `${EXECUTION_SESSION_TITLE_PREFIX}${base}`
  try {
    titles.rename(child.session, composed)
  } catch (error: unknown) {
    host.logger.warn('dsh-plan-handoff: failed to title the execution session: %o', error)
  }
}

/**
 * Run the pending handoff now that the source agent is idle.
 *
 * @param host - plan-handoff service context.
 * @param agent - idle source agent.
 * @param pending - recorded review choice and plan.
 * @returns what the handoff did.
 */
export async function runHandoff(
  host: Context,
  agent: Agent,
  pending: PendingHandoff,
): Promise<HandoffOutcome> {
  switch (pending.execution) {
    case 'keep':
      steerApprovedPlan(agent, pending.plan, true)
      return { kind: 'kept' }
    case 'compact':
      return compactThenExecute(host, agent, pending.plan, new AbortController().signal)
    case 'clear':
      return clearThenExecute(host, agent, pending.plan, pending.title)
    default: {
      const exhausted: never = pending.execution
      return exhausted
    }
  }
}
