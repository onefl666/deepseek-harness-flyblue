/**
 * Tests for the MCP transport factory: each resolved config selects the SDK
 * transport that matches its discriminant.
 */
import { describe, expect, it } from 'vitest'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createTransport } from '@deepseek-ai/dsh-mcp-client/src/transport.ts'
import { Config as ConfigSchema } from '@deepseek-ai/dsh-mcp-client/src/index.ts'

describe('createTransport', () => {
  it('spawns a child process for the stdio transport', () => {
    const transport = createTransport({
      transport: 'stdio',
      serverName: 'srv',
      command: 'echo',
      args: [],
      env: {},
      cwd: '',
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    })
    expect(transport).toBeInstanceOf(StdioClientTransport)
  })

  it('addresses a URL for the Streamable HTTP transport', () => {
    const transport = createTransport({
      transport: 'streamable-http',
      serverName: 'srv',
      url: 'http://127.0.0.1:1234/mcp',
      headers: { Authorization: 'Bearer token' },
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    })
    expect(transport).toBeInstanceOf(StreamableHTTPClientTransport)
  })

  it('addresses a URL for the legacy SSE transport', () => {
    const transport = createTransport({
      transport: 'sse',
      serverName: 'srv',
      url: 'http://127.0.0.1:1234/sse',
      headers: {},
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    })
    // oxlint-disable-next-line typescript/no-deprecated -- the legacy transport is the subject of this case.
    expect(transport).toBeInstanceOf(SSEClientTransport)
  })
})

describe('Config schema', () => {
  it('materializes the SSE branch with its defaults', () => {
    const resolved = ConfigSchema({
      transport: 'sse',
      serverName: 'legacy',
      url: 'http://127.0.0.1:1234/sse',
    } as never)
    expect(resolved).toMatchObject({
      transport: 'sse',
      serverName: 'legacy',
      headers: {},
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    })
  })

  it('keeps an optional protocol floor on every branch', () => {
    for (const branch of [
      { transport: 'stdio', serverName: 'srv', command: 'echo' },
      { transport: 'streamable-http', serverName: 'srv', url: 'http://127.0.0.1:1/mcp' },
      { transport: 'sse', serverName: 'srv', url: 'http://127.0.0.1:1/sse' },
    ]) {
      const resolved = ConfigSchema({ ...branch, minProtocolVersion: '2025-06-18' } as never)
      expect(resolved.minProtocolVersion).toBe('2025-06-18')
    }
  })
})
