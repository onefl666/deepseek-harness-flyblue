import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { Session, SessionId, SessionStore, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import UserQuestionService, { type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { ManualCompactionError } from '@deepseek-ai/dsh-compaction'
import PlanModeController, {
  APPROVE_COMPACT, APPROVE_EXECUTE, APPROVE_KEEP, EXIT_PLAN_MODE,
  EXECUTION_SESSION_TITLE_PREFIX, approvedPlanPrompt, approvedResultText,
} from '../src/index.ts'
import { clearThenExecute } from '../src/handoff.ts'

interface QuestionAnswerer {
  ask(request: AskUserQuestionRequest): Promise<{ answers: { id: string; selected: string[] }[] }>
}

/** Register one answerer on the Agent-scoped user-question waterfall. */
function registerAnswerer(ctx: Context, answerer: QuestionAnswerer): () => void {
  return ctx.on('user-questions/request', request => answerer.ask(request))
}

const PLAN_CONFIG = { section: 'Test plan mode instructions.' }

/** The single event of one type in a session log. */
function findEvent<T extends SessionEvent['type']>(
  log: readonly SessionEvent[],
  type: T,
): Extract<SessionEvent, { type: T }> {
  const found = log.find(event => event.type === type)
  if (!found) throw new Error(`no ${type} event in the session log`)
  return found as Extract<SessionEvent, { type: T }>
}

async function agentWithSession(
  ctx: Context,
  id = 'agent-1',
  extra: { steer?: (message: UserMessage) => void; status?: Agent['status'] } = {},
): Promise<Agent & { session: Session }> {
  const session = Session.create(SessionId(id))
  session.append('plan/mode', { active: true })
  const agent = {
    id: SessionId(id),
    session,
    options: { provider: 'mock', model: 'mock' },
    status: extra.status ?? 'running',
    inject(message: UserMessage) {
      session.append('user/message', message, { surfaceOp: 'append' })
    },
    steer: extra.steer ?? ((_message: UserMessage) => undefined),
  } as unknown as Agent & { session: Session }
  let scoped!: Context
  await ctx.plugin(Object.assign((inner: Context) => { scoped = createScope(inner, agent).ctx }, {
    inject: ['tools'],
  }))
  ;(agent as { ctx?: Context }).ctx = scoped
  const agents = ctx.get('agents')
  if (agents === undefined) ctx.emit('agent/created', { agent })
  else {
    agents.enter(agent, undefined)
    agents.announce(agent)
  }
  return agent
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(PlanModeController, PLAN_CONFIG)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  return ctx
}

function callExit(ctx: Context, agent: Agent, selected: string) {
  registerAnswerer(ctx, {
    ask: (_request: AskUserQuestionRequest) => Promise.resolve({
      answers: [{ id: 'plan-review', selected: [selected] }],
    }),
  })
  return ctx.tools.execute({
    callId: ToolCallId(`exit-${selected}`),
    name: EXIT_PLAN_MODE,
    arguments: { plan: '# Title\n\nDo the work.' },
    signal: new AbortController().signal,
    agent,
  })
}

describe('approved prompts', () => {
  it('states whether history is preserved', () => {
    expect(approvedPlanPrompt({ plan: '# P', contextPreserved: true })).toContain('History is usable')
    expect(approvedPlanPrompt({ plan: '# P', contextPreserved: false })).toContain('no planning conversation')
  })

  it('narrates each execution mode without ordering the model to run the plan', () => {
    expect(approvedResultText('clear')).toContain('fresh session')
    expect(approvedResultText('compact')).toContain('compact')
    expect(approvedResultText('keep')).toContain('Plan approved')
    // The steer owns execution; an imperative here would run the plan in-turn
    // and then again from the steer.
    for (const execution of ['clear', 'compact', 'keep'] as const) {
      expect(approvedResultText(execution)).not.toMatch(/carry out|starting with your next step|next step/i)
    }
  })
})

describe('approved execution handoff', () => {
  it('keep steers the plan when the source is already idle', async () => {
    const ctx = await setup()
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'keep', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    const result = await callExit(ctx, agent, APPROVE_KEEP)
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected approval')
    expect(result.value).toEqual({ approved: true, execution: 'keep' })
    expect(result.concludesTurn).toBe(true)
    expect(steered).toHaveLength(1)
    expect(steered[0]?.content[0]).toMatchObject({ type: 'text' })
    expect(agent.session.snapshotEvents().some(event => event.type === 'plan/approved')).toBe(true)
  })

  it('compact calls compactNow then steers', async () => {
    const ctx = await setup()
    const compactNow = vi.fn(async () => null)
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'compact', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    ctx.provide('compaction', { compactNow } as never)
    const result = await callExit(ctx, agent, APPROVE_COMPACT)
    expect(result.isError).toBe(false)
    expect(result.concludesTurn).toBe(true)
    expect(compactNow).toHaveBeenCalledOnce()
    expect(steered).toHaveLength(1)
  })

  it('compact resolves an isolated preset compaction service', async () => {
    const ctx = await setup()
    const compactNow = vi.fn(async () => null)
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'isolated-compact', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    ctx.provide('agentPresets', {
      serviceFor: (_subject: unknown, name: string) => name === 'compaction' ? { compactNow } : undefined,
    } as never)
    const result = await callExit(ctx, agent, APPROVE_COMPACT)
    expect(result.isError).toBe(false)
    expect(compactNow).toHaveBeenCalledOnce()
    expect(steered).toHaveLength(1)
  })

  it('compact does not see an isolated engine without serviceFor', async () => {
    const ctx = await setup()
    const compactNow = vi.fn(async () => null)
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'isolated-miss', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    ctx.isolate('compaction').provide('compaction', { compactNow } as never)
    await callExit(ctx, agent, APPROVE_COMPACT)
    expect(compactNow).not.toHaveBeenCalled()
    expect(steered).toHaveLength(1)
  })

  it('compact cancellation does not steer', async () => {
    const ctx = await setup()
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'cancel', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    ctx.provide('compaction', {
      compactNow: () => Promise.reject(new ManualCompactionError('cancelled', 'cancelled')),
    } as never)
    const result = await callExit(ctx, agent, APPROVE_COMPACT)
    expect(result.concludesTurn).toBe(true)
    expect(steered).toHaveLength(0)
  })

  it('compact non-cancel failure falls back to keep and steers', async () => {
    const ctx = await setup()
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'compact-fail', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    ctx.provide('compaction', {
      compactNow: () => Promise.reject(new Error('summarizer down')),
    } as never)
    await callExit(ctx, agent, APPROVE_COMPACT)
    expect(steered).toHaveLength(1)
  })

  it('clear without a session factory falls back to compact-then-steer', async () => {
    const ctx = await setup()
    const steered: UserMessage[] = []
    const agent = await agentWithSession(ctx, 'fallback', {
      status: 'idle',
      steer: (message) => { steered.push(message) },
    })
    const result = await callExit(ctx, agent, APPROVE_EXECUTE)
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected approval')
    expect(result.value).toEqual({ approved: true, execution: 'clear' })
    expect(result.concludesTurn).toBe(true)
    expect(steered).toHaveLength(1)
    expect(agent.session.snapshotEvents().some(event => event.type === 'plan/handoff')).toBe(false)
  })
})

interface ClearHarness {
  ctx: Context
  source: Agent & { session: Session }
  /** Messages the created child was steered with. */
  childSteered: UserMessage[]
  /** Messages the source session was steered with (only the fallback does this). */
  sourceSteered: UserMessage[]
  dispose: ReturnType<typeof vi.fn>
  detachSession: ReturnType<typeof vi.fn>
  renames: { session: Session; title: string }[]
}

/**
 * Composition for the clear paths: a live source session, a stub agent factory
 * whose child the test can make fail, and optional title/workspace services.
 */
async function clearHarness(options: {
  sourceTitle?: string
  withTitleService?: boolean
  renameError?: Error
  withWorkspace?: boolean
  /** Resolve a workspace path to nothing, as a path with no registered workspace does. */
  workspaceMissing?: boolean
  /** Compose no `ctx.agents` at all. */
  withoutAgents?: boolean
  createError?: Error
  steerError?: Error
  detachError?: Error
  disposeError?: Error
} = {}): Promise<ClearHarness> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId('source'), {
    ...options.withWorkspace === true ? { meta: { cwd: '/workspace' } } : {},
  })
  const sourceSteered: UserMessage[] = []
  const source = {
    id: session.id,
    session,
    options: { provider: 'mock', model: 'mock' },
    status: 'idle',
    steer: (message: UserMessage) => { sourceSteered.push(message) },
  } as unknown as Agent & { session: Session }

  const childSteered: UserMessage[] = []
  let childSession: Session | undefined
  const child = {
    get id() { return childSession?.id ?? SessionId('child-missing') },
    get session() {
      if (childSession === undefined) throw new Error('the child session was never created')
      return childSession
    },
    options: { provider: 'mock', model: 'mock' },
    status: 'idle',
    steer: (message: UserMessage) => {
      if (options.steerError !== undefined) throw options.steerError
      childSteered.push(message)
    },
  } as unknown as Agent
  const disposeError = options.disposeError
  const dispose = vi.fn(() => disposeError === undefined ? Promise.resolve() : Promise.reject(disposeError))
  const createError = options.createError
  if (options.withoutAgents !== true) {
    ctx.provide('agents', {
      create: createError === undefined
        ? (request: { sessionId: SessionId }) => {
          childSession = Session.create(request.sessionId)
          return Promise.resolve({ agent: child, dispose })
        }
        : () => Promise.reject(createError),
    } as never)
  }

  const detachError = options.detachError
  const detachSession = vi.fn(() => detachError === undefined ? Promise.resolve() : Promise.reject(detachError))
  if (options.withWorkspace === true) {
    ctx.provide('workspaceRegistry', {
      resolveByPath: () => Promise.resolve(options.workspaceMissing === true ? undefined : {
        attachSession: () => Promise.resolve(),
        detachSession,
      }),
    } as never)
  }

  const renames: { session: Session; title: string }[] = []
  if (options.withTitleService !== false) {
    ctx.provide('sessionTitle', {
      get: (subject: Session) => subject === session && options.sourceTitle !== undefined
        ? { title: options.sourceTitle }
        : undefined,
      rename: (subject: Session, title: string) => {
        if (options.renameError !== undefined) throw options.renameError
        renames.push({ session: subject, title })
        return { title }
      },
    } as never)
  }
  ctx.provide('compaction', {
    compactNow: () => {
      throw new Error('the clear path must not compact')
    },
  } as never)
  return { ctx, source, childSteered, sourceSteered, dispose, detachSession, renames }
}

