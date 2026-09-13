/**
 * Workspace-ID scoped Git operations used by the graph and file-change
 * clients. Every repository verb runs from the work-tree root rather than from
 * the workspace directory, because Git reports paths relative to that root
 * while a pathspec resolves against the process working directory: running
 * both from the same directory is what keeps a reported path usable as a
 * mutation target when the workspace is a subdirectory of the repository.
 */
import { execFile } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  assertRelativePath, parseBranch, parseBranches, parseGraph, parseHead, parseStatus, parseWorkTree,
} from './porcelain.ts'
import type { GitBranchEntry, GitGraphView, GitRepositoryView, GitStatusEntry } from './types.ts'

export type { GitBranchEntry, GitGraphEntry, GitGraphView, GitRepositoryView, GitStatusEntry } from './types.ts'

/** Limits Git process duration and graph size. */
export interface Config {
  /** Maximum duration in milliseconds for one Git subprocess. */
  timeoutMs?: number
  /** Maximum commits returned by one graph request. */
  graphLimit?: number
}
/** Runtime schema for Git limits. */
export const Config: z<Config> = z.object({ timeoutMs: z.natural().min(1).default(20_000), graphLimit: z.natural().min(1).default(500) })
declare module '@deepseek-ai/cordis' { interface Context { workspaceGit: WorkspaceGitService } }

/** Fixed output bound for one Git subprocess. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

/**
 * Environment for the work-tree probe. Git states that a directory holds no
 * repository only in a message, never in an exit status, so the probe pins the
 * C locale and matches that message: every other call keeps the inherited
 * environment and surfaces Git's own text in the operator's language.
 */
const PROBE_ENV: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', LANG: 'C' }

/** Git's C-locale wording for the repository-absent answer. */
const NO_REPOSITORY = 'not a git repository'

/** One Git invocation that reports a refusal instead of throwing, so a probe can classify it. */
interface GitRun {
  /** Captured stdout. */
  readonly stdout: string
  /** Null on a zero exit; otherwise the stderr text, or the process message when Git wrote none. */
  readonly failure: string | null
}

/**
 * Host service for the shared Git state used by graph and file-change panels.
 * @typert service workspaceGit
 */
export class WorkspaceGitService extends TypertRemoteService {
  static inject = ['workspaceRegistry']
  /** @param ctx - Context carrying registered workspaces. @param config - Git execution limits. */
  constructor(ctx: Context, private readonly config: Config = {}) { super(ctx, 'workspaceGit') }

  /**
   * Read working-tree status.
   * @param workspaceId - Registered workspace containing the repository.
   * @returns Porcelain status entries whose paths are relative to the repository root.
   */
  @Remote
  async status(workspaceId: WorkspaceId): Promise<GitStatusEntry[]> {
    return this.readStatus(await this.repository(workspaceId))
  }

  /**
   * List local branches and the attached branch.
   * @param workspaceId - Registered workspace containing the repository.
   * @returns Local branch names and the attached branch, absent while HEAD is detached.
   */
  @Remote
  async branches(workspaceId: WorkspaceId): Promise<GitBranchEntry> {
    return this.readBranches(await this.repository(workspaceId))
  }

  /**
   * Read the repository this workspace resolves to plus a bounded commit graph.
   * @param workspaceId - Registered workspace.
   * @returns Repository identity and commit rows, or a null repository when the directory is outside every work tree.
   */
  @Remote
  async graph(workspaceId: WorkspaceId): Promise<GitGraphView> {
    const root = await this.workTree(workspaceId)
    if (root === null) return { repository: null, entries: [] }
    const repository = await this.describe(root)
    // A branch with no commits yet has no history to walk, and `git log`
    // refuses there; the HEAD probe settles that case without reading the
    // refusal text of a second command.
    if (repository.head === null) return { repository, entries: [] }
    const output = await this.git(root, [
      'log', `--max-count=${this.config.graphLimit ?? 500}`, '--topo-order', '--format=%H%x1f%P%x1f%D%x1f%s',
    ])
    return { repository, entries: parseGraph(output) }
  }

