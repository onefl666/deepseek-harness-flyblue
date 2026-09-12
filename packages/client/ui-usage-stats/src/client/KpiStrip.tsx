/**
 * The dashboard's headline figures: one card of equal cells, each showing its
 * value above its label. A value whose compact form drops precision carries the
 * exact figure as a hover/focus tooltip, so nothing is readable only by
 * approximation.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/KpiStrip
 */

import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './KpiStrip.module.css'

/** One headline figure. */
export interface KpiItem {
  /** Stable identity for the cell. */
  key: string
  /** Localized cell label. */
  label: string
  /** Displayed value, already formatted. */
  value: string
  /** Exact value revealed on hover and focus; omit when compaction loses nothing. */
  exact?: string
  /** Localized unit trailing the value, such as the streak's day count. */
  suffix?: string
}

/**
 * Render the headline strip.
 * @param props.items - figures in display order.
 * @returns the strip element.
 */
export function KpiStrip({ items }: { items: readonly KpiItem[] }) {
  return (
    <div className={css.strip}>
      {items.map(item => (
        <article key={item.key} className={css.cell}>
          <strong>
            {item.exact === undefined
              ? <span>{item.value}</span>
              : (
                <Tooltip label={item.exact} side="top">
                  <span tabIndex={0} aria-label={item.exact}>{item.value}</span>
                </Tooltip>
              )}
            {item.suffix !== undefined && <small>{item.suffix}</small>}
          </strong>
          <span>{item.label}</span>
        </article>
      ))}
    </div>
  )
}
