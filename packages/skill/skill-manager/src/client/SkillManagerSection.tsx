/**
 * Skill management settings section: the scope switcher, the searchable list of
 * every skill the scope reads, per-row enable/disable and removal, and the
 * create/import dialogs. Every mutation reconciles from the Host's returned
 * listing, so the page never predicts a filesystem outcome.
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Button, IconEllipsisOutline16, IconPlusOutline16, IconSkillOutline16, Menu,
  SectionChrome, SectionState, SectionToolbar, StateDot, Switch, Tag, Toast,
  sectionToolbarLabels, useRemoteList, useScopeChoice,
  type MenuItem, type StateDotState, type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SkillDraft, SkillEntryView, SkillListView, SkillReadValue, SkillScope } from '../types.ts'
import { SkillEditorDialog } from './SkillEditorDialog.tsx'
import { SkillImportDialog, type ImportMode } from './SkillImportDialog.tsx'
import css from './SkillManagerSection.module.css'

/** Remote dependency surface used by the skill manager section. */
export interface SkillManagerSectionInjected {
  /** Read the scope's roots and skills. */
  list: (scope: SkillScope) => Promise<RemoteResult<SkillListView>>
  /** Read one skill's stored document. */
  read: (scope: SkillScope, name: string) => Promise<RemoteResult<SkillReadValue>>
  /** Author a new skill. */
  create: (scope: SkillScope, draft: SkillDraft) => Promise<RemoteResult<SkillListView>>
  /** Rewrite one managed skill. */
  update: (scope: SkillScope, name: string, draft: SkillDraft) => Promise<RemoteResult<SkillListView>>
  /** Delete one managed skill. */
  uninstall: (scope: SkillScope, name: string) => Promise<RemoteResult<SkillListView>>
  /** Move one managed skill between its root and the disabled area. */
  setEnabled: (scope: SkillScope, name: string, enabled: boolean) => Promise<RemoteResult<SkillListView>>
  /** Copy a local directory into the scope's create root. */
  installFromDirectory: (scope: SkillScope, path: string) => Promise<RemoteResult<SkillListView>>
  /** Clone a repository and copy the skill it carries. */
  installFromGit: (scope: SkillScope, url: string, ref?: string) => Promise<RemoteResult<SkillListView>>
}

/** Which dialog the section currently shows. */
type DialogState =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly name: string }
  | { readonly kind: 'import' }

/** The dot each enablement state maps to. */
const ENABLED_DOT: Readonly<Record<'on' | 'off', StateDotState>> = { on: 'done', off: 'idle' }

/** The tag tone each root origin uses. */
const ORIGIN_TONE: Readonly<Record<string, TagTone>> = { dsh: 'outline', agents: 'neutral', bundled: 'quiet' }

/**
 * Resolve the localized label of the root a skill was found in.
 * @param t - the section's locale seat.
 * @param skill - entry whose root is described.
 * @returns the caller-localized root label.
 */
export function sourceText(
  t: PropsLocale<'settings.skills'>['t'],
  skill: Pick<SkillEntryView, 'kind' | 'origin'>,
): string {
  if (skill.origin === 'bundled') return t('sourceBundled')
  if (skill.kind === 'project') return skill.origin === 'dsh' ? t('sourceDsh') : t('sourceAgents')
  return skill.origin === 'dsh' ? t('sourceUserDsh') : t('sourceUserAgents')
}

/**
 * Render the skill management settings section.
 * @param props - locale, Remote verbs, and the shared framework hooks.
 * @returns the section element tree.
 */
