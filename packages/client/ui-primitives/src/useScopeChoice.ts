/**
 * Scope choice for a manager settings section: which workspace, if any, the
 * section reads, and the picker state that chooses it. Every manager section
 * resolves the same three things from a workspace list, so they resolve here.
 */
import { useCallback, useMemo, useState } from 'react'
import type { ScopePickerWorkspace, ScopeSelection } from './ScopePicker.tsx'

/**
 * What a section reads. Both manager packages declare this same union for
 * their own Remote verbs, so a section passes this value straight through.
 */
export type ManagerScope =
  | { readonly kind: 'user' }
  | { readonly kind: 'workspace'; readonly cwd: string }

/** One section's scope choice, for its verbs and its toolbar alike. */
export interface ScopeChoice {
  /** Workspaces the picker offers, in the order they appear. */
  readonly workspaces: readonly ScopePickerWorkspace[]
  /** The scope to read: the user scope, or the chosen workspace directory. */
  readonly scope: ManagerScope
  /** The picker's current choice. */
  readonly picked: ScopeSelection
  /** Whether the choice names a workspace the list does not supply. */
  readonly blocked: boolean
  /** Called with the picked scope. */
  readonly select: (scope: ScopeSelection) => void
}

/**
 * Track one section's scope choice.
 * @param workspaces - the workspaces the picker offers; the first is the fallback for a nameless choice.
 * @returns the scope to read, the picker's choice, and the selection callback.
 */
export function useScopeChoice(workspaces: readonly ScopePickerWorkspace[]): ScopeChoice {
  const [chosenId, setChosenId] = useState<string | undefined>(undefined)
  const [kind, setKind] = useState<'user' | 'workspace'>('user')
  // The pick a section restored from nothing falls back to the first workspace,
  // which is what the section read before the user chose anything.
  const workspace = workspaces.find(item => item.workspaceId === chosenId) ?? workspaces[0]
  const selected = kind === 'workspace' ? workspace : undefined
  const select = useCallback((picked: ScopeSelection): void => {
    if (picked.kind === 'workspace') setChosenId(picked.workspaceId)
    setKind(picked.kind)
  }, [])
  // The choice's identity is the sections' read dependency: a fresh object per
  // render would re-read the listing on every render.
  return useMemo(() => ({
    workspaces,
    scope: selected === undefined ? { kind: 'user' as const } : { kind: 'workspace' as const, cwd: selected.path },
    picked: selected === undefined
      ? { kind: 'user' as const }
      : { kind: 'workspace' as const, workspaceId: selected.workspaceId },
    blocked: kind === 'workspace' && selected === undefined,
    select,
  }), [workspaces, kind, selected, select])
}
