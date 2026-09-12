/**
 * The dashboard's fixed series palette, exposed as class names so every
 * multi-series view colors the same plotting position the same way.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/series
 */

import css from './series.module.css'

/**
 * Series color classes in fixed plotting order. The dashboard plots at most
 * five positions: four token buckets plus the model-usage remainder.
 */
export const SERIES_CLASSES: readonly (string | undefined)[] = [
  css.series0,
  css.series1,
  css.series2,
  css.series3,
  css.series4,
]
