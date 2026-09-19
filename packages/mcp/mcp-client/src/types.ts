/**
 * Client-safe vocabulary for this package: the connection-status report and
 * the Cordis event that carries it. Types only — the emitting code lives in
 * `./connection.ts`, and consumers that only need the event signature read
 * this face without loading the MCP SDK.
 *
 * @module @deepseek-ai/dsh-mcp-client/types
 */

/** Lifecycle state of one MCP server connection. */
export type McpConnectionStatus =
  /** Connected, tool synchronization complete. */
  | 'connected'
  /** A generation was lost or an attempt failed; a retry is scheduled. */
  | 'reconnecting'
  /** The attempt budget is exhausted, the connect timed out, or the floor rejected the negotiated version. */
  | 'failed'
  /** The plugin instance was disposed; registered tools are gone. */
  | 'stopped'

/** One connection-status transition reported by an `mcp-client` instance. */
export interface McpStatusReport {
  /** Server namespace the instance registered as `mcp__<serverName>__*`. */
  readonly serverName: string
  /** State the instance entered. */
  readonly status: McpConnectionStatus
  /** Diagnostic for `failed`; absent otherwise. */
  readonly error?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One MCP server connection changed state. Emitted by every `mcp-client`
     * instance on connect, on a lost generation, when the reconnect budget is
     * exhausted, when the initial attempt fails and reconnection is disabled,
     * and on disposal. Management surfaces subscribe to keep a status view
     * current; listener failures are contained by the emitter.
     * @param report - server namespace, the state entered, and any failure detail.
     * @mode emit
     */
    'mcp/status'(report: McpStatusReport): void
  }
}
