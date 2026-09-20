// @vitest-environment jsdom
/** ScopePicker: the toolbar control naming which scope a section reads. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScopePicker } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

const LABELS = { aria: 'Scope', user: 'All sessions', noWorkspace: 'No workspace' }
const WORKSPACES = [
  { workspaceId: 'w1', title: 'Harness', path: '/repo/harness' },
  { workspaceId: 'w2', title: 'Docs', path: '/repo/docs' },
]

function picker(scope: { kind: 'user' } | { kind: 'workspace'; workspaceId: string }) {
  const onSelect = vi.fn()
  render(
    <ScopePicker
      workspaces={WORKSPACES}
      scope={scope}
      icon={<svg data-testid="glyph" />}
      labels={LABELS}
      onSelect={onSelect}
    />,
  )
  return { onSelect }
}

describe('ScopePicker', () => {
  it('names the user scope and marks it selected', () => {
    picker({ kind: 'user' })

    expect(screen.getByRole('button', { name: 'Scope' }).textContent).toContain('All sessions')
    expect(screen.getByTestId('glyph')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Scope' }))
    expect(screen.getByRole('menuitem', { name: 'All sessions' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Harness' })).toBeTruthy()
  })

  it('names the chosen workspace by its title', () => {
    picker({ kind: 'workspace', workspaceId: 'w2' })

    expect(screen.getByRole('button', { name: 'Scope' }).textContent).toContain('Docs')
  })

  it('falls back to the no-workspace label when the choice is gone', () => {
    picker({ kind: 'workspace', workspaceId: 'missing' })

    expect(screen.getByRole('button', { name: 'Scope' }).textContent).toContain('No workspace')
  })

  it('reports the picked workspace and closes the menu', () => {
    const { onSelect } = picker({ kind: 'user' })

    fireEvent.click(screen.getByRole('button', { name: 'Scope' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Harness' }))

    expect(onSelect).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'w1' })
    expect(screen.queryByRole('menuitem', { name: 'Harness' })).toBeNull()
  })

  it('reports a return to the user scope', () => {
    const { onSelect } = picker({ kind: 'workspace', workspaceId: 'w1' })

    fireEvent.click(screen.getByRole('button', { name: 'Scope' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'All sessions' }))

    expect(onSelect).toHaveBeenCalledWith({ kind: 'user' })
  })

  it('toggles shut on a second press of the trigger', () => {
    const { onSelect } = picker({ kind: 'user' })
    const trigger = screen.getByRole('button', { name: 'Scope' })

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the chosen row in the open menu', () => {
    picker({ kind: 'workspace', workspaceId: 'w2' })

    fireEvent.click(screen.getByRole('button', { name: 'Scope' }))

    // The menu marks a selection with its trailing check, not a checked state.
    const marked = screen.getByRole('menuitem', { name: 'Docs' })
    expect(marked.querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Harness' }).querySelector('svg')).toBeNull()
  })
})
