import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, type GenerateOptions, type Message, type StreamChunk  } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionTitleService from '@deepseek-ai/dsh-session-title'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import PlanModeController, {
  APPROVE_KEEP, EXIT_PLAN_MODE, EXECUTION_SESSION_TITLE_PREFIX, foldPlanMode,
} from '@deepseek-ai/dsh-plan-handoff'
import { clearThenExecute } from '../src/handoff.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

const PLAN_CONFIG = { section: 'Test plan mode instructions.' }
const TITLE_CONFIG = { fallbackMaxWords: 8, fallbackMaxBytes: 80, maxTitleBytes: 200 }

/**
 * Full-loop integration: a scripted mock model drives the REAL plan-mode plugin
 * through the agent loop — the pending-intent flush at the step boundary, the
 * assembly the soft layer shapes (the exit tool + mode section), and the
 * `request/header` snapshots every transition leaves.
 * Only the model is mocked; the loop, the session log, and the plugin are
 * real.
 */
async function harness(adapter: MockAdapter, options: { titles?: boolean } = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(PlanModeController, PLAN_CONFIG)
  await ctx.plugin(UserQuestionService)
  if (options.titles === true) await ctx.plugin(SessionTitleService, TITLE_CONFIG)
  ctx.llm.registerAdapter(['mock'], adapter)
  for (const name of ['read', 'write']) {
    ctx.tools.register(defineContentToolFixture({
      name,
      description: `test tool ${name}`,
      parameters: {},
      execute: () => Promise.resolve([{ type: 'text', text: `ran ${name}` }]),
    }))
  }
  return ctx
}

/** Answer the plan review with one fixed option. */
function approveWith(ctx: Context, selected: string): void {
  ctx.on('user-questions/request', () => Promise.resolve({
    answers: [{ id: 'plan-review', selected: [selected] }],
  }))
}

/**
 * Resolve after `count` idle transitions of one agent. One subscription covers
 * every transition, so a turn that starts and settles inside the gap between
 * two waits cannot be missed.
 */
function waitForIdle(ctx: Context, agent: Agent, count = 1): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      seen += 1
      if (seen < count) return
      dispose()
      resolve()
    })
  })
}

function findEvent<T extends SessionEvent['type']>(
  log: readonly SessionEvent[],
  type: T,
  position: 'first' | 'last' = 'first',
): Extract<SessionEvent, { type: T }> {
  const found = position === 'first'
    ? log.find(event => event.type === type)
    : log.findLast(event => event.type === type)
  if (!found) throw new Error(`no ${type} event in the session log`)
  return found as Extract<SessionEvent, { type: T }>
}

