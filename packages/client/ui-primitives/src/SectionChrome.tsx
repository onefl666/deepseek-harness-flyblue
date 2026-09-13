// SectionChrome: the shared top matter of a settings-section page — a heading
// row with a one-line description, the caller's counts, pills, and switchers,
// and the standard refresh control, followed by a failure strip while an error
// is present. The three feature sections that grew this markup side by side
// are why it is an atom; nothing here knows a locale or a slot.

import type { ReactNode } from 'react'
import { Button } from './Button.tsx'
import { IconLoadingOutline16, IconRefreshOutline16 } from './icons/index.tsx'
import css from './SectionChrome.module.css'

/** Localized copy for {@link SectionChrome}'s refresh control and failure strip. */
export interface SectionChromeLabels {
  /** Accessible name of the refresh control. */
  refresh: string
  /** Refresh control caption while a read is in flight. */
  refreshing: string
  /** Failure-strip summary naming what failed. */
  errorSummary: string
  /** Retry control caption. */
  retry: string
}

/**
 * Render the section heading row and, directly below it, the failure strip while an error is present.
 * @param props.title - section heading.
 * @param props.intro - one-line description rendered under the heading.
 * @param props.meta - nodes rendered before the refresh control (counts, pills, switchers).
 * @param props.busy - whether a section-wide read is in flight.
 * @param props.refreshDisabled - disables the refresh control for reasons other than `busy`.
 * @param props.onRefresh - invoked when the refresh control or the retry control is activated.
 * @param props.error - raw failure message; the strip is omitted while undefined.
 * @param props.labels - localized refresh control and failure-strip copy.
 * @returns the header element, followed by the alert strip when `error` is set.
 */
export function SectionChrome({ title, intro, meta, busy, refreshDisabled = false, onRefresh, error, labels }: {
  title: string
  intro: string
  meta?: ReactNode
  busy: boolean
  refreshDisabled?: boolean
  onRefresh: () => void
  error?: string | undefined
  labels: SectionChromeLabels
}) {
  return (
    <>
      <header className={css.header}>
        <div>
          <h2 className={css.title}>{title}</h2>
          <p className={css.intro}>{intro}</p>
        </div>
        <div className={css.headerMeta}>
          {meta}
          <Button
            variant="ghost"
            size="sm"
            icon={busy ? <IconLoadingOutline16 className={css.spin} /> : <IconRefreshOutline16 />}
            disabled={busy || refreshDisabled}
            onClick={onRefresh}
            aria-label={labels.refresh}
          >
            {busy ? labels.refreshing : labels.refresh}
          </Button>
        </div>
      </header>
      {error !== undefined && (
        <div className={css.error} role="alert">
          <span>{labels.errorSummary}: {error}</span>
          <Button variant="ghost" size="sm" onClick={onRefresh}>{labels.retry}</Button>
        </div>
      )}
    </>
  )
}
