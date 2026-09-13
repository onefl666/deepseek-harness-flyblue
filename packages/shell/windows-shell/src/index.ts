/**
 * Windows shell preference plugin. Owns the durable `windows-shell` settings
 * namespace — the General-settings row writes it, and the next launch seeds
 * `DSH_WINDOWS_SHELL` from it (see `./boot.ts`) before the first composition,
 * so the win32 shell rows mount the preferred stack. The choice is
 * restart-scoped: exactly one shell executor may mount per host, and a
 * session's tool roster locks once it turns, so a mid-run switch cannot be
 * honored. The row is win32-only through composition — this plugin is gated
 * `process.platform !== 'win32'` in the base bundle, and its absence from a
 * POSIX host hides the settings row.
 * @module @deepseek-ai/dsh-windows-shell
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { WindowsShellSettingsSchema, WINDOWS_SHELL_SETTINGS_NAMESPACE } from './settings.ts'

export {
  DEFAULT_WINDOWS_SHELL, WINDOWS_SHELLS, WINDOWS_SHELL_FIELD,
  WINDOWS_SHELL_SETTINGS_NAMESPACE, WindowsShellSettingsSchema,
  type WindowsShell, type WindowsShellSettings,
} from './settings.ts'
export { seedWindowsShellEnvironment, WINDOWS_SHELL_ENV_KEY } from './boot.ts'

/**
 * Register the durable Windows shell preference when the optional settings
 * service is composed.
 * @param ctx - host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(WINDOWS_SHELL_SETTINGS_NAMESPACE, WindowsShellSettingsSchema, {
      applies: 'restart',
    })
  })
}
