/**
 * Color metric and grid cells of the activity heatmap. The fold is pure over
 * the Host's dense daily series, so the component only maps its output to
 * elements and every aggregation rule is unit-testable.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/activity
 */

import { dateAt, dateKey } from './format.ts'
import type { UsageDay } from './types.ts'

/** How the activity grid colors and reports its cells. */
export type ActivityMetric = 'daily' | 'weekly' | 'cumulative'

interface ActivityPeriod {
  /** Local ISO date the period is reported under. */
  date: string
  /** Tokens attributed to the period. */
  tokens: number
  /** Visible messages attributed to the period. */
  messages: number
}

/** One dated calendar cell, ready to render. */
export interface ActivityCell extends ActivityPeriod {
  /** Monday of the week containing `date`; the weekly period key. */
  week: string
  /** Color level: 0 is nothing reported and 3 is the range maximum. */
  level: 0 | 1 | 2 | 3
}

/**
 * Add whole days to a local ISO calendar key.
 * @param date - `YYYY-MM-DD`.
 * @param amount - signed day count.
 * @returns the shifted `YYYY-MM-DD`.
 */
export function addDays(date: string, amount: number): string {
  const value = dateAt(date)
  value.setDate(value.getDate() + amount)
  return dateKey(value)
}

/**
 * Resolve the Monday of the week containing a date. Weeks start on Monday so
 * the weekly metric is a fixed function of the date rather than of the viewer's
 * locale.
 * @param date - `YYYY-MM-DD`.
 * @returns the containing week's Monday.
 */
function weekStart(date: string): string {
  const value = dateAt(date)
  return addDays(date, -((value.getDay() + 6) % 7))
}

/** Largest reported token total in the range, or zero when nothing was reported. */
function activityMax(values: readonly ActivityPeriod[]): number {
  let max = 0
  for (const value of values) if (value.tokens > max) max = value.tokens
  return max
}

/**
 * Color level of one period against the range maximum.
 * @param value - the period's token total.
 * @param max - the range maximum.
 * @returns 0 for nothing reported, 1 through 3 for the top three thirds.
 */
function activityLevel(value: number, max: number): 0 | 1 | 2 | 3 {
  if (value <= 0 || max <= 0) return 0
  const ratio = value / max
  if (ratio < 1 / 3) return 1
  if (ratio < 2 / 3) return 2
  return 3
}

/** Report each day under the period the selected metric aggregates. */
function activityPeriods(days: readonly UsageDay[], metric: ActivityMetric): ActivityPeriod[] {
  if (metric === 'daily') {
    return days.map(day => ({ date: day.date, tokens: day.totalTokens, messages: day.messageCount }))
  }
  if (metric === 'cumulative') {
    let tokens = 0
    let messages = 0
    return days.map((day) => {
      tokens += day.totalTokens
      messages += day.messageCount
      return { date: day.date, tokens, messages }
    })
  }
  const weeks = new Map<string, { tokens: number; messages: number; dates: string[] }>()
  for (const day of days) {
    const key = weekStart(day.date)
    const week = weeks.get(key)
    if (week === undefined) {
      weeks.set(key, { tokens: day.totalTokens, messages: day.messageCount, dates: [day.date] })
      continue
    }
    week.tokens += day.totalTokens
    week.messages += day.messageCount
    week.dates.push(day.date)
  }
  const periods: ActivityPeriod[] = []
  for (const week of weeks.values()) {
    for (const date of week.dates) periods.push({ date, tokens: week.tokens, messages: week.messages })
  }
  return periods.sort((left, right) => left.date.localeCompare(right.date))
}

/**
 * Fold the range into renderable cells for one coloring metric.
 * @param days - dense chronological range as returned by the Host.
 * @param metric - selected coloring metric.
 * @returns one cell per input day, in chronological order.
 */
export function activityCells(days: readonly UsageDay[], metric: ActivityMetric): ActivityCell[] {
  const periods = activityPeriods(days, metric)
  const max = activityMax(periods)
  return periods.map(period => ({
    ...period,
    week: weekStart(period.date),
    level: activityLevel(period.tokens, max),
  }))
}
