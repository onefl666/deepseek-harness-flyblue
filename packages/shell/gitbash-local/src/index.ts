/**
 * Local Git Bash Service Provider for the bash capability seam on Windows.
 * Each command runs as `<bash.exe> -c <command>` — the same one-shot POSIX
 * dialect as `dsh-bash-local`, with the executable resolved to a Git for
 * Windows install — in a managed process spawned through `ctx.subprocess`.
 * Command defaulting, deadlines and cause classification, the model-friendly
 * terminal environment, and the model-facing stdout/stderr merge for
 * background reads are inherited from `LocalBashExecutor`; this executor owns
 * only Git Bash discovery (fail-loud) and the argv-level seam a confining
 * subclass wraps. Mounting on a non-Windows platform or a Windows host
 * without Git Bash fails at load.
 * @module @deepseek-ai/dsh-gitbash-local
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-bash-local'
import { resolveGitBashPath } from './resolve.ts'

// Resolution lives in its own dependency-free module so the repository's
// coverage-gate probe shares the exact definition the suites use.
export { candidateGitBashPaths, resolveGitBashPath } from './resolve.ts'

/** Plugin config: the local bash executor's knobs plus the Git Bash path. */
export interface Config extends LocalConfig {
  /**
   * Explicit Git Bash executable. When omitted, well-known Git for Windows
   * install locations and PATH-derived candidates are probed in order
   * (`Program Files`, `Program Files (x86)`, a per-user install, the
   * installation a PATH `git.exe` names, then a Git `bin` directory on PATH);
   * mounting fails loudly when none exists.
   */
  gitBashPath?: string
}

/** The shape after schemastery applied the defaults (cwd/gitBashPath have none). */
type ResolvedConfig = Required<Omit<Config, 'cwd' | 'gitBashPath'>> & Pick<Config, 'cwd' | 'gitBashPath'>

/**
 * Git Bash executor over `ctx.subprocess`. The shared `bash` settings section
 * installs this class's schema (the parent constructor reads the concrete
 * class's `static Config`), so a stored `gitBashPath` re-resolves the
 * executable live; every other knob is read through the inherited getter at
 * each command.
 */
export class GitBashExecutor extends LocalBashExecutor {
  // Mirrors `LocalBashExecutor.Config` field-for-field plus `gitBashPath`
  // (schemastery objects do not spread, and the defaults are one concern with
  // the fields they default).
  static override Config = z.object({
    cwd: z.string(),
    timeoutMs: z.number().default(120_000),
    maxTimeoutMs: z.number().default(600_000),
    maxOutputBytes: z.number().default(64_000),
    maxSpillBytes: z.number().default(64 * 1024 * 1024),
    graceMs: z.number().default(3_000),
    gitBashPath: z.string(),
  })

  /** The declared executable the current {@link gitBashPath} was resolved from. */
  private declaredGitBashPath: string | undefined

  /** The Git Bash executable resolved from the current config. */
  private resolvedGitBashPath: string

  /** The Git Bash executable every command runs through. */
  get gitBashPath(): string {
    return this.resolvedGitBashPath
  }

  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    // Schemastery fills these fields before construction; the type does not encode that step.
    const entry = config as ResolvedConfig
    this.declaredGitBashPath = entry.gitBashPath
    this.resolvedGitBashPath = resolveGitBashPath(entry.gitBashPath)
  }

  /**
   * Re-probe the executable when a stored `gitBashPath` changes; every other
   * field is read through the inherited getter at each command, so nothing
   * else derived needs rebuilding when the document changes.
   */
  protected override onSettingsChanged(): void {
    const declared = (this.config as ResolvedConfig).gitBashPath
    if (declared === this.declaredGitBashPath) return
    this.declaredGitBashPath = declared
    this.resolvedGitBashPath = resolveGitBashPath(declared)
  }

  /**
   * The Git Bash invocation argv for one resolved spec — the argv-level seam a
   * confining subclass wraps through `ctx.sandbox.confine` (the Git Bash twin
   * of `dsh-pwsh-local`'s `argv` hook; see `@deepseek-ai/dsh-gitbash-sandbox`).
   */
  protected argv(spec: ShellExecSpec): string[] {
    return [this.gitBashPath, '-c', spec.command]
  }

  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    return this.runArgv(spec, this.argv(spec))
  }

  override start(spec: ShellExecSpec): ShellProcess {
    return this.startArgv(spec, this.argv(spec))
  }
}

export default GitBashExecutor
