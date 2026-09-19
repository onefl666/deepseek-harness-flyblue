/**
 * MCP server manager: the Host owner of the `mcpManager` Remote namespace, the
 * package's Client face being the「MCP 服务器」settings section in `./client`.
 *
 * The manager owns a per-scope JSON registry of server definitions and mounts
 * exactly one `dsh-mcp-client` instance per enabled record into a child fiber
 * of its own, so a toggle is a mount or a dispose and the MCP plugin keeps
 * owning its connection, reconnect budget, and tool registrations. A registry
 * read reconciles the live set, which makes every listing self-healing after a
 * definition changed outside the UI.
 *
 * It also lists the `mcp-client` rows the Loader declares. Those rows are not
 * persisted here: toggling one calls `Entry.update({ disabled })`, which Cordis
 * applies in memory (only `EntryTree.create/remove/move` write a config file
 * back), so the row's defining file stays the source of truth and a restart
 * restores the declared state.
 *
 * @module @deepseek-ai/dsh-mcp-manager
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type { McpStatusReport } from '@deepseek-ai/dsh-mcp-client/types'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import { McpRegistryError, readRegistry, registryPath, updateRegistry } from './registry.ts'
import type { McpRegistry, McpServerRecord } from './registry.ts'
import type {
  McpListView, McpRemoveRequest, McpRestartRequest, McpSaveRequest, McpScope, McpScopeRequest,
  McpServerConfigView, McpServerView, McpSetEnabledRequest, McpSetStaticEnabledRequest, McpStaticRowView,
} from './types.ts'

export type * from './types.ts'

/** MCP plugin module specifier the Loader rows are recognized by. */
const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** Server namespace grammar, shared with `dsh-mcp-client`. */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** The user scope, the only one a service can preload without knowing a project. */
const USER_SCOPE: McpScope = { kind: 'user' }

/** Manager configuration. */
export interface Config {
  /** DeepSeek Harness config root; defaults to `$DSH_HOME` or `~/.dsh`. */
  readonly dshHome?: string
  /** Registry document name inside the harness home and each project `.dsh`. */
  readonly registryFileName?: string
}

/** Manager configuration with every default applied. */
export interface ResolvedMcpManagerConfig {
  readonly dshHome: string | undefined
  readonly registryFileName: string
}

/**
 * Apply the deployment defaults and reject programmatic values Schemastery
 * would have normalized.
 *
 * @param config - Raw plugin configuration.
 * @returns The same values with defaults applied.
 * @throws when the registry name cannot become a file name.
 */
export function resolveMcpManagerConfig(config: Config = {}): ResolvedMcpManagerConfig {
  const registryFileName = config.registryFileName ?? 'mcp-servers.json'
  if (registryFileName.length === 0 || registryFileName.includes('/') || registryFileName.includes('\\')) {
    throw new Error('mcp-manager: registryFileName must be a single nonempty path segment')
  }
  return { dshHome: config.dshHome, registryFileName }
}

/** A refused manager operation, carrying the failure the Remote reports. */
export class McpManagerError extends Error {
  /**
   * @param failure - outcome class the Remote maps to a stable error code.
   * @param message - actionable text shown to the user.
   * @param serverName - namespace the failure is about, when one is known.
   */
  constructor(
    readonly failure: 'not-found' | 'conflict' | 'rejected',
    message: string,
    readonly serverName = '',
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'McpManagerError'
  }
}

/**
 * Validate one stored definition and normalize it into an `mcp-client` config.
 *
 * @param config - Definition as the browser wrote it.
 * @returns The config the MCP plugin instance is mounted with.
 * @throws McpManagerError when a required field for the transport is absent.
 */
export function toInstanceConfig(config: McpServerConfigView): McpClientConfig {
  if (!SERVER_NAME.test(config.serverName)) {
    throw new McpManagerError(
      'rejected',
      `"${config.serverName}" is not a valid server name — use letters, digits, underscores, and hyphens (1-32 characters)`,
    )
  }
  const common = {
    serverName: config.serverName,
    toolCallTimeoutMs: config.toolCallTimeoutMs ?? 60_000,
    failOnStartupError: config.failOnStartupError ?? false,
    ...config.minProtocolVersion === undefined ? {} : { minProtocolVersion: config.minProtocolVersion },
  }
  if (config.transport === 'stdio') {
    if (config.command === undefined || config.command.trim() === '') {
      throw new McpManagerError('rejected', `server "${config.serverName}" needs a command for the stdio transport`)
    }
    return {
      ...common,
      transport: 'stdio',
      command: config.command,
      args: [...config.args ?? []],
      env: { ...config.env ?? {} },
      cwd: config.cwd ?? '',
    }
  }
  if (config.url === undefined || config.url.trim() === '') {
    throw new McpManagerError(
      'rejected',
      `server "${config.serverName}" needs a URL for the ${config.transport} transport`,
    )
  }
  return { ...common, transport: config.transport, url: config.url, headers: { ...config.headers ?? {} } }
}

