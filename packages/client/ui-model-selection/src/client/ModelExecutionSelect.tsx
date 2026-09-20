/**
 * ModelExecutionSelect: the plan-review card's model and thinking-intensity
 * control ('question.planReview.model').
 *
 * It hosts the same {@link ModelMenu} over the session's shared ModelDirectory
 * as the composer seat, and differs in one thing: a pick is staged on the card
 * instead of committed to the session. The card is a decision, so a user who
 * opens the menu and then refines the plan must leave the planning session
 * exactly as it was; the review's staged value is what an approval commits.
 */
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { PlanReviewModelOwnerProps } from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ModelMenu } from './ModelMenu.tsx'
import type { ModelExecutionSelectInjected } from './slots.ts'
import css from './ModelMenu.module.css'

/**
 * Render the plan-review execution-model control.
 * @param props - the card's staged share, the injected directory face, and the
 * standard locale seat.
 * @returns the labelled menu, or null when this session exposes no
 * Agent-bound model RPC.
 */
export function ModelExecutionSelect({
  value, onChange, locked, available, directory, load, t,
}: ModelExecutionSelectInjected & PlanReviewModelOwnerProps & PropsLocale<'model'>) {
  if (!available) return null
  // Staging cannot fail: the card is the only holder of the value, and the
  // Host is asked once, when the approval commits it.
  const stage = (selection: ModelSelection): Promise<boolean> => {
    onChange(selection)
    return Promise.resolve(true)
  }
  return (
    <>
      <span className={css.rowLabel}>{t('planReview.label')}</span>
      <ModelMenu value={value} store={directory} load={load} apply={stage} locked={locked} t={t} />
    </>
  )
}
