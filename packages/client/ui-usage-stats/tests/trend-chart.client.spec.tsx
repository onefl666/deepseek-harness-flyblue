// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrendChart } from '../src/client/TrendChart.tsx'
import { range, translate } from './fixtures.client.ts'
import type { UsageDay } from '../src/client/types.ts'

afterEach(cleanup)

const t = translate as never
const renderTrend = (days: readonly UsageDay[]) => render(<TrendChart t={t} days={days} summary="chart.summary" />)
/** The day columns are the focusable hit areas, in range order. */
const activeColumns = (): HTMLElement[] => [...document.querySelectorAll('span[tabindex="0"]')] as HTMLElement[]

describe('TrendChart', () => {
  it('plots one line per token bucket and labels the axis', () => {
    const { container } = renderTrend(range('2026-09-09', 7))
    expect(container.querySelectorAll('polyline')).toHaveLength(4)
    expect([...container.querySelectorAll('ol')].at(-1)?.textContent?.length).toBeGreaterThan(0)
  })

  it('reveals the day total and its bucket rows on hover', () => {
    renderTrend(range('2026-09-09', 7, index => ({ totalTokens: index === 6 ? 60 : 20 })))
    fireEvent.mouseEnter(activeColumns()[6] as HTMLElement)
    const card = screen.getByRole('tooltip')
    expect(card.textContent).toContain('trend.point')
    expect(card.querySelectorAll('i')).toHaveLength(4)
    expect(card.textContent).toContain('bucket.input')
  })

  it('places the crosshair and one dot per non-zero bucket, and clears them on leave', () => {
    const { container } = renderTrend(range('2026-09-09', 7))
    expect(container.querySelector('[class*="crosshair"]')).toBeNull()
    fireEvent.mouseEnter(activeColumns()[2] as HTMLElement)
    expect(container.querySelector('[class*="crosshair"]')).toBeTruthy()
    expect(container.querySelectorAll('[class*="points"] > i')).toHaveLength(4)
    fireEvent.mouseLeave(activeColumns()[2] as HTMLElement)
    expect(container.querySelector('[class*="crosshair"]')).toBeNull()
  })

  it('reveals the same day on keyboard focus and clears it on blur', () => {
    const { container } = renderTrend(range('2026-09-09', 7))
    fireEvent.focus(activeColumns()[0] as HTMLElement)
    expect(screen.getByRole('tooltip').textContent).toContain('trend.point')
    expect(container.querySelector('[class*="crosshair"]')).toBeTruthy()
    fireEvent.blur(activeColumns()[0] as HTMLElement)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('switches to stacked bars and back', () => {
    const { container } = renderTrend(range('2026-09-09', 7))
    expect(container.querySelectorAll('polyline')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'trend.form.stacked' }))
    expect(container.querySelectorAll('polyline')).toHaveLength(0)
    expect(container.querySelectorAll('[class*="stackValue"] > i').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'trend.form.line' }))
    expect(container.querySelectorAll('polyline')).toHaveLength(4)
  })

  it('recedes the stacked bars the legend is not pointing at', () => {
    const { container } = renderTrend(range('2026-09-09', 7))
    fireEvent.click(screen.getByRole('button', { name: 'trend.form.stacked' }))
    const legend = screen.getByRole('list', { name: 'trend.legend' })
    fireEvent.pointerEnter(legend.children[1] as HTMLElement)
    expect(container.querySelectorAll('[class*="stackValue"] > i[class*="dimmed"]')).toHaveLength(21)
    fireEvent.pointerLeave(legend.children[1] as HTMLElement)
    expect(container.querySelectorAll('[class*="stackValue"] > i[class*="dimmed"]')).toHaveLength(0)
  })

  it('recedes the series the legend is not pointing at', () => {
    const { container } = renderTrend(range('2026-09-09', 7))
    const legend = screen.getByRole('list', { name: 'trend.legend' })
    expect(container.querySelectorAll('[class*="dimmed"]')).toHaveLength(0)
    fireEvent.pointerEnter(legend.children[0] as HTMLElement)
    expect(container.querySelectorAll('polyline[class*="dimmed"]')).toHaveLength(3)
    fireEvent.pointerLeave(legend.children[0] as HTMLElement)
    expect(container.querySelectorAll('[class*="dimmed"]')).toHaveLength(0)
  })

  it('reports no provider usage while message activity remains', () => {
    renderTrend(range('2026-09-09', 7, index => ({
      totalTokens: 0,
      uncachedInputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      messageCount: index === 0 ? 0 : 2,
    })))
    expect(screen.getByText('trend.noUsage')).toBeTruthy()
  })

  it('reports an empty range when nothing happened at all', () => {
    renderTrend(range('2026-09-09', 7, () => ({
      totalTokens: 0,
      uncachedInputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      messageCount: 0,
    })))
    expect(screen.getByText('trend.empty')).toBeTruthy()
  })
})
