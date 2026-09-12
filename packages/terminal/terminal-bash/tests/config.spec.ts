import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Config } from '@deepseek-ai/dsh-terminal-bash/src/config.ts'
import { resolveConfig, validateConfig } from '@deepseek-ai/dsh-terminal-bash/src/config.ts'

function config(overrides: Partial<Config> = {}): Config {
  return {
    backendType: 'shell', shellDialect: 'bash', shellPath: '/bin/bash', shellArgs: [], rows: 40, cols: 160,
    scrollbackLines: 100, scrollbackMaxBytes: 1024, maxReadBytes: 512,
    pollIntervalMs: 10, exactProbeAfterMs: 20, idleSilenceMs: 100, handoffGraceMs: 50, timeoutMs: 1000,
    disposeGraceMs: 100,
    ...overrides,
  }
}

describe('terminal-bash config', () => {
  it('accepts resolved positive bounds', () => {
    expect(() => { validateConfig(config()) }).not.toThrow()
  })

  it('rejects empty names, invalid numbers, and a read cap above retention', () => {
    expect(() => { validateConfig(config({ backendType: '' })) }).toThrow('backendType')
    expect(() => { validateConfig(config({ shellPath: '' })) }).toThrow('shellPath')
    expect(() => { validateConfig(config({ rows: 0 })) }).toThrow('rows')
    expect(() => { validateConfig(config({ rows: 1.5 })) }).toThrow('rows')
    expect(() => { validateConfig(config({ maxReadBytes: 2048 })) }).toThrow('must not exceed')
  })

  it('rejects a handoff grace shorter than one readiness poll', () => {
    expect(() => { validateConfig(config({ handoffGraceMs: 9, pollIntervalMs: 10 })) }).toThrow('handoffGraceMs must be at least pollIntervalMs')
    expect(() => { validateConfig(config({ handoffGraceMs: 10, pollIntervalMs: 10 })) }).not.toThrow()
  })

})

describe('terminal-bash dialect resolution', () => {
  it('defaults bash argv to the interactive profile-free form', () => {
    const { shellPath, shellArgs, shellDialect } = resolveConfig({ backendType: 'shell', rows: 24, cols: 80 }, 'linux')
    expect(shellDialect).toBe('bash')
    expect(shellPath).toBe('/bin/bash')
    expect(shellArgs).toEqual(['--noprofile', '--norc', '-i'])
  })

  it('defaults pwsh argv to the interactive profile-free form and resolves the executable', () => {
    const resolved = resolveConfig({ backendType: 'shell', shellDialect: 'pwsh', rows: 24, cols: 80 }, 'linux')
    expect(resolved.shellDialect).toBe('pwsh')
    expect(resolved.shellPath.length).toBeGreaterThan(0)
    expect(resolved.shellArgs).toEqual(['-NoLogo', '-NoProfile'])
  })

  it('defaults the bash dialect on win32 to the resolved Git Bash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-terminal-bash-gitbash-'))
    try {
      const gitBin = join(dir, 'git', 'bin')
      mkdirSync(gitBin, { recursive: true })
      writeFileSync(join(gitBin, 'bash.exe'), '')
      const resolved = resolveConfig({
        backendType: 'shell', rows: 24, cols: 80,
      }, 'win32', {
        ProgramFiles: join(dir, 'missing'),
        'ProgramFiles(x86)': join(dir, 'missing-x86'),
        SystemRoot: join(dir, 'no-windows'),
        PATH: join(dir, 'git', 'cmd'),
      })
      expect(resolved.shellDialect).toBe('bash')
      expect(resolved.shellPath).toBe(join(gitBin, 'bash.exe'))
      expect(resolved.shellArgs).toEqual(['--noprofile', '--norc', '-i'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly when the bash dialect on win32 finds no Git Bash', () => {
    expect(() => resolveConfig({
      backendType: 'shell', rows: 24, cols: 80,
    }, 'win32', {
      ProgramFiles: 'P:\\missing',
      'ProgramFiles(x86)': 'P:\\missing-x86',
      SystemRoot: 'S:\\no-windows',
      PATH: 'P:\\no-git',
    })).toThrow('terminal-bash: the bash dialect on win32 resolves Git for Windows; install it or set shellPath')
  })

  it('lets an explicit shell specification win over the dialect defaults', () => {
    const resolved = resolveConfig({
      backendType: 'shell', shellDialect: 'pwsh', shellPath: '/custom/pwsh', shellArgs: ['-NoProfile'], rows: 24, cols: 80,
    }, 'linux')
    expect(resolved.shellPath).toBe('/custom/pwsh')
    expect(resolved.shellArgs).toEqual(['-NoProfile'])
  })

  it('lets an explicit shellPath on win32 win over Git Bash discovery', () => {
    const resolved = resolveConfig({
      backendType: 'shell', shellPath: 'C:\\tools\\shell.exe', rows: 24, cols: 80,
    }, 'win32', { PATH: '' })
    expect(resolved.shellPath).toBe('C:\\tools\\shell.exe')
  })

  it('treats empty shell values as unset so Schemastery materialization cannot drop the dialect defaults', () => {
    // Schemastery materializes an absent optional array as `[]`; the resolver
    // must treat that shape like an unset value or a real bash spawn would
    // start non-interactive without the controlled prompt.
    const resolved = resolveConfig({
      backendType: 'shell', shellDialect: 'bash', shellPath: '', shellArgs: [], rows: 24, cols: 80,
    }, 'linux')
    expect(resolved.shellPath).toBe('/bin/bash')
    expect(resolved.shellArgs).toEqual(['--noprofile', '--norc', '-i'])
  })

  it('validates the effective shell path, not only the raw one', () => {
    expect(() => { validateConfig(resolveConfig({ backendType: 'shell', shellDialect: 'bash', rows: 24, cols: 80 }, 'linux')) }).not.toThrow()
    expect(() => { validateConfig(resolveConfig({ backendType: 'shell', shellDialect: 'pwsh', rows: 24, cols: 80 }, 'linux')) }).not.toThrow()
  })
})
