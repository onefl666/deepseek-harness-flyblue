/**
 * AgentPresetChoice: the agent preset a fresh execution session composes
 * ('question.planReview.agentPreset').
 *
 * The plan-review counterpart of the new-session chip — the same roster, the
 * same display copy, over a controlled value. It stages the pick instead of
 * applying it, because the session that receives it does not exist yet: the
 * handoff creates it once the review is approved, and a session's composition
 * is fixed from the moment it starts.
 *
 * It renders nothing where a pick could not be used. A deployment that
 * composes no presets offers none, and a planning session that joined none has
 * nothing to inherit, so there is no value this control could honestly show.
 */
import { useEffect, useState } from 'react'
import {
  IconAgentPresetOutline16, IconChevronDownOutline14, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the plan-review card's SlotMap merge (the execution-preset seat).
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { AgentPresetSettingsState } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import { presetMenuItems } from './preset-menu.tsx'
import css from './AgentPresetChip.module.css'

/** Registration-side business face for the plan-review preset control. */
export interface AgentPresetChoiceInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>
  }
  /** Read the roster, so the control offers names rather than ids. */
  load: () => Promise<void>
}

/** Full component props. */
export type AgentPresetChoiceProps =
  PropsRuntime<'question.planReview.agentPreset'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetChoiceInjected>

/**
 * Render the preset the fresh execution session would compose.
 * @param props - composed slot props: the staged share, the roster face, and `t`.
 * @returns the chip and its roster menu, or null when there is no preset to show.
 */
export function AgentPresetChoice({
  value, onChange, locked, sessionId, useSessions, useAgentPresets, load, t,
}: AgentPresetChoiceProps) {
  const [open, setOpen] = useState(false)
  const options = useAgentPresets(state => state.options)
  // The approved plan executes on the composition its planning history was
  // produced under unless the reviewer picks another, so the chip opens there.
  const inherited = useSessions((state) => {
    const recorded = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof recorded === 'string' ? recorded : undefined
  })

  useEffect(() => {
    void load()
  }, [load])

  const shown = value ?? inherited
  if (options.length === 0 || shown === undefined) return null
  const chosen = options.find(option => option.id === shown)
  const chosenText = chosen === undefined ? undefined : presetDisplayText(chosen, t)

  return (
    <>
      <span className={css.rowLabel}>{t('choiceLabel')}</span>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={presetMenuItems(options, t)}
        selectedId={shown}
        onSelect={(id) => {
          setOpen(false)
          onChange(id)
        }}
        align="start"
        portal
        className={css.menuAnchor}
        anchor={(
          <button
            type="button"
            className={css.seat}
            aria-haspopup="menu"
            aria-expanded={open}
            title={chosenText?.description ?? t('seatHint')}
            disabled={locked}
            onClick={() => { setOpen(current => !current) }}
          >
            <IconAgentPresetOutline16 size={14} className={css.seatIcon} />
            <span className={css.seatLabel}>{chosenText?.name ?? shown}</span>
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </>
  )
}