  /**
   * Create a branch at the current HEAD.
   * @param workspaceId - Registered workspace containing the repository.
   * @param name - New local branch name interpreted by Git.
   */
  @Remote
  async createBranch(workspaceId: WorkspaceId, name: string): Promise<void> {
    await this.git(await this.repository(workspaceId), ['branch', name])
  }

  /**
   * Switch only when no merge/rebase/cherry-pick is active and the tree is clean.
   * @param workspaceId - Registered workspace containing the repository.
   * @param name - Existing local branch name.
   */
  @Remote
  async switchBranch(workspaceId: WorkspaceId, name: string): Promise<void> {
    const root = await this.repository(workspaceId)
    if ((await this.readStatus(root)).length > 0) throw new Error('workspace-git: working tree is not clean')
    if (await this.operationInProgress(root)) throw new Error('workspace-git: another Git operation is in progress')
    const branches = await this.readBranches(root)
    if (!branches.branches.includes(name)) throw new Error('workspace-git: unknown branch')
    await this.rejectBranchHeldByAnotherWorktree(root, name)
    await this.git(root, ['switch', name])
  }

  /**
   * Stage one repository-relative path.
   * @param workspaceId - Registered workspace containing the repository.
   * @param path - Path as reported by status, passed after Git's option separator.
   */
  @Remote
  async stage(workspaceId: WorkspaceId, path: string): Promise<void> {
    await this.git(await this.repository(workspaceId), ['add', '--', assertRelativePath(path)])
  }

  /**
   * Remove one path from the index.
   * @param workspaceId - Registered workspace containing the repository.
   * @param path - Path as reported by status, passed after Git's option separator.
   */
  @Remote
  async unstage(workspaceId: WorkspaceId, path: string): Promise<void> {
    await this.git(await this.repository(workspaceId), ['restore', '--staged', '--', assertRelativePath(path)])
  }

  /**
   * Discard one tracked file only after explicit confirmation.
   * @param workspaceId - Registered workspace containing the repository.
   * @param path - Tracked path as reported by status.
   * @param confirmed - Explicit confirmation required before discarding changes.
   */
  @Remote
  async discard(workspaceId: WorkspaceId, path: string, confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error('workspace-git: confirmation-required')
    await this.git(await this.repository(workspaceId), ['restore', '--worktree', '--', assertRelativePath(path)])
  }

  /** @param root - Work-tree root. @returns porcelain status decoded from the root. */
  private async readStatus(root: string): Promise<GitStatusEntry[]> {
    return parseStatus(await this.git(root, ['status', '--porcelain=v1', '-z']))
  }

  /** @param root - Work-tree root. @returns the local roster with its attached branch. */
  private async readBranches(root: string): Promise<GitBranchEntry> {
    const [listing, head] = await Promise.all([
      this.git(root, ['branch', '--format=%(refname:short)']),
      this.run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    ])
    return parseBranches(listing, parseBranch(head.stdout))
  }

  /**
   * Resolve the work-tree root of a workspace.
   * @param workspaceId - Registered workspace.
   * @returns the root, or null when the directory holds no repository.
   */
  private async workTree(workspaceId: WorkspaceId): Promise<string | null> {
    const path = this.workspacePath(workspaceId)
    const probe = await this.run(path, ['rev-parse', '--is-inside-work-tree'], PROBE_ENV)
    if (probe.failure === null) {
      // Git answered: `true` inside a work tree, `false` inside its own `.git`.
      if (parseWorkTree(probe.stdout) === true) return (await this.git(path, ['rev-parse', '--show-toplevel'])).trim()
      return null
    }
    // A refusal that names no repository is that same answer reaching us as a
    // failure; every other refusal is a fault the operator has to see.
    if (probe.failure.includes(NO_REPOSITORY)) return null
    throw new Error(`workspace-git: ${probe.failure}`)
  }

