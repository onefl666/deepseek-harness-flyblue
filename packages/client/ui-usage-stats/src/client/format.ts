/**
 * One home for every number, date, and weekday string the usage dashboard
 * shows, so chart and table components stay presentation-only. The formatters
 * read the browser locale through `Intl`; product copy stays in the locale
 * dictionary.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/format
 */

const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const exactFormat = new Intl.NumberFormat()
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })
const longDateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/**
 * Convert a local date to its ISO calendar key.
 * @param value - local date or instant.
 * @returns `YYYY-MM-DD` in the browser timezone.
 */
export function dateKey(value: Date): string {
  const year = value.getFullYear().toString().padStart(4, '0')
  const month = (value.getMonth() + 1).toString().padStart(2, '0')
  const day = value.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Read a local ISO calendar key as local midnight.
 * @param date - `YYYY-MM-DD`.
 * @returns the start of that local day.
 */
export function dateAt(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

/**
 * Format a count in compact notation for chart, KPI, and tooltip surfaces.
 * @param value - non-negative count.
 * @returns the localized compact form.
 */
export function compactText(value: number): string {
  return compactFormat.format(value)
}

/**
 * Format a count exactly, without compaction.
 * @param value - non-negative count.
 * @returns the localized exact form.
 */
export function exactText(value: number): string {
  return exactFormat.format(value)
}

/**
 * Format a fraction as a localized percentage.
 * @param value - fraction of a whole.
 * @returns the localized percentage.
 */
export function percentText(value: number): string {
  return percentFormat.format(value)
}

/**
 * Format a local ISO calendar date.
 * @param date - `YYYY-MM-DD`.
 * @param long - include the year (default `false`).
 * @returns the localized date.
 */
export function dateText(date: string, long = false): string {
  return (long ? longDateFormat : shortDateFormat).format(dateAt(date))
}