export function SkillManagerSection({
  t, list, read, create, update, uninstall, setEnabled, installFromDirectory, installFromGit,
  useWorkspaces,
}: PropsLocale<'settings.skills'> & InjectFace<SkillManagerSectionInjected> & PropsRuntime<'settings.section'>) {
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const [query, setQuery] = useState('')
  const [importMode, setImportMode] = useState<ImportMode>('directory')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [confirming, setConfirming] = useState<string | undefined>(undefined)
  const [rowMenu, setRowMenu] = useState<string | undefined>(undefined)
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false)

  const choice = useScopeChoice(workspaces)
  const scope = choice.scope
  const listing = useRemoteList(list, scope)

  /** Settle one row mutation: the confirm it may have armed is over either way. */
  const applied = (result: RemoteResult<SkillListView>, name: string, template: string): void => {
    setConfirming(undefined)
    listing.applied(result, name, template)
  }

  const { view } = listing
  const skills = view.status === 'ready' ? view.value.skills : []
  const createRoot = view.status === 'ready' ? view.value.createRoot : undefined
  const needle = query.trim().toLowerCase()
  const filtered = needle === ''
    ? skills
    : skills.filter(skill => skill.name.toLowerCase().includes(needle)
      || skill.description.toLowerCase().includes(needle))

  const scopeBlocked = choice.blocked
  const toolbarItems: MenuItem[] = [
    { id: 'directory', label: t('importDirectory') },
    { id: 'git', label: t('importGit') },
  ]

  return (
    <section className={css.section} data-skill-manager aria-busy={listing.busy}>
      <SectionChrome
        labels={{ refresh: t('refresh'), refreshing: t('refreshing'), errorSummary: t('error'), retry: t('retry') }}
        title={t('title')}
        intro={t('intro')}
        meta={<span className={css.counts}>{t('installed').replace('{count}', String(skills.length))}</span>}
        busy={listing.busy}
        onRefresh={listing.refresh}
        error={listing.error}
      />
      {scopeBlocked ? <p className={css.notice} role="status">{t('noWorkspace')}</p> : null}
      <SectionToolbar
        scope={choice}
        scopeIcon={<IconSkillOutline16 />}
        query={query}
        onQueryChange={setQuery}
        labels={sectionToolbarLabels(t)}
      >
        <Menu
          open={toolbarMenuOpen}
          onClose={() => { setToolbarMenuOpen(false) }}
          items={toolbarItems}
          onSelect={(id) => {
            setToolbarMenuOpen(false)
            setImportMode(id === 'git' ? 'git' : 'directory')
            setDialog({ kind: 'import' })
          }}
          portal
          align="end"
          closeOnPointerLeave
          anchor={(
            <button
              type="button"
              className={css.toolbarButton}
              aria-haspopup="menu"
              aria-expanded={toolbarMenuOpen}
              onClick={() => { setToolbarMenuOpen(value => !value) }}
            >
              {t('import')}
            </button>
          )}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<IconPlusOutline16 />}
          disabled={createRoot === undefined}
          onClick={() => { setDialog({ kind: 'create' }) }}
        >
          {t('create')}
        </Button>
      </SectionToolbar>
      <SectionState
        loading={view.status === 'loading'}
        rows={3}
        failure={view.status === 'error' ? view.message : undefined}
        labels={{ loading: t('loading'), error: t('error') }}
      >
        {skills.length === 0
          ? <p className={css.empty}>{t('empty')}</p>
          : filtered.length === 0
            ? <p className={css.empty}>{t('emptySearch')}</p>
            : (
              <ul className={css.list}>
                {filtered.map((skill, index) => (
                  <SkillRow
                    key={`${skill.origin}:${skill.kind}:${skill.name}`}
                    t={t}
                    skill={skill}
                    index={index}
                    menuOpen={rowMenu === skill.name}
                    confirming={confirming === skill.name}
                    removing={listing.removing === skill.name}
                    onMenuToggle={(open) => { setRowMenu(open ? skill.name : undefined) }}
                    onToggleEnabled={(next) => {
                      listing.begin(skill.name)
                      void setEnabled(scope, skill.name, next).then((result) => {
                        applied(result, skill.name, t(next ? 'toastEnabled' : 'toastDisabled'))
                      })
                    }}
                    onEdit={() => { setDialog({ kind: 'edit', name: skill.name }) }}
                    onUninstall={() => {
                      listing.begin(skill.name)
                      void uninstall(scope, skill.name).then((result) => {
                        applied(result, skill.name, t('toastRemoved'))
                      })
                    }}
                    onConfirm={() => { setConfirming(skill.name) }}
                  />
                ))}
              </ul>
            )}
      </SectionState>
      {dialog?.kind === 'create' || dialog?.kind === 'edit'
        ? (
          <SkillEditorDialog
            t={t}
            mode={dialog.kind}
            name={dialog.kind === 'edit' ? dialog.name : undefined}
            createRoot={createRoot}
            read={read}
            scope={scope}
            onCancel={() => { setDialog(null) }}
            onSubmit={(draft) => {
              const creating = dialog.kind === 'create'
              return (creating ? create(scope, draft) : update(scope, dialog.name, draft))
                .then((result) => {
                  const failure = listing.adopt(result)
                  if (failure !== null) return failure
                  setDialog(null)
                  listing.announce(t(creating ? 'toastCreated' : 'toastSaved').replace('{name}', draft.name))
                  return undefined
                })
            }}
          />
        )
        : null}
      {dialog?.kind === 'import'
        ? (
          <SkillImportDialog
            t={t}
            mode={importMode}
            onModeChange={setImportMode}
            onCancel={() => { setDialog(null) }}
            onSubmit={(value, ref) => {
              const installing = importMode === 'git'
                ? installFromGit(scope, value, ref)
                : installFromDirectory(scope, value)
              return installing.then((result) => {
                const failure = listing.adopt(result)
                if (failure !== null) return failure
                setDialog(null)
                listing.announce(t('toastInstalled').replace('{name}', value.split(/[\\/]/).pop() ?? value))
                return undefined
              })
            }}
          />
        )
        : null}
      {listing.toast !== null
        ? <Toast key={listing.toast.seq} text={listing.toast.text} onDone={listing.dismissToast} />
        : null}
    </section>
  )
}

