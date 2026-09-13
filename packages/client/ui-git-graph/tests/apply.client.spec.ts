import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { apply, inject } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'
import { GitGraphSection } from '../src/client/section.tsx'
import type { GitGraphInjected } from '../src/client/section.tsx'
import { apply as nodeApply } from '../src/index.ts'

/** The workspace every verb call in these cases addresses. */
const WORKSPACE = 'ws-1' as WorkspaceId

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
  const failure = { ok: false as const, error: { name: 'Error', message: 'unused' } }
  const graph = vi.fn(async () => failure)
  const status = vi.fn(async () => failure)
  const branches = vi.fn(async () => failure)
  const createBranch = vi.fn(async () => failure)
  const switchBranch = vi.fn(async () => failure)
  const stage = vi.fn(async () => failure)
  const unstage = vi.fn(async () => failure)
  const discard = vi.fn(async () => failure)
  ctx.provide('remote.workspaceGit', { graph, status, branches, createBranch, switchBranch, stage, unstage, discard })
  // The section reads its scope from the global useWorkspaces seat, which the
  // Workspace Controller backs; the plugin declares that dependency without
  // calling the service itself.
  ctx.provide('workspaces', { list: { getSnapshot: () => ({ items: [] }) } } as never)
  return { ctx, locale, slots: ctx.get('slots') as SlotRegistry, graph, status, branches, createBranch, switchBranch, stage, unstage, discard }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-git-graph apply', () => {
  it('declares its injected services', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.workspaceGit', 'workspaces'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the settings section and wires every Remote verb through its inject face', async () => {
    const { ctx, locale, slots, graph, status, branches, createBranch, switchBranch, stage, unstage, discard } = await bench()
    locale.setLocale('zh')
    declare(slots)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const entry = slots.entries('settings.section')[0]!
    expect(entry.component).toBe(GitGraphSection)
    expect(entry.options).toMatchObject({ id: 'git-graph', order: 42 })
    expect(resolveSlotLabel(entry.options.label)).toBe('Git 图谱')
    const injected = (entry.inject as unknown as () => GitGraphInjected)()
    // The section resolves its scope itself, so every verb is addressed by the
    // workspace id its caller passes rather than by one the face captured.
    await injected.graph(WORKSPACE)
    expect(graph).toHaveBeenCalledWith(WORKSPACE)
    await injected.status(WORKSPACE)
    expect(status).toHaveBeenCalledWith(WORKSPACE)
    await injected.branches(WORKSPACE)
    expect(branches).toHaveBeenCalledWith(WORKSPACE)
    await injected.createBranch(WORKSPACE, 'feat')
    expect(createBranch).toHaveBeenCalledWith(WORKSPACE, 'feat')
    await injected.switchBranch(WORKSPACE, 'main')
    expect(switchBranch).toHaveBeenCalledWith(WORKSPACE, 'main')
    await injected.stage(WORKSPACE, 'a.ts')
    expect(stage).toHaveBeenCalledWith(WORKSPACE, 'a.ts')
    await injected.unstage(WORKSPACE, 'a.ts')
    expect(unstage).toHaveBeenCalledWith(WORKSPACE, 'a.ts')
    await injected.discard(WORKSPACE, 'a.ts', true)
    expect(discard).toHaveBeenCalledWith(WORKSPACE, 'a.ts', true)

    await fiber.dispose()
    expect(slots.entries('settings.section')).toHaveLength(0)
    expect(() => locale.register('gitgraph', { zh, en })).not.toThrow()
  })

  it('labels the entry in the active locale', async () => {
    const { ctx, locale, slots } = await bench()
    locale.setLocale('en')
    declare(slots)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = slots.entries('settings.section')[0]!
    expect(resolveSlotLabel(entry.options.label)).toBe('Git graph')
    await fiber.dispose()
  })
})
