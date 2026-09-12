/**
 * REAL-composition tier (packages/AGENTS.md): boot the gitbash-local +
 * tool-bash Loader fixture as a subprocess through the same app/boot path a
 * deployment uses, execute real foreground and background Git Bash commands
 * through the tool registry, and assert the assembled model-visible surface:
 * schema, prompt section, and rendered results. Self-skips when no Git Bash
 * resolves (a CI accommodation for hosts without Git for Windows).
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { resolveGitBashPath } from '@deepseek-ai/dsh-gitbash-local'

// The probe follows the executor's own resolution (well-known install
// locations are found even when bash.exe is not on PATH).
const gitBashPath = (() => {
  try {
    return resolveGitBashPath()
  } catch {
    return undefined
  }
})()
const hasGitBash = gitBashPath !== undefined
  && spawnSync(gitBashPath, ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0

const driver = fileURLToPath(new URL(
  './fixtures/loader/driver.ts',
  import.meta.url,
))
const configPath = fileURLToPath(new URL(
  './fixtures/loader/cordis.yml',
  import.meta.url,
))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

interface GitBashLoaderReport {
  schemaHasRunInBackground: boolean
  promptHasMarkerSection: boolean
  foregroundText: string
  backgroundText: string
}

describe.skipIf(!hasGitBash)('gitbash-local + tool-bash through a real Loader composition', () => {
  // Loader boots pay a cold tsx-transform cost under coverage load; give the
  // subprocess headroom past the 30s default process deadline so the
  // assembled boot completes instead of being killed mid-load (the margin
  // mirrors tool-pwsh's loader smoke).
  const processTimeoutMs = 90_000
  it('registers the bash surface and renders real foreground and background results', async () => {
    let report: GitBashLoaderReport | undefined
    const { stderr } = await runLoaderSmoke({
      label: 'gitbash loader smoke',
      tempDirPrefix: 'gitbash-loader-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
      processTimeoutMs,
      inspect: async (cwd) => {
        report = JSON.parse(await readFile(join(cwd, 'gitbash-loader-report.json'), 'utf8')) as GitBashLoaderReport
      },
    })
    expect(stderr).not.toContain('UNHANDLED')
    expect(report).toBeDefined()
    expect(report).toMatchObject({
      schemaHasRunInBackground: true,
      promptHasMarkerSection: true,
    })
    expect(report?.foregroundText).toBe('loader-ok\n')
    expect(report?.backgroundText).toContain('loader-bg-ok')
    expect(report?.backgroundText).toContain('[status: completed, exit code: 0]')
    // 15s of vitest headroom past the subprocess deadline, mirroring
    // the pwsh twin's margin over its process window.
  }, processTimeoutMs + 15_000)
})
