/**
 * The shipped shell composition: the base bundle gates every shell stack by
 * platform and `DSH_WINDOWS_SHELL` on its own rows (`disabled: !!js`), so
 * exactly one shell stack mounts per host — POSIX keeps the confined bash
 * stack, win32 defaults to the (unconfined) Git Bash stack, and
 * `DSH_WINDOWS_SHELL=pwsh` restores the confined PowerShell twin. The spec
 * composes the REAL shipped bundle layers (dsh-base + dsh-web-app resolved
 * from the app installation anchor) through the boot's patch algorithm and
 * pins the effective roster per platform/env pair, the preset-level gates
 * (one-shot tools and the minimal preset's persistent stack), and the
 * cold-start resolution closure for every shell row's bare plugin name.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate } from '@deepseek-ai/cordis-plugin-loader'
import { SHIPPED_PRESET_ROOT } from '@deepseek-ai/dsh-agent-presets'
import { composeEntries, initProfile, loadProfile, PROFILES_DIR } from '@deepseek-ai/dsh-app-boot'

/** The win32 shell selection `DSH_WINDOWS_SHELL` offers; unset means gitbash. */
type WindowsShell = 'unset' | 'pwsh'

/**
 * The effective disabled state of one row on one platform/env pair: a `!!js`
 * expression evaluates with a platform- and env-scoped `process` so every
 * outcome pins on any host.
 */
function disabledOn(row: { disabled?: unknown }, platform: 'win32' | 'linux', windowsShell: WindowsShell = 'unset'): boolean {
  const value = row.disabled
  if (value !== null && typeof value === 'object' && '__jsExpr' in value) {
    return Boolean(evaluate(
      { process: { platform, env: windowsShell === 'pwsh' ? { DSH_WINDOWS_SHELL: 'pwsh' } : {} } },
      (value as { __jsExpr: string }).__jsExpr,
    ))
  }
  return value === true
}

