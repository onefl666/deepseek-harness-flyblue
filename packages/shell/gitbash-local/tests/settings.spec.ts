/** The shared `bash` settings section as the Git Bash executor resolves it. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { SHELL_SETTINGS_NAMESPACE } from '@deepseek-ai/dsh-shell'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { GitBashExecutor } from '@deepseek-ai/dsh-gitbash-local'

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

async function boot(config: ConstructorParameters<typeof GitBashExecutor>[1] = {}): Promise<{
  ctx: Context
  settingsFiber: Fiber
  executorFiber: Fiber
  bash: GitBashExecutor
}> {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  // A configured path keeps the suite platform-independent: it is trusted
  // verbatim, so no Git for Windows install has to exist.
  const executorFiber = ctx.plugin(GitBashExecutor, { timeoutMs: 60_000, gitBashPath: 'C:\\git\\first\\bash.exe', ...config })
  await executorFiber.await()
  return { ctx, settingsFiber, executorFiber, bash: ctx.shell as GitBashExecutor }
}

describe('gitbash executor over the bash settings section', () => {
  it('installs the concrete class schema, so gitBashPath persists as part of the section', async () => {
    const bench = await boot()
    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000, gitBashPath: 'C:\\git\\second\\bash.exe' })
    expect(bench.bash.config.timeoutMs).toBe(5_000)
    expect(bench.bash.gitBashPath).toBe('C:\\git\\second\\bash.exe')
    await bench.ctx.fiber.dispose()
  })

  it('resolves the user layer over the composition entry', async () => {
    const bench = await boot()
    expect(bench.bash.config.timeoutMs).toBe(60_000)

    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000 })

    expect(bench.bash.config.timeoutMs).toBe(5_000)
    await bench.ctx.fiber.dispose()
  })

  it('refuses a stored value the constructor would have rejected', async () => {
    const bench = await boot()

    await expect(bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 0 }))
      .rejects.toThrow(/bash-local: timeoutMs must be a positive finite number/)

    expect(bench.bash.config.timeoutMs).toBe(60_000)
    await bench.ctx.fiber.dispose()
  })

  it('re-resolves the executable when the stored path changes', async () => {
    const bench = await boot({ gitBashPath: '/opt/first/bash.exe' })
    expect(bench.bash.gitBashPath).toBe('/opt/first/bash.exe')

    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { gitBashPath: '/opt/second/bash.exe' })

    expect(bench.bash.gitBashPath).toBe('/opt/second/bash.exe')
    await bench.ctx.fiber.dispose()
  })

  it('keeps the resolved executable when an unrelated field changes', async () => {
    const bench = await boot({ gitBashPath: '/opt/first/bash.exe' })
    const before = bench.bash.gitBashPath

    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000 })

    expect(bench.bash.gitBashPath).toBe(before)
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the settings provider detaches', async () => {
    const bench = await boot({ gitBashPath: '/opt/first/bash.exe' })
    await bench.ctx.settings.update(SHELL_SETTINGS_NAMESPACE, { timeoutMs: 5_000, gitBashPath: '/opt/second/bash.exe' })
    expect(bench.bash.config.timeoutMs).toBe(5_000)
    expect(bench.bash.gitBashPath).toBe('/opt/second/bash.exe')

    await bench.settingsFiber.dispose()

    expect(bench.bash.config.timeoutMs).toBe(60_000)
    expect(bench.bash.gitBashPath).toBe('/opt/first/bash.exe')
    await bench.ctx.fiber.dispose()
  })

  it('releases the namespace when the executor unloads', async () => {
    const bench = await boot()
    expect(bench.ctx.settings.describe().map(row => String(row.ns))).toContain('shell')

    await bench.executorFiber.dispose()

    expect(bench.ctx.settings.describe().map(row => String(row.ns))).not.toContain('shell')
    await bench.ctx.fiber.dispose()
  })
})
