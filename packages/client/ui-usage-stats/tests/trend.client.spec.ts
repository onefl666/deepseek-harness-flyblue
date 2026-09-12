import { describe, expect, it } from 'vitest'
import { axisTicks, BUCKET_KEYS, columnCenter, lineMax, linePoints, pointPosition, SERIES_KEYS, stackMax, trendDays, trendSeries } from '../src/client/trend.ts'
import { day } from './fixtures.client.ts'

describe('trendSeries', () => {
  it('extracts one series per bucket, in plotting order, with its total', () => {
    const days = [day('2026-09-08', { totalTokens: 20 }), day('2026-09-09', { totalTokens: 40 })]
    const series = trendSeries(days)
    expect(series.map(item => item.key)).toEqual([...SERIES_KEYS])
    expect(series.map(item => item.tone)).toEqual([0, 1, 2, 3])
    expect(series.map(item => item.values)).toEqual([[10, 10], [5, 5], [3, 3], [2, 2]])
    expect(series.map(item => item.total)).toEqual([20, 10, 6, 4])
  })

  it('names every bucket in the dictionary', () => {
    expect(Object.values(BUCKET_KEYS)).toEqual(['bucket.input', 'bucket.output', 'bucket.cacheRead', 'bucket.cacheWrite'])
  })
})

describe('trendDays', () => {
  it('carries each day its own labeled bucket values', () => {
    const days = [day('2026-09-08')]
    expect(trendDays(days)).toEqual([{
      date: '2026-09-08',
      total: 20,
      messages: 2,
      values: [
        { key: 'uncachedInputTokens', tone: 0, value: 10 },
        { key: 'outputTokens', tone: 1, value: 5 },
        { key: 'cacheReadTokens', tone: 2, value: 3 },
        { key: 'cacheWriteTokens', tone: 3, value: 2 },
      ],
    }])
  })
})

describe('scales', () => {
  it('scales the line form by the largest single bucket', () => {
    expect(lineMax(trendSeries([day('2026-09-08')]))).toBe(10)
    expect(lineMax(trendSeries([day('2026-09-08', { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })]))).toBe(1)
    expect(lineMax([])).toBe(1)
  })

  it('scales the stacked form by the largest daily total', () => {
    expect(stackMax([day('2026-09-08', { totalTokens: 20 }), day('2026-09-09', { totalTokens: 55 })])).toBe(55)
    expect(stackMax([day('2026-09-08', { totalTokens: 0 })])).toBe(1)
    expect(stackMax([])).toBe(1)
  })
})

describe('geometry', () => {
  it('centers a column inside its share of the plot box', () => {
    expect(columnCenter(0, 4)).toBe(12.5)
    expect(columnCenter(3, 4)).toBe(87.5)
  })

  it('inverts the vertical axis so the maximum sits at the top', () => {
    expect(pointPosition(0, 4, 50, 50)).toEqual({ x: 12.5, y: 0 })
    expect(pointPosition(1, 4, 0, 50)).toEqual({ x: 37.5, y: 100 })
  })

  it('draws a polyline as space-separated pairs', () => {
    expect(linePoints([50, 0], 50)).toBe('25,0 75,100')
  })

  it('labels every day while the range fits and thins longer ranges', () => {
    expect(axisTicks(7, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(axisTicks(30, 7)).toEqual([0, 5, 10, 15, 19, 24, 29])
    expect(axisTicks(0, 7)).toEqual([])
  })
})
