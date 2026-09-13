// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { WindowsShellRow, type WindowsShellRowProps } from '../src/client/WindowsShellRow.tsx'
import { zh } from '../src/client/locales.ts'
import { WindowsShellSettingsController } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

/** Controller over a real mirror derived from the same scripted context. */
function derivedController(remote: { settings: object }) {
  const ctx = { remote } as never
  return new WindowsShellSettingsController(new SettingsDescribeMirror(ctx), ctx)
}

afterEach(cleanup)

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

const dictionary: Record<string, string> = zh
const t: WindowsShellRowProps['t'] = key => dictionary[key] ?? key
type AttentionSnapshot = Parameters<Parameters<WindowsShellRowProps['useSessionPendingInteraction']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionPendingInteraction: WindowsShellRowProps['useSessionPendingInteraction'] = selector => selector(noAttention)
const runtime = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useSessionPendingInteraction,
  usePanelInfo, useResource,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
}

function mount(controller: WindowsShellSettingsController) {
  return render(
    <WindowsShellRow
      {...runtime}
      load={() => controller.load()}
      select={shell => controller.select(shell)}
      useWindowsShell={bindSnapshotSelector(controller.store)}
      t={t}
    />,
  )
}

describe('WindowsShellRow', () => {
  it('loads the namespace, opens the menu, and selects a new stack', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view('pwsh', 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('gitbash')] })),
        mutate,
      },
    })
    mount(controller)
    const button = await screen.findByRole('button', { name: 'Git Bash' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(button.getAttribute('aria-expanded')).toBe('false') })
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Git Bash' }))
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: 'PowerShell' }))
    await screen.findByRole('button', { name: 'PowerShell' })
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('hides an unavailable namespace and disables a read-only provider', async () => {
    const absent = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [] })),
        mutate: vi.fn(),
      },
    })
    const rendered = mount(absent)
    await waitFor(() => { expect(rendered.container.textContent).toBe('') })
    rendered.unmount()

    const readonly = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: false, hasDocument: false, namespaces: [view('gitbash')] })),
        mutate: vi.fn(),
      },
    })
    mount(readonly)
    expect((await screen.findByRole('button', { name: 'Git Bash' })).hasAttribute('disabled')).toBe(true)
  })

  it('shows loading and a contained write error', async () => {
    type DescribeAnswer = ReturnType<typeof ok<{
      writable: boolean
      namespaces: SettingsNamespaceView[]
    }>>
    const describe = Promise.withResolvers<DescribeAnswer>()
    const controller = derivedController({
      settings: {
        describe: () => describe.promise,
        mutate: () => Promise.resolve({
          ok: false as const,
          error: new RemoteError('settings/conflict', 'changed elsewhere', {
            ns: 'windows-shell', expected: 1, actual: 2,
          }),
        }),
      },
    })
    mount(controller)
    expect((await screen.findByRole('button', { name: '加载中' })).hasAttribute('disabled')).toBe(true)
    describe.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('gitbash')] }))
    const button = await screen.findByRole('button', { name: 'Git Bash' })
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: 'PowerShell' }))
    expect((await screen.findByRole('alert')).textContent).toBe('changed elsewhere')
  })

  it('surfaces an advertisement outside the shipped stacks as the row error', async () => {
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('cmd')] })),
        mutate: vi.fn(),
      },
    })
    mount(controller)
    expect((await screen.findByRole('alert')).textContent).toBe('windows-shell settings advertises "cmd"')
  })
})
