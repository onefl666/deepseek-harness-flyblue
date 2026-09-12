/**
 * Real-process tests for `@deepseek-ai/dsh-gitbash-local`: the LOCAL
 * subprocess service plus a REAL Git Bash executable, exercised through the
 * executor seam (`resolve` → `run`/`start`). These verify the world — actual
 * Git Bash runs, output capture, truncation and spill, deadlines, kill
 * escalation, and the background-handle contract. The suite self-skips when
 * no Git Bash resolves (a CI accommodation for hosts without Git for
 * Windows); the pure unit tests (config validation, executable resolution)
 * run on every platform. Git Bash inherits the POSIX dialect, so stdout is LF
 * and `$$` is an msys pid — Windows pids come from `/proc/$$/winpid`.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { GitBashExecutor, candidateGitBashPaths, resolveGitBashPath } from '@deepseek-ai/dsh-gitbash-local'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SubprocessRuntime from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessOutcome, SubprocessOutputReader, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { ShellProcess } from '@deepseek-ai/dsh-shell'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-gitbash-exec-spec-'))

afterAll(() => {
  rmSync(spillDir, { recursive: true, force: true })
})

/** Per-test temp dirs, removed after each test. */
const tempDirs: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  const ownedContexts = contexts.splice(0)
  const directories = tempDirs.splice(0)
  const results = await Promise.allSettled(ownedContexts.map(ctx => ctx.fiber.dispose()))
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
  const failures: unknown[] = results.flatMap((result): unknown[] => result.status === 'rejected' ? [result.reason] : [])
  if (failures.length > 0) throw new AggregateError(failures, 'Git Bash fixture cleanup failed')
})

function createContext(): Context {
  const ctx = new Context()
  contexts.push(ctx)
  return ctx
}

/** A private file barrier keeps the command alive until the test releases it. */
function commandBarrier() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-gitbash-barrier-'))
  tempDirs.push(dir)
  const path = join(dir, 'release')
  return {
    command: 'while [ ! -e "$DSH_TEST_RELEASE" ]; do sleep 0.02; done',
    env: { DSH_TEST_RELEASE: path },
    release: () => { writeFileSync(path, '') },
  }
}

