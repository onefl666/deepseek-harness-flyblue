/**
 * SectionToolbar: the row above a manager settings section's list — the scope
 * picker, the search field, and the section's own trailing actions. The three
 * parts are one row of one width, so they travel together rather than being
 * recomposed per section.
 */
import type { ReactNode } from 'react'
import { ScopePicker } from './ScopePicker.tsx'
import { SearchField } from './SearchField.tsx'
import type { ScopeChoice } from './useScopeChoice.ts'
import css from './SectionToolbar.module.css'

/**
 * The copy every manager settings section's dictionary publishes for its
 * toolbar. A section's own translate seat accepts these keys, so the names
 * live here once instead of being respelled at each call site.
 */
export type SectionToolbarKey =
  | 'scopeLabel' | 'scopeUser' | 'scopeNoWorkspace'
  | 'search' | 'clearSearch' | 'searchPlaceholder'

/** A section's translate seat narrowed to the toolbar's keys. */
export type SectionToolbarTranslate = (key: SectionToolbarKey) => string

/** Complete localized copy for the toolbar. */
export interface SectionToolbarLabels {
  /** Scope picker copy. */
  readonly scope: { readonly aria: string; readonly user: string; readonly noWorkspace: string }
  /** Search field's accessible name. */
  readonly search: string
  /** Search field's clear-button name. */
  readonly clearSearch: string
  /** Search field's placeholder. */
  readonly searchPlaceholder: string
}

/**
 * Read a section's toolbar copy from its own dictionary.
 * @param t - the section's translate seat.
 * @returns the labels the toolbar renders.
 */
export function sectionToolbarLabels(t: SectionToolbarTranslate): SectionToolbarLabels {
  return {
    scope: { aria: t('scopeLabel'), user: t('scopeUser'), noWorkspace: t('scopeNoWorkspace') },
    search: t('search'),
    clearSearch: t('clearSearch'),
    searchPlaceholder: t('searchPlaceholder'),
  }
}

/** SectionToolbar props: the scope choice, the search draft, and the trailing controls. */
export interface SectionToolbarProps {
  /** The section's scope choice, which supplies the picker's workspaces and selection. */
  readonly scope: ScopeChoice
  /** Glyph marking the scope picker. */
  readonly scopeIcon: ReactNode
  /** Current search draft. */
  readonly query: string
  /** Called with each search edit. */
  readonly onQueryChange: (value: string) => void
  /** Complete localized copy, from {@link sectionToolbarLabels}. */
  readonly labels: SectionToolbarLabels
  /** Controls after the search field, pinned to the trailing edge. */
  readonly children: ReactNode
}

/**
 * Render the section toolbar.
 * @param props - the scope choice, the search draft, labels, and the trailing controls.
 * @returns the scale picker, the search field, and the trailing controls on one row.
 */
export function SectionToolbar({
  scope, scopeIcon, query, onQueryChange, labels, children,
}: SectionToolbarProps) {
  return (
    <div className={css.toolbar}>
      <ScopePicker
        workspaces={scope.workspaces}
        scope={scope.picked}
        icon={scopeIcon}
        labels={labels.scope}
        onSelect={scope.select}
      />
      <SearchField
        className={css.search as string}
        value={query}
        onChange={onQueryChange}
        label={labels.search}
        clearLabel={labels.clearSearch}
        placeholder={labels.searchPlaceholder}
      />
      <span className={css.toolbarEnd}>{children}</span>
    </div>
  )
}
