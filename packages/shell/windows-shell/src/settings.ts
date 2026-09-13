/** Windows shell preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Shell stacks this distribution ships for Windows, in settings-row order. */
export const WINDOWS_SHELLS = ['gitbash', 'pwsh'] as const

/** Settings namespace owned by the windows-shell plugin. */
export const WINDOWS_SHELL_SETTINGS_NAMESPACE = 'windows-shell'

/** Field carrying the preferred Windows shell stack. */
export const WINDOWS_SHELL_FIELD = 'shell'

/** Shell stack persisted by the Windows Shell settings row. */
export type WindowsShell = typeof WINDOWS_SHELLS[number]

/** Default stack when the user-settings document has no override. */
export const DEFAULT_WINDOWS_SHELL: WindowsShell = 'gitbash'

/** Durable windows-shell section shared by the Host schema and the boot seed. */
export interface WindowsShellSettings {
  /** Preferred Windows shell stack, mounted by the next launch. */
  shell: WindowsShell
}

/** Durable windows-shell schema; also the wire envelope the browser scope validates against. */
export const WindowsShellSettingsSchema: z<WindowsShellSettings> = z.object({
  [WINDOWS_SHELL_FIELD]: z.union([...WINDOWS_SHELLS]).default(DEFAULT_WINDOWS_SHELL),
})