// The probe follows the executor's own resolution; a configured path is never
// probed, so the bare try/catch skips exactly when discovery cannot resolve.
const gitBashPath = (() => {
  try {
    return resolveGitBashPath()
  } catch {
    return undefined
  }
})()
const hasGitBash = gitBashPath !== undefined
  && spawnSync(gitBashPath, ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0

/** Filesystem path equality across macOS temp symlinks and Windows drive-letter casing. */
function samePath(actual: string, expected: string): boolean {
  const norm = (value: string) => (
    process.platform === 'win32' ? realpathSync.native(value).toLowerCase() : realpathSync.native(value)
  )
  return norm(actual) === norm(expected)
}

async function setup(config: ConstructorParameters<typeof GitBashExecutor>[1] = {}) {
  const ctx = createContext()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  // A short kill grace via the REAL config path, so escalation tests stay fast.
  await ctx.plugin(GitBashExecutor, { graceMs: 200, ...config })
  const bash = ctx.shell as GitBashExecutor
  return { ctx, bash }
}

/**
 * Accumulate consuming reads until the marker arrives, using the current test's
 * budget. Callers keep the child at a barrier when later output must remain unread.
 */
async function readUntil(proc: ShellProcess, expected: string, timeoutMs: number): Promise<string> {
  let all = ''
  await expect.poll(() => {
    all += proc.readOutput().delta
    return all
  }, { timeout: timeoutMs }).toContain(expected)
  return all
}

describe('resolveGitBashPath and candidateGitBashPaths (pure, every platform)', () => {
  it('trusts an explicit configured path verbatim', () => {
    expect(resolveGitBashPath('C:\\custom\\git\\bin\\bash.exe')).toBe('C:\\custom\\git\\bin\\bash.exe')
    expect(resolveGitBashPath('bash')).toBe('bash')
  })

  it('refuses to resolve on non-Windows platforms', () => {
    expect(() => resolveGitBashPath(undefined, { ProgramFiles: 'P:\\Program Files' }, 'linux'))
      .toThrow('gitbash-local: Git Bash resolution requires the win32 platform')
    expect(() => resolveGitBashPath(undefined, { PATH: 'P:\\git\\bin' }, 'darwin'))
      .toThrow(/requires the win32 platform/)
  })

  it('fails loudly on Windows when no candidate exists', () => {
    expect(() => resolveGitBashPath(undefined, {
      ProgramFiles: 'P:\\missing',
      'ProgramFiles(x86)': 'P:\\missing-x86',
      SystemRoot: 'S:\\no-windows',
      PATH: 'P:\\no-git',
    }, 'win32')).toThrow('gitbash-local: no Git Bash (bash.exe) found; install Git for Windows or set the gitBashPath config')
  })

  it('uses stable Windows roots when the environment omits the overrides', () => {
    expect(candidateGitBashPaths({})).toEqual([
      join('C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      join('C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    ])
    // An empty LOCALAPPDATA is unset in disguise — no per-user candidate.
    expect(candidateGitBashPaths({ LOCALAPPDATA: '' })).toEqual([
      join('C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      join('C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    ])
  })

  it('lists per-user installs, git.exe-derived installations, then PATH bin entries', () => {
    const candidates = candidateGitBashPaths({
      ProgramFiles: 'P:\\Program Files',
      'ProgramFiles(x86)': 'P:\\Program Files (x86)',
      LOCALAPPDATA: 'L:\\app-data',
      SystemRoot: 'S:\\Windows',
      PATH: ';"Q:\\quoted git\\cmd";P:\\plain\\bin',
    })
    expect(candidates).toEqual([
      join('P:\\Program Files', 'Git', 'bin', 'bash.exe'),
      join('P:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
      join('L:\\app-data', 'Programs', 'Git', 'bin', 'bash.exe'),
      // Every PATH entry contributes the installation its git.exe names
      // (`…\Git\cmd` → `…\Git\bin`; host join collapses the `..` segment);
      // the `P:\plain\bin` derived candidate equals its direct candidate, so
      // it lists once.
      join('Q:\\quoted git\\cmd', '..', 'bin', 'bash.exe'),
      join('P:\\plain\\bin', 'bash.exe'),
      join('Q:\\quoted git\\cmd', 'bash.exe'),
    ])
  })

  it('skips System32 and WindowsApps PATH entries whose bash.exe is the WSL launcher or a Store alias', () => {
    const candidates = candidateGitBashPaths({
      ProgramFiles: 'P:\\missing',
      'ProgramFiles(x86)': 'P:\\missing-x86',
      SystemRoot: 'S:\\Windows',
      LOCALAPPDATA: 'L:\\app-data',
      PATH: 'S:\\Windows\\System32;L:\\app-data\\Microsoft\\WindowsApps;Q:\\git\\bin',
    })
    // The System32/WindowsApps entries contribute only the git.exe-derived
    // candidate (`…\..\..\bin\bash.exe` collapses into their parent trees),
    // never their own bash.exe.
    expect(candidates).not.toContain(join('S:\\Windows', 'System32', 'bash.exe'))
    expect(candidates).not.toContain(join('L:\\app-data', 'Microsoft', 'WindowsApps', 'bash.exe'))
    expect(candidates).toContain(join('Q:\\git\\bin', 'bash.exe'))
    // An absent SystemRoot still excludes the default C:\Windows\System32.
    expect(candidateGitBashPaths({
      ProgramFiles: 'P:\\missing',
      'ProgramFiles(x86)': 'P:\\missing-x86',
      PATH: 'C:\\Windows\\System32',
    })).not.toContain(join('C:\\Windows', 'System32', 'bash.exe'))
    // An empty LOCALAPPDATA disables the WindowsApps probe rather than
    // misreading the empty root.
    expect(candidateGitBashPaths({
      ProgramFiles: 'P:\\missing',
      'ProgramFiles(x86)': 'P:\\missing-x86',
      SystemRoot: 'S:\\Windows',
      LOCALAPPDATA: '',
      PATH: 'Q:\\git\\bin',
    })).toContain(join('Q:\\git\\bin', 'bash.exe'))
  })

  it('returns the first EXISTING win32 candidate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-gitbash-resolve-'))
    tempDirs.push(dir)
    // A PATH entry naming `…\Git\cmd` makes the derived `…\Git\bin\bash.exe`
    // the first existing candidate even though the entry has no bash.exe.
    mkdirSync(join(dir, 'git', 'cmd'), { recursive: true })
    mkdirSync(join(dir, 'git', 'bin'), { recursive: true })
    writeFileSync(join(dir, 'git', 'bin', 'bash.exe'), '')
    expect(resolveGitBashPath(undefined, {
      ProgramFiles: join(dir, 'missing'),
      'ProgramFiles(x86)': join(dir, 'missing-x86'),
      SystemRoot: join(dir, 'no-windows'),
      PATH: join(dir, 'git', 'cmd'),
    }, 'win32')).toBe(join(dir, 'git', 'bin', 'bash.exe'))
  })

  it('returns a direct PATH bin entry when no derived installation exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-gitbash-resolve-bin-'))
    tempDirs.push(dir)
    const store = join(dir, 'bin')
    mkdirSync(store)
    writeFileSync(join(store, 'bash.exe'), '')
    expect(resolveGitBashPath(undefined, {
      ProgramFiles: join(dir, 'missing'),
      'ProgramFiles(x86)': join(dir, 'missing-x86'),
      SystemRoot: join(dir, 'no-windows'),
      PATH: store,
    }, 'win32')).toBe(join(store, 'bash.exe'))
  })

  it('accepts a link-shaped PATH candidate whose target cannot be stat-ed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-gitbash-resolve-link-'))
    tempDirs.push(dir)
    const store = join(dir, 'bin')
    mkdirSync(store, { recursive: true })
    const link = join(store, 'bash.exe')
    symlinkSync(join(dir, 'no-such-target.exe'), link)
    expect(resolveGitBashPath(undefined, {
      ProgramFiles: join(dir, 'missing'),
      'ProgramFiles(x86)': join(dir, 'missing-x86'),
      SystemRoot: join(dir, 'no-windows'),
      PATH: store,
    }, 'win32')).toBe(link)
  })

  it('skips a directory candidate and fails loudly when nothing else exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-gitbash-resolve-dir-'))
    tempDirs.push(dir)
    const store = join(dir, 'bin')
    mkdirSync(join(store, 'bash.exe'), { recursive: true })
    expect(() => resolveGitBashPath(undefined, {
      ProgramFiles: join(dir, 'missing'),
      'ProgramFiles(x86)': join(dir, 'missing-x86'),
      SystemRoot: join(dir, 'no-windows'),
      PATH: store,
    }, 'win32')).toThrow(/no Git Bash/)
  })
})

