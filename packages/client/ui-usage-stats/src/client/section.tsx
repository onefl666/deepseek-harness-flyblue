/**
 * Usage-statistics settings section. It owns one scan at a time — the requested
 * range, the committed snapshot, and the notices that report a failed or
 * partial scan — and arranges the cards that present it. Each card owns its own
 * panel, its own viewing state, and its own accessible summary.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/section
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SegmentedRange, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { ActivityHeatmap } from './ActivityHeatmap.tsx'
import { compactText, exactText } from './format.ts'
import { KpiStrip } from './KpiStrip.tsx'
import type { KpiItem } from './KpiStrip.tsx'
import { ModelUsage } from './ModelUsage.tsx'
import { SERIES_CLASSES } from './series.ts'
import { BUCKET_KEYS, SERIES_KEYS } from './trend.ts'
import { TrendChart } from './TrendChart.tsx'
import { UsageDetails } from './UsageDetails.tsx'
import { NS } from './locales.ts'
import type { SkippedSession, Stats, UsageDays } from './types.ts'
import css from './section.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Local usage dashboard and settings navigation copy. */
    usageStats: keyof typeof import('./locales.ts').zh
  }
}

/** Remote dependency used by the usage panel. */
export interface UsageStatsInjected {
  /** Read one Host scan of the requested range. */
  stats: (request: { days: UsageDays }) => Promise<RemoteResult<Stats>>
}

/**
 * Reveal a figure exactly when compaction changed it, so a tooltip never
 * restates the number already on screen.
 */
function exactOnly(value: number): { exact: string } | Record<string, never> {
  const exact = exactText(value)
  return compactText(value) === exact ? {} : { exact }
}

/** Headline figures for one snapshot. */
function kpis(snapshot: Stats, t: TranslateNS<typeof NS>): KpiItem[] {
  return [
    { key: 'tokens', label: t('kpi.tokens'), value: compactText(snapshot.totalTokens), ...exactOnly(snapshot.totalTokens) },
    { key: 'sessions', label: t('kpi.sessions'), value: compactText(snapshot.sessionCount), ...exactOnly(snapshot.sessionCount) },
    { key: 'messages', label: t('kpi.messages'), value: compactText(snapshot.messageCount), ...exactOnly(snapshot.messageCount) },
    {
      key: 'activeDays',
      label: t('kpi.activeDays'),
      value: t('kpi.activeOf', { active: exactText(snapshot.activeDays), total: exactText(snapshot.days) }),
    },
    { key: 'streak', label: t('kpi.streak'), value: exactText(snapshot.currentStreakDays), suffix: t('days') },
  ]
}

/** Placeholder shown while the first scan is in flight. */
function Skeleton({ label }: { label: string }) {
  return (
    <div className={css.skeleton} aria-busy="true" aria-label={label}>
      <div className={css.skeletonHeader} />
      <div className={css.skeletonGrid}>
        {Array.from({ length: 6 }, (_, index) => <div className={css.skeletonCard} key={index} />)}
      </div>
      <div className={css.skeletonChart} />
      <div className={css.skeletonChart} />
    </div>
  )
}

/**
 * Render the local usage-history dashboard.
 * @param props.t - translate seat of this plugin's namespace.
 * @param props.stats - remote scan reader injected by the registration.
 * @returns the settings section.
 */
