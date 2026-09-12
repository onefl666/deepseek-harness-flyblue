// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsageStatsSection } from '../src/client/section.tsx'
import type { UsageStatsInjected } from '../src/client/section.tsx'
import { BUCKETS, model, range, translate } from './fixtures.client.ts'
import type { Stats, UsageDay } from '../src/client/types.ts'

afterEach(cleanup)

const t = translate as never

/**
 * A dense snapshot for one range.
 * @param days - inclusive range length.
 * @param at - optional per-day overrides, indexed from the oldest day.
 * @returns the Host snapshot the section consumes.
 */
function snapshot(days: 7 | 30, at: (index: number) => Partial<UsageDay> = () => ({})): Stats {
  const daily = range('2026-09-09', days, at)
  return {
    days,
    timeZone: 'UTC',
    startDate: daily[0]?.date ?? '',
    endDate: daily.at(-1)?.date ?? '',
    generatedAt: new Date('2026-09-09T12:00:00Z').getTime(),
    ...BUCKETS,
    totalTokens: 1_234_567,
    sessionCount: 2,
    messageCount: 4,
    activeDays: 2,
    currentStreakDays: 1,
    daily,
    models: [model(1, 40), model(2, 20)],
    skippedSessions: [],
  }
}

const ok = (value: Stats) => Promise.resolve({ ok: true as const, value })
const renderSection = (stats: UsageStatsInjected['stats']) =>
  render(<UsageStatsSection t={t} stats={stats} />)