/** One skill row: identity, source, state, and its actions. */
function SkillRow({
  t, skill, index, menuOpen, confirming, removing, onMenuToggle, onToggleEnabled, onEdit, onUninstall, onConfirm,
}: {
  readonly t: PropsLocale<'settings.skills'>['t']
  readonly skill: SkillEntryView
  readonly index: number
  readonly menuOpen: boolean
  readonly confirming: boolean
  readonly removing: boolean
  readonly onMenuToggle: (open: boolean) => void
  readonly onToggleEnabled: (next: boolean) => void
  readonly onEdit: () => void
  readonly onUninstall: () => void
  readonly onConfirm: () => void
}) {
  const items: MenuItem[] = [
    { id: 'edit', label: t('edit') },
    { id: 'uninstall', label: confirming ? t('uninstallConfirm') : t('uninstall'), danger: true },
  ]
  return (
    <li
      className={css.row}
      data-enabled={skill.enabled ? 'true' : 'false'}
      data-removing={removing ? 'true' : undefined}
      style={{ '--row-index': index } as CSSProperties}
    >
      <span className={css.rowState} role="img" aria-label={skill.enabled ? t('enabledTag') : t('disabledTag')}>
        <StateDot state={ENABLED_DOT[skill.enabled ? 'on' : 'off']} />
      </span>
      <span className={css.rowMain}>
        <span className={css.rowTitle}>
          <strong className={css.rowName}>{skill.name}</strong>
          <Tag tone={ORIGIN_TONE[skill.origin] ?? 'outline'}>{sourceText(t, skill)}</Tag>
          {skill.managed ? null : <Tag tone="quiet">{t('readOnly')}</Tag>}
        </span>
        <span className={css.rowDescription}>{skill.description}</span>
      </span>
      <span className={css.rowActions}>
        <Switch
          checked={skill.enabled}
          disabled={!skill.managed || removing}
          label={t('toggleAria').replace('{name}', skill.name)}
          title={skill.managed ? undefined : t('readOnlyHint')}
          onChange={onToggleEnabled}
        />
        <Menu
          open={menuOpen}
          onClose={() => { onMenuToggle(false) }}
          items={items}
          onSelect={(id) => {
            onMenuToggle(false)
            if (id === 'edit') onEdit()
            else if (confirming) onUninstall()
            else onConfirm()
          }}
          align="end"
          portal
          closeOnPointerLeave
          anchor={(
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('actionsAria').replace('{name}', skill.name)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => { onMenuToggle(!menuOpen) }}
            >
              <IconEllipsisOutline16 aria-hidden="true" />
            </button>
          )}
        />
      </span>
    </li>
  )
}
