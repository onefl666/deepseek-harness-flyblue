/**
 * Windows shell settings controller. The row mirrors the shared describe
 * view for the host's `windows-shell` namespace and writes the `shell` field
 * with the view's revision; the accepted answer folds back into the mirror.
 * The selectable ids are the closed product vocabulary this distribution
 * ships for Windows — an advertisement outside it fails the row loudly
 * instead of rendering a selector that cannot name the current value.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import {
  createSnapshotStore, type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'

/** Windows-shell's settings namespace on the host wire. */
export const WINDOWS_SHELL_SETTINGS_NS = 'windows-shell'

/** The two stacks this distribution ships for Windows, in menu order. */
export const WINDOWS_SHELL_IDS = ['gitbash', 'pwsh'] as const

/** One selectable Windows shell stack id. */
export type WindowsShellId = typeof WINDOWS_SHELL_IDS[number]

/**
 * Narrow one wire value to a selectable shell id.
 * @param value - value crossing the describe-view boundary.
 * @returns whether the value names a shipped Windows shell stack.
 */
export function isWindowsShellId(value: unknown): value is WindowsShellId {
  return WINDOWS_SHELL_IDS.some(shell => shell === value)
}

/** Windows Shell settings-row snapshot. */
export interface WindowsShellRowState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  error: string | null
  writable: boolean
  current: WindowsShellId
  revision: number
}

/** Write answer from the settings wire: the accepted view or a held error. */
type MutateAnswer = Awaited<ReturnType<ClientContext['remote']['settings']['mutate']>>

/** Controller deriving the row from the shared mirror and writing the preference through it. */
export class WindowsShellSettingsController {
  /** Row snapshot consumed through a bound selector hook. */
  readonly store: SnapshotStore<WindowsShellRowState> = createSnapshotStore({
    status: 'idle',
    error: null,
    writable: false,
    current: 'gitbash',
    revision: 0,
  })

  private following: (() => void) | undefined
  private saving = false
  private disposed = false

  /**
   * @param describeFace - the shared mirror's read/fold face (view and revision source).
   * @param ctx - the row plugin's context, whose `remote.settings` namespace
   * carries the `shell` write.
   */
  constructor(
    private readonly describeFace: SettingsDescribeFace,
    private readonly ctx: ClientContext,
  ) {}

  /**
   * Begin following the mirror (idempotent) and reflect its current answer.
   * @returns settlement once the snapshot reflects the mirror.
   */
  async load(): Promise<void> {
    if (this.disposed) return
    this.following ??= this.describeFace.subscribe(() => { this.derive() })
    this.setStatus('loading')
    await this.describeFace.ensure()
    this.derive()
  }

  /**
   * Persist one shell as the Windows default for the next launch. A selection
   * made while one is already saving is ignored — the row's control is
   * disabled during the save, so this only drops programmatic double-submits.
   * @param shell - selectable shell id.
   * @returns nothing; {@link store} carries success or failure.
   */
  async select(shell: WindowsShellId): Promise<void> {
    const revision = this.revisionOf()
    if (revision === undefined || !this.store.getSnapshot().writable || this.saving) return
    this.saving = true
    this.setStatus('saving')
    const answer = await this.write(shell, revision)
    if (!this.disposed) this.settle(answer)
  }

  /** Stop following the mirror; later publishes leave the snapshot alone. */
  dispose(): void {
    this.disposed = true
    this.following?.()
    this.following = undefined
  }

  /** The revision fence for the next write; undefined while the namespace is unserved. */
  private revisionOf(): number | undefined {
    return this.describeFace.getSnapshot().view?.namespaces
      .find(entry => entry.ns === WINDOWS_SHELL_SETTINGS_NS)?.revision
  }

  /** One revision-fenced write; the saving guard clears before the answer settles into the store. */
  private async write(shell: WindowsShellId, revision: number): Promise<MutateAnswer> {
    try {
      const op = { op: 'set' as const, path: ['shell'], value: shell }
      return await this.ctx.remote.settings.mutate(WINDOWS_SHELL_SETTINGS_NS, [op], revision)
    } finally {
      this.saving = false
    }
  }

  /** Fold the write answer into the mirror; its publish re-derives this row. */
  private settle(answer: MutateAnswer): void {
    if (answer.ok) {
      this.describeFace.acceptView(answer.value)
    } else {
      this.fail(answer.error)
    }
  }

  private setStatus(status: 'loading' | 'saving'): void {
    this.store.update((state) => {
      state.status = status
      state.error = null
    })
  }

  private derive(): void {
    if (this.disposed || this.saving) return
    const mirrored = this.describeFace.getSnapshot()
    if (mirrored.view === undefined) {
      // No answer yet: a terminal non-loopback mirror hides the row, a held
      // failure fails it, and an in-flight read keeps the loading state.
      if (mirrored.status === 'unavailable') this.hide()
      else if (mirrored.error !== null) this.fail(new Error(mirrored.error))
      return
    }
    const view = mirrored.view.namespaces.find(entry => entry.ns === WINDOWS_SHELL_SETTINGS_NS)
    if (view === undefined) {
      // A POSIX host mounts no windows-shell plugin, so the namespace is absent.
      this.hide()
      return
    }
    const current = (view.value as { shell?: unknown } | null)?.shell
    if (!isWindowsShellId(current)) {
      this.fail(new Error(`windows-shell settings advertises "${String(current)}"`))
      return
    }
    const { writable } = mirrored.view
    this.store.update((state) => {
      state.status = 'ready'
      state.error = null
      state.writable = writable
      state.current = current
      state.revision = view.revision
    })
  }

  private hide(): void {
    this.store.update((state) => {
      state.status = 'unavailable'
      state.writable = false
      state.current = 'gitbash'
      state.revision = 0
    })
  }

  private fail(error: Error): void {
    this.store.update((state) => {
      state.status = 'error'
      state.error = error.message
    })
  }
}