  /** @param workspaceId - Registered workspace. @returns the work-tree root. */
  private async repository(workspaceId: WorkspaceId): Promise<string> {
    const root = await this.workTree(workspaceId)
    if (root === null) throw new Error('workspace-git: workspace is not a Git repository')
    return root
  }

  /**
   * Read the repository identity of one work-tree root. Both probes answer by
   * refusing — an unborn branch has no hash and a detached HEAD has no
   * symbolic name — so neither refusal is a fault.
   * @param root - Work-tree root.
   * @returns the root with its HEAD hash and attached branch, each absent when it does not exist.
   */
  private async describe(root: string): Promise<GitRepositoryView> {
    const [head, branch] = await Promise.all([
      this.run(root, ['rev-parse', '--verify', '--quiet', 'HEAD']),
      this.run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    ])
    return { root, head: parseHead(head.stdout), branch: parseBranch(branch.stdout) }
  }

  /**
   * @param root - Work-tree root.
   * @param name - Branch the caller is about to check out.
   */
  private async rejectBranchHeldByAnotherWorktree(root: string, name: string): Promise<void> {
    const listing = await this.git(root, ['worktree', 'list', '--porcelain'])
    const held = listing.split(/\r?\n\r?\n/).some((block) => {
      const lines = block.split(/\r?\n/)
      return lines.includes(`branch refs/heads/${name}`) && !lines.includes(`worktree ${root}`)
    })
    if (held) throw new Error('workspace-git: branch is checked out by another worktree')
  }

  /**
   * Run one Git command from a working directory.
   * @param cwd - Directory the command runs in.
   * @param args - Arguments passed after the executable name.
   * @param env - Environment override for a probe that must not read localized output.
   * @returns captured stdout plus the failure text, or a rejection when the process never ran.
   */
  private run(cwd: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<GitRun> {
    return new Promise((resolveResult, reject) => {
      execFile('git', [...args], { cwd, env, timeout: this.config.timeoutMs ?? 20_000, maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout, stderr) => {
        if (error === null) { resolveResult({ stdout, failure: null }); return }
        // A numeric code is Git's own exit status, which callers classify. Any
        // other code means no status ever arrived (missing binary, unusable
        // directory, timeout, truncated output), so there is no result to read.
        if (typeof error.code !== 'number') {
          reject(new Error(`workspace-git: git could not run in ${cwd}: ${error.message}`))
          return
        }
        resolveResult({ stdout, failure: stderr.trim() || error.message })
      })
    })
  }

  /**
   * Run one Git command that must succeed.
   * @param root - Work-tree root the command runs in.
   * @param args - Arguments passed after the executable name.
   * @returns captured stdout.
   */
  private async git(root: string, args: readonly string[]): Promise<string> {
    const result = await this.run(root, args)
    if (result.failure !== null) throw new Error(`workspace-git: ${result.failure}`)
    return result.stdout
  }

  /** @param workspaceId - Registered workspace. @returns its canonical directory. */
  private workspacePath(workspaceId: WorkspaceId): string {
    const workspace = this.ctx.workspaceRegistry.get(workspaceId)
    if (workspace === undefined) throw new Error('workspace-git: unknown workspace')
    return workspace.path
  }

  /** @param root - Work-tree root. @returns whether an unfinished Git operation owns the repository. */
  private async operationInProgress(root: string): Promise<boolean> {
    // A missing MERGE_HEAD is normal; the remaining state files are checked
    // with one shell-free Git probe each so branch switching cannot cross an
    // incomplete merge, rebase, cherry-pick, or revert. Git prints each state
    // path relative to the directory the probe ran in, so it is resolved
    // against that root before it is stat'ed.
    const states = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']
    for (const state of states) {
      const path = resolve(root, (await this.git(root, ['rev-parse', '--git-path', state])).trim())
      try {
        await lstat(path)
        return true
      } catch (error) {
        /* v8 ignore next -- a state path Git just reported can only be absent */
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return false
  }
}
export default WorkspaceGitService
