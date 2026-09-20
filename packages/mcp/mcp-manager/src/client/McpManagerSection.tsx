/**
 * MCP server management settings section: the scope switcher, the searchable
 * list of stored servers and Loader-declared `mcp-client` rows, per-row
 * enable/disable, reconnect, removal, and the create/edit dialog.
 *
 * Every mutation reconciles from the Host's returned listing, so the page never
 * predicts a mount outcome. Declared rows are marked as such and say that their
 * toggle is process-local.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Button, IconEllipsisOutline16, IconPlusOutline16, IconApiOutline14, Menu,
  SectionChrome, SectionState, SectionToolbar, StateDot, Switch, Tag, Toast,
  sectionToolbarLabels, useRemoteList, useScopeChoice,
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
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [rowMenu, setRowMenu] = useState<string | undefined>(undefined)

  const choice = useScopeChoice(workspaces)
  const scope = choice.scope
  const listing = useRemoteList(list, scope)
  // A connection transition changes what the rows should say, and the manager
  // answers from its own status cache, so one more listing is the whole update.
  useEffect(() => subscribeStatus(listing.refresh), [subscribeStatus, listing.refresh])

  const { view } = listing
  const servers = view.status === 'ready' ? view.value.servers : []
  const staticRows = view.status === 'ready' ? view.value.staticRows : []
  const protocolVersions = view.status === 'ready' ? view.value.supportedProtocolVersions : []
  const registryPath = view.status === 'ready' ? view.value.registryPath : ''
  const needle = query.trim().toLowerCase()
  const matches = (name: string, target: string): boolean => needle === ''
    || name.toLowerCase().includes(needle)
    || target.toLowerCase().includes(needle)
  const shown = servers.filter(server => matches(server.serverName, server.target))
  const shownStatic = staticRows.filter(row => matches(row.serverName, row.moduleName))
  const editing = dialog?.kind === 'edit'
    ? servers.find(server => server.serverName === dialog.serverName)?.config
    : undefined
  const nothingMatches = needle !== '' && shown.length === 0 && shownStatic.length === 0

  return (
    <section className={css.section} data-mcp-manager aria-busy={listing.busy}>
      <SectionChrome
        labels={{ refresh: t('refresh'), refreshing: t('refreshing'), errorSummary: t('error'), retry: t('retry') }}
        title={t('title')}
        intro={t('intro')}
        meta={<span className={css.counts}>{t('installed').replace('{count}', String(servers.length))}</span>}
        busy={listing.busy}
        onRefresh={listing.refresh}
        error={listing.error}
      />
      <SectionToolbar
        scope={choice}
        scopeIcon={<IconApiOutline14 />}
        query={query}
        onQueryChange={setQuery}
        labels={sectionToolbarLabels(t)}
      >
        <Button
          size="sm"
          variant="ghost"
          icon={<IconPlusOutline16 />}
          onClick={() => { setDialog({ kind: 'create' }) }}
        >
          {t('create')}
        </Button>
      </SectionToolbar>
      <SectionState
        loading={view.status === 'loading'}
        rows={2}
        failure={view.status === 'error' ? view.message : undefined}
        labels={{ loading: t('loading'), error: t('error') }}
      >
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
                removing={listing.removing === server.serverName}
                onMenuToggle={(open) => { setRowMenu(open ? server.serverName : undefined) }}
                onToggleEnabled={(next) => {
                  listing.begin(server.serverName)
                  void setEnabled(scope, server.serverName, next).then((result) => {
                    listing.applied(result, server.serverName, t(next ? 'toastEnabled' : 'toastDisabled'))
                  })
                }}
                onEdit={() => { setDialog({ kind: 'edit', serverName: server.serverName }) }}
                onRestart={() => {
                  void restart(scope, server.serverName).then((result) => {
                    listing.applied(result, server.serverName, t('toastRestarted'))
                  })
                }}
                onRemove={() => {
                  listing.begin(server.serverName)
                  void remove(scope, server.serverName).then((result) => {
                    listing.applied(result, server.serverName, t('toastRemoved'))
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
                      listing.applied(result, row.serverName, t(next ? 'toastEnabled' : 'toastDisabled'))
                    })
                  }}
                />
              ))}
            </ul>
          )}
        </>
      </SectionState>
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
                const failure = listing.adopt(await save(scope, config))
                if (failure !== null) return failure
              }
              setDialog(null)
              listing.announce(t('toastSaved').replace('{name}', configs[0]?.serverName ?? ''))
              return undefined
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
