/**
 * Tests for the MCP client's protocol-version floor and its connection-status
 * events. Isolated file so `vi.mock` of the MCP SDK does not pollute the other
 * suites.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Config } from '@deepseek-ai/dsh-mcp-client'
import type { McpConnectionStatus } from '@deepseek-ai/dsh-mcp-client/types'

// ---- Mock MCP SDK ----

const { MockClient, state } = vi.hoisted(() => {
  const state = {
    /** Version the server answers `initialize` with. */
    negotiated: '2025-11-25',
    /** Whether the transport connect itself fails. */
    connectFails: false,
    /** Request methods each instance received, in order. */
    requests: [] as string[],
  }
  class MockClient {
    onclose?: () => void

    onerror?: (error: Error) => void

    async connect(): Promise<void> {
      if (state.connectFails) throw new Error('transport refused')
      await this.request({ method: 'initialize', params: {} }, {}, {})
    }

    async request(request: { method: string; params?: unknown }, _schema?: unknown, _options?: unknown): Promise<unknown> {
      state.requests.push(request.method)
      if (request.method === 'initialize') {
        return {
          protocolVersion: state.negotiated,
          capabilities: {},
          serverInfo: { name: 'mock-server', version: '1.0.0' },
        }
      }
      if (request.method === 'tools/list') return { tools: [] }
      throw new Error(`unexpected MCP request: ${request.method}`)
    }

    async close(): Promise<void> {
      this.onclose?.()
    }

    setNotificationHandler = (): void => {}
  }
  return { MockClient, state }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: MockClient }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: vi.fn() }))

import { apply, inject } from '@deepseek-ai/dsh-mcp-client/src/index.ts'
import { resolveMinProtocolVersion } from '@deepseek-ai/dsh-mcp-client/src/connection.ts'

const stdioConfig: Config = {
  transport: 'stdio',
  serverName: 'srv',
  command: 'echo',
  args: [],
  env: {},
  cwd: '',
  toolCallTimeoutMs: 60_000,
  failOnStartupError: false,
}

async function mountRegistry(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  return ctx
}

// ---- Tests ----

describe('resolveMinProtocolVersion', () => {
  it('accepts every version the SDK offers', () => {
    expect(resolveMinProtocolVersion('2024-11-05', 'test')).toBe('2024-11-05')
  })

  it('accepts omission as "every version"', () => {
    expect(resolveMinProtocolVersion(undefined, 'test')).toBeUndefined()
  })

  it('fails loud on a version the SDK cannot offer', () => {
    expect(() => resolveMinProtocolVersion('1999-01-01', 'test')).toThrow(/minProtocolVersion/)
  })
})

describe('protocol-version floor', () => {
  let ctx: Context

  beforeEach(async () => {
    vi.clearAllMocks()
    state.negotiated = '2025-11-25'
    state.connectFails = false
    state.requests = []
    ctx = await mountRegistry()
  })

  it('connects when the server negotiates at the floor', async () => {
    await apply(ctx, { ...stdioConfig, minProtocolVersion: '2025-06-18' })
    expect(state.requests).toContain('initialize')
  })

  it('refuses a server that negotiates below the floor', async () => {
    state.negotiated = '2024-11-05'
    // apply() reports the startup refusal with the real failure as its cause.
    const failure = await apply(ctx, {
      ...stdioConfig,
      minProtocolVersion: '2025-06-18',
      failOnStartupError: true,
      reconnect: { enabled: false },
    }).then(() => undefined, (error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(String((failure as Error).cause)).toMatch(/minProtocolVersion 2025-06-18/)
  })

  it('reports the refusal through the connection-status event', async () => {
    state.negotiated = '2024-11-05'
    const failures: string[] = []
    ctx.on('mcp/status', (report) => {
      if (report.status === 'failed') failures.push(report.error ?? '')
    })
    await apply(ctx, {
      ...stdioConfig,
      minProtocolVersion: '2025-06-18',
      reconnect: { enabled: false },
    })
    expect(failures.join('\n')).toMatch(/minProtocolVersion 2025-06-18/)
  })

  it('accepts an older server when no floor is configured', async () => {
    state.negotiated = '2024-10-07'
    await apply(ctx, stdioConfig)
    expect(ctx.tools.get('mcp__srv__missing')).toBeUndefined()
  })
})

describe('connection-status events', () => {
  let ctx: Context
  let seen: McpConnectionStatus[]

  beforeEach(async () => {
    vi.clearAllMocks()
    state.negotiated = '2025-11-25'
    state.connectFails = false
    state.requests = []
    seen = []
    ctx = await mountRegistry()
    ctx.on('mcp/status', (report) => { seen.push(report.status) })
  })

  it('reports connected once the initial sync settles', async () => {
    await apply(ctx, stdioConfig)
    expect(seen).toEqual(['connected'])
  })

  it('names the server namespace on every report', async () => {
    const names: string[] = []
    ctx.on('mcp/status', (report) => { names.push(report.serverName) })
    await apply(ctx, { ...stdioConfig, serverName: 'other' })
    expect(names).toEqual(['other'])
  })

  it('reports failed with the failure text when the connection fails and reconnect is off', async () => {
    state.connectFails = true
    const reports: string[] = []
    ctx.on('mcp/status', (report) => {
      if (report.status === 'failed') reports.push(report.error ?? '')
    })
    await apply(ctx, { ...stdioConfig, reconnect: { enabled: false } })
    expect(seen).toEqual(['failed'])
    expect(reports.join('\n')).toContain('transport refused')
  })

  it('reports reconnecting while the supervisor still has attempts left', async () => {
    state.connectFails = true
    await apply(ctx, { ...stdioConfig, reconnect: { maxAttempts: 3, initialDelayMs: 5 } })
    expect(seen).toEqual(['reconnecting'])
  })

  it('reports stopped when the plugin instance is disposed', async () => {
    const fiber = ctx.plugin({ inject, apply }, stdioConfig)
    await fiber
    await fiber.dispose()
    expect(seen).toEqual(['connected', 'stopped'])
  })
})
