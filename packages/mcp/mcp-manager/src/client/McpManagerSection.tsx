/**
 * MCP server management settings section: the scope switcher, the searchable
 * list of stored servers and Loader-declared `mcp-client` rows, per-row
 * enable/disable, reconnect, removal, and the create/edit dialog.
 *
 * Every mutation reconciles from the Host's returned listing, so the page never
 * predicts a mount outcome. Declared rows are marked as such and say that their
 * toggle is process-local.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Button, IconEllipsisOutline16, IconPlusOutline16, IconApiOutline14, Menu, SearchField,
  SectionChrome, StateDot, Switch, Tag, Toast,
  type MenuItem, type StateDotState, type TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { McpListView, McpScope, McpServerConfigView, McpServerView, McpStaticRowView } from '../types.ts'
import { McpServerDialog, transportText } from './McpServerDialog.tsx'
import css from './McpManagerSection.module.css'

/** Remote dependency surface used by the MCP manager section. */
export interface McpManagerSectionInjected {
  /** Read the scope's registry and the declared rows. */
  list: (scope: McpScope) => Promise<RemoteResult<McpListView>>
  /** Create or replace one stored server. */
  save: (scope: McpScope, config: McpServerConfigView) => Promise<RemoteResult<McpListView>>
  /** Delete one stored server. */
  remove: (scope: McpScope, serverName: string) => Promise<RemoteResult<McpListView>>
  /** Run or stop one stored server. */
  setEnabled: (scope: McpScope, serverName: string, enabled: boolean) => Promise<RemoteResult<McpListView>>
  /** Reconnect one stored server. */
  restart: (scope: McpScope, serverName: string) => Promise<RemoteResult<McpListView>>
  /** Run or stop one Loader-declared row. */
  setStaticEnabled: (entryId: string, enabled: boolean) => Promise<RemoteResult<McpListView>>
  /**
   * Listen for connection-status transitions pushed by every live
   * `mcp-client` instance.
   * @param listener - called after each transition.
   * @returns the unsubscribe function.
   */
  subscribeStatus: (listener: () => void) => () => void
}

/** Which dialog the section currently shows. */
type DialogState = { readonly kind: 'create' } | { readonly kind: 'edit'; readonly serverName: string }

/** Load lifecycle of the current scope's listing. */
type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: McpListView }

/** Row state a status maps to. */
const STATUS_DOT: Readonly<Record<string, StateDotState>> = {
  connected: 'done',
  reconnecting: 'ongoing',
  failed: 'error',
  stopped: 'idle',
  disabled: 'idle',
}

/** Tag tone per row state. */
const STATUS_TONE: Readonly<Record<string, TagTone>> = {
  connected: 'success',
  reconnecting: 'warning',
  failed: 'danger',
  stopped: 'neutral',
  disabled: 'quiet',
}

/**
 * Render the MCP server management settings section.
 * @param props - locale, Remote verbs, and the shared framework hooks.
 * @returns the section element tree.
 */
