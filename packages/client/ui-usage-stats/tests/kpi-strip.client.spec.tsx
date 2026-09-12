// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KpiStrip } from '../src/client/KpiStrip.tsx'
import type { KpiItem } from '../src/client/KpiStrip.tsx'

afterEach(cleanup)

const items: readonly KpiItem[] = [
  { key: 'tokens', label: 'Token 总量', value: '1.2M', exact: '1,234,567' },
  { key: 'streak', label: '当前连续活跃', value: '3', suffix: '天' },
]

describe('KpiStrip', () => {
  it('shows every value above its label', () => {
    const { container } = render(<KpiStrip items={items} />)
    const cells = [...container.querySelectorAll('article')]
    expect(cells).toHaveLength(2)
    expect(cells[0]?.textContent).toBe('1.2MToken 总量')
    expect(cells[1]?.textContent).toBe('3天当前连续活跃')
  })

  it('reveals the exact figure on hover and on focus, and names it for assistive tech', () => {
    render(<KpiStrip items={items} />)
    const value = screen.getByText('1.2M')
    expect(value.getAttribute('aria-label')).toBe('1,234,567')
    fireEvent.mouseEnter(value)
    expect(screen.getByRole('tooltip').textContent).toBe('1,234,567')
    fireEvent.mouseLeave(value)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(value)
    expect(screen.getByRole('tooltip').textContent).toBe('1,234,567')
  })

  it('adds no tooltip where the displayed value is already exact', () => {
    render(<KpiStrip items={items} />)
    fireEvent.mouseEnter(screen.getByText('3'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
