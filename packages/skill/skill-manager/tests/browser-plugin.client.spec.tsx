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
import { SkillManagerSection } from '../src/client/SkillManagerSection.tsx'
import type { SkillManagerSectionInjected } from '../src/client/SkillManagerSection.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = { roots: [], skills: [] }

/** Build a client runtime with a stubbed skillManager Remote namespace. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const list = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const read = vi.fn().mockResolvedValue({ ok: true, value: { name: 'x', description: 'd', path: '/x', frontmatter: '', body: '' } })
  const create = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const update = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const uninstall = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const setEnabled = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const installFromDirectory = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const installFromGit = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  ctx.provide('remote.skillManager', {
    list, read, create, update, uninstall, setEnabled, installFromDirectory, installFromGit,
  })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

/** Declare the settings shell's section slot the plugin registers into. */
function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('skill-manager browser plugin', () => {
  it('declares only the services the section contribution uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.skillManager'])
  })

  it('registers a localized section without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(SkillManagerSection)
    expect(entry.options).toMatchObject({ id: 'skills', order: 30 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('技能')
    await b.ctx.fiber.dispose()
  })

  it('forwards every Remote verb with the request the Host expects', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('settings.section')[0]!.inject as unknown as () => SkillManagerSectionInjected)()
    const scope = { kind: 'user' } as const
    const draft = { name: 'fresh', description: 'd', body: 'b' }

    await injected.list(scope)
    await injected.read(scope, 'fresh')
    await injected.create(scope, draft)
    await injected.update(scope, 'fresh', draft)
    await injected.uninstall(scope, 'fresh')
    await injected.setEnabled(scope, 'fresh', false)
    await injected.installFromDirectory(scope, '/tmp/source')
    await injected.installFromGit(scope, 'https://example.com/repo.git')
    await injected.installFromGit(scope, 'https://example.com/repo.git', 'v2')

    const remote = b.ctx.get('remote.skillManager') as Record<string, ReturnType<typeof vi.fn>>
    expect(remote.list).toHaveBeenCalledWith({ scope })
    expect(remote.read).toHaveBeenCalledWith({ scope, name: 'fresh' })
    expect(remote.create).toHaveBeenCalledWith({ scope, draft })
    expect(remote.update).toHaveBeenCalledWith({ scope, name: 'fresh', draft })
    expect(remote.uninstall).toHaveBeenCalledWith({ scope, name: 'fresh' })
    expect(remote.setEnabled).toHaveBeenCalledWith({ scope, name: 'fresh', enabled: false })
    expect(remote.installFromDirectory).toHaveBeenCalledWith({ scope, path: '/tmp/source' })
    expect(remote.installFromGit).toHaveBeenNthCalledWith(1, { scope, url: 'https://example.com/repo.git' })
    expect(remote.installFromGit).toHaveBeenNthCalledWith(2, { scope, url: 'https://example.com/repo.git', ref: 'v2' })
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
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('Skills')

    stop()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('settings.section')[0]?.component).toBe(SkillManagerSection)
    })

    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
