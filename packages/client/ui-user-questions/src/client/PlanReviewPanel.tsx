// PlanReviewPanel: the composer takeover for a question carrying the
// `plan-review` presentation intent. A plan under review is one decision over
// one body of markdown, so it takes the waiting-approval card shape — tinted
// strip, content, right-aligned action row — instead of the generic question
// flow's pager, numbered options, skip and custom-answer affordances, which
// read as a quiz the user is being graded on.
//
// Discuss dismisses the request so the composer returns. Refine stays in plan
// mode. Each approve label leaves plan mode on a different execution path.
//
// The card also carries the execution settings the review declared: what the
// approved plan should run on (model and thinking intensity, from the seats
// that own those contracts) and, where a fresh session is the decision, the
// agent preset that session composes. Every setting is staged here and
// committed by the approval — so refining the plan leaves the session, and the
// composition of the session that is already running, exactly as they were.

import { useMemo, useState } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  Button, extractMarkdownPlainText, IconEditOutlineRegular, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingQuestion, PlanReview, QuestionComposerProps } from './contract/slots.ts'
import css from './PlanReviewPanel.module.css'

/** The setting name whose value only a session created from scratch can take. */
const AGENT_PRESET_SETTING = 'agentPreset'

/** The panel's own props: the question domain face, the narrowed review, the two declared seats, and the locale seat. */
export type PlanReviewPanelProps = {
  pending: PendingQuestion
  review: PlanReview
  /** Render a declared execution-setting seat (`question.planReview.*`). */
  renderSlot: QuestionComposerProps['renderSlot']
} & Pick<QuestionComposerProps, 't' | 'commitModel'>

/**
 * Localise a known execution-path label; unknown labels use the generic approve
 * copy. The labels are the asker's own: the Host maps the answered one back to
 * an execution mode by exact comparison, so they stay untranslated here and on
 * the wire.
 */
function approveCopy(label: string, t: PlanReviewPanelProps['t']): string {
  switch (label) {
    case 'Approve and execute':
      return t('plan.approve.execute')
    case 'Approve and compact context':
      return t('plan.approve.compact')
    case 'Approve and keep context':
      return t('plan.approve.keep')
    default:
      return t('plan.approve')
  }
}

/**
 * Optional-prop spread for a decision button's tooltip: `title` is optional on
 * the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
 *
 * @param description - the asker's option description, when it carries one.
 * @returns The `title` prop to spread, or nothing.
 */
function tooltip(description: string | undefined): { title?: string } {
  return description === undefined ? {} : { title: description }
}

/**
 * Render plan review controls; the submitted document opens in the sidebar.
 *
 * @param props - the question domain face, the narrowed plan review, the two
 * declared seats, and `t`.
 * @returns The plan-review takeover for this request.
 */
