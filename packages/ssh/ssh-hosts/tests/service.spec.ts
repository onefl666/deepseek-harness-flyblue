import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SshService from '../src/index.ts'
import { SshHostId } from '../src/types.ts'

async function withHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ssh-hosts-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try { await run(home) } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
}

describe('SSH host service', () => {
  it('uses its own Cordis key while preserving the ssh Remote namespace', async () => {
    await withHome(async () => {
      const ctx = new Context()
      const fiber = await ctx.plugin(SshService)

      expect(ctx.get('sshHosts')).toBeInstanceOf(SshService)
      expect(ctx.get('ssh')).toBeUndefined()
      expect(ctx.get('sshHosts')?.typertRemote.namespace).toBe('ssh')

      await fiber.dispose()
      expect(ctx.get('sshHosts')).toBeUndefined()
    })
  })

  it('loads persisted hosts before plugin activation completes', async () => {
    await withHome(async (home) => {
      await writeFile(join(home, 'dsh-ssh.json'), JSON.stringify({
        version: 1,
        hosts: [{ id: 'saved', alias: 'Saved', host: 'example.invalid', port: 22, user: 'user', password: 'secret' }],
      }))
      const ctx = new Context()
      const fiber = await ctx.plugin(SshService)
      expect(ctx.sshHosts.list()).toEqual([{
        id: SshHostId('saved'), alias: 'Saved', host: 'example.invalid', port: 22, user: 'user', auth: 'password',
      }])
      await fiber.dispose()
    })
  })

  it('rejects activation when the persisted host file is invalid', async () => {
    await withHome(async (home) => {
      await writeFile(join(home, 'dsh-ssh.json'), '{"version":2,"hosts":[]}')
      const ctx = new Context()
      await expect(ctx.plugin(SshService)).rejects.toThrow('ssh: unsupported configuration format')
      expect(ctx.get('sshHosts')).toBeUndefined()
    })
  })
})
