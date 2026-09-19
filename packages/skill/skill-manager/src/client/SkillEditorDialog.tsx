/**
 * Create/edit dialog for one skill. The editor owns the draft and reports only
 * the Host failure text back to the section, so the section keeps a single
 * error channel.
 */

import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SkillDraft, SkillReadValue, SkillScope } from '../types.ts'
import css from './SkillManagerSection.module.css'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Props for {@link SkillEditorDialog}. */
export interface SkillEditorDialogProps {
  /** Locale seat of the owning section. */
  readonly t: PropsLocale<'settings.skills'>['t']
  /** Whether the dialog authors a new skill or rewrites an existing one. */
  readonly mode: 'create' | 'edit'
  /** Existing skill name; required when `mode` is `edit`. */
  readonly name: string | undefined
  /** Absolute directory a new skill is written into. */
  readonly createRoot: string | undefined
  /** Read verb for loading an existing skill into the editor. */
  readonly read: (scope: SkillScope, name: string) => Promise<RemoteResult<SkillReadValue>>
  /** Scope owning the skill. */
  readonly scope: SkillScope
  /** Dismiss the dialog without submitting. */
  readonly onCancel: () => void
  /** Submit the draft; resolves to a failure message, or undefined on success. */
  readonly onSubmit: (draft: SkillDraft) => Promise<string | undefined>
}

/**
 * Render the skill editor dialog.
 * @param props - mode, locale, read verb, and submit handler.
 * @returns the dialog element tree.
 */
export function SkillEditorDialog({
  t, mode, name, createRoot, read, scope, onCancel, onSubmit,
}: SkillEditorDialogProps) {
  const [draftName, setDraftName] = useState(name ?? '')
  const [description, setDescription] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (mode !== 'edit' || name === undefined) return
    let live = true
    void read(scope, name).then((result) => {
      if (!live) return
      setLoading(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setDraftName(result.value.name)
      setBody(result.value.body)
      setDescription(result.value.description)
      setWhenToUse(result.value.whenToUse ?? '')
    })
    return () => { live = false }
  }, [mode, name, read, scope])

  const submit = (): void => {
    if (saving) return
    if (!SKILL_NAME.test(draftName)) {
      setError(t('nameInvalid'))
      return
    }
    if (description.trim() === '') {
      setError(t('descriptionRequired'))
      return
    }
    setSaving(true)
    setError(undefined)
    const draft: SkillDraft = {
      name: draftName,
      description: description.trim(),
      ...whenToUse.trim() === '' ? {} : { whenToUse: whenToUse.trim() },
      body,
    }
    void onSubmit(draft).then((failure) => {
      setSaving(false)
      if (failure !== undefined) setError(failure)
    })
  }

  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('close')}
      title={mode === 'create' ? t('createTitle') : t('editTitle')}
      description={mode === 'create'
        ? createRoot === undefined ? t('createIntroNoRoot') : t('createIntro').replace('{root}', createRoot)
        : t('editIntro')}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="outline" disabled={saving} onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" disabled={saving || loading} onClick={submit}>
            {saving ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <div className={css.form}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('name')}</span>
          <Input
            aria-label={t('name')}
            placeholder={t('namePlaceholder')}
            value={draftName}
            disabled={mode === 'edit'}
            onChange={(event) => { setDraftName(event.target.value) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('description')}</span>
          <Input
            aria-label={t('description')}
            placeholder={t('descriptionPlaceholder')}
            value={description}
            onChange={(event) => { setDescription(event.target.value) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('whenToUse')}</span>
          <Input
            aria-label={t('whenToUse')}
            placeholder={t('whenToUsePlaceholder')}
            value={whenToUse}
            onChange={(event) => { setWhenToUse(event.target.value) }}
          />
        </label>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('body')}</span>
          <textarea
            className={css.bodyEditor}
            aria-label={t('body')}
            placeholder={t('bodyPlaceholder')}
            value={body}
            rows={10}
            onChange={(event) => { setBody(event.target.value) }}
          />
        </label>
        {error !== undefined ? <p className={css.formError} role="alert">{error}</p> : null}
      </div>
    </Modal>
  )
}
