/**
 * Windows shell preference plugin, browser half — the General-settings row
 * over the host's `windows-shell` namespace. A pick persists the preferred
 * stack through the host Settings API; the next launch seeds the composition
 * from it, which is the restart scope the row copy states.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot types (this package registers a General row).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the ctx.slots merge the row registration writes through.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (the settings invalidation rides the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { WindowsShellRow } from './WindowsShellRow.tsx'
import type { WindowsShellRowInjected } from './WindowsShellRow.tsx'
import { en, zh } from './locales.ts'
import { WindowsShellSettingsController, type WindowsShellId } from './settings-store.ts'

export type { WindowsShellRowInjected, WindowsShellRowProps } from './WindowsShellRow.tsx'
export type {
  WindowsShellId, WindowsShellRowState,
} from './settings-store.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.settings', 'settingsScope']

/**
 * Client plugin body: register the Windows shell row into General settings.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('settings.windows-shell', { zh, en }), 'ui-windows-shell: settings row dictionaries')

  // The shared SettingsScope mirror updates after document commits and reconnects.
  const controller = new WindowsShellSettingsController(ctx.settingsScope.describe(), ctx)
  const load = (): Promise<void> => controller.load()
  const select = (shell: WindowsShellId): Promise<void> => controller.select(shell)
  const injected = (): WindowsShellRowInjected => ({
    hooks: { windowsShell: controller.store },
    load,
    select,
  })

  ctx.effect(() => () => { controller.dispose() }, 'ui-windows-shell: settings row directory')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'windows-shell',
    order: 1,
    locale: 'settings.windows-shell',
    inject: injected,
  }, WindowsShellRow))
}
