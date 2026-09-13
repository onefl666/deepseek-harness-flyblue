/**
 * ui-windows-shell browser half on a real cordis Context: the plugin
 * registers the General-settings row with its locale dictionaries over the
 * shared settings mirror, the injected face loads and writes the namespace,
 * and fiber disposal removes the contribution (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { remoteDefaultResponses } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/remote-default-responses.ts'
import { RemoteMock } from '@deepseek-ai/dsh-remote-mock'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  WindowsShellRow, type WindowsShellRowInjected,
} from '../src/client/WindowsShellRow.tsx'
import { apply, inject } from '../src/client/index.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  const mock = RemoteMock.create().load(remoteDefaultResponses)
  onTestFinished(() => { mock.assertNoUnmatched() })
  const remote = new TestRemote(ctx, { settings: mock.remote.settings })
  ctx.slots.register({
    name: 'root',
    children: {
      'settings.general.item': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return {
    ctx, fiber, remote, locale,
    row: () => ctx.slots.entries('settings.general.item')
      .find(entry => entry.component === WindowsShellRow),
  }
}

describe('ui-windows-shell browser plugin', () => {
  it('registers the settings row and its dictionaries', async () => {
    const b = await bench()
    const row = b.row()!
    expect(row.options).toEqual({ id: 'windows-shell', order: 1 })
    const injected = row.inject?.() as WindowsShellRowInjected | undefined
    expect(injected?.hooks.windowsShell).toBeDefined()
    expect(typeof injected?.load).toBe('function')
    expect(typeof injected?.select).toBe('function')
    await injected!.load()
    await injected!.select('pwsh')

    const t = b.locale.bind('settings.windows-shell')
    expect(t('title')).toBe('Windows Shell')
    expect(t('shell.pwsh')).toBe('PowerShell')
  })

  it('disposal removes the row (HMR safety)', async () => {
    const b = await bench()
    expect(b.row()).toBeDefined()
    b.remote.emit('settings/document-updated', ['another', 1])
    b.remote.emit('settings/document-updated', ['windows-shell', 1])
    b.ctx.emit('connection/reset')
    await b.fiber.dispose()
    expect(b.row()).toBeUndefined()
  })
})
