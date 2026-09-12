/** Shared fixtures and a translate stub for the usage-dashboard specs. */
import { dateKey } from '../src/client/format.ts'
import type { ModelUsage, UsageDay } from '../src/client/types.ts'

/** Token buckets with distinct values, so a view that mixes them up fails. */
export const BUCKETS = {
  uncachedInputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 3,
  cacheWriteTokens: 2,
  reasoningTokens: 4,
}

/**
 * One dense daily row.
 * @param date - local ISO date.
 * @param overrides - fields to replace.
 * @returns the daily row.
 */
export function day(date: string, overrides: Partial<UsageDay> = {}): UsageDay {
  return { date, ...BUCKETS, totalTokens: 20, sessionCount: 1, messageCount: 2, ...overrides }
}

/**
 * One model aggregate.
 * @param index - provider and model suffix.
 * @param totalTokens - attributed tokens.
 * @returns the model row.
 */
export function model(index: number, totalTokens: number): ModelUsage {
  return { provider: `p${index}`, model: `m${index}`, ...BUCKETS, totalTokens, sessionCount: 1 }
}

/**
 * A dense range ending on `end`, oldest first.
 * @param end - local ISO date of the last day.
 * @param size - number of days.
 * @param at - optional per-index overrides, indexed from the oldest day.
 * @returns the dense range.
 */
export function range(end: string, size: number, at: (index: number) => Partial<UsageDay> = () => ({})): UsageDay[] {
  const last = new Date(`${end}T00:00:00`)
  return Array.from({ length: size }, (_, index) => {
    const value = new Date(last)
    value.setDate(value.getDate() - (size - 1 - index))
    return day(dateKey(value), at(index))
  })
}

/**
 * Translate stub standing in for the locale seat: it returns the key followed by
 * its named parameters, so a spec can assert both which key a view chose and
 * what it passed to it.
 * @param key - dictionary key.
 * @param params - interpolation values.
 * @returns the key, with its parameters appended as `name=value` pairs.
 */
export function translate(key: string, params?: Record<string, unknown>): string {
  if (params === undefined) return key
  const named = Object.entries(params).map(([name, value]) => `${name}=${String(value)}`)
  return `${key}(${named.join(' ')})`
}
