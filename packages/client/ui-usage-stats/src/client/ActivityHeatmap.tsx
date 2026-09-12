/**
 * Token-activity grid. One square per Host calendar day, colored by the
 * selected metric, with a hover/focus detail card on every cell. The metric
 * switch lives here because it changes only what this card reports.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/ActivityHeatmap
 */

import { useMemo, useState } from 'react'
import { SegmentedRange, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { activityCells, addDays } from './activity.ts'
import type { ActivityCell, ActivityMetric } from './activity.ts'
import { compactText, dateText, exactText } from './format.ts'
import { ChartTooltipCard } from './ChartTooltipCard.tsx'
import { NS } from './locales.ts'
import type { LocaleKey } from './locales.ts'
import type { UsageDay } from './types.ts'
import css from './ActivityHeatmap.module.css'

/** Supported coloring metrics, in the switch's display order. */
const METRICS: readonly ActivityMetric[] = ['daily', 'weekly', 'cumulative']

/** Dictionary key naming each metric. */
const METRIC_KEYS: Record<ActivityMetric, LocaleKey> = {
  daily: 'activity.metric.daily',
  weekly: 'activity.metric.weekly',
  cumulative: 'activity.metric.cumulative',
}

/**
 * Headline of a cell's detail card: the day, its week, or the running total,
 * matching the metric that colored it.
 * @param cell - the revealed cell.
 * @param metric - the metric that colored the grid.
 * @param t - translate seat of this plugin's namespace.
 * @returns the localized headline.
 */
function cellTitle(cell: ActivityCell, metric: ActivityMetric, t: TranslateNS<typeof NS>): string {
  if (metric === 'weekly') {
    return t('activity.week', { start: dateText(cell.week), end: dateText(addDays(cell.week, 6)) })
  }
  const date = dateText(cell.date, true)
  return metric === 'cumulative' ? t('activity.through', { date }) : date
}

/**
 * Render the activity grid.
 * @param props.t - translate seat of this plugin's namespace.
 * @param props.days - dense chronological range as returned by the Host.
 * @returns the activity card.
 */
export function ActivityHeatmap({ t, days }: { t: TranslateNS<typeof NS>; days: readonly UsageDay[] }) {
  const [metric, setMetric] = useState<ActivityMetric>('daily')
  const cells = useMemo(() => activityCells(days, metric), [days, metric])
  const active = cells.some(cell => cell.messages > 0)
  const reported = cells.some(cell => cell.tokens > 0)
  return (
    <article className={css.panel}>
      <div className={css.header}>
        <h3 className={css.title}>{t('activity.title')}</h3>
        <SegmentedRange
          aria-label={t('activity.metric')}
          minWidth="54px"
          value={metric}
          options={METRICS.map(value => ({ value, label: t(METRIC_KEYS[value]) }))}
          onChange={setMetric}
        />
      </div>
      <p className={css.help}>{t('activity.help')}</p>
      {active
        ? (
          <>
            {!reported && <p className={css.note} role="status">{t('activity.noUsage')}</p>}
            <ol className={css.grid} aria-label={t('activity.title')}>
              {cells.map(cell => (
                <li key={cell.date}>
                  <Tooltip
                    side="top"
                    label={(
                      <ChartTooltipCard
                        title={cellTitle(cell, metric, t)}
                        detail={t('activity.detail', {
                          tokens: compactText(cell.tokens),
                          messages: exactText(cell.messages),
                        })}
                      />
                    )}
                  >
                    <span
                      className={css.cell}
                      data-level={cell.level}
                      role="img"
                      tabIndex={0}
                      aria-label={t('activity.cell', {
                        date: dateText(cell.date, true),
                        tokens: exactText(cell.tokens),
                        messages: exactText(cell.messages),
                      })}
                    />
                  </Tooltip>
                </li>
              ))}
            </ol>
          </>
        )
        : <div className={css.empty}>{t('activity.empty')}</div>}
    </article>
  )
}
