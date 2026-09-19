// SearchField: the search control shared by list-management surfaces. The
// clear affordance stays mounted so its opacity/scale transition retargets
// from the computed value when the query flips mid-animation.

import clsx from 'clsx'
import { IconCloseOutline16, IconSearchOutline16 } from './icons/index.tsx'
import css from './SearchField.module.css'

/** Props for {@link SearchField}. */
export interface SearchFieldProps {
  /** Current query text. */
  value: string
  /** Called with the next query on every edit or clear. */
  onChange: (next: string) => void
  /** Accessible name for the search input. */
  label: string
  /** Accessible name for the clear affordance. */
  clearLabel: string
  /** Placeholder text; omission leaves the field unlabelled visually. */
  placeholder?: string
  /** Extra class for the outer label. */
  className?: string
}

/**
 * Render the shared search field: icon, visually-hidden label, native search
 * input, and an always-mounted clear button.
 * @param props - query value, change callback, and the two accessible names.
 * @returns the labelled search control.
 */
export function SearchField({
  value, onChange, label, clearLabel, placeholder, className,
}: SearchFieldProps) {
  return (
    <label className={clsx(css.field, className)}>
      <IconSearchOutline16 className={css.icon} aria-hidden="true" />
      <span className={css.visuallyHidden}>{label}</span>
      <input
        type="search"
        className={css.input}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => { onChange(event.currentTarget.value) }}
      />
      <button
        type="button"
        className={css.clear}
        data-empty={value.length === 0 ? 'true' : undefined}
        aria-label={clearLabel}
        tabIndex={value.length === 0 ? -1 : 0}
        onClick={() => { onChange('') }}
      >
        <IconCloseOutline16 aria-hidden="true" />
      </button>
    </label>
  )
}
