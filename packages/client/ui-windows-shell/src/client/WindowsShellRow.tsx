/**
 * Windows shell preference row: which shell stack the next launch mounts on a
 * Windows host. The restart scope is stated in the row copy itself — the host
 * seeds the composition from the stored preference, it cannot swap a running
 * one.
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WindowsShellId, WindowsShellRowState } from './settings-store.ts'
import { WINDOWS_SHELL_IDS } from './settings-store.ts'
import type { WindowsShellSettingsKey } from './locales.ts'
import css from './WindowsShellRow.module.css'

/** Registration-side business face for the host-backed preference. */
export interface WindowsShellRowInjected {
  hooks: {
    /** Windows shell snapshot bound by the renderer as useWindowsShell. */
    windowsShell: SnapshotStore<WindowsShellRowState>
  }
  /** Load the descriptor when the row first renders. */
  load: () => Promise<void>
  /** Persist one selectable shell id. */
  select: (shell: WindowsShellId) => Promise<void>
}

/** Full component props. */
export type WindowsShellRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.windows-shell'>
  & InjectFace<WindowsShellRowInjected>

/** Locale key for each shell id's product label, in menu order. */
const LABEL_KEYS: Record<WindowsShellId, WindowsShellSettingsKey> = {
  gitbash: 'shell.gitbash',
  pwsh: 'shell.pwsh',
}

/**
 * Render the Windows shell selector.
 * @param props - composed slot props.
 * @returns the row, or null when the host does not expose the namespace.
 */
export function WindowsShellRow({ load, select, useWindowsShell, t }: WindowsShellRowProps) {
  const state = useWindowsShell(snapshot => snapshot)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (state.writable && state.status !== 'unavailable') return
    setOpen(false)
  }, [state.status, state.writable])

  if (state.status === 'unavailable') return null
  const busy = state.status === 'loading' || state.status === 'saving'
  const label = busy ? t('loading') : t(LABEL_KEYS[state.current])
  const description: string = state.error ?? t('description')

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.desc} role={state.error === null ? undefined : 'alert'}>{description}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={WINDOWS_SHELL_IDS.map(id => ({ id, label: t(LABEL_KEYS[id]) }))}
        selectedId={state.current}
        onSelect={(id) => {
          setOpen(false)
          if (id === state.current) return
          void select(id as WindowsShellId)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy || !state.writable}
            onClick={() => { setOpen(value => !value) }}
          >
            {label}
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Windows shell row copy. */
    'settings.windows-shell': WindowsShellSettingsKey
  }
}
