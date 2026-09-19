/**
 * Behavior tests for the MCP server manager: the per-scope registry, the
 * definition validator, the failure vocabulary, and the Remote surface the Web
 * settings section drives.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Fiber } from '@deepseek-ai/cordis'
import {
  McpManagerError, McpManagerGateway, resolveMcpManagerConfig, toInstanceConfig, toRemoteError,
} from '../src/index.ts'
import { McpRegistryError, readRegistry, registryPath, updateRegistry } from '../src/registry.ts'
import type { McpServerConfigView } from '../src/types.ts'

let root: string
let ctx: Context
let fiber: Fiber
let gateway: McpManagerGateway

const userRegistry = (): string => join(root, 'mcp-servers.json')

/** One valid stdio definition. */
function stdio(name: string): McpServerConfigView {
  return { transport: 'stdio', serverName: name, command: 'echo', args: ['hi'] }
}

/** Write one registry document directly. */
async function seed(path: string, servers: readonly { enabled: boolean; config: McpServerConfigView }[]): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify({ formatVersion: 1, servers }, undefined, 2)}\n`, 'utf8')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mcp-manager-'))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  fiber = await ctx.plugin(McpManagerGateway, { dshHome: root })
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- Context merge is declared in the module under test.
  gateway = ctx.get('mcpManager') as McpManagerGateway
})

afterEach(async () => {
  await fiber.dispose()
  await rm(root, { recursive: true, force: true })
})

describe('resolveMcpManagerConfig', () => {
  it('defaults the registry document name', () => {
    expect(resolveMcpManagerConfig({}).registryFileName).toBe('mcp-servers.json')
  })

  it('rejects a registry name that is not one path segment', () => {
    expect(() => resolveMcpManagerConfig({ registryFileName: 'nested/file.json' })).toThrow(/single nonempty path segment/)
  })
})

describe('registryPath', () => {
  it('places the user registry directly under the harness home', () => {
    const config = resolveMcpManagerConfig({ dshHome: root })
    expect(registryPath(config, { kind: 'user' })).toBe(join(root, 'mcp-servers.json'))
  })

  it('places a project registry under the workspace .dsh directory', () => {
    const config = resolveMcpManagerConfig({ dshHome: root })
    expect(registryPath(config, { kind: 'workspace', cwd: join(root, 'project') }))
      .toBe(join(root, 'project', '.dsh', 'mcp-servers.json'))
  })
})

describe('readRegistry and updateRegistry', () => {
  it('treats a missing document as an empty registry', async () => {
    expect(await readRegistry(userRegistry())).toEqual({ formatVersion: 1, servers: [] })
  })

  it('round-trips one change', async () => {
    await updateRegistry(userRegistry(), () => ({
      formatVersion: 1,
      servers: [{ enabled: true, config: stdio('kept') }],
    }))
    expect((await readRegistry(userRegistry())).servers).toHaveLength(1)
  })

  it('serializes concurrent changes through the file lock', async () => {
    await Promise.all([0, 1, 2, 3].map(index => updateRegistry(userRegistry(), current => ({
      formatVersion: 1,
      servers: [...current.servers, { enabled: true, config: stdio(`s${String(index)}`) }],
    }))))
    expect((await readRegistry(userRegistry())).servers).toHaveLength(4)
  })

  it('refuses a document it cannot parse instead of dropping servers', async () => {
    await writeFile(userRegistry(), 'not json', 'utf8')
    await expect(readRegistry(userRegistry())).rejects.toBeInstanceOf(McpRegistryError)
  })

  it('refuses a document from another format generation', async () => {
    await writeFile(userRegistry(), JSON.stringify({ formatVersion: 99, servers: [] }), 'utf8')
    await expect(readRegistry(userRegistry())).rejects.toBeInstanceOf(McpRegistryError)
  })

  it('refuses a record without a boolean enabled flag', async () => {
    await writeFile(userRegistry(), JSON.stringify({ formatVersion: 1, servers: [{ config: {} }] }), 'utf8')
    await expect(readRegistry(userRegistry())).rejects.toBeInstanceOf(McpRegistryError)
  })
})

describe('toInstanceConfig', () => {
  it('applies the tool-call timeout and startup defaults', () => {
    expect(toInstanceConfig(stdio('srv'))).toMatchObject({
      transport: 'stdio',
      serverName: 'srv',
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
      cwd: '',
    })
  })

  it('requires a command for the stdio transport', () => {
    expect(() => toInstanceConfig({ transport: 'stdio', serverName: 'srv' })).toThrow(/needs a command/)
  })

  it('requires a URL for the URL transports', () => {
    expect(() => toInstanceConfig({ transport: 'sse', serverName: 'srv' })).toThrow(/needs a URL/)
  })

  it('carries the optional protocol floor through', () => {
    expect(toInstanceConfig({ ...stdio('srv'), minProtocolVersion: '2025-06-18' }))
      .toMatchObject({ minProtocolVersion: '2025-06-18' })
  })

  it('rejects a server name outside the namespace grammar', () => {
    expect(() => toInstanceConfig({ ...stdio('bad name') })).toThrow(McpManagerError)
  })
})

describe('toRemoteError', () => {
  it.each([
    ['not-found', 'mcp-manager/not-found'],
    ['conflict', 'mcp-manager/conflict'],
    ['rejected', 'mcp-manager/rejected'],
  ] as const)('maps %s onto %s', (failure, code) => {
    expect(toRemoteError(new McpManagerError(failure, 'message', 'srv')).code).toBe(code)
  })

  it('classifies an unknown rejection as a generic refusal', () => {
    expect(toRemoteError(new Error('boom')).code).toBe('mcp-manager/rejected')
  })
})

describe('McpManagerGateway', () => {
  it('lists a stored server without mounting a disabled one', async () => {
    await seed(userRegistry(), [{ enabled: false, config: stdio('idle') }])
    const listing = await gateway.list({ scope: { kind: 'user' } })
    expect(listing.registryPath).toBe(userRegistry())
    expect(listing.servers).toEqual([
      expect.objectContaining({ serverName: 'idle', enabled: false, mounted: false, status: 'disabled', target: 'echo hi' }),
    ])
    expect(listing.supportedProtocolVersions).toContain('2025-11-25')
  })

  it('refuses an unusable definition before writing anything', async () => {
    await expect(gateway.save({ scope: { kind: 'user' }, config: { transport: 'stdio', serverName: 'srv' } }))
      .rejects.toMatchObject({ code: 'mcp-manager/rejected' })
    expect((await readRegistry(userRegistry())).servers).toEqual([])
  })

  it('stores a definition and keeps retrying an unreachable server', async () => {
    const listing = await gateway.save({
      scope: { kind: 'user' },
      config: { transport: 'sse', serverName: 'unreachable', url: 'http://127.0.0.1:1/sse' },
    })
    // The plugin activates (failOnStartupError defaults to false) and its own
    // supervisor owns the retry, so the row reports the state it is in.
    expect(listing.servers[0]).toMatchObject({
      serverName: 'unreachable', enabled: true, mounted: true, status: 'reconnecting',
    })
    expect((await readRegistry(userRegistry())).servers).toHaveLength(1)
  })

  it('reports a refused startup as a failed row when the definition demands it', async () => {
    const listing = await gateway.save({
      scope: { kind: 'user' },
      config: {
        transport: 'sse',
        serverName: 'strict',
        url: 'http://127.0.0.1:1/sse',
        failOnStartupError: true,
      },
    })
    expect(listing.servers[0]).toMatchObject({ serverName: 'strict', enabled: true, mounted: false, status: 'failed' })
  })

  it('remembers the enabled flag when a server is switched off', async () => {
    await seed(userRegistry(), [{ enabled: false, config: stdio('idle') }])
    const enabled = await gateway.setEnabled({ scope: { kind: 'user' }, serverName: 'idle', enabled: true })
    expect(enabled.servers[0]?.enabled).toBe(true)

    const disabled = await gateway.setEnabled({ scope: { kind: 'user' }, serverName: 'idle', enabled: false })
    expect(disabled.servers[0]).toMatchObject({ enabled: false, mounted: false, status: 'disabled' })
  })

  it('deletes a stored server', async () => {
    await seed(userRegistry(), [{ enabled: false, config: stdio('doomed') }])
    const listing = await gateway.uninstall({ scope: { kind: 'user' }, serverName: 'doomed' })
    expect(listing.servers).toEqual([])
  })

  it('reports a missing server as not-found', async () => {
    await expect(gateway.uninstall({ scope: { kind: 'user' }, serverName: 'absent' }))
      .rejects.toMatchObject({ code: 'mcp-manager/not-found' })
  })

  it('reconnects a stored server without changing its enabled flag', async () => {
    await seed(userRegistry(), [{ enabled: false, config: stdio('idle') }])
    const listing = await gateway.restart({ scope: { kind: 'user' }, serverName: 'idle' })
    expect(listing.servers[0]?.enabled).toBe(false)
  })

  it('refuses a name the same scope already stores in another registry', async () => {
    const project = join(root, 'project')
    await seed(userRegistry(), [{ enabled: false, config: stdio('dup') }])
    await seed(join(project, '.dsh', 'mcp-servers.json'), [{ enabled: false, config: stdio('dup') }])

    await expect(gateway.setEnabled({
      scope: { kind: 'workspace', cwd: project },
      serverName: 'dup',
      enabled: true,
    })).rejects.toMatchObject({ code: 'mcp-manager/conflict' })
  })

  it('surfaces an unusable registry document as a refusal', async () => {
    await writeFile(userRegistry(), 'not json', 'utf8')
    await expect(gateway.list({ scope: { kind: 'user' } }))
      .rejects.toMatchObject({ code: 'mcp-manager/rejected' })
  })

  it('refuses a declared-row toggle when no Loader is composed', async () => {
    await expect(gateway.setStaticEnabled({ entryId: 'memory', enabled: true }))
      .rejects.toMatchObject({ code: 'mcp-manager/rejected' })
  })

  it('starts the user scope from its registry when the service activates', async () => {
    const second = new Context()
    await second.plugin(SystemPrompt)
    await second.plugin(ToolRuntime)
    await seed(join(root, 'fresh', 'mcp-servers.json'), [{ enabled: false, config: stdio('from-file') }])
    const secondFiber = await second.plugin(McpManagerGateway, { dshHome: join(root, 'fresh') })
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- same handle as the bench.
    const secondGateway = second.get('mcpManager') as McpManagerGateway
    const listing = await secondGateway.list({ scope: { kind: 'user' } })
    expect(listing.servers.map(server => server.serverName)).toEqual(['from-file'])
    await secondFiber.dispose()
  })

  it('keeps a project registry out of the user document', async () => {
    const project = join(root, 'project')
    await gateway.save({ scope: { kind: 'workspace', cwd: project }, config: {
      transport: 'sse', serverName: 'project-only', url: 'http://127.0.0.1:1/sse',
    } })
    expect((await readRegistry(userRegistry())).servers).toEqual([])
    expect(JSON.parse(await readFile(join(project, '.dsh', 'mcp-servers.json'), 'utf8')))
      .toMatchObject({ formatVersion: 1 })
  })
})