describe('the shipped shell composition (real bundle layers)', () => {
  let home: string
  afterEach(() => { if (home !== undefined) rmSync(home, { recursive: true, force: true }) })
  // The app installation anchor, mirroring profile-boot.ts: the bundle layers
  // resolve from the REAL dsh-base/dsh-web-app packages through it, so this
  // suite composes the shipped patch files, not test fixtures.
  const anchor = fileURLToPath(new URL('../package.json', import.meta.url))

  it('composes the gitbash roster on win32, the pwsh roster behind DSH_WINDOWS_SHELL=pwsh, and the bash roster on POSIX', () => {
    home = mkdtempSync(join(tmpdir(), 'dsh-windows-home-'))
    initProfile(join(home, PROFILES_DIR, 'web'), ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    const profile = loadProfile('dsh', 'web', anchor, home)
    const warnings: string[] = []
    const rows = composeEntries(
      profile.layers.map(layer => layer.patches),
      message => warnings.push(message),
    )
    const byId = new Map(rows.map(row => [row.id, row]))
    // One shared patch set, three rosters: the shell stacks gate themselves.
    for (const id of ['bash-sandbox', 'gitbash-local', 'pwsh-sandbox', 'tool-bash', 'tool-pwsh', 'permission-unconfined', 'windows-shell']) {
      expect(byId.has(id), `row ${id}`).toBe(true)
    }
    // POSIX is untouched: the confined bash stack mounts, whatever the env var.
    for (const shell of ['unset', 'pwsh'] as const) {
      expect(disabledOn(byId.get('bash-sandbox')!, 'linux', shell), `bash-sandbox on linux/${shell}`).toBe(false)
      expect(disabledOn(byId.get('pwsh-sandbox')!, 'linux', shell), `pwsh-sandbox on linux/${shell}`).toBe(true)
      expect(disabledOn(byId.get('gitbash-local')!, 'linux', shell), `gitbash-local on linux/${shell}`).toBe(true)
    }
    // win32 defaults to Git Bash; pwsh needs the explicit opt-in.
    expect(disabledOn(byId.get('gitbash-local')!, 'win32'), 'gitbash-local on win32').toBe(false)
    expect(disabledOn(byId.get('pwsh-sandbox')!, 'win32'), 'pwsh-sandbox on win32').toBe(true)
    expect(disabledOn(byId.get('gitbash-local')!, 'win32', 'pwsh'), 'gitbash-local on win32/pwsh').toBe(true)
    expect(disabledOn(byId.get('pwsh-sandbox')!, 'win32', 'pwsh'), 'pwsh-sandbox on win32/pwsh').toBe(false)
    // The durable shell preference rides every win32 stack; POSIX never
    // mounts it, so its settings namespace (and row) stays absent there.
    for (const shell of ['unset', 'pwsh'] as const) {
      expect(disabledOn(byId.get('windows-shell')!, 'linux', shell), `windows-shell on linux/${shell}`).toBe(true)
    }
    expect(disabledOn(byId.get('windows-shell')!, 'win32'), 'windows-shell on win32').toBe(false)
    expect(disabledOn(byId.get('windows-shell')!, 'win32', 'pwsh'), 'windows-shell on win32/pwsh').toBe(false)
    // Host shell-tool rows are disabled on every platform; sessions mount
    // their own rows instead.
    expect(byId.get('tool-bash')?.disabled).toBe(true)
    expect(byId.get('tool-pwsh')?.disabled).toBe(true)
    // The permission switcher always mounts, but only honestly: the full
    // preset table needs a confining executor, so the unconfined twin (one
    // danger-full-access/ask preset) takes over on the default win32 stack.
    // The rest of the permission surface never moves.
    for (const shell of ['unset', 'pwsh'] as const) {
      expect(disabledOn(byId.get('permission')!, 'linux', shell), `permission on linux/${shell}`).toBe(false)
      expect(disabledOn(byId.get('permission-unconfined')!, 'linux', shell), `permission-unconfined on linux/${shell}`).toBe(true)
    }
    expect(disabledOn(byId.get('permission')!, 'win32'), 'permission on win32').toBe(true)
    expect(disabledOn(byId.get('permission-unconfined')!, 'win32'), 'permission-unconfined on win32').toBe(false)
    expect(disabledOn(byId.get('permission')!, 'win32', 'pwsh'), 'permission on win32/pwsh').toBe(false)
    expect(disabledOn(byId.get('permission-unconfined')!, 'win32', 'pwsh'), 'permission-unconfined on win32/pwsh').toBe(true)
    for (const id of ['ui-permission', 'sandbox', 'sandbox-policy', 'fs-sandbox', 'approval']) {
      expect(byId.get(id)?.disabled, `row ${id}`).not.toBe(true)
    }
    // The launcher's cold-start module fallback BFS-links the apps/cli
    // dependency closure into the profile's node_modules, so every bare
    // plugin name in the base patch must resolve from there.
    const cliManifest = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies?: Record<string, string> }
    for (const name of ['@deepseek-ai/dsh-pwsh-sandbox', '@deepseek-ai/dsh-tool-pwsh', '@deepseek-ai/dsh-gitbash-local', '@deepseek-ai/dsh-windows-shell']) {
      expect(cliManifest.dependencies?.[name], `cold-start closure must reach ${name}`).toBeDefined()
    }
    expect(warnings).toEqual([])
  })

  it('base-only profiles carry all three stacks with the same platform/env gating', () => {
    home = mkdtempSync(join(tmpdir(), 'dsh-windows-home-'))
    initProfile(join(home, PROFILES_DIR, 'base-only'), ['@deepseek-ai/dsh-base'])
    const profile = loadProfile('dsh', 'base-only', anchor, home)
    const warnings: string[] = []
    const rows = composeEntries(
      profile.layers.map(layer => layer.patches),
      message => warnings.push(message),
    )
    const byId = new Map(rows.map(row => [row.id, row]))
    for (const id of ['bash-sandbox', 'gitbash-local', 'tool-bash', 'pwsh-sandbox', 'tool-pwsh']) {
      expect(byId.has(id), `row ${id}`).toBe(true)
    }
    // No web overlay: the tool rows keep their own platform/env gating.
    expect(disabledOn(byId.get('tool-bash')!, 'linux'), 'tool-bash on linux').toBe(false)
    expect(disabledOn(byId.get('tool-pwsh')!, 'linux'), 'tool-pwsh on linux').toBe(true)
    expect(disabledOn(byId.get('tool-bash')!, 'win32'), 'tool-bash on win32').toBe(false)
    expect(disabledOn(byId.get('tool-pwsh')!, 'win32'), 'tool-pwsh on win32').toBe(true)
    expect(disabledOn(byId.get('tool-bash')!, 'win32', 'pwsh'), 'tool-bash on win32/pwsh').toBe(true)
    expect(disabledOn(byId.get('tool-pwsh')!, 'win32', 'pwsh'), 'tool-pwsh on win32/pwsh').toBe(false)
    expect(warnings).toEqual([])
  })
})