/** Join the text blocks of one message. */
function textOf(message: Message): string {
  return message.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/** Text of the session's current system node: the `system/message` at surface node 0. */
function systemText(agent: Agent): string {
  const head = agent.session.deriveMessages()[0]
  if (head?.role !== 'system') throw new Error('surface node 0 is not a system message')
  return textOf(head)
}

/** Text of the leading system message of one loop-built request. */
function requestSystem(options: GenerateOptions | undefined): string {
  const head = options?.messages[0]
  if (head?.role !== 'system') throw new Error('the request does not lead with a system message')
  return textOf(head)
}

describe('plan mode through the agent loop', () => {
  it('a pre-turn set() makes the FIRST header plan-shaped, and a non-shell call is guidance-constrained only', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('call-1', 'write', {}, 'Writing during plan.'),
      textResponse('Noted in the plan.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('it-plan-seed'), { provider: 'mock', model: 'mock' })
    // Selected while idle: the mode commits immediately, before the first assembly.
    ctx.planMode.set(agent, true)

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'explore the repo' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const log = agent.session.snapshotEvents()
    const planMode = findEvent(log, 'plan/mode')
    const header = findEvent(log, 'request/header')
    expect(planMode.seq).toBeLessThan(header.seq)
    expect(header.data.reason).toBe('initial')
    expect(header.data.header.tools?.map(tool => tool.name)).toEqual(['exit_plan_mode', 'read', 'write'])
    // The first system node already carries the section: appended, never replaced.
    const systemNode = findEvent(log, 'system/message')
    expect(systemNode.surfaceOp).toBe('append')
    expect(log.filter(event => event.type === 'system/message')).toHaveLength(1)
    expect(agent.session.surface.nodes[0]).toBe(systemNode.seq)
    expect(systemText(agent)).toContain('plan mode')

    // No tool gate: the write RUNS — plan restrains by the section's
    // guidance alone (enforcement lives on the independent sandbox/approval
    // axes). The mode itself stays plan throughout.
    const result = findEvent(log, 'tool/result')
    expect(result.data.message.content[0].isError).toBe(false)
    expect(foldPlanMode(log)).toBe(true)
    expect(log.some(event => event.type === 'user/message' && event.data.source.kind === 'plugin')).toBe(false)
  })

  it('a user flip between turns lands at the boundary: one notice and a changed header with stable tool schemas', async () => {
    const adapter = new MockAdapter([
      textResponse('First turn, default mode.'),
      textResponse('Second turn, plan mode.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('it-plan-flip'), { provider: 'mock', model: 'mock' })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)
    expect(foldPlanMode(agent.session.snapshotEvents())).toBe(false)
    const first = findEvent(agent.session.snapshotEvents(), 'request/header')
    expect(first.data.header.tools?.map(tool => tool.name)).toEqual(['exit_plan_mode', 'read', 'write'])
    const firstSystem = findEvent(agent.session.snapshotEvents(), 'system/message')
    expect(systemText(agent)).not.toContain(PLAN_CONFIG.section)

    ctx.planMode.set(agent, true)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'now plan' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const log = agent.session.snapshotEvents()
    expect(foldPlanMode(log)).toBe(true)
    const notices = log.filter(event => event.type === 'user/message' && event.data.source.kind === 'plugin')
    expect(notices).toHaveLength(1)
    expect(notices[0]?.type === 'user/message' && notices[0].data.content).toEqual([
      { type: 'text', text: 'The user switched this session to plan mode.' },
    ])
    // The changed prompt replaces surface node 0 in place; the header is
    // re-logged as a series snapshot because tools and config are unchanged.
    const systemNodes = log.filter(event => event.type === 'system/message')
    expect(systemNodes).toHaveLength(2)
    const secondSystem = systemNodes[1]
    expect(secondSystem?.surfaceOp).toEqual({ op: 'replace', startSeq: firstSystem.seq, endSeq: firstSystem.seq })
    expect(secondSystem?.sourceEventSeqs).toEqual([firstSystem.seq])
    expect(agent.session.surface.nodes[0]).toBe(secondSystem?.seq)
    expect(systemText(agent)).toContain('plan mode')
    expect(log.filter(event => event.type === 'request/header').map(event => event.data.reason)).toEqual(['initial', 'series'])
    const second = findEvent(log, 'request/header', 'last')
    expect(second.data.header.tools?.map(tool => tool.name)).toEqual(['exit_plan_mode', 'read', 'write'])
    expect(second.data.header.tools).toEqual(first.data.header.tools)
  })

  it('a mode flip at error settlement waits until the step after a same-step retry', async () => {
    const failedRequest = [{
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'temporarily unavailable', code: 'SERVER', status: 503 } },
    }] satisfies StreamChunk[]
    const adapter = new MockAdapter([
      failedRequest,
      textResponse('Recovered with the original step assembly.'),
      textResponse('Entered plan mode on the next step.'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('it-plan-retry-flip'), { provider: 'mock', model: 'mock' })
    ctx.on('agent/request-error', async ({ agent: subject }, next) => {
      if (subject !== agent) return next()
      ctx.planMode.set(agent, true)
      return { kind: 'retry' }
    })

    const idle = waitForIdle(ctx, agent)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'plan after the transient failure' }], source: { kind: 'user' } }))
    await idle

    expect(adapter.requests).toHaveLength(2)
    expect(requestSystem(adapter.requests[0])).not.toContain(PLAN_CONFIG.section)
    expect(requestSystem(adapter.requests[1])).not.toContain(PLAN_CONFIG.section)
    expect(adapter.requests[1]?.tools).toEqual(adapter.requests[0]?.tools)
    expect(ctx.planMode.get(agent)).toEqual({ active: false, pending: true })
    expect(agent.session.snapshotEvents().some(event => event.type === 'plan/mode')).toBe(false)

    const nextIdle = waitForIdle(ctx, agent)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue with the plan' }], source: { kind: 'user' } }))
    await nextIdle

    expect(adapter.requests).toHaveLength(3)
    expect(requestSystem(adapter.requests[2])).toContain(PLAN_CONFIG.section)
    expect(adapter.requests[2]?.tools).toEqual(adapter.requests[0]?.tools)
    const log = agent.session.snapshotEvents()
    const planMode = findEvent(log, 'plan/mode')
    const firstEnd = log.find(event => event.type === 'step/end'
      && event.data.turn === 1 && event.data.step === 1)
    const nextStart = log.find(event => event.type === 'step/start'
      && event.data.turn === 2 && event.data.step === 1)
    expect(firstEnd?.seq).toBeLessThan(planMode.seq)
    expect(planMode.seq).toBeLessThan(nextStart?.seq ?? 0)
    const systemNodes = log.filter(event => event.type === 'system/message')
    expect(systemNodes).toHaveLength(2)
    expect(systemNodes[1]?.sourceEventSeqs).toEqual([systemNodes[0]?.seq])
    expect(nextStart?.seq).toBeLessThan(systemNodes[1]?.seq ?? 0)
    expect(systemText(agent)).toContain(PLAN_CONFIG.section)
    const notice = log.find(event => event.type === 'user/message' && event.data.source.kind === 'plugin')
    expect(notice?.type === 'user/message' && notice.data.content).toEqual([
      { type: 'text', text: 'The user switched this session to plan mode.' },
    ])
  })

  it('one approval executes the plan exactly once, in the turn the plugin steers', async () => {
    const approved = '# Approved plan\n\nDo the work.'
    const adapter = new MockAdapter([
      toolCallResponse('exit-1', EXIT_PLAN_MODE, { plan: approved }),
      textResponse('Executing the approved plan.'),
    ])
    const ctx = await harness(adapter)
    approveWith(ctx, APPROVE_KEEP)
    const agent = await ctx.agentLoop.create(SessionId('it-plan-handoff-keep'), { provider: 'mock', model: 'mock' })
    ctx.planMode.set(agent, true)

    // Turn 1 is the planning turn; turn 2 is the execution turn the handoff
    // steers. Any in-turn execution would show a third request.
    const settled = waitForIdle(ctx, agent, 2)
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'plan the work' }], source: { kind: 'user' } }))
    await settled

    expect(adapter.requests).toHaveLength(2)
    const log = agent.session.snapshotEvents()
    const steers = log.filter(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'plan-handoff')
    expect(steers).toHaveLength(1)
    const firstTurnEnd = findEvent(log, 'turn/end')
    expect(firstTurnEnd.seq).toBeLessThan(steers[0]?.seq ?? 0)
    expect(foldPlanMode(log)).toBe(false)
    const execution = adapter.requests[1]?.messages.at(-1)
    expect(execution?.role).toBe('user')
    expect(textOf(execution as Message)).toContain(approved)
    expect(textOf(execution as Message)).toContain('History is usable')
  })

  it('clear titles the execution session after the planning session', async () => {
    const adapter = new MockAdapter([textResponse('Executing in a fresh session.')])
    const ctx = await harness(adapter, { titles: true })
    const source = await ctx.agentLoop.create(SessionId('it-plan-handoff-clear'), { provider: 'mock', model: 'mock' })
    ctx.sessionTitle.rename(source.session, 'Plan the migration')

    const outcome = await clearThenExecute(ctx, source, '# Approved plan\n\nDo the work.', 'Approved plan')

    expect(outcome.kind).toBe('cleared')
    const handoff = findEvent(source.session.snapshotEvents(), 'plan/handoff')
    const child = ctx.sessions.get(handoff.data.childSessionId)
    expect(child).toBeDefined()
    const titles = child?.snapshotEvents().filter(event => event.type === 'session/title') ?? []
    expect(titles).toHaveLength(1)
    expect(titles[0]?.data.title).toBe(`${EXECUTION_SESSION_TITLE_PREFIX}Plan the migration`)
    expect(titles[0]?.data.source).toEqual({ kind: 'user' })
  })
})
