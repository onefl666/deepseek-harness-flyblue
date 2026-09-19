// @vitest-environment jsdom
/**
 * The plan-handoff follow policy: a live `plan/handoff` on the Session on
 * screen selects the execution session it names, whether that child is already
 * listed or arrives later. History replay never moves the user, a live handoff
 * on another Session is ignored, and a user who navigates away after the event
 * does not cancel the pending open.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type {
  SessionLiveEventEntry, SessionTransientEventEntry,
} from '@deepseek-ai/dsh-api-session-controller/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LlmAttemptId } from '@deepseek-ai/dsh-llm/brand'
import { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session/types'
import { followPlanHandoff } from '../src/client/handoff-navigation.ts'

const PLAN = 'plan-session' as SessionId
const EXECUTION = 'execution-session' as SessionId
const OTHER = 'other-session' as SessionId

let runtime: SlotTestRuntime | undefined

afterEach(async () => {
  await runtime?.dispose()
  runtime = undefined
})

/** One durable live `plan/handoff` naming the execution session. */
function handoff(childSessionId: string, seq: number): SessionLiveEventEntry {
  return {
    type: 'event',
    event: {
      type: 'plan/handoff',
      seq: SessionSeq(seq),
      time: seq,
      data: { childSessionId: childSessionId as SessionId, mode: 'clear' },
    },
  }
}

/** One client-only Assistant frame: a live append that is not a durable event. */
function liveChunk(seq: number): SessionTransientEventEntry {
  return {
    type: 'transient',
    event: {
      type: 'assistant/live-chunk',
      seq,
      time: seq,
      data: {
        attemptId: LlmAttemptId('attempt-1'),
        turn: 1,
        step: 1,
        chunk: { type: 'text-delta', index: 0, text: 'live' },
      },
    },
  }
}

/** Sessions the policy selected, in call order. */
function opened(rt: SlotTestRuntime): readonly unknown[] {
  return rt.sessions.calls.filter(call => call.method === 'open').map(call => call.args[0])
}

/** One planning Session already selected on screen. */
async function boot(): Promise<SlotTestRuntime> {
  runtime = await SlotTestRuntime.create()
  await runtime.sessions.add({ id: PLAN }, { current: true })
  return runtime
}

describe('plan handoff follow', () => {
  it('opens the execution session when the list already carries it', async () => {
    const rt = await boot()
    const dispose = followPlanHandoff(rt.sessions)
    await rt.sessions.add({ id: EXECUTION }, { current: false })

    await rt.sessions.appendEvent(PLAN, handoff(EXECUTION, 2))
    expect(opened(rt)).toEqual([EXECUTION])
    dispose()
  })

  it('waits for a late execution session to reach the list', async () => {
    const rt = await boot()
    const dispose = followPlanHandoff(rt.sessions)

    await rt.sessions.appendEvent(PLAN, handoff(EXECUTION, 2))
    expect(opened(rt)).toEqual([])

    await rt.sessions.add({ id: EXECUTION }, { current: false })
    expect(opened(rt)).toEqual([EXECUTION])
    dispose()
  })

  it('does not follow history that already carries a handoff', async () => {
    const rt = await boot()
    await rt.sessions.add({ id: EXECUTION }, { current: false })
    const dispose = followPlanHandoff(rt.sessions)

    await rt.sessions.replaceEvents(PLAN, [handoff(EXECUTION, 2)])
    await rt.sessions.prependEvents(PLAN, [handoff(EXECUTION, 1)])
    expect(opened(rt)).toEqual([])
    dispose()
  })

  it('ignores a live handoff on a session that is not on screen', async () => {
    const rt = await boot()
    await rt.sessions.add({ id: EXECUTION }, { current: false })
    await rt.sessions.add({ id: OTHER }, { current: false })
    const dispose = followPlanHandoff(rt.sessions)

    await rt.sessions.setCurrent(OTHER)
    await rt.sessions.appendEvent(PLAN, handoff(EXECUTION, 2))
    expect(opened(rt)).toEqual([])
    dispose()
  })

  it('keeps a pending execution session after the user switches away', async () => {
    const rt = await boot()
    await rt.sessions.add({ id: OTHER }, { current: false })
    const dispose = followPlanHandoff(rt.sessions)

    await rt.sessions.appendEvent(PLAN, handoff(EXECUTION, 2))
    await rt.sessions.setCurrent(OTHER)
    await rt.sessions.add({ id: EXECUTION }, { current: false })
    expect(opened(rt)).toEqual([EXECUTION])
    dispose()
  })

  it('ignores live entries that are not plan handoffs', async () => {
    const rt = await boot()
    const dispose = followPlanHandoff(rt.sessions)

    rt.sessions.behavior(PLAN).eventSource.append(liveChunk(1.5))
    await rt.sessions.appendEvent(PLAN, {
      type: 'event',
      event: { type: 'turn/start', seq: SessionSeq(2), time: 2, data: { turn: 1 } },
    })
    expect(opened(rt)).toEqual([])
    dispose()
  })

  it('stops following once the plugin effect is disposed', async () => {
    const rt = await boot()
    const dispose = followPlanHandoff(rt.sessions)

    dispose()
    await rt.sessions.appendEvent(PLAN, handoff(EXECUTION, 2))
    await rt.sessions.add({ id: EXECUTION }, { current: false })
    expect(opened(rt)).toEqual([])
  })
})