export function McpManagerSection({
  t, list, save, remove, setEnabled, restart, setStaticEnabled, subscribeStatus, useWorkspaces,
}: PropsLocale<'settings.mcp'> & InjectFace<McpManagerSectionInjected> & PropsRuntime<'settings.section'>) {
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const [chosenWorkspaceId, setChosenWorkspaceId] = useState<string | undefined>(undefined)
  const [scopeKind, setScopeKind] = useState<'user' | 'workspace'>('user')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const [rowMenu, setRowMenu] = useState<string | undefined>(undefined)
  const sequence = useRef(0)
  const toastSeq = useRef(0)

  const workspace = workspaces.find(item => item.workspaceId === chosenWorkspaceId) ?? workspaces[0]
  const scope = useMemo<McpScope>(
    () => scopeKind === 'workspace' && workspace !== undefined
      ? { kind: 'workspace', cwd: workspace.path }
      : { kind: 'user' },
    [scopeKind, workspace],
  )

  const announce = useCallback((text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }, [])

  const applyListing = useCallback((seq: number, result: RemoteResult<McpListView>): void => {
    if (seq !== sequence.current) return
    setBusy(false)
    if (result.ok) setView({ status: 'ready', value: result.value })
    else setView({ status: 'error', message: result.error.message })
  }, [])

  const refresh = useCallback(() => {
    const seq = ++sequence.current
    setBusy(true)
    setError(undefined)
    void list(scope).then((result) => { applyListing(seq, result) })
  }, [list, scope, applyListing])

  useEffect(() => { refresh() }, [refresh])
  // A connection transition changes what the rows should say, and the manager
  // answers from its own status cache, so one more listing is the whole update.
  useEffect(() => subscribeStatus(refresh), [subscribeStatus, refresh])

  /** Apply a mutation's refreshed listing under a sequence that retires in-flight reads. */
  const applied = useCallback((result: RemoteResult<McpListView>, name: string, template: string): void => {
    setRemoving(undefined)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    sequence.current += 1
    setError(undefined)
    setView({ status: 'ready', value: result.value })
    announce(template.replace('{name}', name))
  }, [announce])

  const servers = view.status === 'ready' ? view.value.servers : []
  const staticRows = view.status === 'ready' ? view.value.staticRows : []
  const protocolVersions = view.status === 'ready' ? view.value.supportedProtocolVersions : []
  const registryPath = view.status === 'ready' ? view.value.registryPath : ''
  const firstLoad = view.status === 'loading'
  const needle = query.trim().toLowerCase()
  const matches = (name: string, target: string): boolean => needle === ''
    || name.toLowerCase().includes(needle)
    || target.toLowerCase().includes(needle)
  const shown = servers.filter(server => matches(server.serverName, server.target))
  const shownStatic = staticRows.filter(row => matches(row.serverName, row.moduleName))
  const editing = dialog?.kind === 'edit'
    ? servers.find(server => server.serverName === dialog.serverName)?.config
    : undefined

  const scopeItems: MenuItem[] = [
    { id: 'user', label: t('scopeUser') },
    ...workspaces.map(item => ({ id: `workspace:${item.workspaceId}`, label: item.title })),
  ]
  const selectedScopeId = scopeKind === 'workspace' && workspace !== undefined
    ? `workspace:${workspace.workspaceId}`
    : 'user'
  const scopeLabel = selectedScopeId === 'user' ? t('scopeUser') : workspace?.title ?? t('scopeNoWorkspace')
  const nothingMatches = needle !== '' && shown.length === 0 && shownStatic.length === 0

  return (
    <section className={css.section} data-mcp-manager aria-busy={busy}>
      <SectionChrome
        labels={{ refresh: t('refresh'), refreshing: t('refreshing'), errorSummary: t('error'), retry: t('retry') }}
        title={t('title')}
        intro={t('intro')}
        meta={<span className={css.counts}>{t('installed').replace('{count}', String(servers.length))}</span>}
        busy={busy}
        onRefresh={refresh}
        error={error}
      />
      <div className={css.toolbar}>
        <Menu
          open={scopeMenuOpen}
          onClose={() => { setScopeMenuOpen(false) }}
          items={scopeItems}
          selectedId={selectedScopeId}
          onSelect={(id) => {
            setScopeMenuOpen(false)
            if (id === 'user') setScopeKind('user')
            else {
              setChosenWorkspaceId(id.slice('workspace:'.length))
              setScopeKind('workspace')
            }
          }}
          portal
          align="start"
          anchor={(
            <button
              type="button"
              className={css.scope}
              aria-haspopup="menu"
              aria-expanded={scopeMenuOpen}
              aria-label={t('scopeLabel')}
              onClick={() => { setScopeMenuOpen(value => !value) }}
            >
              <IconApiOutline14 className={css.scopeIcon} aria-hidden="true" />
              <span className={css.scopeText}>{scopeLabel}</span>
            </button>
          )}
        />
        <SearchField
          className={css.search as string}
          value={query}
          onChange={setQuery}
          label={t('search')}
          clearLabel={t('clearSearch')}
          placeholder={t('searchPlaceholder')}
        />
        <span className={css.toolbarEnd}>
          <Button
            size="sm"
            variant="ghost"
            icon={<IconPlusOutline16 />}
            onClick={() => { setDialog({ kind: 'create' }) }}
          >
            {t('create')}
          </Button>
        </span>
      </div>
      {firstLoad
        ? (
          <div className={css.skeleton} aria-busy="true" aria-label={t('loading')}>
            <div className={css.skeletonRow} />
            <div className={css.skeletonRow} />
          </div>
        )
        : view.status === 'error'
          ? <p className={css.failure} role="alert">{`${t('error')}: ${view.message}`}</p>
          : (
            <>
              <h3 className={css.groupTitle}>{t('managedTitle')}</h3>
              {servers.length === 0 ? <p className={css.empty}>{t('empty')}</p> : null}
              {nothingMatches ? <p className={css.empty}>{t('emptySearch')}</p> : null}
              <ul className={css.list}>
                {shown.map((server, index) => (
                  <ManagedRow
                    key={server.serverName}
                    t={t}
                    server={server}
                    index={index}
                    menuOpen={rowMenu === server.serverName}
                    removing={removing === server.serverName}
                    onMenuToggle={(open) => { setRowMenu(open ? server.serverName : undefined) }}
                    onToggleEnabled={(next) => {
                      setRemoving(server.serverName)
                      void setEnabled(scope, server.serverName, next).then((result) => {
                        applied(result, server.serverName, next ? 'toastEnabled' : 'toastDisabled')
                      })
                    }}
                    onEdit={() => { setDialog({ kind: 'edit', serverName: server.serverName }) }}
                    onRestart={() => {
                      void restart(scope, server.serverName).then((result) => {
                        applied(result, server.serverName, 'toastRestarted')
                      })
                    }}
                    onRemove={() => {
                      setRemoving(server.serverName)
                      void remove(scope, server.serverName).then((result) => {
                        applied(result, server.serverName, 'toastRemoved')
                      })
                    }}
                  />
                ))}
              </ul>
              <h3 className={css.groupTitle}>{t('declaredTitle')}</h3>
              <p className={css.hint}>{t('declaredHint')}</p>
              {shownStatic.length === 0 ? null : (
                <ul className={css.list}>
                  {shownStatic.map((row, index) => (
                    <StaticRow
                      key={row.entryId}
                      t={t}
                      row={row}
                      index={index}
                      onToggleEnabled={(next) => {
                        void setStaticEnabled(row.entryId, next).then((result) => {
                          applied(result, row.serverName, next ? 'toastEnabled' : 'toastDisabled')
                        })
                      }}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
      {dialog !== null
        ? (
          <McpServerDialog
            t={t}
            mode={editing === undefined ? 'create' : 'edit'}
            initial={editing}
            registryPath={registryPath}
            protocolVersions={protocolVersions}
            onCancel={() => { setDialog(null) }}
            onSubmit={async (configs) => {
              for (const config of configs) {
                const result = await save(scope, config)
                if (!result.ok) return result.error.message
                sequence.current += 1
                setError(undefined)
                setView({ status: 'ready', value: result.value })
              }
              setDialog(null)
              announce(t('toastSaved').replace('{name}', configs[0]?.serverName ?? ''))
              return undefined
            }}
          />
        )
        : null}
      {toast !== null ? <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(null) }} /> : null}
    </section>
  )
}

/** One stored server row. */
function ManagedRow({
  t, server, index, menuOpen, removing, onMenuToggle, onToggleEnabled, onEdit, onRestart, onRemove,
}: {
  readonly t: PropsLocale<'settings.mcp'>['t']
  readonly server: McpServerView
  readonly index: number
  readonly menuOpen: boolean
  readonly removing: boolean
  readonly onMenuToggle: (open: boolean) => void
  readonly onToggleEnabled: (next: boolean) => void
  readonly onEdit: () => void
  readonly onRestart: () => void
  readonly onRemove: () => void
}) {
  const items: MenuItem[] = [
    { id: 'edit', label: t('edit') },
    { id: 'restart', label: t('restart') },
    { id: 'remove', label: t('remove'), danger: true },
  ]
  return (
    <li
      className={css.row}
      data-removing={removing ? 'true' : undefined}
      style={{ '--row-index': index } as CSSProperties}
    >
      <StatusMark t={t} status={server.status} />
      <span className={css.rowMain}>
        <span className={css.rowTitle}>
          <strong className={css.rowName}>{server.serverName}</strong>
          <Tag tone={STATUS_TONE[server.status] ?? 'neutral'}>{statusText(t, server.status)}</Tag>
          <Tag tone="outline">{transportText(t, server.transport)}</Tag>
        </span>
        <span className={css.rowDescription}>{server.target}</span>
      </span>
      <span className={css.rowActions}>
        <Switch
          checked={server.enabled}
          disabled={removing}
          label={t('toggleAria').replace('{name}', server.serverName)}
          onChange={onToggleEnabled}
        />
        <Menu
          open={menuOpen}
          onClose={() => { onMenuToggle(false) }}
          items={items}
          onSelect={(id) => {
            onMenuToggle(false)
            if (id === 'edit') onEdit()
            else if (id === 'restart') onRestart()
            else onRemove()
          }}
          align="end"
          portal
          closeOnPointerLeave
          anchor={(
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('actionsAria').replace('{name}', server.serverName)}
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

/** One Loader-declared `mcp-client` row. */
function StaticRow({
  t, row, index, onToggleEnabled,
}: {
  readonly t: PropsLocale<'settings.mcp'>['t']
  readonly row: McpStaticRowView
  readonly index: number
  readonly onToggleEnabled: (next: boolean) => void
}) {
  return (
    <li className={css.row} style={{ '--row-index': index } as CSSProperties}>
      <StatusMark t={t} status={row.status} />
      <span className={css.rowMain}>
        <span className={css.rowTitle}>
          <strong className={css.rowName}>{row.serverName}</strong>
          <Tag tone={STATUS_TONE[row.status] ?? 'neutral'}>{statusText(t, row.status)}</Tag>
          <Tag tone="quiet">{row.entryId}</Tag>
        </span>
      </span>
      <span className={css.rowActions}>
        <Switch
          checked={row.enabled}
          label={t('staticToggleAria').replace('{name}', row.entryId)}
          title={t('declaredHint')}
          onChange={onToggleEnabled}
        />
      </span>
    </li>
  )
}

/** The status dot plus its accessible name. */
function StatusMark({ t, status }: {
  readonly t: PropsLocale<'settings.mcp'>['t']
  readonly status: string
}) {
  const label = statusText(t, status)
  return (
    <span className={css.rowState} role="img" aria-label={label} title={label}>
      <StateDot state={STATUS_DOT[status] ?? 'idle'} />
    </span>
  )
}

/**
 * Resolve the localized label of one connection state.
 * @param t - the section's locale seat.
 * @param status - reported connection state.
 * @returns the caller-localized state label.
 */
export function statusText(t: PropsLocale<'settings.mcp'>['t'], status: string): string {
  if (status === 'connected') return t('statusConnected')
  if (status === 'reconnecting') return t('statusReconnecting')
  if (status === 'failed') return t('statusFailed')
  return status === 'stopped' ? t('statusStopped') : t('statusDisabled')
}