export function UsageStatsSection({ t, stats }: PropsLocale<typeof NS> & InjectFace<UsageStatsInjected>) {
  const [snapshot, setSnapshot] = useState<Stats>()
  const [requestedDays, setRequestedDays] = useState<UsageDays>(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [skipped, setSkipped] = useState<readonly SkippedSession[]>([])
  // Transient skip banner: the seq keys the Toast so a repeated refresh
  // restarts the hold-then-fade cycle instead of reusing the faded one.
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const dismissToast = useCallback(() => { setToast(null) }, [])
  const requestSequence = useRef(0)
  const committedDays = useRef<UsageDays>(30)
  const load = useCallback((days: UsageDays) => {
    const sequence = ++requestSequence.current
    setBusy(true)
    setError(undefined)
    void stats({ days }).then((result) => {
      if (sequence !== requestSequence.current) return
      setBusy(false)
      if (result.ok) {
        committedDays.current = result.value.days
        setSnapshot(result.value)
        setRequestedDays(result.value.days)
        setSkipped(result.value.skippedSessions)
        if (result.value.skippedSessions.length > 0) {
          toastSeq.current += 1
          setToast({ seq: toastSeq.current, text: t('skipped.toast', { count: result.value.skippedSessions.length }) })
        }
      } else { setError(result.error.message); setRequestedDays(committedDays.current) }
    })
  }, [stats, t])
  useEffect(() => { load(30) }, [load])

  if (snapshot === undefined && busy) {
    return (
      <section className={css.section} data-usage-stats>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
        <Skeleton label={t('loading')} />
      </section>
    )
  }
  const retry = () => { load(requestedDays) }
  const selectDays = (days: UsageDays) => {
    if (days !== requestedDays || error !== undefined) {
      setRequestedDays(days)
      load(days)
    }
  }
  const summary = snapshot === undefined
    ? ''
    : t('chart.summary', { tokens: exactText(snapshot.totalTokens), messages: exactText(snapshot.messageCount) })
  return (
    <section className={css.section} data-usage-stats aria-busy={busy}>
      <header className={css.header}>
        <div><h2 className={css.title}>{t('title')}</h2><p className={css.intro}>{t('intro')}</p></div>
        <button
          type="button"
          className={css.refresh}
          disabled={busy}
          onClick={() => { load(requestedDays) }}
        >
          {busy ? t('refreshing') : t('refresh')}
        </button>
      </header>
      {busy && snapshot !== undefined && <p className={css.status} role="status">{t('updating')}</p>}
      {error !== undefined && (
        <div className={css.error} role="alert">
          <span>{t('error')}: {error}</span>
          <button type="button" onClick={retry}>{t('retry')}</button>
        </div>
      )}
      {skipped.length > 0 && (
        <div className={css.skipped} role="status">
          <span>{t('skipped.notice')}</span>
          <ul>{skipped.map(item => <li key={item.id}>{item.id}: {item.error}</li>)}</ul>
        </div>
      )}
      {snapshot === undefined
        ? <div className={css.empty}>{t('error.empty')}</div>
        : (
          <>
            <KpiStrip items={kpis(snapshot, t)} />
            <div className={css.range}>
              <span className={css.rangeLabel}>{t('range.label')}</span>
              <SegmentedRange
                aria-label={t('range.label')}
                value={requestedDays}
                options={[
                  { value: 7, label: t('range.7') },
                  { value: 30, label: t('range.30') },
                ]}
                onChange={selectDays}
              />
            </div>
            <ActivityHeatmap t={t} days={snapshot.daily} />
            <TrendChart t={t} days={snapshot.daily} summary={summary} />
            <ModelUsage t={t} models={snapshot.models} totalTokens={snapshot.totalTokens} />
            <article className={css.panel}>
              <h3>{t('breakdown.title')}</h3>
              <div className={css.breakdown}>
                {SERIES_KEYS.map((key, tone) => (
                  <div key={key}>
                    <i className={SERIES_CLASSES[tone]} />
                    <span>{t(BUCKET_KEYS[key])}</span>
                    <strong>{exactText(snapshot[key])}</strong>
                  </div>
                ))}
              </div>
              <p className={css.note}>{t('reasoning', { value: exactText(snapshot.reasoningTokens) })}</p>
            </article>
            <UsageDetails t={t} days={snapshot.daily} models={snapshot.models} />
            <p className={css.footer}>
              {t('updated')} {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: snapshot.timeZone }).format(snapshot.generatedAt)} · {snapshot.timeZone}
            </p>
          </>
        )}
      {toast !== null && <Toast key={toast.seq} text={toast.text} onDone={dismissToast} />}
    </section>
  )
}
