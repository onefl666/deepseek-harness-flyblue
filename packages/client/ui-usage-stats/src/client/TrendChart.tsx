/**
 * Daily Token trend. The range is plotted as one line per token bucket or as
 * stacked daily bars; both forms share the day columns, so hovering or focusing
 * a column places the crosshair, marks each series' value for that day, and
 * opens the day's detail card.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/TrendChart
 */

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { SegmentedRange, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { axisTicks, BUCKET_KEYS, columnCenter, lineMax, linePoints, pointPosition, stackMax, trendDays, trendSeries } from './trend.ts'
import type { TrendDay } from './trend.ts'
import { compactText, dateText, exactText } from './format.ts'
import { ChartTooltipCard } from './ChartTooltipCard.tsx'
import { SERIES_CLASSES } from './series.ts'
import { NS } from './locales.ts'
import type { LocaleKey } from './locales.ts'
import type { UsageDay } from './types.ts'
import css from './TrendChart.module.css'

/** The two plotting forms. */
type TrendForm = 'line' | 'stacked'

/** Supported forms, in the switch's display order. */
const FORMS: readonly TrendForm[] = ['line', 'stacked']

/** Dictionary key naming each form. */
const FORM_KEYS: Record<TrendForm, LocaleKey> = { line: 'trend.form.line', stacked: 'trend.form.stacked' }

/** Every day is labeled while the range is a week; longer ranges thin the axis. */
const AXIS_LABELS = 7

/** One revealed day: its position in the range and its plotted values. */
interface ActiveDay {
  index: number
  day: TrendDay
}

/**
 * Render the daily Token trend.
 * @param props.t - translate seat of this plugin's namespace.
 * @param props.days - dense chronological range as returned by the Host.
 * @param props.summary - localized prose summary of the range, for readers who
 * cannot use the plotted shape.
 * @returns the trend card.
 */
export function TrendChart({ t, days, summary }: {
  t: TranslateNS<typeof NS>
  days: readonly UsageDay[]
  summary: string
}) {
  const [form, setForm] = useState<TrendForm>('line')
  const [active, setActive] = useState<ActiveDay>()
  const [emphasis, setEmphasis] = useState<number>()
  const series = useMemo(() => trendSeries(days), [days])
  const plotted = useMemo(() => trendDays(days), [days])
  const line = useMemo(() => lineMax(series), [series])
  const stack = useMemo(() => stackMax(days), [days])
  const ticks = useMemo(() => new Set(axisTicks(days.length, AXIS_LABELS)), [days.length])
  const reported = days.some(day => day.totalTokens > 0)
  if (!reported) {
    return (
      <article className={css.panel}>
        <h3 className={css.title}>{t('trend.title')}</h3>
        <div className={css.empty}>
          {plotted.some(day => day.messages > 0) ? t('trend.noUsage') : t('trend.empty')}
        </div>
      </article>
    )
  }
  const clear = () => { setActive(undefined) }
  const reveal = (index: number, day: TrendDay) => { setActive({ index, day }) }
  const faded = (tone: number) => emphasis !== undefined && emphasis !== tone
  return (
    <article className={css.panel}>
      <div className={css.header}>
        <h3 className={css.title}>{t('trend.title')}</h3>
        <SegmentedRange
          aria-label={t('trend.form')}
          minWidth="54px"
          value={form}
          options={FORMS.map(value => ({ value, label: t(FORM_KEYS[value]) }))}
          onChange={setForm}
        />
      </div>
      <p className={css.srOnly}>{summary}</p>
      <ul className={css.legend} aria-label={t('trend.legend')}>
        {series.map(item => (
          <li
            key={item.key}
            onPointerEnter={() => { setEmphasis(item.tone) }}
            onPointerLeave={() => { setEmphasis(undefined) }}
          >
            <i className={SERIES_CLASSES[item.tone]} />
            <span>{t(BUCKET_KEYS[item.key])}</span>
          </li>
        ))}
      </ul>
      <div className={css.chart}>
        <div className={css.plot}>
          {form === 'line'
            ? (
              <svg className={css.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {series.map(item => (
                  <polyline
                    key={item.key}
                    className={faded(item.tone) ? css.dimmed : undefined}
                    points={linePoints(item.values, line)}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )
            : (
              <ol className={css.stack} aria-hidden="true">
                {plotted.map(day => (
                  <li key={day.date}>
                    <div className={css.stackTrack}>
                      <div className={css.stackValue} style={{ '--bar-size': `${day.total / stack * 100}%` } as CSSProperties}>
                        {day.values.map(item => item.value !== 0 && (
                          <i
                            key={item.key}
                            className={faded(item.tone) ? css.dimmed : undefined}
                            style={{ flexGrow: item.value }}
                          />
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          {active !== undefined && (
            <>
              <div className={css.crosshair} style={{ '--point-x': `${columnCenter(active.index, days.length)}%` } as CSSProperties} />
              <div className={css.points}>
                {active.day.values.map(item => item.value !== 0 && (
                  <i
                    key={item.key}
                    className={SERIES_CLASSES[item.tone]}
                    style={{
                      '--point-x': `${columnCenter(active.index, days.length)}%`,
                      '--point-y': `${pointPosition(active.index, days.length, item.value, line).y}%`,
                    } as CSSProperties}
                  />
                ))}
              </div>
            </>
          )}
          <ol className={css.columns} aria-label={t('trend.title')}>
            {plotted.map((day, index) => (
              <li key={day.date} className={css.column}>
                <Tooltip
                  side="top"
                  label={(
                    <ChartTooltipCard
                      title={t('trend.point', { date: dateText(day.date), tokens: compactText(day.total) })}
                      rows={day.values
                        .filter(item => item.value > 0)
                        .map(item => ({
                          key: item.key,
                          tone: item.tone,
                          label: t(BUCKET_KEYS[item.key]),
                          value: compactText(item.value),
                        }))}
                    />
                  )}
                >
                  <span
                    className={css.hit}
                    role="img"
                    tabIndex={0}
                    aria-label={t('trend.column', { date: dateText(day.date, true), tokens: exactText(day.total) })}
                    onMouseEnter={() => { reveal(index, day) }}
                    onMouseLeave={clear}
                    onFocus={() => { reveal(index, day) }}
                    onBlur={clear}
                  />
                </Tooltip>
              </li>
            ))}
          </ol>
        </div>
        <ol className={css.axis} aria-hidden="true">
          {plotted.map((day, index) => (
            <li key={day.date}>{ticks.has(index) ? dateText(day.date) : ''}</li>
          ))}
        </ol>
      </div>
    </article>
  )
}
