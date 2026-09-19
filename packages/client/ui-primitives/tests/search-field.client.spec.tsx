// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchField } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

describe('SearchField', () => {
  it('names the input from the caller label and shows the caller placeholder', () => {
    render(
      <SearchField
        value=""
        label="Search skills"
        clearLabel="Clear search"
        placeholder="Search…"
        onChange={() => {}}
      />,
    )
    const input = screen.getByRole('searchbox', { name: 'Search skills' })
    expect(input.getAttribute('placeholder')).toBe('Search…')
  })

  it('reports every edit with the field text', () => {
    const onChange = vi.fn()
    render(<SearchField value="" label="Search" clearLabel="Clear" onChange={onChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beam' } })
    expect(onChange).toHaveBeenCalledWith('beam')
  })

  it('clears to the empty query from the named clear affordance', () => {
    const onChange = vi.fn()
    render(<SearchField value="beam" label="Search" clearLabel="Clear search" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('keeps the clear affordance mounted but out of the tab order while the query is empty', () => {
    const { rerender } = render(
      <SearchField value="" label="Search" clearLabel="Clear search" onChange={() => {}} />,
    )
    const clear = screen.getByRole('button', { name: 'Clear search' })
    expect(clear.getAttribute('data-empty')).toBe('true')
    expect(clear.getAttribute('tabindex')).toBe('-1')

    rerender(<SearchField value="beam" label="Search" clearLabel="Clear search" onChange={() => {}} />)
    expect(clear.getAttribute('data-empty')).toBeNull()
    expect(clear.getAttribute('tabindex')).toBe('0')
  })

  it('keeps a caller class alongside its own so a render site can place it', () => {
    const { container } = render(
      <SearchField value="" label="Search" clearLabel="Clear" className="placed" onChange={() => {}} />,
    )
    const field = container.firstElementChild
    expect(field?.classList.contains('placed')).toBe(true)
    expect(field?.classList.length).toBeGreaterThan(1)
  })
})
