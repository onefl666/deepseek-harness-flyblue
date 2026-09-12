import { describe, expect, it } from 'vitest'
import { activityCells, addDays } from '../src/client/activity.ts'
import { day } from './fixtures.client.ts'

// 2026-08-31 and 2026-09-07 are Mondays; 2026-09-01 through 2026-09-06 belong
// to the first of those weeks.
describe('addDays', () => {
  it('moves forward and backward across a month boundary', () => {
    expect(addDays('2026-09-09', 6)).toBe('2026-09-15')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-09-09', 0)).toBe('2026-09-09')
  })
})

describe('activityCells', () => {
  it('reports each day under its own totals for the daily metric', () => {
    const days = [day('2026-09-07', { totalTokens: 30, messageCount: 3 }), day('2026-09-08', { totalTokens: 9, messageCount: 1 })]
    expect(activityCells(days, 'daily')).toEqual([
      { date: '2026-09-07', week: '2026-09-07', tokens: 30, messages: 3, level: 3 },
      { date: '2026-09-08', week: '2026-09-07', tokens: 9, messages: 1, level: 1 },
    ])
  })

  it('gives every day of a week the week totals for the weekly metric', () => {
    const days = [
      day('2026-09-06', { totalTokens: 5, messageCount: 1 }),
      day('2026-09-07', { totalTokens: 20, messageCount: 2 }),
      day('2026-09-08', { totalTokens: 10, messageCount: 3 }),
    ]
    const cells = activityCells(days, 'weekly')
    expect(cells.map(cell => cell.week)).toEqual(['2026-08-31', '2026-09-07', '2026-09-07'])
    expect(cells.map(cell => cell.tokens)).toEqual([5, 30, 30])
    expect(cells.map(cell => cell.messages)).toEqual([1, 5, 5])
    // Weeks are reported in chronological order even though the fold collects
    // them by first sighting.
    expect(cells.map(cell => cell.date)).toEqual(['2026-09-06', '2026-09-07', '2026-09-08'])
    expect(cells.map(cell => cell.level)).toEqual([1, 3, 3])
  })

  it('reports a running total for the cumulative metric', () => {
    const days = [day('2026-09-07', { totalTokens: 10, messageCount: 1 }), day('2026-09-08', { totalTokens: 20, messageCount: 2 })]
    expect(activityCells(days, 'cumulative').map(cell => [cell.tokens, cell.messages, cell.level])).toEqual([
      [10, 1, 2],
      [30, 3, 3],
    ])
  })

  it('bands the color levels by thirds of the range maximum', () => {
    const days = [
      day('2026-09-01', { totalTokens: 0 }),
      day('2026-09-02', { totalTokens: 33 }),
      day('2026-09-03', { totalTokens: 34 }),
      day('2026-09-04', { totalTokens: 66 }),
      day('2026-09-05', { totalTokens: 67 }),
      day('2026-09-06', { totalTokens: 100 }),
    ]
    expect(activityCells(days, 'daily').map(cell => cell.level)).toEqual([0, 1, 2, 2, 3, 3])
  })

  it('leaves every cell empty when the range reports no tokens', () => {
    const days = [day('2026-09-07', { totalTokens: 0, messageCount: 4 })]
    expect(activityCells(days, 'daily')).toEqual([
      { date: '2026-09-07', week: '2026-09-07', tokens: 0, messages: 4, level: 0 },
    ])
  })

  it('returns nothing for an empty range', () => {
    expect(activityCells([], 'daily')).toEqual([])
  })
})