describe('spawn construction (pure, every platform)', () => {
  /** A subprocess service that records spawn specs and settles instantly. */
  class CapturingSubprocessRuntime extends SubprocessRuntime {
    specs: SubprocessSpawnSpec[] = []
    done: Promise<SubprocessOutcome> = Promise.resolve({ exitCode: 0, signal: null })
    stderrText = ''
    override async resolveExecutable(command: string): Promise<string> { return command }
    override spawnTerminal(): Promise<never> { throw new Error('gitbash spawns pipes, never terminals') }
    private readonly stdoutReader: SubprocessOutputReader = {
      readFrom: () => ({ text: '', lossy: false, nextOffset: 0 }),
    }
    private readonly stderrReader: SubprocessOutputReader = {
      readFrom: offset => ({
        text: this.stderrText.slice(offset),
        lossy: false,
        nextOffset: this.stderrText.length,
      }),
    }
    override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
      this.specs.push(spec)
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        collected: { stdout: this.stdoutReader, stderr: this.stderrReader },
        done: this.done,
        terminate: () => {},
        waitForExit: async () => true,
      }
    }
  }

  it('runs every command as `bash -c` with the resolved executable, POSIX-dialect', async () => {
    const ctx = createContext()
    const subprocess = new CapturingSubprocessRuntime(ctx)
    await ctx.plugin(GitBashExecutor, { gitBashPath: 'C:\\git\\bin\\bash.exe' })
    const bash = ctx.shell as GitBashExecutor
    expect(bash.gitBashPath).toBe('C:\\git\\bin\\bash.exe')
    await ctx.shell.run(ctx.shell.resolve({ command: 'printf 你好' }))
    expect(subprocess.specs).toHaveLength(1)
    expect(subprocess.specs[0]!.argv).toEqual(['C:\\git\\bin\\bash.exe', '-c', 'printf 你好'])
  })

  it('reports both unread stderr and an asynchronous provider rejection exactly once', async () => {
    const ctx = createContext()
    const subprocess = new CapturingSubprocessRuntime(ctx)
    await ctx.plugin(GitBashExecutor, { gitBashPath: 'C:\\git\\bin\\bash.exe' })
    subprocess.stderrText = 'target stderr'
    subprocess.done = Promise.reject(new Error('provider lost the direct outcome'))

    const proc = ctx.shell.start(ctx.shell.resolve({ command: 'echo maybe-ran' }))
    await expect(proc.done).resolves.toBeUndefined()
    expect(proc.status).toBe('killed')
    const output = proc.readOutput().delta
    expect(output).toContain('target stderr')
    expect(output).toContain('subprocess failed before reporting an outcome:')
    expect(proc.readOutput().delta).toBe('')
  })

  it('settles an unprintable provider rejection instead of rejecting done', async () => {
    const ctx = createContext()
    const subprocess = new CapturingSubprocessRuntime(ctx)
    await ctx.plugin(GitBashExecutor, { gitBashPath: 'C:\\git\\bin\\bash.exe' })
    const providerError = new Error('unprintable provider error')
    Object.defineProperty(providerError, Symbol.toPrimitive, {
      value: () => { throw new Error('provider formatting must not escape') },
    })
    subprocess.done = Promise.reject(providerError)

    const proc = ctx.shell.start(ctx.shell.resolve({ command: 'echo maybe-ran' }))
    await expect(proc.done).resolves.toBeUndefined()
    expect(proc.status).toBe('killed')
    expect(proc.readOutput().delta).toContain('unprintable provider failure')
    expect(proc.readOutput().delta).toBe('')
  })

  it('preserves an explicit kill stamp and maps an aborted direct outcome to killed', async () => {
    const ctx = createContext()
    const subprocess = new CapturingSubprocessRuntime(ctx)
    await ctx.plugin(GitBashExecutor, { gitBashPath: 'C:\\git\\bin\\bash.exe' })

    const killedOutcome = Promise.withResolvers<SubprocessOutcome>()
    subprocess.done = killedOutcome.promise
    const killed = ctx.shell.start(ctx.shell.resolve({ command: 'echo maybe-ran' }))
    expect(killed.kill()).toBe(true)
    killedOutcome.resolve({ exitCode: 0, signal: null })
    await killed.done
    expect(killed.status).toBe('killed')
    expect(killed.exitCode).toBe(0)

    const abortedOutcome = Promise.withResolvers<SubprocessOutcome>()
    subprocess.done = abortedOutcome.promise
    const controller = new AbortController()
    const aborted = ctx.shell.start(ctx.shell.resolve({
      command: 'echo maybe-ran',
      signal: controller.signal,
    }))
    controller.abort()
    abortedOutcome.resolve({ exitCode: 0, signal: null })
    await aborted.done
    expect(aborted.status).toBe('killed')
  })

  it.skipIf(process.platform === 'win32')('refuses to mount without a configured path off win32', async () => {
    const ctx = createContext()
    await expect(ctx.plugin(GitBashExecutor, {})).rejects.toThrow('gitbash-local: Git Bash resolution requires the win32 platform')
  })
})

