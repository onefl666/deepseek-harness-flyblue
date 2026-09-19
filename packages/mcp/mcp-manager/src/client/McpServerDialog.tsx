/**
 * Create/edit dialog for one MCP server: the reference form (name, transport,
 * timeout, minimum protocol version, and the transport's own fields) beside a
 * JSON tab that accepts a pasted configuration document.
 *
 * The dialog owns the draft and reports only the Host failure text back, so the
 * section keeps one error channel.
 */

import { useState } from 'react'
import {
  Button, IconPlusOutline16, IconTrashOutline16, Input, Menu, Modal, SegmentedRange,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { McpServerConfigView, McpTransportKind } from '../types.ts'
import css from './McpManagerSection.module.css'

const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/
const DEFAULT_TIMEOUT_MS = '60000'

/** One editable key/value row. */
interface Pair {
  readonly key: string
  readonly value: string
}

/** Which tab the dialog edits. */
type DialogTab = 'form' | 'json'

/** Props for {@link McpServerDialog}. */
export interface McpServerDialogProps {
  /** Locale seat of the owning section. */
  readonly t: PropsLocale<'settings.mcp'>['t']
  /** Whether the dialog adds a server or rewrites an existing one. */
  readonly mode: 'create' | 'edit'
  /** Existing definition when editing. */
  readonly initial: McpServerConfigView | undefined
  /** Absolute registry path the definition is stored in. */
  readonly registryPath: string
  /** Protocol versions the build accepts as a floor, newest first. */
  readonly protocolVersions: readonly string[]
  /** Dismiss the dialog without submitting. */
  readonly onCancel: () => void
  /** Submit one or more definitions; resolves to a failure message, or undefined on success. */
  readonly onSubmit: (configs: readonly McpServerConfigView[]) => Promise<string | undefined>
}

/** Read a record from unknown JSON, or undefined when it is not one. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Normalize one transport spelling, accepting the SDK's `type` key too. */
function transportOf(value: unknown): McpTransportKind | undefined {
  if (value === 'sse') return 'sse'
  if (value === 'http' || value === 'streamable-http' || value === 'streamableHttp') return 'streamable-http'
  if (value === 'stdio' || value === undefined) return 'stdio'
  return undefined
}

/** Keep string-valued entries of a pasted record. */
function stringMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const kept: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string') kept[key] = entry
  }
  return kept
}

/** Keep string entries of a pasted argument list. */
function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined
}

/**
 * Parse a pasted configuration document into definitions. Both the bare
 * `{"server-name": {...}}` shape and the `{"mcpServers": {...}}` wrapper are
 * accepted, as is the SDK's `type` key beside this package's `transport`.
 *
 * @param text - pasted JSON.
 * @returns one definition per entry, or undefined when the text carries none.
 */
export function parseServerJson(text: string): McpServerConfigView[] | undefined {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  const document = asRecord(value)
  if (document === undefined) return undefined
  const entries = asRecord(document.mcpServers) ?? document
  const configs: McpServerConfigView[] = []
  for (const [key, raw] of Object.entries(entries)) {
    const record = asRecord(raw)
    if (record === undefined) continue
    const transport = transportOf(record.transport ?? record.type)
    if (transport === undefined) continue
    const args = stringList(record.args)
    const env = stringMap(record.env)
    const headers = stringMap(record.headers)
    configs.push({
      transport,
      serverName: typeof record.serverName === 'string' ? record.serverName : key,
      ...typeof record.command === 'string' ? { command: record.command } : {},
      ...args === undefined ? {} : { args },
      ...env === undefined ? {} : { env },
      ...typeof record.cwd === 'string' ? { cwd: record.cwd } : {},
      ...typeof record.url === 'string' ? { url: record.url } : {},
      ...headers === undefined ? {} : { headers },
      ...typeof record.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: record.toolCallTimeoutMs } : {},
      ...typeof record.minProtocolVersion === 'string' ? { minProtocolVersion: record.minProtocolVersion } : {},
    })
  }
  return configs.length === 0 ? undefined : configs
}

/** Split a space-separated argument field, honoring double quotes. */
function splitArgs(value: string): string[] {
  const parts = value.match(/"[^"]*"|\S+/gu) ?? []
  return parts.map(part => part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part)
}

/**
 * Render the MCP server dialog.
 * @param props - mode, initial definition, locale, and submit handler.
 * @returns the dialog element tree.
 */
