/**
 * Series extraction and geometry for the daily Token trend chart. Every
 * function is pure and returns drawing coordinates in a 0..100 box, so the
 * component needs no element measurement and the chart stays responsive at any
 * card width.
 *
 * Both shapes are built by mapping over the day series rather than by indexing
 * one array with another's position, so no consumer has to prove an index is in
 * range.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/trend
 */

import type { LocaleKey } from './locales.ts'
import type { UsageDay } from './types.ts'

/**
 * The four disjoint token buckets, in the order every series view plots them.
 * The stacked bars and the lines share this order, so one palette position names
 * the same bucket in both forms.
 */
export const SERIES_KEYS = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const

/** One plotted token bucket. */
export type SeriesKey = typeof SERIES_KEYS[number]

/** Dictionary key naming each bucket, for legends, tooltips, and breakdown rows. */
export const BUCKET_KEYS: Record<SeriesKey, LocaleKey> = {
  uncachedInputTokens: 'bucket.input',
  outputTokens: 'bucket.output',
  cacheReadTokens: 'bucket.cacheRead',
  cacheWriteTokens: 'bucket.cacheWrite',
}

/** One bucket's value on one day. */
export interface TrendValue {
  /** The bucket this value belongs to. */
  key: SeriesKey
  /** Palette position of the bucket. */
  tone: number
  /** The day's value. */
  value: number
}

/** One plotted day, carrying its own bucket values. */
export interface TrendDay {
  /** Local ISO date. */
  date: string
  /** Sum of the four buckets. */
  total: number
  /** Visible messages on this day, for the empty-state copy. */
  messages: number
  /** One entry per plotted bucket, in plotting order. */
  values: TrendValue[]
}

/** One plotted bucket across the whole range. */
export interface TrendSeries {
  /** The bucket this series plots. */
  key: SeriesKey
  /** Palette position of the bucket. */
  tone: number
  /** Sum over the range, for the accessible summary. */
  total: number
  /** One value per day, in the range's chronological order. */
  values: number[]
}

/** Geometry of one plotted point, in the chart's 0..100 box. */
export interface TrendPoint {
  /** Horizontal position; the center of the day's hover column. */
  x: number
  /** Vertical position, 0 at the top of the plot box. */
  y: number
}

/**
 * Extract one series per token bucket.
 * @param days - dense chronological range as returned by the Host.
 * @returns the series in plotting order; `values` keeps the input day order.
 */
export function trendSeries(days: readonly UsageDay[]): TrendSeries[] {
  return SERIES_KEYS.map((key, tone) => {
    const values = days.map(day => day[key])
    return { key, tone, values, total: values.reduce((sum, value) => sum + value, 0) }
  })
}

/**
 * Zip the range into per-day bucket values.
 * @param days - dense chronological range as returned by the Host.
 * @returns one entry per day, in the same order.
 */
export function trendDays(days: readonly UsageDay[]): TrendDay[] {
  return days.map(day => ({
    date: day.date,
    total: day.totalTokens,
    messages: day.messageCount,
    values: SERIES_KEYS.map((key, tone) => ({ key, tone, value: day[key] })),
  }))
}

/**
 * Vertical scale for the line form: the largest single bucket value, so a
 * bucket that never dominates still leaves the baseline.
 * @param series - series from {@link trendSeries}.
 * @returns a positive maximum, never zero.
 */
export function lineMax(series: readonly TrendSeries[]): number {
  let max = 0
  for (const item of series) for (const value of item.values) if (value > max) max = value
  return max > 0 ? max : 1
}

/**
 * Vertical scale for the stacked form: the largest daily total, which is what
 * the stacked segments add up to.
 * @param days - dense chronological range as returned by the Host.
 * @returns a positive maximum, never zero.
 */
export function stackMax(days: readonly UsageDay[]): number {
  let max = 0
  for (const day of days) if (day.totalTokens > max) max = day.totalTokens
  return max > 0 ? max : 1
}

/**
 * Horizontal center of one day's hover column, as a percentage of the plot box.
 * The lines, the highlight dots, and the crosshair all use it, so a point sits
 * in the middle of the column that reveals it.
 * @param index - zero-based day index.
 * @param count - number of days in the range.
 * @returns the column center as a percentage.
 */
export function columnCenter(index: number, count: number): number {
  return (index + 0.5) / count * 100
}

/**
 * Position one plotted point.
 * @param index - zero-based day index.
 * @param count - number of days in the range.
 * @param value - the value at that day.
 * @param max - the form's vertical scale.
 * @returns coordinates in the 0..100 box.
 */
export function pointPosition(index: number, count: number, value: number, max: number): TrendPoint {
  return {
    x: columnCenter(index, count),
    y: 100 - value / max * 100,
  }
}

/**
 * Draw one series as an SVG polyline in the 0..100 box.
 * @param values - per-day values.
 * @param max - the form's vertical scale.
 * @returns space-separated `x,y` pairs.
 */
export function linePoints(values: readonly number[], max: number): string {
  return values
    .map((value, index) => {
      const point = pointPosition(index, values.length, value, max)
      return `${point.x},${point.y}`
    })
    .join(' ')
}

/**
 * Choose which days carry an axis label.
 * @param count - number of days in the range.
 * @param limit - maximum number of labels to place; must be at least 2.
 * @returns ascending day indices, always including the last day.
 */
export function axisTicks(count: number, limit: number): number[] {
  if (count <= limit) return Array.from({ length: count }, (_, index) => index)
  const step = (count - 1) / (limit - 1)
  return Array.from({ length: limit }, (_, index) => Math.round(index * step))
}
