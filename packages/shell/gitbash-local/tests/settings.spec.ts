/** Live Git Bash configuration through Loader updates. */

import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { GitBashExecutor } from '../src/index.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'

it('updates command budgets and the executable path without remounting', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LocalSubprocessRuntime)
  const live = await liveConfig(ctx, GitBashExecutor, {
    timeoutMs: 60_000,
    gitBashPath: '/opt/first/bash.exe',
  })
  const before = live.fiber
  expect((ctx.shell as GitBashExecutor).gitBashPath).toBe('/opt/first/bash.exe')

  await live.update({ timeoutMs: 5_000, gitBashPath: '/opt/second/bash.exe' })
  expect(live.entry.fiber === before).toBe(true)
  expect((ctx.shell as GitBashExecutor).gitBashPath).toBe('/opt/second/bash.exe')
  expect(ctx.shell.resolve({ command: 'echo ok' }).timeoutMs).toBe(5_000)

  await live.update({ timeoutMs: 0 })
  expect(() => ctx.shell.resolve({ command: 'echo ok' })).toThrow('timeoutMs must be a positive finite number')
  await live.replace({ gitBashPath: '/opt/first/bash.exe' })
  expect(ctx.shell.resolve({ command: 'echo ok' }).timeoutMs).toBe(120_000)
  expect((ctx.shell as GitBashExecutor).gitBashPath).toBe('/opt/first/bash.exe')
})