export function McpServerDialog({
  t, mode, initial, registryPath, protocolVersions, onCancel, onSubmit,
}: McpServerDialogProps) {
  const [tab, setTab] = useState<DialogTab>('form')
  const [transport, setTransport] = useState<McpTransportKind>(initial?.transport ?? 'stdio')
  const [serverName, setServerName] = useState(initial?.serverName ?? '')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [args, setArgs] = useState((initial?.args ?? []).join(' '))
  const [cwd, setCwd] = useState(initial?.cwd ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [timeout, setTimeoutMs] = useState(String(initial?.toolCallTimeoutMs ?? DEFAULT_TIMEOUT_MS))
  const [protocol, setProtocol] = useState(initial?.minProtocolVersion ?? '')
  const [env, setEnv] = useState<Pair[]>(pairsOf(initial?.env))
  const [headers, setHeaders] = useState<Pair[]>(pairsOf(initial?.headers))
  const [json, setJson] = useState('')
  const [transportOpen, setTransportOpen] = useState(false)
  const [protocolOpen, setProtocolOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const protocolItems: MenuItem[] = [
    { id: 'auto', label: t('protocolAuto') },
    ...protocolVersions.map(version => ({ id: version, label: version })),
  ]
  const transportItems: MenuItem[] = [
    { id: 'stdio', label: t('typeStdio') },
    { id: 'streamable-http', label: t('typeHttp') },
    { id: 'sse', label: t('typeSse') },
  ]

  const submit = (): void => {
    if (saving) return
    const configs = tab === 'json' ? jsonConfigs() : formConfigs()
    if (typeof configs === 'string') {
      setError(configs)
      return
    }
    setSaving(true)
    setError(undefined)
    void onSubmit(configs).then((failure) => {
      setSaving(false)
      if (failure !== undefined) setError(failure)
    })
  }

  /** Build the draft from the form tab, returning the failure text instead when it is incomplete. */
  const formConfigs = (): McpServerConfigView[] | string => {
    if (!SERVER_NAME.test(serverName)) return serverName.trim() === '' ? t('nameRequired') : t('nameInvalid')
    if (transport === 'stdio' && command.trim() === '') return t('commandRequired')
    if (transport !== 'stdio' && url.trim() === '') return t('urlRequired')
    const timeoutValue = Number(timeout)
    const common = {
      transport,
      serverName,
      ...Number.isFinite(timeoutValue) && timeoutValue > 0 ? { toolCallTimeoutMs: timeoutValue } : {},
      ...protocol === '' ? {} : { minProtocolVersion: protocol },
    }
    return [transport === 'stdio'
      ? { ...common, command, args: splitArgs(args), cwd, env: pairsToRecord(env) }
      : { ...common, url, headers: pairsToRecord(headers) }]
  }

  /** Build the drafts from the JSON tab, returning the failure text instead when it does not parse. */
  const jsonConfigs = (): McpServerConfigView[] | string => {
    const parsed = parseServerJson(json)
    return parsed ?? t('jsonInvalid')
  }

  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('close')}
      title={mode === 'create' ? t('createTitle') : t('editTitle')}
      description={mode === 'create' ? t('createIntro').replace('{path}', registryPath) : t('editIntro')}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="outline" disabled={saving} onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" disabled={saving} onClick={submit}>
            {saving ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <div className={css.form}>
        <SegmentedRange
          aria-label={t('title')}
          value={tab}
          minWidth="96px"
          options={[{ value: 'form', label: t('formTab') }, { value: 'json', label: t('jsonTab') }]}
          onChange={setTab}
        />
        {tab === 'json'
          ? (
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('jsonLabel')}</span>
              <textarea
                className={css.jsonEditor}
                aria-label={t('jsonLabel')}
                value={json}
                rows={12}
                onChange={(event) => { setJson(event.target.value) }}
              />
              <span className={css.hint}>{t('jsonHint')}</span>
            </label>
          )
          : (
            <>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('name')}</span>
                <Input
                  aria-label={t('name')}
                  placeholder={t('namePlaceholder')}
                  value={serverName}
                  disabled={mode === 'edit'}
                  onChange={(event) => { setServerName(event.target.value) }}
                />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('type')}</span>
                <Menu
                  open={transportOpen}
                  onClose={() => { setTransportOpen(false) }}
                  items={transportItems}
                  selectedId={transport}
                  onSelect={(id) => {
                    setTransportOpen(false)
                    setTransport(id as McpTransportKind)
                  }}
                  align="start"
                  anchor={(
                    <button
                      type="button"
                      className={css.select}
                      aria-label={t('type')}
                      aria-haspopup="menu"
                      aria-expanded={transportOpen}
                      onClick={() => { setTransportOpen(value => !value) }}
                    >
                      {transportText(t, transport)}
                    </button>
                  )}
                />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('timeout')}</span>
                <Input
                  aria-label={t('timeout')}
                  value={timeout}
                  onChange={(event) => { setTimeoutMs(event.target.value) }}
                />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('protocolVersion')}</span>
                <Menu
                  open={protocolOpen}
                  onClose={() => { setProtocolOpen(false) }}
                  items={protocolItems}
                  selectedId={protocol === '' ? 'auto' : protocol}
                  onSelect={(id) => {
                    setProtocolOpen(false)
                    setProtocol(id === 'auto' ? '' : id)
                  }}
                  align="start"
                  anchor={(
                    <button
                      type="button"
                      className={css.select}
                      aria-label={t('protocolVersion')}
                      aria-haspopup="menu"
                      aria-expanded={protocolOpen}
                      onClick={() => { setProtocolOpen(value => !value) }}
                    >
                      {protocol === '' ? t('protocolAuto') : protocol}
                    </button>
                  )}
                />
              </label>
              {transport === 'stdio'
                ? (
                  <>
                    <label className={css.field}>
                      <span className={css.fieldLabel}>{t('command')}</span>
                      <Input
                        aria-label={t('command')}
                        placeholder={t('commandPlaceholder')}
                        value={command}
                        onChange={(event) => { setCommand(event.target.value) }}
                      />
                    </label>
                    <label className={css.field}>
                      <span className={css.fieldLabel}>{t('args')}</span>
                      <Input
                        aria-label={t('args')}
                        placeholder={t('argsPlaceholder')}
                        value={args}
                        onChange={(event) => { setArgs(event.target.value) }}
                      />
                    </label>
                    <label className={css.field}>
                      <span className={css.fieldLabel}>{t('cwd')}</span>
                      <Input
                        aria-label={t('cwd')}
                        value={cwd}
                        onChange={(event) => { setCwd(event.target.value) }}
                      />
                    </label>
                    <PairEditor
                      t={t}
                      title={t('envTitle')}
                      pairs={env}
                      onChange={setEnv}
                    />
                  </>
                )
                : (
                  <>
                    <label className={css.field}>
                      <span className={css.fieldLabel}>{t('url')}</span>
                      <Input
                        aria-label={t('url')}
                        placeholder={t('urlPlaceholder')}
                        value={url}
                        onChange={(event) => { setUrl(event.target.value) }}
                      />
                    </label>
                    <PairEditor
                      t={t}
                      title={t('headersTitle')}
                      pairs={headers}
                      onChange={setHeaders}
                    />
                  </>
                )}
            </>
          )}
        {error !== undefined ? <p className={css.formError} role="alert">{error}</p> : null}
      </div>
    </Modal>
  )
}

