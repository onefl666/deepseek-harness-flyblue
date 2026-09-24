/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 *
 * It is the host half of {@link ModelMenu}: it supplies the session's shared
 * ModelDirectory and commits a pick through `session.selectModel`, so a switch
 * here and a switch in the /model popup are one state. The plan-review card
 * hosts the same menu against a staged selection instead — see
 * ModelExecutionSelect.
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import { ModelMenu } from './ModelMenu.tsx'

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the menu over this session's directory, or null when the session
 * exposes no Agent-bound model RPC.
 */
export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  if (!available) return null
  const apply = async (selection: Parameters<typeof select>[0]) => {
    const result = await select(selection)
    if (result?.ok === true) return { ok: true as const }
    if (result?.ok === false) return {
      ok: false as const,
      message: result.error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${result.error.code}: ${result.error.message}` }),
    }
    return { ok: false as const, message: t('error.unavailable') }
  }
  return <ModelMenu value={null} store={directory} load={load} apply={apply} locked={locked} t={t} />
}
