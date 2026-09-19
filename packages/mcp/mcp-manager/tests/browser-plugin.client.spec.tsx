// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { NS } from '../src/client/locales.ts'
import { McpManagerSection } from '../src/client/McpManagerSection.tsx'
import type { McpManagerSectionInjected } from '../src/client/McpManagerSection.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = { registryPath: '', servers: [], staticRows: [], supportedProtocolVersions: [] }

/** Build a client runtime with a stubbed mcpManager Remote namespace. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const $on = vi.fn((_event: string, _listener: (report: unknown) => void) => () => {})
  class RemoteService extends Service {
    $on = $on

    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const remote = {
    list: vi.fn().mockResolvedValue({ ok: true, value: EMPTY }),
    save: vi.fn().mockResolvedValue({ ok: true, value: EMPTY }),
    uninstall: vi.fn().mockResolvedValue({ ok: true, value: EMPTY }),
    setEnabled: vi.fn().mockResolvedValue({ ok: true, value: EMPTY }),
    restart: vi.fn().mockResolvedValue({ ok: true, value: EMPTY }),
    setStaticEnabled: vi.fn().mockResolvedValue({ ok: true, value: EMPTY }),
  }
  ctx.provide('remote.mcpManager', remote)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, remote, $on }
}

/** Declare the settings shell's section slot the plugin registers into. */
function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('mcp-manager browser plugin', () => {
  it('declares only the services the section contribution uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.mcpManager'])
  })

  it('registers a localized section without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(McpManagerSection)
    expect(entry.options).toMatchObject({ id: 'mcp', order: 35 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('MCP 服务器')
    await b.ctx.fiber.dispose()
  })

  it('forwards every Remote verb with the request the Host expects', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('settings.section')[0]!.inject as unknown as () => McpManagerSectionInjected)()
    const scope = { kind: 'user' } as const
    const config = { transport: 'stdio', serverName: 'srv', command: 'echo' } as const

    await injected.list(scope)
    await injected.save(scope, config)
    await injected.remove(scope, 'srv')
    await injected.setEnabled(scope, 'srv', true)
    await injected.restart(scope, 'srv')
    await injected.setStaticEnabled('memory', false)

    expect(b.remote.list).toHaveBeenCalledWith({ scope })
    expect(b.remote.save).toHaveBeenCalledWith({ scope, config })
    expect(b.remote.uninstall).toHaveBeenCalledWith({ scope, serverName: 'srv' })
    expect(b.remote.setEnabled).toHaveBeenCalledWith({ scope, serverName: 'srv', enabled: true })
    expect(b.remote.restart).toHaveBeenCalledWith({ scope, serverName: 'srv' })
    expect(b.remote.setStaticEnabled).toHaveBeenCalledWith({ entryId: 'memory', enabled: false })
    await b.ctx.fiber.dispose()
  })

  it('subscribes to the forwarded connection-status event through the Remote', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('settings.section')[0]!.inject as unknown as () => McpManagerSectionInjected)()

    const listener = vi.fn()
    const off = injected.subscribeStatus(listener)
    expect(b.$on).toHaveBeenCalledWith('mcp/status', expect.any(Function))
    expect(typeof off).toBe('function')
    await b.ctx.fiber.dispose()
  })

  it('follows locale and recovers across late declaration and declarer reload', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.section')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.section')).toHaveLength(1) })
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('MCP servers')

    stop()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('settings.section')[0]?.component).toBe(McpManagerSection)
    })

    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
