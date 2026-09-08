/** Historical local-session usage statistics. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionPersistenceRevision, SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import { buildUsageSnapshot, createSessionUsageProjection, foldSessionUsage } from './projection.ts'
import type { SessionUsageProjection } from './projection.ts'
import type { UsageStatsRequest, UsageStatsSkippedSession, UsageStatsSnapshot } from './types.ts'

export type { UsageStatsDay, UsageStatsDays, UsageStatsModel, UsageStatsRequest, UsageStatsSkippedSession, UsageStatsSnapshot, UsageTokenBuckets } from './types.ts'

/** Default number of cold session logs inspected concurrently. */
export const DEFAULT_INSPECT_CONCURRENCY = 4

/** Configures bounded cold-session inspection. */
export interface Config {
  /** Maximum persistence inspections in flight. */
  inspectConcurrency?: number
}

/** Runtime schema for usage-stat settings. */
export const Config: z<Config> = z.object({ inspectConcurrency: z.natural().min(1).max(32).default(DEFAULT_INSPECT_CONCURRENCY) })

declare module '@deepseek-ai/cordis' { interface Context { usageStats: UsageStatsService } }

type CachedSession =
  | { kind: 'live'; session: Session; projection: SessionUsageProjection }
  | { kind: 'cold'; revision: SessionPersistenceRevision; projection: SessionUsageProjection }
  | { kind: 'failed'; revision: SessionPersistenceRevision; error: string }

/** Normalize an arbitrary throw to a browser-safe message. */
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function mapConcurrent<T>(values: readonly T[], concurrency: number, run: (value: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next++
      const value = values[index]
      /* v8 ignore next -- the claimed index is always inside values. */
      if (value !== undefined) await run(value)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
}

/**
 * Derives browser-safe historical accounting from every interpretable local session log.
 * The service reads no credentials, plans, balances, prices, or quotas.
 * @typert service usageStats
 */
export class UsageStatsService extends TypertRemoteService {
  static inject = ['sessionPersistence', 'sessions']
  private readonly cache = new Map<SessionId, CachedSession>()
  private readonly inspectConcurrency: number

  /** @param ctx - Context carrying live sessions and durable persistence. @param config - Bounded inspection configuration. */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'usageStats')
    this.inspectConcurrency = config.inspectConcurrency ?? DEFAULT_INSPECT_CONCURRENCY
  }

  /**
   * Read one stored session's complete validated event log without taking
   * write ownership.
   * @param id - stored session to read.
   * @returns the contiguous events from sequence zero.
   */
  private async readStoredEvents(id: SessionId): Promise<readonly SessionEvent[]> {
    const handle = await this.ctx.sessionPersistence.open(id, 'read')
    try {
      return (await handle.read()).events
    } finally {
      await handle.close()
    }
  }

  /**
   * Read one consistent per-session scan for the requested Host calendar range.
   * A session whose log cannot be interpreted is skipped and listed in
   * `skippedSessions`; every other count omits it. Failures to list live
   * sessions or stored snapshots still reject the request.
   * @param request - Seven- or thirty-day inclusive range.
   * @returns Dense daily activity and provider-reported usage.
   */
  @Remote
  async stats(request: UsageStatsRequest): Promise<UsageStatsSnapshot> {
    const generatedAt = Date.now()
    const [liveSessions, storedSnapshots] = await Promise.all([
      Promise.resolve(this.ctx.sessions.list()),
      this.ctx.sessionPersistence.list(),
    ])
    const liveById = new Map(liveSessions.map(session => [session.id, session]))
    const storedById = new Map(storedSnapshots.map(snapshot => [snapshot.header.id, snapshot]))
    const present = new Set<SessionId>([...liveById.keys(), ...storedById.keys()])
    const skipped: UsageStatsSkippedSession[] = []
    for (const [id, session] of liveById) {
      const cached = this.cache.get(id)
      const projection = cached?.kind === 'live' && cached.session === session && cached.projection.seq <= session.seq
        ? cached.projection
        : createSessionUsageProjection()
      try {
        foldSessionUsage(projection, session.snapshotEvents().slice(projection.seq))
      } catch (error) {
        // The projection may be partially folded; drop it so the next scan rebuilds from sequence zero.
        this.cache.delete(id)
        skipped.push({ id, error: failureMessage(error) })
        continue
      }
      this.cache.set(id, { kind: 'live', session, projection })
    }
    const cold = [...storedById.values()].filter(snapshot => !liveById.has(snapshot.header.id))
    await mapConcurrent(cold, this.inspectConcurrency, async (snapshot: SessionPersistenceSnapshot) => {
      const cached = this.cache.get(snapshot.header.id)
      if (cached?.kind === 'cold' && cached.revision === snapshot.revision) return
      if (cached?.kind === 'failed' && cached.revision === snapshot.revision) {
        // The same revision inspects to the same unreadable log; reuse the recorded failure.
        skipped.push({ id: snapshot.header.id, error: cached.error })
        return
      }
      try {
        const inspected = await this.readStoredEvents(snapshot.header.id)
        const projection = foldSessionUsage(createSessionUsageProjection(), inspected)
        this.cache.set(snapshot.header.id, { kind: 'cold', revision: snapshot.revision, projection })
      } catch (error) {
        const message = failureMessage(error)
        this.cache.set(snapshot.header.id, { kind: 'failed', revision: snapshot.revision, error: message })
        skipped.push({ id: snapshot.header.id, error: message })
      }
    })
    for (const id of this.cache.keys()) if (!present.has(id)) this.cache.delete(id)
    const projections = [...present].map((id) => {
      const cached = this.cache.get(id)
      return cached !== undefined && cached.kind !== 'failed' ? cached.projection : createSessionUsageProjection()
    })
    return {
      ...buildUsageSnapshot(projections, request.days, generatedAt),
      skippedSessions: skipped.sort((left, right) => left.id.localeCompare(right.id)),
    }
  }
}

export default UsageStatsService
