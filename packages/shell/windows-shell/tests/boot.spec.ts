/** Boot seeding of `DSH_WINDOWS_SHELL` from the durable preference. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, onTestFinished } from 'vitest'
import { seedWindowsShellEnvironment, WINDOWS_SHELL_ENV_KEY } from '../src/index.ts'

const dir = mkdtempSync(join(tmpdir(), 'dsh-windows-shell-boot-'))
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

let sequence = 0

/** Write one document and hand back its path plus a fresh env object. */
function documentOf(text: string): { file: string; env: NodeJS.ProcessEnv } {
  const file = join(dir, `doc-${sequence += 1}.yaml`)
  writeFileSync(file, text)
  return { file, env: {} }
}

describe('seedWindowsShellEnvironment', () => {
  it('seeds the env key only for a stored pwsh preference', () => {
    const pwsh = documentOf('windows-shell:\n  shell: pwsh\n')
    expect(seedWindowsShellEnvironment(pwsh.env, pwsh.file)).toBe('pwsh')
    expect(pwsh.env[WINDOWS_SHELL_ENV_KEY]).toBe('pwsh')

    const gitbash = documentOf('windows-shell:\n  shell: gitbash\n')
    expect(seedWindowsShellEnvironment(gitbash.env, gitbash.file)).toBe('gitbash')
    expect(WINDOWS_SHELL_ENV_KEY in gitbash.env).toBe(false)
  })

  it('treats a missing file, an empty document, or a missing section as the Git Bash default', () => {
    const missing = { file: join(dir, 'absent.yaml'), env: {} as NodeJS.ProcessEnv }
    expect(seedWindowsShellEnvironment(missing.env, missing.file)).toBe('gitbash')
    expect(WINDOWS_SHELL_ENV_KEY in missing.env).toBe(false)

    for (const text of ['', '# only a comment\n', 'other:\n  key: value\n', 'windows-shell: 3\n']) {
      const doc = documentOf(text)
      expect(seedWindowsShellEnvironment(doc.env, doc.file)).toBe('gitbash')
      expect(WINDOWS_SHELL_ENV_KEY in doc.env).toBe(false)
    }
  })

  it('keeps an explicit per-invocation variable over the stored preference', () => {
    const storedGitbash = documentOf('windows-shell:\n  shell: gitbash\n')
    storedGitbash.env[WINDOWS_SHELL_ENV_KEY] = 'pwsh'
    expect(seedWindowsShellEnvironment(storedGitbash.env, storedGitbash.file)).toBe('pwsh')
    expect(storedGitbash.env[WINDOWS_SHELL_ENV_KEY]).toBe('pwsh')

    const storedPwsh = documentOf('windows-shell:\n  shell: pwsh\n')
    storedPwsh.env[WINDOWS_SHELL_ENV_KEY] = 'gitbash'
    expect(seedWindowsShellEnvironment(storedPwsh.env, storedPwsh.file)).toBe('gitbash')
    expect(storedPwsh.env[WINDOWS_SHELL_ENV_KEY]).toBe('gitbash')
  })

  it('ignores a stored value outside the two stacks; the provider registration fails loud later', () => {
    const doc = documentOf('windows-shell:\n  shell: cmd\n')
    expect(seedWindowsShellEnvironment(doc.env, doc.file)).toBe('gitbash')
    expect(WINDOWS_SHELL_ENV_KEY in doc.env).toBe(false)
  })

  it('fails loud on a malformed document, naming the file', () => {
    const doc = documentOf('windows-shell: [no')
    expect(() => seedWindowsShellEnvironment(doc.env, doc.file))
      .toThrow(new RegExp(`cannot parse .*${doc.file.replaceAll('\\', '\\\\')}`))
  })

  it('rethrows a read failure other than absence', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(() => seedWindowsShellEnvironment(env, dir)).toThrow(/EISDIR/)
  })

  it('reads the settings document under the harness home by default', () => {
    const home = join(dir, `home-${sequence += 1}`)
    mkdirSync(home)
    writeFileSync(join(home, 'settings.yaml'), 'windows-shell:\n  shell: pwsh\n')
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    onTestFinished(() => {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    })
    const env: NodeJS.ProcessEnv = {}
    expect(seedWindowsShellEnvironment(env)).toBe('pwsh')
    expect(env[WINDOWS_SHELL_ENV_KEY]).toBe('pwsh')
  })
})
