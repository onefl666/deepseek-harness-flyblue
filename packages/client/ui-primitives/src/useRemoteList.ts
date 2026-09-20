/**
 * One Remote listing's page lifecycle, shared by the settings sections that
 * read a manager's listing over the wire.
 *
 * A read carries the sequence it started at: a reply whose sequence has been
 * retired by a mutation or a newer read is dropped, so the page can never show
 * a listing older than one already applied. Mutations reconcile from the reply
 * the Host returns rather than predicting an outcome, which is the rule every
 * manager section follows.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * One read's reply, stated structurally so this package keeps its zero
 * protocol dependency: every Remote verb's `RemoteResult<V>` satisfies it, and
 * the only thing this hook reads from a reply is the discriminant, the value,
 * and the failure message.
 */
export type RemoteListReply<V> =
  | { readonly ok: true; readonly value: V }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** What a section renders for the current scope. */
export type RemoteListView<V> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: V }

/** One listing's lifecycle and the transient state every manager section shows around it. */
export interface RemoteList<V> {
  /** The listing to render: the in-flight first read, the last good reply, or the failure. */
  view: RemoteListView<V>
  /** Whether a read is in flight, for the section's busy chrome. */
  busy: boolean
  /** The last mutation failure; cleared by the next refresh, adoption, or success. */
  error: string | undefined
  /** The announcement a completed mutation raised, keyed so the same text replays. */
  toast: { seq: number; text: string } | null
  /** The item whose mutation is in flight. */
  removing: string | undefined
  /** Mark one item's mutation as in flight. */
  begin: (name: string) => void
  /** Raise one announcement. */
  announce: (text: string) => void
  /** Drop the announcement node once it has played. */
  dismissToast: () => void
  /** Re-read the listing, retiring any read already in flight. */
  refresh: () => void
  /**
   * Adopt one reply's listing: a success retires reads already in flight and
   * ends the busy state, since nothing is outstanding past it; a failure
   * records its message. The caller owns whatever else the operation settles.
   * @param result - the reply to adopt.
   * @returns the failure message, or null once the reply was adopted.
   */
  adopt: (result: RemoteListReply<V>) => string | null
  /**
   * Settle one row mutation: clear its in-flight mark, adopt the reply, and
   * announce the outcome.
   * @param result - the mutation's reply.
   * @param name - the item the mutation named.
   * @param template - announcement text carrying a `{name}` placeholder.
   */
  applied: (result: RemoteListReply<V>, name: string, template: string) => void
}

/**
 * Track one scope's Remote listing.
 * `list` must be stable for a given scope (the Remote inject face supplies it);
 * a new identity re-reads, which is what a scope change should do.
 * @param list - read the listing for `scope`.
 * @param scope - the scope the listing belongs to.
 * @returns the listing and the transient state around it.
 */
export function useRemoteList<V, S>(
  list: (scope: S) => Promise<RemoteListReply<V>>,
  scope: S,
): RemoteList<V> {
  const [view, setView] = useState<RemoteListView<V>>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const sequence = useRef(0)
  const toastSeq = useRef(0)

  const announce = useCallback((text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }, [])

  const refresh = useCallback((): void => {
    const seq = ++sequence.current
    setBusy(true)
    setError(undefined)
    void list(scope).then((result) => {
      if (seq !== sequence.current) return
      setBusy(false)
      if (result.ok) setView({ status: 'ready', value: result.value })
      else setView({ status: 'error', message: result.error.message })
    })
  }, [list, scope])

  useEffect(() => { refresh() }, [refresh])

  const adopt = useCallback((result: RemoteListReply<V>): string | null => {
    if (!result.ok) {
      setError(result.error.message)
      return result.error.message
    }
    sequence.current += 1
    setBusy(false)
    setError(undefined)
    setView({ status: 'ready', value: result.value })
    return null
  }, [])

  const applied = useCallback((result: RemoteListReply<V>, name: string, template: string): void => {
    setRemoving(undefined)
    if (adopt(result) !== null) return
    announce(template.replace('{name}', name))
  }, [adopt, announce])

  const dismissToast = useCallback(() => { setToast(null) }, [])

  return {
    view, busy, error, toast, removing, begin: setRemoving,
    announce, dismissToast, refresh, adopt, applied,
  }
}
