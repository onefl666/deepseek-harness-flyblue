// @vitest-environment jsdom
/**
 * One listing's page lifecycle: the newest read wins, and a mutation
 * reconciles from the reply the Host returns.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRemoteList, type RemoteList, type RemoteListReply } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

interface View { readonly items: readonly string[] }

/**
 * Render the hook the way a section consumes it: a probe component holding the
 * live controller, so a test can drive refreshes and mutations by hand.
 */
function probe(list: (scope: string) => Promise<RemoteListReply<View>>) {
  const holder: { current?: RemoteList<View> } = {}
  function Probe(): null {
    holder.current = useRemoteList(list, 'user')
    return null
  }
  render(<Probe />)
  return holder
}

const ready = (items: string[]): RemoteListReply<View> => ({ ok: true, value: { items } })

describe('useRemoteList', () => {
  it('reads on mount and publishes the listing', async () => {
    const list = vi.fn(async () => ready(['a']))
    const holder = probe(list)

    await waitFor(() => { expect(holder.current?.view).toEqual({ status: 'ready', value: { items: ['a'] } }) })
    expect(list).toHaveBeenCalledWith('user')
    expect(holder.current?.busy).toBe(false)
  })

  it('records a failed read as the failure branch', async () => {
    const holder = probe(async () => ({ ok: false, error: { message: 'registry unreadable' } }))

    await waitFor(() => {
      expect(holder.current?.view).toEqual({ status: 'error', message: 'registry unreadable' })
    })
  })

  it('drops a reply a mutation already retired', async () => {
    let settle!: (result: RemoteListReply<View>) => void
    const list = vi.fn(() => new Promise<RemoteListReply<View>>((resolve) => { settle = resolve }))
    const holder = probe(list)

    act(() => { holder.current?.adopt(ready(['fresh'])) })
    act(() => { settle(ready(['stale'])) })

    await waitFor(() => { expect(holder.current?.view).toEqual({ status: 'ready', value: { items: ['fresh'] } }) })
    // The retired read ends with it: the chrome must not stay busy.
    expect(holder.current?.busy).toBe(false)
  })

  it('announces a settled mutation and clears its in-flight row', () => {
    const holder = probe(async () => ready([]))

    act(() => { holder.current?.begin('alpha') })
    expect(holder.current?.removing).toBe('alpha')

    act(() => { holder.current?.applied(ready(['beta']), 'alpha', 'removed {name}') })

    expect(holder.current?.removing).toBeUndefined()
    expect(holder.current?.toast?.text).toBe('removed alpha')
    expect(holder.current?.view).toEqual({ status: 'ready', value: { items: ['beta'] } })

    act(() => { holder.current?.dismissToast() })
    expect(holder.current?.toast).toBeNull()
  })

  it('records a failed mutation without announcing one', () => {
    const holder = probe(async () => ready([]))

    act(() => { holder.current?.begin('alpha') })
    act(() => { holder.current?.applied({ ok: false, error: { message: 'still mounted' } }, 'alpha', 'removed {name}') })

    expect(holder.current?.error).toBe('still mounted')
    expect(holder.current?.toast).toBeNull()
    expect(holder.current?.removing).toBeUndefined()
  })

  it('replays an announcement raised twice with the same text', () => {
    const holder = probe(async () => ready([]))

    act(() => { holder.current?.announce('same') })
    const first = holder.current?.toast?.seq ?? 0
    act(() => { holder.current?.announce('same') })

    expect(holder.current?.toast?.seq).toBeGreaterThan(first)
  })

  it('re-reads when the scope changes', async () => {
    const list = vi.fn(async (scope: string) => ready([scope]))
    const holder: { current?: RemoteList<View> } = {}
    function Probe({ scope }: { scope: string }): null {
      holder.current = useRemoteList(list, scope)
      return null
    }
    const view = render(<Probe scope="user" />)
    await waitFor(() => { expect(holder.current?.view).toEqual({ status: 'ready', value: { items: ['user'] } }) })

    view.rerender(<Probe scope="workspace" />)

    await waitFor(() => { expect(holder.current?.view).toEqual({ status: 'ready', value: { items: ['workspace'] } }) })
  })
})