describe('UsageStatsSection', () => {
  it('shows a stable skeleton, then the strip, charts, and detail tables', async () => {
    let resolve!: (value: Awaited<ReturnType<UsageStatsInjected['stats']>>) => void
    const stats = vi.fn<UsageStatsInjected['stats']>(() => new Promise((done) => { resolve = done }))
    renderSection(stats)
    expect(screen.getByLabelText('loading').getAttribute('aria-busy')).toBe('true')
    resolve({ ok: true, value: snapshot(30) })
    await waitFor(() => { expect(screen.getByText('kpi.tokens')).toBeTruthy() })
    expect(screen.getByText('activity.title')).toBeTruthy()
    expect(screen.getByRole('img', { name: /models\.summary/ })).toBeTruthy()
    fireEvent.click(screen.getByText('details'))
    expect(screen.getByText('models.table')).toBeTruthy()
    expect(screen.getByText('daily.table')).toBeTruthy()
  })

  it('shows the exact figure behind a compacted KPI value', async () => {
    renderSection(() => ok(snapshot(30)))
    const value = await screen.findByLabelText('1,234,567')
    fireEvent.mouseEnter(value)
    expect(screen.getByRole('tooltip').textContent).toBe('1,234,567')
  })

  it('switches ranges and refreshes without hiding the retained result', async () => {
    let secondResolve!: (value: Awaited<ReturnType<UsageStatsInjected['stats']>>) => void
    const stats = vi.fn((_request: { days: 7 | 30 }) => stats.mock.calls.length === 1
      ? ok(snapshot(30))
      : new Promise((done) => { secondResolve = done }))
    renderSection(stats as UsageStatsInjected['stats'])
    await screen.findByText('kpi.tokens')
    fireEvent.click(screen.getByRole('button', { name: 'range.7' }))
    expect(screen.getByText('updating')).toBeTruthy()
    expect(screen.getByText('kpi.tokens')).toBeTruthy()
    secondResolve({ ok: true, value: snapshot(7) })
    await waitFor(() => { expect(stats).toHaveBeenLastCalledWith({ days: 7 }) })
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    expect(stats).toHaveBeenLastCalledWith({ days: 7 })
  })

  it('ignores a click on the range already shown', async () => {
    const stats = vi.fn<UsageStatsInjected['stats']>(() => ok(snapshot(30)))
    renderSection(stats)
    await screen.findByText('kpi.tokens')
    fireEvent.click(screen.getByRole('button', { name: 'range.30' }))
    expect(stats).toHaveBeenCalledTimes(1)
  })

  it('keeps old data on failure and exposes retry', async () => {
    const stats = vi.fn()
      .mockImplementationOnce(() => ok(snapshot(30)))
      .mockResolvedValueOnce({ ok: false, error: { name: 'Error', message: 'disk offline' } })
      .mockImplementationOnce(() => ok(snapshot(30)))
    renderSection(stats as UsageStatsInjected['stats'])
    await screen.findByText('kpi.tokens')
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await screen.findByText(/disk offline/)
    expect(screen.getByText('kpi.tokens')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => { expect(stats).toHaveBeenCalledTimes(3) })
  })

  it('ignores an older response after a newer range selection', async () => {
    const pending: ((value: Awaited<ReturnType<UsageStatsInjected['stats']>>) => void)[] = []
    let callCount = 0
    const stats = vi.fn<UsageStatsInjected['stats']>(() => {
      callCount++
      return callCount === 1 ? ok(snapshot(30)) : new Promise((done) => { pending.push(done) })
    })
    renderSection(stats)
    await screen.findByText('kpi.tokens')
    fireEvent.click(screen.getByRole('button', { name: 'range.7' }))
    fireEvent.click(screen.getByRole('button', { name: 'range.30' }))
    pending[1]?.({ ok: true, value: { ...snapshot(30), messageCount: 30 } })
    pending[0]?.({ ok: true, value: { ...snapshot(7), messageCount: 7 } })
    await waitFor(() => {
      const list = screen.getByRole('list', { name: 'activity.title' })
      expect(list.children).toHaveLength(30)
    })
  })

  it('pops a toast and lists skipped sessions while keeping the dashboard', async () => {
    const skippedSessions = [{ id: 's-1', error: 'contains unknown event type' }]
    renderSection(() => ok({ ...snapshot(30), skippedSessions }))
    await screen.findByText('kpi.tokens')
    expect(screen.getByRole('alert').textContent).toContain('skipped.toast')
    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('skipped.notice')
    expect(notice.textContent).toContain('s-1: contains unknown event type')
    expect(screen.getByText('kpi.tokens')).toBeTruthy()
  })

  it('clears the notice when the next load skips nothing', async () => {
    const stats = vi.fn()
      .mockImplementationOnce(() => ok({ ...snapshot(30), skippedSessions: [{ id: 's-1', error: 'bad' }] }))
      .mockImplementationOnce(() => ok(snapshot(30)))
    renderSection(stats as UsageStatsInjected['stats'])
    await screen.findByText('kpi.tokens')
    expect(screen.getByRole('status')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => { expect(screen.queryByRole('status')).toBeNull() })
  })

  it('dismisses the toast after its display cycle', async () => {
    vi.useFakeTimers()
    try {
      renderSection(() => ok({ ...snapshot(30), skippedSessions: [{ id: 's-1', error: 'bad' }] }))
      await act(async () => {})
      expect(screen.getByRole('alert')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(4000) })
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('names the governing control and keeps the kept figures in step with it', async () => {
    renderSection(() => ok(snapshot(7)))
    await screen.findByText('kpi.tokens')
    const control = screen.getByRole('button', { name: 'range.7' })
    expect(control.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('range.label')).toBeTruthy()
    const active = screen.getByText(/kpi\.activeOf/)
    expect(active.textContent).toContain('active=2')
    expect(active.textContent).toContain('total=7')
  })

  it('shows explicit no-usage copy while retaining message activity', async () => {
    const emptyBuckets = {
      uncachedInputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    }
    renderSection(() => ok({
      ...snapshot(7),
      totalTokens: 0,
      models: [],
      daily: snapshot(7).daily.map(value => ({ ...value, ...emptyBuckets, totalTokens: 0 })),
    }))
    expect(await screen.findByText('trend.noUsage')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('activity.noUsage')
    expect(screen.getByText('models.empty')).toBeTruthy()
  })

  it('reports a range with no activity at all', async () => {
    renderSection(() => ok({
      ...snapshot(7),
      totalTokens: 0,
      messageCount: 0,
      activeDays: 0,
      models: [],
      daily: snapshot(7).daily.map(value => ({
        ...value,
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        messageCount: 0,
      })),
    }))
    expect(await screen.findByText('activity.empty')).toBeTruthy()
    expect(screen.getByText('trend.empty')).toBeTruthy()
  })
})
