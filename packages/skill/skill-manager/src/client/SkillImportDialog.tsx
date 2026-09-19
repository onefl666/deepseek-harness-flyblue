/**
 * Import dialog for one skill: a local directory copy or a shallow clone of a
 * repository that carries a single skill. The mode switch and both forms share
 * one dialog so the section owns a single "install" path.
 */

import { useState } from 'react'
import { Button, Input, Modal, SegmentedRange } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SkillManagerSection.module.css'

/** Which install source the dialog edits. */
export type ImportMode = 'directory' | 'git'

/** Props for {@link SkillImportDialog}. */
export interface SkillImportDialogProps {
  /** Locale seat of the owning section. */
  readonly t: PropsLocale<'settings.skills'>['t']
  /** Source the dialog currently edits. */
  readonly mode: ImportMode
  /** Switch the edited source. */
  readonly onModeChange: (mode: ImportMode) => void
  /** Dismiss the dialog without submitting. */
  readonly onCancel: () => void
  /** Submit the path or URL; resolves to a failure message, or undefined on success. */
  readonly onSubmit: (value: string, ref: string | undefined) => Promise<string | undefined>
}

/**
 * Render the skill import dialog.
 * @param props - mode, locale, and submit handler.
 * @returns the dialog element tree.
 */
export function SkillImportDialog({
  t, mode, onModeChange, onCancel, onSubmit,
}: SkillImportDialogProps) {
  const [path, setPath] = useState('')
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const submit = (): void => {
    if (importing) return
    const value = mode === 'git' ? url.trim() : path.trim()
    if (value === '') {
      setError(mode === 'git' ? t('urlRequired') : t('pathRequired'))
      return
    }
    setImporting(true)
    setError(undefined)
    void onSubmit(value, mode === 'git' && ref.trim() !== '' ? ref.trim() : undefined).then((failure) => {
      setImporting(false)
      if (failure !== undefined) setError(failure)
    })
  }

  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('close')}
      title={t('importTitle')}
      description={t('importIntro')}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="outline" disabled={importing} onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" disabled={importing} onClick={submit}>
            {importing ? t('importing') : t('importSubmit')}
          </Button>
        </>
      )}
    >
      <div className={css.form}>
        <SegmentedRange
          aria-label={t('importTitle')}
          value={mode}
          minWidth="120px"
          options={[
            { value: 'directory', label: t('importDirectory') },
            { value: 'git', label: t('importGit') },
          ]}
          onChange={onModeChange}
        />
        {mode === 'directory'
          ? (
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('importDirectory')}</span>
              <Input
                aria-label={t('importPath')}
                placeholder={t('importPath')}
                value={path}
                onChange={(event) => { setPath(event.target.value) }}
              />
            </label>
          )
          : (
            <>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('importGit')}</span>
                <Input
                  aria-label={t('importUrl')}
                  placeholder={t('importUrl')}
                  value={url}
                  onChange={(event) => { setUrl(event.target.value) }}
                />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('importRef')}</span>
                <Input
                  aria-label={t('importRef')}
                  placeholder={t('importRef')}
                  value={ref}
                  onChange={(event) => { setRef(event.target.value) }}
                />
              </label>
            </>
          )}
        {error !== undefined ? <p className={css.formError} role="alert">{error}</p> : null}
      </div>
    </Modal>
  )
}