describe.skipIf(!hasGitBash)('GitBashExecutor.run', () => {
  it('resolves with output and the effective timeout', { timeout: 15_000 }, async () => {
    const { bash } = await setup({ timeoutMs: 10_000 })
    const result = await bash.run(bash.resolve({ command: "printf 'hi\\n'" }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toBe('hi\n')
    expect(result.timeoutMs).toBe(10_000)
  })

  it('propagates non-zero exits and stderr', async () => {
    const { bash } = await setup()
    const result = await bash.run(bash.resolve({ command: "printf 'err\\n' >&2; exit 3" }))
    expect(result.exitCode).toBe(3)
    expect(result.stderr.text).toBe('err\n')
    expect(result.stdout.text).toBe('')
  })

  it('passes UTF-8 through unchanged in both directions', async () => {
    const { bash } = await setup()
    const result = await bash.run(bash.resolve({ command: "printf '你好，世界\\n'" }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toBe('你好，世界\n')
  })

  it('uses config cwd, overridable per call', async () => {
    const first = mkdtempSync(join(tmpdir(), 'dsh-gitbash-cwd-a-'))
    const second = mkdtempSync(join(tmpdir(), 'dsh-gitbash-cwd-b-'))
    tempDirs.push(first, second)
    const { bash } = await setup({ cwd: first })
    // `pwd -W` reports the Windows working directory Git Bash mounted.
    const fromConfig = await bash.run(bash.resolve({ command: 'pwd -W' }))
    expect(samePath(fromConfig.stdout.text.trim(), first)).toBe(true)
    const fromCall = await bash.run(bash.resolve({ command: 'pwd -W', workdir: second }))
    expect(samePath(fromCall.stdout.text.trim(), second)).toBe(true)
  })

  it('defaults cwd to process.cwd()', async () => {
    const { bash } = await setup()
    const result = await bash.run(bash.resolve({ command: 'pwd -W' }))
    expect(samePath(result.stdout.text.trim(), process.cwd())).toBe(true)
  })

  it('caps per-call timeouts at maxTimeoutMs', async () => {
    const { bash } = await setup({ timeoutMs: 1_000, maxTimeoutMs: 2_000 })
    const result = await bash.run(bash.resolve({ command: 'true', timeoutMs: 99_999 }))
    expect(result.timeoutMs).toBe(2_000)
  })

  it('rejects invalid numeric config and timeout overrides', async () => {
    await expect(setup({ timeoutMs: Number.NaN })).rejects.toThrow(/timeoutMs/)
    await expect(setup({ maxTimeoutMs: 0 })).rejects.toThrow(/maxTimeoutMs/)
    await expect(setup({ maxOutputBytes: -1 })).rejects.toThrow(/maxOutputBytes/)
    await expect(setup({ maxSpillBytes: 0 })).rejects.toThrow(/maxSpillBytes/)
    await expect(setup({ graceMs: 0 })).rejects.toThrow(/graceMs/)
    await expect(setup({ graceMs: MAX_TIMER_DELAY_MS + 1 }))
      .rejects.toThrow(`graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)

    const { bash } = await setup()
    expect(() => bash.resolve({ command: 'true', timeoutMs: Number.NaN })).toThrow(/request\.timeoutMs/)
    expect(() => bash.resolve({ command: 'true', timeoutMs: -1 })).toThrow(/request\.timeoutMs/)
    expect(() => bash.resolve({ command: 'true', stdoutMaxBytes: Number.NaN })).toThrow(/request\.stdoutMaxBytes/)
    expect(() => bash.resolve({ command: 'true', stdoutMaxBytes: -1 })).toThrow(/request\.stdoutMaxBytes/)
  })

  it('defaults stdoutMaxBytes to maxOutputBytes and lets foreground callers raise stdout only', async () => {
    const { bash } = await setup({ maxOutputBytes: 100 })
    expect(bash.resolve({ command: 'true' }).stdoutMaxBytes).toBe(100)

    const result = await bash.run(bash.resolve({
      command: "printf '%0.sx' $(seq 1 500); printf '%0.se\\n' $(seq 1 500) >&2",
      stdoutMaxBytes: 500,
    }))

    expect(result.stdout.text).toBe('x'.repeat(500))
    expect(result.stdout.truncated).toBe(false)
    expect(result.stderr.truncated).toBe(true)
    expect(result.stderr.text.length).toBeLessThanOrEqual(100)
  })

  it('per-call timeout takes precedence under the cap and kills on expiry', async () => {
    const { bash } = await setup({ timeoutMs: 60_000 })
    const result = await bash.run(bash.resolve({ command: 'sleep 60', timeoutMs: 100 }))
    expect(result.timedOut).toBe(true)
    // Mutually exclusive: a timeout classifies as timedOut, never also aborted.
    expect(result.aborted).toBe(false)
    expect(result.timeoutMs).toBe(100)
  })

  it('propagates abort signals', async () => {
    const { bash } = await setup()
    const controller = new AbortController()
    const pending = bash.run(bash.resolve({ command: 'sleep 60', signal: controller.signal }))
    setTimeout(() => { controller.abort() }, 50)
    const result = await pending
    expect(result.aborted).toBe(true)
    // Mutually exclusive: an upstream cancel classifies as aborted, never also timedOut.
    expect(result.timedOut).toBe(false)
  })

  it('classifies a self-killed command as neither timed out nor aborted', async () => {
    const { bash } = await setup({ timeoutMs: 60_000 })
    const result = await bash.run(bash.resolve({ command: 'kill -9 $$' }))
    expect(result.timedOut).toBe(false)
    expect(result.aborted).toBe(false)
    // Windows reports a forced termination without a signal.
    expect(result.signal).toBeNull()
  })

  it('rejects on spawn failure (bad workdir)', async () => {
    const { bash } = await setup()
    await expect(bash.run(bash.resolve({ command: 'true', workdir: '/nonexistent-dsh' }))).rejects.toThrow(/ENOENT/)
  })

  it('resolve() carries stdin/env/dshEnv onto the spec, and run() threads them to the command', async () => {
    const { bash } = await setup()
    const spec = bash.resolve({
      command: 'IFS= read -r s; printf \'%s\\n\' "$s" "[${SEAM_VAR}][${DSH_SEAM_VAR}]"',
      stdin: 'piped\n',
      env: { SEAM_VAR: 'env-ok' },
      dshEnv: { DSH_SEAM_VAR: 'dsh-ok' },
    })
    // resolve() keeps the optional input/environment fields verbatim.
    expect(spec.stdin).toBe('piped\n')
    expect(spec.env).toEqual({ SEAM_VAR: 'env-ok' })
    expect(spec.dshEnv).toEqual({ DSH_SEAM_VAR: 'dsh-ok' })
    const result = await bash.run(spec)
    expect(result.stdout.text).toBe('piped\n[env-ok][dsh-ok]\n')
  })

  it('resolve() omits stdin/env/dshEnv when the request supplies none', async () => {
    const { bash } = await setup()
    const spec = bash.resolve({ command: 'true' })
    expect('stdin' in spec).toBe(false)
    expect('env' in spec).toBe(false)
    expect('dshEnv' in spec).toBe(false)
  })
})

describe.skipIf(!hasGitBash)('GitBashExecutor.start (background process handles)', () => {
  it('start returns immediately with a running handle that settles as completed', async ({ task }) => {
    const { bash } = await setup()
    const barrier = commandBarrier()
    const proc = bash.start(bash.resolve({
      command: `printf 'ready\\n'; ${barrier.command}; printf 'done\\n'`,
      env: barrier.env,
    }))
    expect(proc.status).toBe('running')
    expect(await readUntil(proc, 'ready\n', task.timeout)).toBe('ready\n')
    expect(proc.status).toBe('running')
    barrier.release()
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.signal).toBeNull()
    expect(proc.exitCode).toBe(0)
    expect(proc.readOutput().delta).toBe('done\n')
  })

  it('threads stdin and extra env into a background process', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({
      command: 'IFS= read -r s; printf \'%s\\n\' "$s" "[${BG_VAR}][${DSH_BG_VAR}]"',
      stdin: 'bg-stdin\n',
      env: { BG_VAR: 'bg-env' },
      dshEnv: { DSH_BG_VAR: 'bg-dsh-env' },
    }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.signal).toBeNull()
    expect(proc.exitCode).toBe(0)
    expect(proc.readOutput().delta).toBe('bg-stdin\n[bg-env][bg-dsh-env]\n')
  })

  it('readOutput is consuming: increments are never re-delivered, and reads stay valid after exit', async ({ task }) => {
    const { bash } = await setup()
    const barrier = commandBarrier()
    const proc = bash.start(bash.resolve({
      command: `printf 'first\\n'; ${barrier.command}; printf 'second\\n'`,
      env: barrier.env,
    }))
    const first = await readUntil(proc, 'first\n', task.timeout)
    expect(first).toBe('first\n')
    expect(proc.status).toBe('running')
    expect(proc.readOutput().delta).toBe('')
    barrier.release()
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.exitCode).toBe(0)
    // Read-after-exit returns the remaining buffered output — once.
    const second = proc.readOutput()
    expect(second.delta).toBe('second\n')
    expect(second.lossy).toBe(false)
    expect(proc.readOutput().delta).toBe('')
  })

  it('readOutput marks stderr sections', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: "printf 'out\\n'; printf 'err\\n' >&2" }))
    await proc.done
    expect(proc.readOutput().delta).toBe('out\n[stderr]\nerr\n')
  })

  it('readOutput reports stderr-only deltas without a leading newline', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: "printf 'err\\n' >&2" }))
    await proc.done
    expect(proc.readOutput().delta).toBe('[stderr]\nerr\n')
  })

  it('readOutput adds a separator only when stdout lacks a trailing newline', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: "printf 'out'; printf 'err\\n' >&2" }))
    await proc.done
    expect(proc.readOutput().delta).toBe('out\n[stderr]\nerr\n')
  })

  it('readOutput flags lossy reads and reports stdout spill paths', async () => {
    const { bash } = await setup({ maxOutputBytes: 100 })
    const proc = bash.start(bash.resolve({ command: 'for i in $(seq 1 100); do echo "line-$i"; done' }))
    await proc.done
    const read = proc.readOutput()
    // Window slid past offset 0 → lossy, spill path points at the full stream.
    expect(read.lossy).toBe(true)
    expect(read.stdoutSpillPath).toBeDefined()
  })

  it('readOutput reports stderr spill paths', async () => {
    const { bash } = await setup({ maxOutputBytes: 100 })
    const proc = bash.start(bash.resolve({ command: 'for i in $(seq 1 100); do echo "line-$i" >&2; done' }))
    await proc.done
    const read = proc.readOutput()
    expect(read.lossy).toBe(true)
    expect(read.stderrSpillPath).toBeDefined()
    expect(read.delta).toContain('[stderr]')
  })

  it('kill() requests managed-range termination: true once, false after settlement', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'sleep 60' }))
    expect(proc.kill()).toBe(true)
    await proc.done
    expect(proc.status).toBe('killed')
    expect(proc.kill()).toBe(false)
  })

  it('kill() returns false for a naturally completed process', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'true' }))
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.kill()).toBe(false)
  })

  it('a spec.signal abort settles the handle as killed, not completed', async () => {
    const { bash } = await setup()
    const controller = new AbortController()
    const proc = bash.start(bash.resolve({ command: 'sleep 60', signal: controller.signal }))
    controller.abort()
    await proc.done
    expect(proc.status).toBe('killed')
  })

  it('an asynchronous creation failure settles as killed with a stage-neutral note', async () => {
    const { bash } = await setup()
    const proc = bash.start(bash.resolve({ command: 'true', workdir: '/nonexistent-dsh' }))
    // done resolves (never rejects) even though the process never ran.
    await expect(proc.done).resolves.toBeUndefined()
    expect(proc.status).toBe('killed')
    expect(proc.readOutput().delta).toContain('subprocess failed before reporting an outcome:')
  })
})

describe.skipIf(!hasGitBash)('process lifecycle ownership (the subprocess service, not the executor)', () => {
  it('a background process survives executor-fiber disposal and dies with the subprocess service', async ({ task }) => {
    const ctx = createContext()
    const managerFiber = await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    const executorFiber = await ctx.plugin(GitBashExecutor, { graceMs: 200 })
    const bash = ctx.shell as GitBashExecutor

    // The child prints its own Windows pid ($$ is an msys pid) so the test can
    // probe liveness through the public read surface alone.
    const proc = bash.start(bash.resolve({ command: 'cat /proc/$$/winpid; sleep 60' }))
    const pid = Number((await readUntil(proc, '\n', task.timeout)).trim())
    expect(Number.isInteger(pid) && pid > 0).toBe(true)

    // Executor reload/disposal leaves background work running — the
    // handle stays live and readable, mirroring the job runtime's
    // registrations-outlive-producer-fibers contract.
    await executorFiber.dispose()
    expect(proc.status).toBe('running')
    expect(() => process.kill(pid, 0)).not.toThrow()

    // Service disposal kills the group and AWAITS its exit (no orphans).
    await managerFiber.dispose()
    expect(() => process.kill(pid, 0)).toThrow()
    await proc.done
    expect(['killed', 'completed']).toContain(proc.status)
  })

  it('service disposal settles running handles and leaves settled ones untouched', async () => {
    const ctx = createContext()
    const managerFiber = await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    await ctx.plugin(GitBashExecutor, { graceMs: 200 })
    const bash = ctx.shell as GitBashExecutor

    const finished = bash.start(bash.resolve({ command: 'true' }))
    await finished.done
    expect(finished.status).toBe('completed')
    const running = bash.start(bash.resolve({ command: 'sleep 60' }))

    await managerFiber.dispose()
    // A settled process was untouched; the live one was terminated and joined.
    expect(finished.status).toBe('completed')
    await running.done
    expect(['killed', 'completed']).toContain(running.status)
  })
})
