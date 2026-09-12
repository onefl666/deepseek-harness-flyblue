// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActivityHeatmap } from '../src/client/ActivityHeatmap.tsx'
import { day, translate } from './fixtures.client.ts'
import type { UsageDay } from '../src/client/types.ts'

afterEach(cleanup)

const t = translate as never
const renderHeatmap = (days: readonly UsageDay[]) => render(<ActivityHeatmap t={t} days={days} />)
const cells = (): HTMLElement[] => [...screen.getByRole('list', { name: 'activity.title' }).children]
  .map(item => item.firstElementChild as HTMLElement)

describe('ActivityHeatmap', () => {
  it('renders one cell per day, colored by thirds of the range maximum', () => {
    const days = [
      day('2026-09-07', { totalTokens: 0, messageCount: 0 }),
      day('2026-09-08', { totalTokens: 9 }),
      day('2026-09-09', { totalTokens: 30 }),
    ]
    renderHeatmap(days)
    expect(cells().map(cell => cell.getAttribute('data-level'))).toEqual(['0', '1', '3'])
  })

  it('names every cell with its date, tokens, and messages', () => {
    renderHeatmap([day('2026-09-09', { totalTokens: 160_000_000, messageCount: 27 })])
    expect(screen.getByRole('list', { name: 'activity.title' }).children[0]?.firstElementChild?.getAttribute('aria-label'))
      .toContain('activity.cell')
  })

  it('reveals the day detail on hover and hides it on leave', () => {
    renderHeatmap([day('2026-09-09', { totalTokens: 1_600_000, messageCount: 27 })])
    const cell = cells()[0] as HTMLElement
    fireEvent.mouseEnter(cell)
    const card = screen.getByRole('tooltip')
    expect(card.textContent).toContain('2026')
    expect(card.textContent).toContain('activity.detail')
    fireEvent.mouseLeave(cell)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('reveals the same detail on keyboard focus', () => {
    renderHeatmap([day('2026-09-09')])
    const cell = cells()[0] as HTMLElement
    fireEvent.focus(cell)
    expect(screen.getByRole('tooltip').textContent).toContain('activity.detail')
    fireEvent.blur(cell)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('reports the week total and the running total when the metric changes', () => {
    renderHeatmap([day('2026-09-07'), day('2026-09-08')])
    const cell = cells()[0] as HTMLElement
    fireEvent.click(screen.getByRole('button', { name: 'activity.metric.weekly' }))
    fireEvent.mouseEnter(cells()[0] as HTMLElement)
    expect(screen.getByRole('tooltip').textContent).toContain('activity.week')
    fireEvent.mouseLeave(cells()[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'activity.metric.cumulative' }))
    fireEvent.mouseEnter(cells()[0] as HTMLElement)
    expect(screen.getByRole('tooltip').textContent).toContain('activity.through')
    fireEvent.mouseLeave(cell)
  })

  it('says the range has no visible messages instead of drawing empty cells', () => {
    renderHeatmap([day('2026-09-09', { totalTokens: 0, messageCount: 0 })])
    expect(screen.getByText('activity.empty')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'activity.title' })).toBeNull()
  })

  it('keeps the grid and explains that no provider reported tokens', () => {
    renderHeatmap([day('2026-09-09', { totalTokens: 0, messageCount: 3 })])
    expect(screen.getByRole('status').textContent).toBe('activity.noUsage')
    expect(cells().map(cell => cell.getAttribute('data-level'))).toEqual(['0'])
  })
})
