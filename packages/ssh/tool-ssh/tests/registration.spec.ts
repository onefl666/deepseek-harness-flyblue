import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SshService from '@deepseek-ai/dsh-ssh-hosts'
import { describe, expect, it } from 'vitest'
import * as ToolSsh from '../src/index.ts'

describe('SSH tool registration', () => {
  it('tracks a host service that activates after the tool and unloads', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-tool-ssh-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      const toolFiber = await ctx.plugin(ToolSsh)
      expect(ctx.tools.schemas()).toEqual([])

      const host = await ctx.plugin(SshService)
      expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual(['ssh_exec', 'ssh_list'])

      await host.dispose()
      expect(ctx.tools.schemas()).toEqual([])

      await ctx.plugin(SshService)
      expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual(['ssh_exec', 'ssh_list'])

      await toolFiber.dispose()
      expect(ctx.tools.schemas()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      await rm(home, { recursive: true, force: true })
    }
  })
})
