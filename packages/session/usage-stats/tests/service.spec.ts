import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import SessionPersistence, { SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import UsageStatsService from '../src/index.ts'

interface Stored { header: SessionHeader; revision: string; events: SessionEvent[] }

class FakePersistence extends SessionPersistence {
  readonly supportsRawArtifacts = false
  readonly stored = new Map<string, Stored>()
  inspections = 0
  active = 0
  maxActive = 0
  fail?: unknown
  locate(): undefined { return undefined }
  async create(): Promise<void> {}
  async append(): Promise<void> {}
  async load(id: ReturnType<typeof SessionId>) { return this.inspect(id) }
  async inspect(id: ReturnType<typeof SessionId>) {
    this.inspections++
    this.active++
    this.maxActive = Math.max(this.maxActive, this.active)
    await new Promise(resolve => setTimeout(resolve, 1))
    this.active--
    if (this.fail !== undefined) throw this.fail
    const value = this.stored.get(id)
    if (value === undefined) throw new Error('missing')
    return { meta: value.header, events: value.events }
  }
  async readFrom(id: ReturnType<typeof SessionId>, fromSeq: number) {
    const value = await this.inspect(id)
    return { meta: value.meta, events: [...value.events.slice(fromSeq)] }
  }
  async list(): Promise<SessionHeader[]> { return [...this.stored.values()].map(value => value.header) }
  async listSnapshots() {
    return [...this.stored.values()].map(value => ({
      header: value.header,
      revision: SessionPersistenceRevision(value.revision),
    }))
  }
}

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function harness(concurrency = 2) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(FakePersistence)
  await ctx.plugin(UsageStatsService, { inspectConcurrency: concurrency })
  return { ctx, persistence: ctx.sessionPersistence as FakePersistence }
}

function stored(id: string, revision: string, time: number): Stored {
  const sessionId = SessionId(id)
  return {
    header: { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: time }, revision,
    events: [{ type: 'user/message', seq: 0, time, data: { id: `m-${id}`, role: 'user', content: [{ type: 'text', text: id }], source: { kind: 'user' } }, surfaceOp: 'append' } as SessionEvent],
  }
}

describe('UsageStatsService', () => {
  it('unions live and cold sessions, lets live identity win, and reuses revisions', async () => {
    const { ctx, persistence } = await harness()
    const now = Date.now()
    const live = ctx.sessions.create(SessionId('same'))
    live.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'live' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    persistence.stored.set('same', stored('same', 'r1', now))
    persistence.stored.set('cold', stored('cold', 'r1', now))
    const first = await ctx.usageStats.stats({ days: 7 })
    expect(first).toMatchObject({ sessionCount: 2, messageCount: 2 })
    expect(persistence.inspections).toBe(1)
    await ctx.usageStats.stats({ days: 7 })
    expect(persistence.inspections).toBe(1)
    persistence.stored.get('cold')!.revision = 'r2'
    await ctx.usageStats.stats({ days: 7 })
    expect(persistence.inspections).toBe(2)
  })

  it('bounds cold inspection concurrency and skips failed inspections', async () => {
    const { ctx, persistence } = await harness(2)
    const now = Date.now()
    for (let index = 0; index < 6; index++) persistence.stored.set(`s${index}`, stored(`s${index}`, 'r1', now))
    await ctx.usageStats.stats({ days: 30 })
    expect(persistence.maxActive).toBe(2)
    persistence.stored.get('s0')!.revision = 'r2'
    persistence.fail = new Error('inspection failed')
    const snapshot = await ctx.usageStats.stats({ days: 30 })
    expect(snapshot.skippedSessions).toEqual([{ id: 's0', error: 'inspection failed' }])
    expect(snapshot.messageCount).toBe(5)
    const inspections = persistence.inspections
    await ctx.usageStats.stats({ days: 30 })
    expect(persistence.inspections).toBe(inspections)
    expect(persistence.maxActive).toBe(2)
  })

  it('re-inspects a failed session once its revision changes', async () => {
    const { ctx, persistence } = await harness()
    const now = Date.now()
    persistence.stored.set('s0', stored('s0', 'r1', now))
    persistence.stored.set('s1', stored('s1', 'r1', now))
    persistence.fail = new Error('inspection failed')
    const failed = await ctx.usageStats.stats({ days: 7 })
    expect(failed.skippedSessions).toEqual([
      { id: 's0', error: 'inspection failed' },
      { id: 's1', error: 'inspection failed' },
    ])
    expect(persistence.inspections).toBe(2)
    persistence.fail = undefined
    persistence.stored.get('s0')!.revision = 'r2'
    const partiallyHealed = await ctx.usageStats.stats({ days: 7 })
    expect(partiallyHealed.skippedSessions).toEqual([{ id: 's1', error: 'inspection failed' }])
    expect(partiallyHealed.messageCount).toBe(1)
    expect(persistence.inspections).toBe(3)
    persistence.stored.get('s1')!.revision = 'r2'
    const healed = await ctx.usageStats.stats({ days: 7 })
    expect(healed.skippedSessions).toEqual([])
    expect(healed.messageCount).toBe(2)
  })

  it('reports non-Error inspection failures through String()', async () => {
    const { ctx, persistence } = await harness()
    persistence.stored.set('s0', stored('s0', 'r1', Date.now()))
    persistence.fail = 'broken'
    const snapshot = await ctx.usageStats.stats({ days: 7 })
    expect(snapshot.skippedSessions).toEqual([{ id: 's0', error: 'broken' }])
  })

  it('skips a live session whose fold fails', async () => {
    const { ctx, persistence } = await harness()
    const now = Date.now()
    const live = ctx.sessions.create(SessionId('broken-live'))
    live.append('assistant/message', {
      turn: 0,
      step: 0,
      message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider: 'p', model: 'm' } }),
      usage: { inputTokens: -1, outputTokens: 0 },
    }, { surfaceOp: 'append' })
    persistence.stored.set('good', stored('good', 'r1', now))
    const first = await ctx.usageStats.stats({ days: 7 })
    expect(first.skippedSessions).toEqual([{ id: 'broken-live', error: 'usage-stats: event 0 has invalid token usage' }])
    expect(first.messageCount).toBe(1)
    const second = await ctx.usageStats.stats({ days: 7 })
    expect(second.skippedSessions).toEqual(first.skippedSessions)
    expect(second.messageCount).toBe(1)
  })

  it('prunes disappeared cache entries', async () => {
    const { ctx, persistence } = await harness()
    persistence.stored.set('cold', stored('cold', 'r1', Date.now()))
    await ctx.usageStats.stats({ days: 7 })
    persistence.stored.clear()
    await ctx.usageStats.stats({ days: 7 })
    persistence.stored.set('cold', stored('cold', 'r1', Date.now()))
    await ctx.usageStats.stats({ days: 7 })
    expect(persistence.inspections).toBe(2)
  })
})
