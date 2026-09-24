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

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WINDOWS_SHELLS, DEFAULT_WINDOWS_SHELL } from './settings.ts'

/** Profile preference projected by SettingsForms for the General-settings row. */
export interface Config {
  /** Shell stack selected for the next launch. */
  shell: Volatile<(typeof WINDOWS_SHELLS)[number]>
}

/** Runtime config schema; the volatile field is editable through SettingsForms. */
export const Config = z.object({
  shell: z.union([...WINDOWS_SHELLS]).default(DEFAULT_WINDOWS_SHELL).volatile(),
})

export {
  DEFAULT_WINDOWS_SHELL, WINDOWS_SHELLS, WINDOWS_SHELL_FIELD,
  WINDOWS_SHELL_SETTINGS_NAMESPACE, WindowsShellSettingsSchema,
  type WindowsShell, type WindowsShellSettings,
} from './settings.ts'
export { seedWindowsShellEnvironment, WINDOWS_SHELL_ENV_KEY } from './boot.ts'

/** Mount the Config-bearing profile entry consumed by SettingsForms. */
export function apply(_ctx: Context): void {}
