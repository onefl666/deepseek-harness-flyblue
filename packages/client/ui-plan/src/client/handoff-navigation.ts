/**
 * Follow the execution session a clear plan handoff opens.
 *
 * The planning session logs `plan/handoff` once its approved plan runs in a
 * fresh session, and that child may reach the Session list before or after the
 * event: a listed child opens on the spot, a late one opens when the list
 * carries it. Only a live append on the session on screen commits the
 * navigation, so opening a session whose log already holds a handoff never
 * moves the user; the user navigating away after the event does not cancel the
 * pending open.
 */

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: the plan domain declares `plan/handoff` on SessionEventMap.
import type {} from '@deepseek-ai/dsh-plan-handoff/client'

/**
 * Watch the selected session for a clear plan handoff and select the execution
 * session it names.
 * @param sessions - the Client sessions service.
 * @returns teardown removing both subscriptions.
 */
export function followPlanHandoff(sessions: ISessions): () => void {
  /** Session whose live event window is subscribed. */
  let watched: SessionId | undefined
  let unsubscribeEvents: (() => void) | undefined
  /** Execution session logged by a live handoff, not yet listed. */
  let execution: SessionId | undefined

  const openExecution = (): void => {
    if (execution === undefined || !sessions.list.getSnapshot().ids.includes(execution)) return
    const child = execution
    execution = undefined
    sessions.open(child)
  }

  const watchCurrent = (): void => {
    const current = sessions.list.getSnapshot().current
    if (current === watched && unsubscribeEvents !== undefined) return
    unsubscribeEvents?.()
    unsubscribeEvents = undefined
    watched = current
    if (current === undefined) return
    const feed = sessions.binding(current)?.eventSource
    if (feed === undefined) return
    unsubscribeEvents = feed.subscribe(() => {
      const change = feed.getSnapshot().change
      if (change.kind !== 'append') return
      for (const entry of change.entries) {
        if (entry.type !== 'event' || entry.event.type !== 'plan/handoff') continue
        execution = entry.event.data.childSessionId
      }
      openExecution()
    })
  }

  const unsubscribeList = sessions.list.subscribe(() => {
    watchCurrent()
    openExecution()
  })
  watchCurrent()
  return () => {
    unsubscribeEvents?.()
    unsubscribeList()
  }
}
