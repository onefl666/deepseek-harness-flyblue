/** The `windows-shell` settings namespace as the plugin registers it. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply } from '../src/index.ts'
import { WINDOWS_SHELL_SETTINGS_NAMESPACE } from '../src/index.ts'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

async function boot(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const fiber = ctx.plugin(apply)
  await fiber.await()
  return { ctx, fiber }
}

describe('windows-shell settings namespace', () => {
  it('registers with the schema default and restart timing', async () => {
    const { ctx } = await boot()
    const descriptor = ctx.settings.describe().find(row => row.ns === WINDOWS_SHELL_SETTINGS_NAMESPACE)
    expect(descriptor?.value).toEqual({ shell: 'gitbash' })
    expect(descriptor?.applies).toBe('restart')
    await ctx.fiber.dispose()
  })

  it('resolves a stored pwsh preference through the schema', async () => {
    const { ctx } = await boot()
    await ctx.settings.update(WINDOWS_SHELL_SETTINGS_NAMESPACE, { shell: 'pwsh' })
    const descriptor = ctx.settings.describe().find(row => row.ns === WINDOWS_SHELL_SETTINGS_NAMESPACE)
    expect(descriptor?.value).toEqual({ shell: 'pwsh' })
    await ctx.fiber.dispose()
  })

  it('refuses a stored value outside the two stacks', async () => {
    const { ctx } = await boot()
    await expect(ctx.settings.update(WINDOWS_SHELL_SETTINGS_NAMESPACE, { shell: 'cmd' }))
      .rejects.toThrow()
    const descriptor = ctx.settings.describe().find(row => row.ns === WINDOWS_SHELL_SETTINGS_NAMESPACE)
    expect(descriptor?.value).toEqual({ shell: 'gitbash' })
    await ctx.fiber.dispose()
  })

  it('releases the namespace when the plugin unloads', async () => {
    const { ctx, fiber } = await boot()
    expect(ctx.settings.describe().map(row => String(row.ns))).toContain(WINDOWS_SHELL_SETTINGS_NAMESPACE)

    await fiber.dispose()

    expect(ctx.settings.describe().map(row => String(row.ns))).not.toContain(WINDOWS_SHELL_SETTINGS_NAMESPACE)
    await ctx.fiber.dispose()
  })
})
