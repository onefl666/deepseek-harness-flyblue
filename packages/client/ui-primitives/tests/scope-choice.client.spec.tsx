// @vitest-environment jsdom
/**
 * Scope choice: which workspace, if any, a manager settings section reads.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useScopeChoice, type ScopeChoice } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

const WORKSPACES = [
  { workspaceId: 'w1', title: 'Harness', path: '/repo/harness' },
  { workspaceId: 'w2', title: 'Docs', path: '/repo/docs' },
]

/** Render the hook the way a section consumes it, exposing the live choice. */
function probe(workspaces = WORKSPACES) {
  const holder: { current?: ScopeChoice } = {}
  function Probe({ tick }: { tick: number }): null {
    holder.current = useScopeChoice(workspaces)
    void tick
    return null
  }
  const view = render(<Probe tick={0} />)
  return {
    holder,
    /** Re-render the probe without changing anything the hook depends on. */
    rerender: (tick: number) => { view.rerender(<Probe tick={tick} />) },
  }
}

describe('useScopeChoice', () => {
  it('opens on the user scope', () => {
    const { holder } = probe()

    expect(holder.current?.scope).toEqual({ kind: 'user' })
    expect(holder.current?.picked).toEqual({ kind: 'user' })
    expect(holder.current?.blocked).toBe(false)
    expect(holder.current?.workspaces).toBe(WORKSPACES)
  })

  it('resolves the picked workspace to its directory', () => {
    const { holder } = probe()

    act(() => { holder.current?.select({ kind: 'workspace', workspaceId: 'w2' }) })

    expect(holder.current?.scope).toEqual({ kind: 'workspace', cwd: '/repo/docs' })
    expect(holder.current?.picked).toEqual({ kind: 'workspace', workspaceId: 'w2' })
    expect(holder.current?.blocked).toBe(false)
  })

  it('returns to the user scope on a later pick', () => {
    const { holder } = probe()

    act(() => { holder.current?.select({ kind: 'workspace', workspaceId: 'w1' }) })
    act(() => { holder.current?.select({ kind: 'user' }) })

    expect(holder.current?.scope).toEqual({ kind: 'user' })
    expect(holder.current?.picked).toEqual({ kind: 'user' })
  })

  it('reads the user scope while the choice names no offered workspace', () => {
    const { holder } = probe([])

    act(() => { holder.current?.select({ kind: 'workspace', workspaceId: 'gone' }) })

    expect(holder.current?.scope).toEqual({ kind: 'user' })
    expect(holder.current?.picked).toEqual({ kind: 'user' })
    expect(holder.current?.blocked).toBe(true)
  })

  it('keeps its identity across renders, because a section reads the listing by it', () => {
    const { holder, rerender } = probe()
    const before = holder.current

    rerender(1)

    // A fresh object per render would re-read the listing on every render.
    expect(holder.current).toBe(before)
  })
})