export function PlanReviewPanel({
  pending, review, t, renderSlot, commitModel,
}: PlanReviewPanelProps) {
  // The panel waits for the host's resolved frame before leaving, so repeated
  // clicks must not resubmit. A failed send re-enables it and shows the error.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Staged execution settings: null means the reviewer left that choice alone,
  // and the plan then runs on what the session (or the fresh session's
  // inheritance) already carries.
  const [stagedModel, setStagedModel] = useState<ModelSelection | null>(null)
  const [stagedPreset, setStagedPreset] = useState<string | null>(null)
  // The fresh-session step: the preset choice belongs to the one approve path
  // that opens a session able to take it, so it is asked for only there.
  const [confirmingFresh, setConfirmingFresh] = useState(false)
  const settle = (send: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void send().catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  const decide = (label: string): void => {
    settle(async () => {
      const fresh = label === 'Approve and execute'
      const approving = review.approves.some(option => option.label === label)
      const settings: Record<string, string> = {}
      if (approving && stagedModel !== null && review.settings.includes('provider') && review.settings.includes('model')) {
        if (fresh) {
          settings.provider = stagedModel.provider
          settings.model = stagedModel.model
          if (stagedModel.reasoningEffort !== undefined && review.settings.includes('reasoningEffort')) {
            settings.reasoningEffort = stagedModel.reasoningEffort
          }
        } else if (!await commitModel(stagedModel)) {
          throw new Error(t('plan.execution.rejected'))
        }
      }
      if (fresh && stagedPreset !== null && review.settings.includes(AGENT_PRESET_SETTING)) {
        settings[AGENT_PRESET_SETTING] = stagedPreset
      }
      await pending.answer({
        answers: [{
          id: review.id,
          selected: [label],
          ...Object.keys(settings).length === 0 ? {} : { settings },
        }],
      })
    })
  }
  const startDecision = (label: string): void => {
    // The fresh session is the one path whose session does not exist yet, so it
    // is the only one a preset can be chosen for.
    if (label === 'Approve and execute' && review.settings.includes(AGENT_PRESET_SETTING)) {
      setConfirmingFresh(true)
      setError(null)
      return
    }
    decide(label)
  }
  const refine = review.refine
  const summary = useMemo(() => {
    const title = extractMarkdownPlainText(review.plan, { mode: 'first-line' })
    const description = extractMarkdownPlainText(review.plan, { mode: 'first-paragraph' })
    return { title, description: description === title ? '' : description }
  }, [review.plan])

  return (
    <div className={css.frame} data-plan-review-key={pending.key}>
      <section className={css.card} aria-label={review.question} aria-busy={busy}>
        <div className={css.strip}>
          <StateDot state={busy ? 'ongoing' : 'warning'} />
          {t('plan.header')}
          <div className={css.previewActions}>
            {renderSlot('conversation.plan-review.actions', { review, requestKey: pending.key })}
          </div>
        </div>
        <div className={css.summary}>
          <h3 className={css.title}>{summary.title}</h3>
          {summary.description !== '' && <p className={css.description}>{summary.description}</p>}
        </div>
        <div className={css.footer}>
          {review.settings.includes('provider') && review.settings.includes('model') && (
            <div className={css.settings}>
              {renderSlot('question.planReview.model', {
                value: stagedModel,
                onChange: setStagedModel,
                locked: busy,
              })}
            </div>
          )}
          {confirmingFresh && (
            <>
              <div className={css.settings}>
                {renderSlot('question.planReview.agentPreset', {
                  value: stagedPreset,
                  onChange: setStagedPreset,
                  locked: busy,
                })}
              </div>
              <p className={css.note}>{t('plan.execution.freshNote')}</p>
            </>
          )}
          <div className={css.row}>
            <div className={css.feedback} role="status">{error}</div>
            <div className={css.actions}>
              <Button
                variant="outline" className={css.discuss} icon={<IconEditOutlineRegular size={14} />}
                disabled={busy} onClick={() => { settle(() => pending.cancel()) }}
              >
                {t('plan.discuss')}
              </Button>
              {confirmingFresh
                ? (
                  <>
                    <Button
                      variant="outline" disabled={busy}
                      onClick={() => { setConfirmingFresh(false) }}
                    >
                      {t('plan.execution.back')}
                    </Button>
                    <Button
                      variant="primary" disabled={busy}
                      onClick={() => { decide('Approve and execute') }}
                    >
                      {t('plan.execution.start')}
                    </Button>
                  </>
                )
                : (
                  <>
                    {refine !== undefined && (
                      <Button
                        variant="outline" {...tooltip(refine.description)}
                        disabled={busy} onClick={() => { decide(refine.label) }}
                      >
                        {refine.label === 'Refine plan' ? t('plan.refine') : t('plan.decline')}
                      </Button>
                    )}
                    {review.approves.map((option, index) => (
                      <Button
                        key={option.label}
                        variant={index === review.approves.length - 1 ? 'primary' : 'outline'}
                        {...tooltip(option.description)}
                        disabled={busy} onClick={() => { startDecision(option.label) }}
                      >
                        {approveCopy(option.label, t)}
                      </Button>
                    ))}
                  </>
                )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