/** The dialog title's transport label. */
export function transportText(t: PropsLocale<'settings.mcp'>['t'], transport: McpTransportKind): string {
  if (transport === 'stdio') return t('typeStdio')
  return transport === 'sse' ? t('typeSse') : t('typeHttp')
}


/** Project a stored record into editable rows. */
function pairsOf(record: Readonly<Record<string, string>> | undefined): Pair[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }))
}

/** Project editable rows back into a stored record, dropping blank keys. */
function pairsToRecord(pairs: readonly Pair[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const pair of pairs) {
    if (pair.key.trim() === '') continue
    record[pair.key.trim()] = pair.value
  }
  return record
}

/** Editable key/value list for environment variables or request headers. */
function PairEditor({
  t, title, pairs, onChange,
}: {
  readonly t: PropsLocale<'settings.mcp'>['t']
  readonly title: string
  readonly pairs: readonly Pair[]
  readonly onChange: (next: Pair[]) => void
}) {
  return (
    <div className={css.field}>
      <span className={css.fieldLabel}>{title}</span>
      <div className={css.pairs}>
        {pairs.map((pair, index) => (
          <div className={css.pairRow} key={index}>
            <Input
              aria-label={t('keyPlaceholder')}
              placeholder={t('keyPlaceholder')}
              value={pair.key}
              onChange={(event) => {
                onChange(pairs.map((candidate, at) => at === index
                  ? { key: event.target.value, value: candidate.value }
                  : candidate))
              }}
            />
            <Input
              aria-label={t('valuePlaceholder')}
              placeholder={t('valuePlaceholder')}
              value={pair.value}
              onChange={(event) => {
                onChange(pairs.map((candidate, at) => at === index
                  ? { key: candidate.key, value: event.target.value }
                  : candidate))
              }}
            />
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('removePair')}
              onClick={() => { onChange(pairs.filter((_candidate, at) => at !== index)) }}
            >
              <IconTrashOutline16 aria-hidden="true" />
            </button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<IconPlusOutline16 />}
          onClick={() => { onChange([...pairs, { key: '', value: '' }]) }}
        >
          {t('addPair')}
        </Button>
      </div>
    </div>
  )
}