/**
 * Map a manager refusal onto the Remote failure vocabulary.
 *
 * @param error - The value thrown by a manager operation.
 * @returns The RemoteError the gateway should report.
 */
export function toRemoteError(error: unknown): RemoteError {
  if (error instanceof McpManagerError) {
    switch (error.failure) {
      case 'not-found':
        return new RemoteError('mcp-manager/not-found', error.message, { serverName: error.serverName })
      case 'conflict':
        return new RemoteError('mcp-manager/conflict', error.message, { serverName: error.serverName })
      case 'rejected':
        return new RemoteError('mcp-manager/rejected', error.message, { reason: error.message })
    }
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new RemoteError('mcp-manager/rejected', reason, { reason })
}

/** Readable target of one definition, for row display. */
function targetOf(config: McpServerConfigView): string {
  return config.transport === 'stdio'
    ? [config.command ?? '', ...config.args ?? []].filter(part => part !== '').join(' ')
    : config.url ?? ''
}

/** Read a literal server name from a Loader row's config, tolerating `!!js` expressions. */
function staticServerName(config: unknown): string | undefined {
  if (config === null || typeof config !== 'object') return undefined
  const value = (config as { serverName?: unknown }).serverName
  return typeof value === 'string' ? value : undefined
}

/** Stable mount key: the scope's registry identity plus the namespace. */
function mountKey(scope: McpScope, serverName: string): string {
  return `${scopePrefix(scope)}\u0000${serverName}`
}

/** Every mount key of one scope starts with this prefix. */
function scopePrefix(scope: McpScope): string {
  return scope.kind === 'user' ? 'user' : `workspace:${scope.cwd}`
}

/** Remote-only service backing MCP server management. */
export class McpManagerGateway extends TypertRemoteService {
  static Config: Schema<Config> = z.object({
    dshHome: z.string(),
    registryFileName: z.string().default('mcp-servers.json'),
  })

  static inject = ['tools']

  private readonly config: ResolvedMcpManagerConfig
  /** Live instances, keyed by scope identity and namespace. */
  private readonly mounts = new Map<string, Fiber>()
  /** Latest status report per namespace, from every `mcp-client` in this runtime. */
  private readonly statuses = new Map<string, McpStatusReport>()

  /**
   * @param ctx - Host context carrying the tool registry.
   * @param config - Plugin configuration; every field has a deployment default.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'mcpManager')
    this.config = resolveMcpManagerConfig(config)
  }

  /**
   * Start the user scope's enabled servers before the service becomes
   * injectable, and register status listening plus teardown. A registry that
   * cannot be read fails the service rather than serving a partial set.
   */
  async* [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    yield async () => {
      for (const key of [...this.mounts.keys()]) await this.detach(key)
    }
    this.ctx.on('mcp/status', (report) => { this.statuses.set(report.serverName, report) })
    await this.reconcile(USER_SCOPE)
  }

  /**
   * List one scope's stored servers and the Loader's own `mcp-client` rows,
   * after reconciling the live instances with the stored definitions.
   * @param request - Scope to list.
   * @returns The registry path, the stored servers, and the static rows.
   * @throws RemoteError when the registry exists but cannot be parsed.
   */
  @Remote('list')
  async list(request: McpScopeRequest): Promise<McpListView> {
    return await this.run(async () => {
      await this.reconcile(request.scope)
      return await this.snapshot(request.scope)
    })
  }

  /**
   * Create or replace one stored server. The definition is validated before
   * anything is written, so an unusable definition never reaches the registry.
   * @param request - Scope and complete definition.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when the definition is invalid or the name is held by a declared row.
   */
  @Remote('save')
  async save(request: McpSaveRequest): Promise<McpListView> {
    return await this.run(async () => {
      const { scope, config } = request
      toInstanceConfig(config)
      await this.assertNameFree(scope, config.serverName, true)
      await updateRegistry(registryPath(this.config, scope), current => ({
        formatVersion: 1,
        servers: [
          ...current.servers.filter(record => record.config.serverName !== config.serverName),
          { enabled: true, config },
        ],
      }))
      await this.reconcile(scope)
      return await this.snapshot(scope)
    })
  }

  /**
   * Delete one stored server; its instance is disposed by the next reconcile.
   * @param request - Scope and namespace.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when no stored server holds that namespace.
   */
  @Remote('uninstall')
  async uninstall(request: McpRemoveRequest): Promise<McpListView> {
    return await this.run(async () => {
      const { scope, serverName } = request
      await this.requireRecord(scope, serverName)
      await updateRegistry(registryPath(this.config, scope), current => ({
        formatVersion: 1,
        servers: current.servers.filter(record => record.config.serverName !== serverName),
      }))
      await this.reconcile(scope)
      return await this.snapshot(scope)
    })
  }

  /**
   * Run or stop one stored server, persisting the choice.
   * @param request - Scope, namespace, and the state to reach.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when no stored server holds that namespace or the namespace is declared elsewhere.
   */
  @Remote('setEnabled')
  async setEnabled(request: McpSetEnabledRequest): Promise<McpListView> {
    return await this.run(async () => {
      const { scope, serverName, enabled } = request
      const record = await this.requireRecord(scope, serverName)
      if (enabled) {
        toInstanceConfig(record.config)
        await this.assertNameFree(scope, serverName, true)
      }
      await updateRegistry(registryPath(this.config, scope), current => ({
        formatVersion: 1,
        servers: current.servers.map(candidate => candidate.config.serverName === serverName
          ? { enabled, config: candidate.config }
          : candidate),
      }))
      await this.reconcile(scope)
      return await this.snapshot(scope)
    })
  }

  /**
   * Reconnect one stored server by disposing its instance; the next reconcile
   * mounts a fresh one.
   * @param request - Scope and namespace.
   * @returns The scope's refreshed listing.
   * @throws RemoteError when no stored server holds that namespace.
   */
  @Remote('restart')
  async restart(request: McpRestartRequest): Promise<McpListView> {
    return await this.run(async () => {
      const { scope, serverName } = request
      await this.requireRecord(scope, serverName)
      await this.detach(mountKey(scope, serverName))
      await this.reconcile(scope)
      return await this.snapshot(scope)
    })
  }

  /**
   * Run or stop one Loader-declared `mcp-client` row. The change is live for
   * this process only: Cordis applies `Entry.update({ disabled })` in memory,
   * so the defining file keeps the state it declares.
   * @param request - Loader entry id and the state to reach.
   * @returns The current static rows after the change.
   * @throws RemoteError when the Loader or the row cannot be resolved.
   */
  @Remote('setStaticEnabled')
  async setStaticEnabled(request: McpSetStaticEnabledRequest): Promise<McpListView> {
    return await this.run(async () => {
      const entry = this.loaderEntry(request.entryId)
      await entry.update({ disabled: !request.enabled })
      return await this.snapshot(USER_SCOPE)
    })
  }

  /** Resolve one declared `mcp-client` row, or fail with `not-found`. */
  private loaderEntry(entryId: string): { update(options: { disabled: boolean }): Promise<void> } {
    const loader = this.ctx.get('loader')
    if (loader === undefined) {
      throw new McpManagerError('rejected', 'this deployment composes no Cordis Loader, so declared rows cannot be toggled')
    }
    let entry
    try {
      entry = loader.resolve(entryId)
    } catch (error: unknown) {
      throw new McpManagerError(
        'not-found',
        `no Loader entry is declared under "${entryId}"`,
        '',
        error,
      )
    }
    if (entry.options.name !== MCP_CLIENT_MODULE) {
      throw new McpManagerError('not-found', `"${entryId}" is not an mcp-client row`)
    }
    return entry
  }

  /** Read one scope's registry. */
  private async read(scope: McpScope): Promise<McpRegistry> {
    return await readRegistry(registryPath(this.config, scope))
  }

  /**
   * Bring the live instances of one scope in line with its stored definitions:
   * dispose every mount the registry no longer asks for, then mount every
   * enabled record that has none. A definition whose instance cannot start is
   * reported as a failed row instead of failing this call, so a listing still
   * answers while a server is down.
   */
  private async reconcile(scope: McpScope): Promise<void> {
    const records = (await this.read(scope)).servers
    const prefix = `${scopePrefix(scope)}\u0000`
    const wanted = new Set(records.filter(record => record.enabled)
      .map(record => mountKey(scope, record.config.serverName)))
    for (const key of [...this.mounts.keys()]) {
      if (key.startsWith(prefix) && !wanted.has(key)) await this.detach(key)
    }
    for (const record of records) {
      if (!record.enabled) continue
      const key = mountKey(scope, record.config.serverName)
      if (this.mounts.has(key)) continue
      await this.attach(key, record)
    }
  }

  /** Mount one stored server, recording a startup failure as its reported status. */
  private async attach(key: string, record: McpServerRecord): Promise<void> {
    const { serverName } = record.config
    let instance: Fiber
    try {
      const handle = this.ctx.plugin(McpClient, toInstanceConfig(record.config))
      instance = await handle
    } catch (error: unknown) {
      this.statuses.set(serverName, {
        serverName,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
    this.mounts.set(key, instance)
  }

  /** Dispose one managed instance, if it is mounted. */
  private async detach(key: string): Promise<void> {
    const mounted = this.mounts.get(key)
    if (mounted === undefined) return
    this.mounts.delete(key)
    await mounted.dispose()
  }

  /** Read one stored record, or fail with `not-found`. */
  private async requireRecord(scope: McpScope, serverName: string): Promise<McpServerRecord> {
    const record = (await this.read(scope)).servers.find(candidate => candidate.config.serverName === serverName)
    if (record === undefined) {
      throw new McpManagerError('not-found', `no MCP server named "${serverName}" is stored in this scope`, serverName)
    }
    return record
  }

  /**
   * Refuse a namespace another live instance or declared row already holds.
   * `dsh-mcp-client` reserves its namespace per registration scope, and every
   * instance this manager mounts shares one scope, so the check spans the
   * manager's own mounts, both registries, and the Loader's rows.
   *
   * @param scope - scope the request addresses.
   * @param serverName - namespace the request claims.
   * @param allowSelf - whether a record in the requested scope may already hold it.
   */
  private async assertNameFree(scope: McpScope, serverName: string, allowSelf: boolean): Promise<void> {
    const declared = this.staticRows().find(row => row.serverName === serverName)
    if (declared !== undefined) {
      throw new McpManagerError(
        'conflict',
        `"${serverName}" is already declared by the cordis.yml row "${declared.entryId}"`,
        serverName,
      )
    }
    const own = mountKey(scope, serverName)
    for (const key of this.mounts.keys()) {
      if (key === own && allowSelf) continue
      if (key.endsWith(`\u0000${serverName}`)) {
        throw new McpManagerError('conflict', `"${serverName}" is already running — pick another server name`, serverName)
      }
    }
    const scopes: McpScope[] = scope.kind === 'user' ? [scope] : [USER_SCOPE, scope]
    for (const candidate of scopes) {
      const holds = (await this.read(candidate)).servers
        .some(record => record.config.serverName === serverName)
      if (!holds) continue
      if (allowSelf && candidate.kind === scope.kind) continue
      throw new McpManagerError('conflict', `"${serverName}" is already stored — pick another server name`, serverName)
    }
  }

  /** Every `mcp-client` row the Loader currently holds. */
  private staticRows(): McpStaticRowView[] {
    const loader = this.ctx.get('loader')
    if (loader === undefined) return []
    const rows: McpStaticRowView[] = []
    for (const entry of loader.entries()) {
      if (entry.options.group || entry.options.name !== MCP_CLIENT_MODULE) continue
      const serverName = staticServerName(entry.options.config)
      const report = serverName === undefined ? undefined : this.statuses.get(serverName)
      rows.push({
        entryId: entry.id,
        serverName: serverName ?? entry.id,
        enabled: !entry.disabled,
        status: entry.fiber === undefined ? 'stopped' : report?.status ?? 'stopped',
        ...report?.error === undefined ? {} : { error: report.error },
        moduleName: entry.options.name,
      })
    }
    return rows
  }

  /** Project one stored record into its wire view. */
  private viewOf(scope: McpScope, record: McpServerRecord): McpServerView {
    const { serverName } = record.config
    const mounted = this.mounts.has(mountKey(scope, serverName))
    const report = this.statuses.get(serverName)
    const status = mounted ? report?.status ?? 'stopped' : report?.status === 'failed' ? 'failed' : 'disabled'
    return {
      serverName,
      enabled: record.enabled,
      mounted,
      status,
      ...report?.error === undefined ? {} : { error: report.error },
      transport: record.config.transport,
      target: targetOf(record.config),
      config: record.config,
    }
  }

  /** Build the listing one Remote answer carries. */
  private async snapshot(scope: McpScope): Promise<McpListView> {
    return {
      registryPath: registryPath(this.config, scope),
      servers: (await this.read(scope)).servers.map(record => this.viewOf(scope, record)),
      staticRows: this.staticRows(),
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    }
  }

  /** Run one operation, translating every refusal into the Remote vocabulary. */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      if (error instanceof RemoteError) throw error
      if (error instanceof McpRegistryError) {
        throw new RemoteError('mcp-manager/rejected', error.message, { reason: error.message })
      }
      throw toRemoteError(error)
    }
  }
}

export default McpManagerGateway