describe('execution session title', () => {
  it('names the child after the planning session title', async () => {
    const { ctx, source, renames } = await clearHarness({ sourceTitle: 'Plan the migration' })
    const result = await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(result.kind).toBe('cleared')
    expect(renames).toHaveLength(1)
    expect(renames[0]?.title).toBe(`${EXECUTION_SESSION_TITLE_PREFIX}Plan the migration`)
    expect(renames[0]?.session.id).toBe(result.kind === 'cleared' ? result.childSessionId : undefined)
    const handoff = findEvent(source.session.snapshotEvents(), 'plan/handoff')
    expect(handoff.data.childSessionId).toBe(renames[0]?.session.id)
  })

  it('falls back to the plan heading when the planning session has no title', async () => {
    const { ctx, source, renames } = await clearHarness()
    await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(renames[0]?.title).toBe(`${EXECUTION_SESSION_TITLE_PREFIX}Title`)
  })

  it('leaves an already prefixed base title alone', async () => {
    const { ctx, source, renames } = await clearHarness({
      sourceTitle: `${EXECUTION_SESSION_TITLE_PREFIX}Plan the migration`,
    })
    await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(renames[0]?.title).toBe(`${EXECUTION_SESSION_TITLE_PREFIX}Plan the migration`)
  })

  it('steers without a title when no title service is composed', async () => {
    const { ctx, source, childSteered } = await clearHarness({ withTitleService: false })
    const result = await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(result.kind).toBe('cleared')
    expect(childSteered).toHaveLength(1)
  })

  it('keeps the execution session when the rename is rejected', async () => {
    const { ctx, source, childSteered } = await clearHarness({ renameError: new Error('title store down') })
    const result = await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(result.kind).toBe('cleared')
    if (result.kind !== 'cleared') throw new Error('expected a cleared handoff')
    expect(result.childSessionId).toContain('session-')
    expect(childSteered).toHaveLength(1)
  })

  it('discards the child on a post-create failure instead of executing in the source session', async () => {
    const { ctx, source, sourceSteered, dispose, detachSession, childSteered } = await clearHarness({
      withWorkspace: true,
      steerError: new Error('steer rejected'),
    })
    await expect(clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')).rejects.toThrow('steer rejected')
    const handoff = findEvent(source.session.snapshotEvents(), 'plan/handoff')
    expect(detachSession).toHaveBeenCalledWith(handoff.data.childSessionId)
    expect(dispose).toHaveBeenCalledOnce()
    expect(childSteered).toHaveLength(0)
    expect(sourceSteered).toHaveLength(0)
  })

  it('steers without a workspace when the source path has none registered', async () => {
    const { ctx, source, childSteered } = await clearHarness({ withWorkspace: true, workspaceMissing: true })
    const result = await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(result.kind).toBe('cleared')
    expect(childSteered).toHaveLength(1)
  })

  it('rolls back without detaching when no workspace was ever attached', async () => {
    const { ctx, source, detachSession, dispose } = await clearHarness({ steerError: new Error('steer rejected') })
    await expect(clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')).rejects.toThrow('steer rejected')
    expect(detachSession).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('reports both rollback failures without masking the handoff failure', async () => {
    const { ctx, source, detachSession, dispose } = await clearHarness({
      withWorkspace: true,
      steerError: new Error('steer rejected'),
      detachError: new Error('detach failed'),
      disposeError: new Error('dispose failed'),
    })
    await expect(clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')).rejects.toThrow('steer rejected')
    expect(detachSession).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('falls back to the source session when no agent factory is composed at all', async () => {
    const { ctx, source, sourceSteered } = await clearHarness({ withoutAgents: true })
    const result = await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(result).toEqual({ kind: 'cleared-fallback' })
    expect(sourceSteered).toHaveLength(1)
  })

  it('falls back to the source session only when the child was never created', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('source-uncreated'))
    const sourceSteered: UserMessage[] = []
    const source = {
      id: session.id,
      session,
      options: { provider: 'mock', model: 'mock' },
      status: 'idle',
      steer: (message: UserMessage) => { sourceSteered.push(message) },
    } as unknown as Agent & { session: Session }
    const dispose = vi.fn(() => Promise.resolve())
    ctx.provide('agents', { create: () => Promise.reject(new Error('no agent factory registered')) } as never)
    const result = await clearThenExecute(ctx, source, '# Title\n\nDo the work.', 'Title')
    expect(result).toEqual({ kind: 'cleared-fallback' })
    expect(dispose).not.toHaveBeenCalled()
    expect(sourceSteered).toHaveLength(1)
  })
})