describe('shipped agent presets gate the shell stacks by platform and env', () => {
  const presetRoot = SHIPPED_PRESET_ROOT

  it.each(['standard', 'ptc', 'cordis'])('preset %s gates its shell tool rows by platform and env', (preset) => {
    const entries: unknown = yaml.load(
      readFileSync(join(presetRoot, preset, 'agent.cordis.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(entries)) throw new TypeError(`preset ${preset} must parse to an entry array`)
    // tool-bash mounts on POSIX and on win32 unless pwsh is selected;
    // tool-pwsh mounts only on the pwsh-selected win32 stack.
    const expectations = [
      ['tool-bash', 'linux', 'unset', false], ['tool-bash', 'linux', 'pwsh', false],
      ['tool-bash', 'win32', 'unset', false], ['tool-bash', 'win32', 'pwsh', true],
      ['tool-pwsh', 'linux', 'unset', true], ['tool-pwsh', 'linux', 'pwsh', true],
      ['tool-pwsh', 'win32', 'unset', true], ['tool-pwsh', 'win32', 'pwsh', false],
    ] as const
    for (const [id, platform, shell, expected] of expectations) {
      const row = entries.find((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).id === id
      ))
      if (row === undefined) throw new TypeError(`preset ${preset} must mount ${id}`)
      expect(row.disabled).toMatchObject({ __jsExpr: expect.any(String) as string })
      expect(disabledOn(row, platform, shell), `${id} on ${platform}/${shell}`).toBe(expected)
    }
  })

  it('minimal mounts no one-shot shell tool row and gates its persistent stack by platform and env', () => {
    const entries: unknown = yaml.load(
      readFileSync(join(presetRoot, 'minimal', 'agent.cordis.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(entries)) throw new TypeError('minimal preset must parse to an entry array')
    for (const id of ['tool-bash', 'tool-pwsh']) {
      expect(entries.some(entry => (
        typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).id === id
      )), `${id} must be absent from minimal`).toBe(false)
    }
    const group = entries.find((entry): entry is Record<string, unknown> => (
      typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).id === 'persistent-shell'
    ))
    if (group === undefined) throw new TypeError('minimal preset must mount persistent-shell')
    const rows = group.config as unknown[]
    if (!Array.isArray(rows)) throw new TypeError('persistent-shell must carry a row list')
    const byId = new Map(rows
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map(entry => [entry.id, entry]))
    // The bash stack (terminal-bash + persistent-bash) mounts on POSIX and on
    // win32 (where terminal-bash resolves Git Bash) unless pwsh is selected;
    // the pwsh twin mounts only on the pwsh-selected win32 stack — exactly one
    // persistent shell per host.
    const bashRows = ['terminal-bash', 'persistent-bash']
    const pwshRows = ['terminal-pwsh', 'persistent-pwsh']
    for (const id of bashRows) {
      expect(disabledOn(byId.get(id)!, 'linux', 'unset'), `${id} on linux`).toBe(false)
      expect(disabledOn(byId.get(id)!, 'linux', 'pwsh'), `${id} on linux/pwsh`).toBe(false)
      expect(disabledOn(byId.get(id)!, 'win32', 'unset'), `${id} on win32`).toBe(false)
      expect(disabledOn(byId.get(id)!, 'win32', 'pwsh'), `${id} on win32/pwsh`).toBe(true)
    }
    for (const id of pwshRows) {
      expect(disabledOn(byId.get(id)!, 'linux', 'unset'), `${id} on linux`).toBe(true)
      expect(disabledOn(byId.get(id)!, 'linux', 'pwsh'), `${id} on linux/pwsh`).toBe(true)
      expect(disabledOn(byId.get(id)!, 'win32', 'unset'), `${id} on win32`).toBe(true)
      expect(disabledOn(byId.get(id)!, 'win32', 'pwsh'), `${id} on win32/pwsh`).toBe(false)
    }
    expect(byId.get('terminal-pwsh')?.config).toMatchObject({ shellDialect: 'pwsh' })
  })
})
