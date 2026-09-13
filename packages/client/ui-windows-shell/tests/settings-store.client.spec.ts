import { describe, expect, it, vi } from 'vitest'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { WindowsShellSettingsController } from '../src/client/settings-store.ts'

function view(shell: string, revision = 0): SettingsNamespaceView {
  return {
    ns: 'windows-shell',
    schema: { uid: 1, refs: {} },
    value: { shell },
    base: { shell: 'gitbash' },
    applies: 'restart',
    secrets: [],
    revision,
  }
}

/** The settings namespace answers over the Remote carrier, which has no envelope. */
function ok<T>(value: T) {
  return { ok: true as const, value }
}

/** The windows-shell controller over a real mirror and one scripted context. */
function shellController(api: object, mode?: 'memory') {
  const ctx = { remote: { settings: api } } as never
  const mirror = new SettingsDescribeMirror(ctx, mode)
  return { mirror, controller: new WindowsShellSettingsController(mirror, ctx) }
}

describe('windows shell settings store', () => {
  it('loads and writes the shell field with optimistic concurrency', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({
      writable: true,
      hasDocument: false,
      namespaces: [view('gitbash', 4)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(view('pwsh', 5))))
    const { controller } = shellController({ describe, mutate })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      writable: true,
      current: 'gitbash',
      revision: 4,
    })
    await controller.select('pwsh')
    expect(mutate).toHaveBeenCalledWith(
      'windows-shell',
      [{ op: 'set', path: ['shell'], value: 'pwsh' }],
      4,
    )
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      current: 'pwsh',
      revision: 5,
    })
    // The write answer folded into the mirror; no re-read followed.
    expect(describe).toHaveBeenCalledTimes(1)
  })

  it('hides the row when the namespace is absent or the mirror is memory-mode', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [] })))
    const { controller } = shellController({ describe, mutate: vi.fn() })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'unavailable', writable: false })

    const neverRead = vi.fn()
    const remote = shellController({ describe: neverRead, mutate: vi.fn() }, 'memory').controller
    await remote.load()
    expect(remote.store.getSnapshot().status).toBe('unavailable')
    await remote.select('pwsh')
    expect(neverRead).not.toHaveBeenCalled()
  })

  it('contains write and read failures', async () => {
    const failing = shellController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('gitbash')] })),
      mutate: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('settings/conflict', 'stale', { ns: 'windows-shell', expected: 1, actual: 2 }),
      }),
    }).controller
    await failing.load()
    await failing.select('pwsh')
    expect(failing.store.getSnapshot()).toMatchObject({ status: 'error', error: 'stale' })

    const rejected = shellController({
      describe: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('gateway/internal', 'offline', {}),
      }),
      mutate: vi.fn(),
    }).controller
    await rejected.load()
    expect(rejected.store.getSnapshot()).toMatchObject({ status: 'error', error: 'offline' })

    const thrown = shellController({
      describe: async () => { throw 'disconnected' },
      mutate: vi.fn(),
    }).controller
    await thrown.load()
    expect(thrown.store.getSnapshot()).toMatchObject({ status: 'error', error: 'disconnected' })
  })

  it('fails on an advertisement outside the shipped stacks', async () => {
    const controller = shellController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('cmd')] })),
      mutate: vi.fn(),
    }).controller
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'windows-shell settings advertises "cmd"',
    })
  })

  it('no-ops a selection without a writable view', async () => {
    const mutate = vi.fn()
    const readOnly = shellController({
      describe: () => Promise.resolve(ok({
        writable: false, hasDocument: false, namespaces: [view('gitbash', 2)],
      })),
      mutate,
    }).controller
    await readOnly.load()
    expect(readOnly.store.getSnapshot()).toMatchObject({
      current: 'gitbash',
      writable: false,
      revision: 2,
    })
    await readOnly.select('pwsh')
    expect(mutate).not.toHaveBeenCalled()
  })

  it('follows a mirror refresh without an own read once loaded', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce(ok({ writable: true, hasDocument: false, namespaces: [view('gitbash', 1)] }))
      .mockResolvedValueOnce(ok({ writable: true, hasDocument: false, namespaces: [view('pwsh', 2)] }))
    const { mirror, controller } = shellController({ describe, mutate: vi.fn() })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ current: 'gitbash' })

    await mirror.load()

    expect(controller.store.getSnapshot()).toMatchObject({ current: 'pwsh', revision: 2 })
  })

  it('disposal stops deriving and suppresses in-flight writes', async () => {
    const neverRead = vi.fn()
    const { controller: neverLoaded } = shellController({ describe: neverRead, mutate: vi.fn() })
    neverLoaded.dispose()
    await neverLoaded.load()
    expect(neverLoaded.store.getSnapshot().status).toBe('idle')
    expect(neverRead).not.toHaveBeenCalled()

    const read = Promise.withResolvers<ReturnType<typeof ok<{
      writable: boolean
      namespaces: SettingsNamespaceView[]
    }>>>()
    const { mirror, controller: idle } = shellController({ describe: () => read.promise, mutate: vi.fn() })
    const loading = idle.load()
    idle.dispose()
    read.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('gitbash')] }))
    await Promise.all([loading, mirror.load()])
    expect(idle.store.getSnapshot().status).toBe('loading')

    const mutation = Promise.withResolvers<ReturnType<typeof ok<SettingsNamespaceView>>>()
    const active = shellController({
      describe: () => Promise.resolve(ok({
        writable: true,
        hasDocument: false,
        namespaces: [view('gitbash')],
      })),
      mutate: () => mutation.promise,
    }).controller
    await active.load()
    const saving = active.select('pwsh')
    active.dispose()
    mutation.resolve(ok(view('pwsh', 1)))
    await saving
    expect(active.store.getSnapshot().status).toBe('saving')
  })
})
