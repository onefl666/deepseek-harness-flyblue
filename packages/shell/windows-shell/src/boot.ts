/**
 * Boot-time seeding of the Windows shell composition fact. The win32 shell
 * rows (executor, tools, permission presets) gate on `DSH_WINDOWS_SHELL`, so
 * the durable preference only reaches the composition when the launcher seeds
 * the variable before the first mount; see the plugin root for why the choice
 * cannot switch a running composition.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  DEFAULT_WINDOWS_SHELL, WINDOWS_SHELL_FIELD, WINDOWS_SHELL_SETTINGS_NAMESPACE, type WindowsShell,
} from './settings.ts'

/** Composition-time environment key the win32 shell rows gate on. */
export const WINDOWS_SHELL_ENV_KEY = 'DSH_WINDOWS_SHELL'

/** Absolute default location of the document the seed reads (`settings.yaml` under the harness home). */
function defaultSettingsPath(): string {
  return join(resolveDshHome(), 'settings.yaml')
}

/**
 * Read the `windows-shell` section from a raw settings document.
 * @param document - parsed YAML value of the whole document.
 * @returns the stored `shell` field, or undefined when absent.
 */
function storedShell(document: unknown): unknown {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return undefined
  const section = (document as Record<string, unknown>)[WINDOWS_SHELL_SETTINGS_NAMESPACE]
  if (section === null || typeof section !== 'object' || Array.isArray(section)) return undefined
  return (section as Record<string, unknown>)[WINDOWS_SHELL_FIELD]
}

/**
 * Seed {@link WINDOWS_SHELL_ENV_KEY} from the durable preference before the
 * first composition. An explicitly set variable stays untouched — it is the
 * per-invocation override — and only a stored `pwsh` sets anything, because an
 * unset variable already mounts the Git Bash default. A missing document,
 * missing section, or value outside the two stacks leaves the environment
 * alone; the settings provider's registration stays the fail-loud authority
 * for a schema-invalid stored section. A malformed document throws, naming the
 * file, exactly as the provider would on the same text.
 * @param env - environment object seeded in place (defaults to `process.env`).
 * @param filename - settings document read (defaults to `settings.yaml` under the harness home).
 * @returns the shell stack the composition will mount.
 */
export function seedWindowsShellEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  filename: string = defaultSettingsPath(),
): WindowsShell {
  const explicit = env[WINDOWS_SHELL_ENV_KEY]
  if (explicit !== undefined) return explicit === 'pwsh' ? 'pwsh' : 'gitbash'

  let text: string
  try {
    text = readFileSync(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_WINDOWS_SHELL
    throw error
  }
  let document: unknown
  try {
    document = parse(text)
  } catch (error) {
    throw new Error(`windows-shell: cannot parse ${filename}: ${(error as Error).message}`)
  }
  if (storedShell(document) === 'pwsh') env[WINDOWS_SHELL_ENV_KEY] = 'pwsh'
  return env[WINDOWS_SHELL_ENV_KEY] === 'pwsh' ? 'pwsh' : 'gitbash'
}
