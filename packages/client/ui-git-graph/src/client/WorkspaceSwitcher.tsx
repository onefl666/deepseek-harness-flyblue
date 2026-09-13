/**
 * Workspace chooser for the Git panel header. The panel shows one workspace at
 * a time and this control is how an operator points it at another one, so the
 * choice is visible where the data is rather than in a separate settings step.
 * Composed from the shared menu primitive; the trigger carries the caption,
 * which is what names the control for a reader who cannot see its position.
 */

import { useState } from 'react'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import {
  IconChevronDownOutline14, IconCheckOutline16, IconFolderOpenOutline16, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceNamed } from './workspace-scope.ts'
import css from './section.module.css'

/** Menu row keys are ids, not positions, so the first row needs its own. */
const CAPTION_ID = 'scope'

/** Props of the workspace chooser. */
export interface WorkspaceSwitcherProps {
  /** Registered workspaces in registry order. */
  workspaces: readonly WorkspaceView[]
  /** Workspace currently shown. */
  selected: WorkspaceView
  /** Workspace the open session belongs to, marked in the list. */
  sessionWorkspaceId: WorkspaceId | undefined
  /** Visible caption naming what the control chooses. */
  caption: string
  /** Workspace the operator picked. */
  onSelect: (workspace: WorkspaceView) => void
}

/**
 * Render the workspace chooser.
 * @param props - registered workspaces, the shown one, and the pick callback.
 * @returns the trigger and its menu.
 */
export function WorkspaceSwitcher({ workspaces, selected, sessionWorkspaceId, caption, onSelect }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      className={css.switcherAnchor}
      items={[
        { type: 'label', id: CAPTION_ID, text: caption },
        ...workspaces.map(workspace => ({
          id: workspace.workspaceId,
          label: (
            <span className={css.switcherRow}>
              <span className={css.switcherTitle}>{workspace.title}</span>
              <span className={css.switcherPath}>{workspace.path}</span>
            </span>
          ),
          // The open session's workspace is marked, because leaving it is the
          // change an operator most often makes by accident.
          icon: workspace.workspaceId === sessionWorkspaceId ? <IconCheckOutline16 /> : undefined,
        })),
      ]}
      selectedId={selected.workspaceId}
      onSelect={(id) => { setOpen(false); onSelect(workspaceNamed(workspaces, id, selected)) }}
      align="start"
      portal
      anchor={(
        <button
          type="button"
          className={css.switcher}
          aria-haspopup="menu"
          aria-expanded={open}
          title={selected.path}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconFolderOpenOutline16 className={css.switcherIcon} />
          <span className={css.switcherCaption}>{caption}</span>
          <span className={css.switcherLabel}>{selected.title}</span>
          <IconChevronDownOutline14 className={css.switcherChevron} />
        </button>
      )}
    />
  )
}
