/** The Windows shell preference is a profile Config form. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as windowsShell from '../src/index.ts'

describe('windows-shell profile config', () => {
  it('defaults to Git Bash and accepts PowerShell in the mounted plugin', async () => {
    const ctx = new Context()
    const defaultFiber = ctx.plugin(windowsShell)
    await defaultFiber.await()
    expect((defaultFiber.config as windowsShell.Config).shell.get()).toBe('gitbash')
    await defaultFiber.dispose()

    const selectedFiber = ctx.plugin(windowsShell, { shell: 'pwsh' } as never)
    await selectedFiber.await()
    expect((selectedFiber.config as windowsShell.Config).shell.get()).toBe('pwsh')
    await ctx.fiber.dispose()
  })

  it('rejects a shell outside the two shipped stacks', async () => {
    const ctx = new Context()
    await expect(ctx.plugin(windowsShell, { shell: 'cmd' } as never).await()).rejects.toThrow()
    await ctx.fiber.dispose()
  })
})
