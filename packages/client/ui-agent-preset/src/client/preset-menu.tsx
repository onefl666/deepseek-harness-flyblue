/**
 * The roster as menu rows, for every surface that offers a preset choice. Name
 * and description together: the id alone never says what a preset does, which
 * is why the roster carries display copy. A preset that published no
 * description still reads as a row, with the shared placeholder standing in.
 */
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetOption } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './AgentPresetChip.module.css'

/**
 * Project one roster into menu entries.
 * @param options - the selectable presets, in roster order.
 * @param t - the preset dictionary seat, for names, descriptions, and the placeholder.
 * @returns one row per option.
 */
export function presetMenuItems(
  options: readonly AgentPresetOption[],
  t: TranslateNS<'settings.agentPreset'>,
): MenuEntry[] {
  return options.map((option) => {
    const text = presetDisplayText(option, t)
    return {
      id: option.id,
      label: (
        <span className={css.item}>
          <span className={css.itemName}>{text.name}</span>
          <span className={css.itemDesc}>{text.description ?? t('noDescription')}</span>
        </span>
      ),
    }
  })
}
