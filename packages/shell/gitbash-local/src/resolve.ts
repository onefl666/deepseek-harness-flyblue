/**
 * Git Bash executable resolution, dependency-free so non-package consumers
 * (the repository's coverage-gate probe in `vitest.config.ts`) can share the
 * ONE resolution definition with the executor and its suites — a probe that
 * resolved differently from the code under test could exempt a file whose
 * suites actually run. Like the pwsh twin, path manipulation follows the host
 * module so temp-fixture suites probe real files on every platform; the
 * derived-candidate collapse therefore reads host-style, which only win32
 * hosts exercise against the real filesystem anyway.
 *
 * @module @deepseek-ai/dsh-gitbash-local/resolve
 */

import { lstatSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'

/**
 * Non-empty PATH entries with surrounding `setx`-style quotes stripped.
 * @param path - the raw `PATH` value to split.
 * @returns entry directories in order.
 */
function pathEntries(path: NodeJS.ProcessEnv['PATH']): string[] {
  return (path ?? '')
    .split(';')
    .map(entry => entry.trim().replace(/^"|"$/g, ''))
    .filter(entry => entry.length > 0)
}

/**
 * Whether `child` names a location inside `parent`.
 */
function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Whether a PATH-derived `bash.exe` candidate sits in a Windows system
 * location: `System32\bash.exe` is the WSL launcher and `WindowsApps` holds
 * Store execution aliases, so neither is Git Bash even when the file exists.
 * @param candidate - the PATH-derived candidate to classify.
 * @param env - the environment the system locations come from.
 */
function isWindowsSystemLocation(candidate: string, env: NodeJS.ProcessEnv): boolean {
  if (isWithin(join(env.SystemRoot ?? 'C:\\Windows', 'System32'), candidate)) return true
  const localAppData = env.LOCALAPPDATA
  return localAppData !== undefined && localAppData.length > 0
    && isWithin(join(localAppData, 'Microsoft', 'WindowsApps'), candidate)
}

/**
 * Whether a candidate can be spawned. lstat opens the entry itself instead of
 * following reparse points, so it sees a Store app execution alias where stat
 * hits the target's ACL (EACCES); Node reports that alias as a symlink on
 * current releases and as a plain file on older ones, and CreateProcess
 * resolves either shape. A real directory never matches.
 */
function candidateExists(candidate: string): boolean {
  try {
    const stat = lstatSync(candidate)
    return stat.isFile() || stat.isSymbolicLink()
  } catch {
    // ENOENT (the candidate vanished between listing and probing) is the only
    // expected failure; any other error names an unspawnable path, so false
    // is the safe answer for it too.
    return false
  }
}

/**
 * Well-known Git for Windows install locations plus PATH-derived candidates.
 * Explicitly parameterized (env) so resolution is a pure function of its
 * inputs on every platform. Every entry of `PATH` contributes both the Git
 * installation its `git.exe` names (`…\Git\cmd` puts `bash.exe` one level up
 * in `…\Git\bin`) and, unless it is a Windows system location, its own
 * `bash.exe`.
 * @param env - the environment to derive candidates from; defaults to the process environment.
 * @returns candidate `bash.exe` paths in resolution order, deduplicated.
 */
export function candidateGitBashPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const candidates = [
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe'),
  ]
  if (env.LOCALAPPDATA !== undefined && env.LOCALAPPDATA.length > 0) {
    candidates.push(join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'))
  }
  const seen = new Set(candidates)
  const push = (candidate: string) => {
    if (!seen.has(candidate)) {
      seen.add(candidate)
      candidates.push(candidate)
    }
  }
  const entries = pathEntries(env.PATH)
  for (const entry of entries) {
    // A PATH entry is the directory its `git.exe` lives in (`…\Git\cmd`), so
    // the installation's `bin\bash.exe` sits one level up.
    push(join(entry, '..', 'bin', 'bash.exe'))
  }
  for (const entry of entries) {
    const candidate = join(entry, 'bash.exe')
    if (!isWindowsSystemLocation(candidate, env)) push(candidate)
  }
  return candidates
}

/**
 * Resolve the Git Bash executable this executor spawns.
 * @param configured - an explicit `gitBashPath` config value, trusted as-is.
 * @param env - the environment to probe on Windows; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns the first existing well-known location on Windows (Git for Windows
 *   installs, then PATH-derived installations).
 * @throws Error on any other platform, or on Windows where no candidate
 *   exists: a bare `bash` is never returned because Windows may resolve it to
 *   the WSL launcher and run commands against a different filesystem view.
 */
export function resolveGitBashPath(
  configured?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (configured !== undefined && configured.length > 0) return configured
  if (platform !== 'win32') {
    throw new Error('gitbash-local: Git Bash resolution requires the win32 platform')
  }
  for (const candidate of candidateGitBashPaths(env)) {
    if (candidateExists(candidate)) return candidate
  }
  throw new Error(
    'gitbash-local: no Git Bash (bash.exe) found; install Git for Windows or set the gitBashPath config',
  )
}
