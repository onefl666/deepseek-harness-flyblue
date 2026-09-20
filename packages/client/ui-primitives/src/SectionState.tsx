/**
 * SectionState: the load/failure/body branches every manager settings section
 * shares. The section renders its rows as children; this owns the skeleton
 * while the first read is in flight and the failure line when it failed.
 */
import type { ReactNode } from 'react'
import css from './SectionState.module.css'

/** Complete localized copy for the section's non-body states. */
export interface SectionStateLabels {
  /** Accessible name of the loading skeleton. */
  readonly loading: string
  /** Label the failure line prefixes its message with. */
  readonly error: string
}

/** SectionState props: which branch to render, and the body for the loaded one. */
export interface SectionStateProps {
  /** Whether the first read is still in flight. */
  readonly loading: boolean
  /** Loading rows the skeleton draws. */
  readonly rows: number
  /** The read's failure message, or undefined while there is none. */
  readonly failure: string | undefined
  /** Complete localized copy; the primitive owns no fallback. */
  readonly labels: SectionStateLabels
  /** The loaded body. */
  readonly children: ReactNode
}

/**
 * Render whichever branch the section's listing is in.
 * @param props - the branch selector, the skeleton's row count, labels, and the loaded body.
 * @returns the skeleton, the failure line, or the body.
 */
export function SectionState({ loading, rows, failure, labels, children }: SectionStateProps) {
  if (loading) {
    return (
      <div className={css.skeleton} aria-busy="true" aria-label={labels.loading}>
        {Array.from({ length: rows }, (_unused, index) => <div className={css.skeletonRow} key={index} />)}
      </div>
    )
  }
  if (failure !== undefined) {
    return <p className={css.failure} role="alert">{`${labels.error}: ${failure}`}</p>
  }
  return <>{children}</>
}
