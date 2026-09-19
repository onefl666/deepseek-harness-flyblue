/**
 * Browser-safe vocabulary of the MCP management surface: the scope, the stored
 * server definition, the listing views, the mutation requests, and the failure
 * codes.
 *
 * @module @deepseek-ai/dsh-mcp-manager/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No stored server with that name exists in the addressed scope. */
    'mcp-manager/not-found': { readonly serverName: string }
    /** The name is already taken by another stored server or by a live `mcp-client` row. */
    'mcp-manager/conflict': { readonly serverName: string }
    /** Any other refusal: an invalid definition, a failed mount, an unusable registry file. */
    'mcp-manager/rejected': { readonly reason: string }
  }
}

/** Which registry one request addresses. */
export type McpScope =
  /** The harness home registry. */
  | { readonly kind: 'user' }
  /** The registry inside the project containing `cwd`. */
  | { readonly kind: 'workspace'; readonly cwd: string }

/** Transport discriminant of one MCP server definition. */
export type McpTransportKind = 'stdio' | 'streamable-http' | 'sse'

/** One MCP server definition as the browser reads and writes it. */
export interface McpServerConfigView {
  /** Transport the instance connects over. */
  readonly transport: McpTransportKind
  /** Model-facing namespace (`mcp__<serverName>__<tool>`). */
  readonly serverName: string
  /** Executable, for `stdio` only. */
  readonly command?: string
  /** Arguments passed without shell interpolation, for `stdio` only. */
  readonly args?: readonly string[]
  /** Extra environment variables, for `stdio` only. */
  readonly env?: Readonly<Record<string, string>>
  /** Child working directory, for `stdio` only. */
  readonly cwd?: string
  /** Endpoint URL, for `streamable-http` and `sse`. */
  readonly url?: string
  /** Extra request headers, for `streamable-http` and `sse`. */
  readonly headers?: Readonly<Record<string, string>>
  /** Per-tool-call timeout in milliseconds. */
  readonly toolCallTimeoutMs?: number
  /** Whether a failed initial connection should fail the mount. */
  readonly failOnStartupError?: boolean
  /** Oldest acceptable MCP protocol version (`YYYY-MM-DD`). */
  readonly minProtocolVersion?: string
}

/** One stored server plus its live state. */
export interface McpServerView {
  /** Model-facing namespace. */
  readonly serverName: string
  /** Whether the stored record asks for the instance to run. */
  readonly enabled: boolean
  /** Whether an instance is currently mounted for this record. */
  readonly mounted: boolean
  /** Latest reported connection state, or `disabled` when nothing is mounted. */
  readonly status: 'connected' | 'reconnecting' | 'failed' | 'stopped' | 'disabled'
  /** Failure detail for `failed`; absent otherwise. */
  readonly error?: string
  /** Transport the definition selects. */
  readonly transport: McpTransportKind
  /** Command or URL the instance targets, for row display. */
  readonly target: string
  /** The stored definition itself. */
  readonly config: McpServerConfigView
}

/** One `mcp-client` row declared by the Loader rather than by this manager. */
export interface McpStaticRowView {
  /** Loader entry id the row was declared under. */
  readonly entryId: string
  /** Namespace the row declares, when its config carries a literal one. */
  readonly serverName: string
  /** Whether the Loader currently has the row enabled. */
  readonly enabled: boolean
  /** Latest reported connection state, or `stopped` when the row has no fiber. */
  readonly status: 'connected' | 'reconnecting' | 'failed' | 'stopped'
  /** Failure detail for `failed`; absent otherwise. */
  readonly error?: string
  /** Module specifier the row names. */
  readonly moduleName: string
}

/** One scope's complete listing. */
export interface McpListView {
  /** Absolute path of the registry this scope reads. */
  readonly registryPath: string
  /** Stored servers in registry order. */
  readonly servers: readonly McpServerView[]
  /** `mcp-client` rows the Loader owns, which this manager does not persist. */
  readonly staticRows: readonly McpStaticRowView[]
  /** MCP protocol versions this build accepts as a floor, newest first. */
  readonly supportedProtocolVersions: readonly string[]
}

/** Request shape shared by every scope-addressed read. */
export interface McpScopeRequest {
  /** Scope whose registry is read. */
  readonly scope: McpScope
}

/** Request to create or replace one stored server. */
export interface McpSaveRequest {
  /** Scope that stores the definition. */
  readonly scope: McpScope
  /** Complete definition to store. */
  readonly config: McpServerConfigView
}

/** Request to delete one stored server. */
export interface McpRemoveRequest {
  /** Scope owning the definition. */
  readonly scope: McpScope
  /** Namespace of the definition to delete. */
  readonly serverName: string
}

/** Request to run or stop one stored server. */
export interface McpSetEnabledRequest {
  /** Scope owning the definition. */
  readonly scope: McpScope
  /** Namespace of the definition. */
  readonly serverName: string
  /** Whether the instance should be mounted. */
  readonly enabled: boolean
}

/** Request to reconnect one stored server without changing its stored state. */
export interface McpRestartRequest {
  /** Scope owning the definition. */
  readonly scope: McpScope
  /** Namespace of the definition to restart. */
  readonly serverName: string
}

/** Request to toggle one Loader-declared `mcp-client` row. */
export interface McpSetStaticEnabledRequest {
  /** Loader entry id of the row. */
  readonly entryId: string
  /** Whether the row's instance should run. */
  readonly enabled: boolean
}
