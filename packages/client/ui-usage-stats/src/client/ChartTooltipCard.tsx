/**
 * The dashboard's shared hover/focus detail card: a headline naming the period
 * and its total, an optional detail line, and optional swatch rows matching the
 * series palette. It renders inside the Tooltip primitive's bubble, which takes
 * no pointer events, so the card stays a pure read surface.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/ChartTooltipCard
 */

import { SERIES_CLASSES } from './series.ts'
import css from './ChartTooltipCard.module.css'

/** One swatch row of a detail card. */
export interface ChartTooltipRow {
  /** Stable identity, normally the series key. */
  key: string
  /** Palette position; indexes the shared series palette. */
  tone: number
  /** Localized series name. */
  label: string
  /** Localized value. */
  value: string
}

/**
 * Render a chart detail card.
 * @param props.title - localized headline naming the period and its total.
 * @param props.detail - optional localized second line.
 * @param props.rows - optional localized swatch rows, in plotting order.
 * @returns the card element.
 */
export function ChartTooltipCard({ title, detail, rows }: {
  title: string
  detail?: string | undefined
  rows?: readonly ChartTooltipRow[] | undefined
}) {
  return (
    <span className={css.card}>
      <span className={css.title}>{title}</span>
      {detail !== undefined && <span className={css.detail}>{detail}</span>}
      {rows !== undefined && rows.length > 0 && (
        <span className={css.rows}>
          {rows.map(row => (
            <span key={row.key} className={css.row}>
              <i className={SERIES_CLASSES[row.tone]} />
              <span className={css.name}>{row.label}</span>
              <span className={css.value}>{row.value}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
