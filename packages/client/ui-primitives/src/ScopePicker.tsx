/**
 * ScopePicker: the toolbar control that chooses whether a settings section
 * reads the user-wide scope or one workspace. The menu it opens is the same
 * list every section offers, so the picker owns the items, the current label,
 * and the chosen id rather than leaving three derivations to each caller.
 */
import { useState, type ReactNode } from 'react'
import { Menu, type MenuItem } from './Menu.tsx'
import css from './ScopePicker.module.css'

/** Prefix that keeps a workspace row distinct from the user-wide one in the menu's id space. */
const WORKSPACE_PREFIX = 'workspace:'

/** One workspace the picker can select. */
export interface ScopePickerWorkspace {
  /** Stable workspace identity. */
  readonly workspaceId: string
  /** Display title the menu row and the trigger show. */
  readonly title: string
  /** Absolute directory the workspace reads. */
  readonly path: string
}

/** The scope a picker selects. */
export type ScopeSelection =
  | { readonly kind: 'user' }
  | { readonly kind: 'workspace'; readonly workspaceId: string }

/** Complete localized copy for the picker. */
export interface ScopePickerLabels {
  /** Accessible name of the trigger. */
  readonly aria: string
  /** Label of the user-wide scope. */
  readonly user: string
  /** Label shown while the chosen workspace is no longer offered. */
  readonly noWorkspace: string
}

/** ScopePicker props: the offered workspaces, the chosen scope, and complete labels. */
export interface ScopePickerProps {
  /** Workspaces the menu offers, in the order they appear. */
  readonly workspaces: readonly ScopePickerWorkspace[]
  /** The chosen scope. */
  readonly scope: ScopeSelection
  /** Glyph marking the trigger. */
  readonly icon: ReactNode
  /** Complete localized copy; the picker owns no fallback. */
  readonly labels: ScopePickerLabels
  /** Called with the chosen scope. */
  readonly onSelect: (scope: ScopeSelection) => void
}

/**
 * Render the scope picker.
 * @param props - the offered workspaces, the chosen scope, the glyph, labels, and the selection callback.
 * @returns the trigger and, while open, its workspace menu.
 */
export function ScopePicker({ workspaces, scope, icon, labels, onSelect }: ScopePickerProps) {
  const [open, setOpen] = useState(false)
  const items: MenuItem[] = [
    { id: 'user', label: labels.user },
    ...workspaces.map(workspace => ({
      id: `${WORKSPACE_PREFIX}${workspace.workspaceId}`,
      label: workspace.title,
    })),
  ]
  const chosen = scope.kind === 'workspace'
    ? workspaces.find(workspace => workspace.workspaceId === scope.workspaceId)
    : undefined
  const label = scope.kind === 'user' ? labels.user : chosen?.title ?? labels.noWorkspace

  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={items}
      selectedId={scope.kind === 'user' ? 'user' : `${WORKSPACE_PREFIX}${scope.workspaceId}`}
      onSelect={(id) => {
        setOpen(false)
        onSelect(id === 'user'
          ? { kind: 'user' }
          : { kind: 'workspace', workspaceId: id.slice(WORKSPACE_PREFIX.length) })
      }}
      portal
      align="start"
      anchor={(
        <button
          type="button"
          className={css.scope}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={labels.aria}
          onClick={() => { setOpen(current => !current) }}
        >
          <span className={css.scopeIcon} aria-hidden="true">{icon}</span>
          <span className={css.scopeText}>{label}</span>
        </button>
      )}
    />
  )
}
