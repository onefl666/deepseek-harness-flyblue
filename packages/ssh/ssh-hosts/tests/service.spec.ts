import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SshService from '../src/index.ts'

describe('SSH host service', () => {
  it('uses its own Cordis key while preserving the ssh Remote namespace', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(SshService)

    expect(ctx.get('sshHosts')).toBeInstanceOf(SshService)
    expect(ctx.get('ssh')).toBeUndefined()
    expect(ctx.get('sshHosts')?.typertRemote.namespace).toBe('ssh')

    await fiber.dispose()
    expect(ctx.get('sshHosts')).toBeUndefined()
  })
})
